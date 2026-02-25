import { pool, maintenancePool } from "../config/db.js";

const TABLE_NAME_MAP = {
  checklist: "public.checklist",
  delegation: "public.delegation",
};

const getTableName = (dashboardType = "checklist") => {
  const normalizedType =
    typeof dashboardType === "string"
      ? dashboardType.toLowerCase()
      : "checklist";

  return TABLE_NAME_MAP[normalizedType] || TABLE_NAME_MAP.checklist;
};

const getMonthDateRange = (monthYear = "") => {
  if (!monthYear) return null;

  const [yearStr, monthStr] = monthYear.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  const paddedMonth = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  return {
    start: `${year}-${paddedMonth}-01`,
    end: `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`,
  };
};

export const getStaffTasks = async (req, res) => {
  try {
    const {
      staffFilter = "all",
      page = 1,
      limit = 50,
      monthYear = "",
      departmentFilter = "all",
      search = ""
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 50, 1);

    // 1. Determine Date Range
    let startDate, endDate;
    if (monthYear) {
      const range = getMonthDateRange(monthYear);
      if (range) {
        startDate = range.start;
        const e = new Date(range.end);
        e.setDate(e.getDate() + 1);
        endDate = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
      }
    }

    if (!startDate) {
      const now = new Date();
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      endDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
    }

    // 2. Build User Base Query
    const userParams = [];
    let userQuery = `
      SELECT 
          u.user_name AS name,
          u.employee_id,
          u.department,
          u.email_id AS email
      FROM public.users u
      WHERE LOWER(u.role::text) = 'user'
        AND u.user_name IS NOT NULL
        AND u.user_name <> 'Sheelesh Marele'
    `;

    if (departmentFilter !== "all") {
      userParams.push(departmentFilter);
      userQuery += ` AND u.department = $${userParams.length}`;
    }

    if (search && search.trim()) {
      userParams.push(`%${search.trim().toLowerCase()}%`);
      userQuery += ` AND (LOWER(u.user_name) LIKE $${userParams.length} 
                   OR LOWER(u.employee_id) LIKE $${userParams.length} 
                   OR LOWER(u.department) LIKE $${userParams.length})`;
    }

    if (staffFilter !== "all") {
      userParams.push(staffFilter);
      userQuery += ` AND u.user_name = $${userParams.length}`;
    }

    const usersRes = await pool.query(userQuery, userParams);
    const allUsers = usersRes.rows;

    if (allUsers.length === 0) {
      return res.json([]);
    }

    // 3. Fetch Task Summaries
    const checklistSummaryQuery = `
      SELECT
          c.name,
          COUNT(*) AS total_tasks,
          COUNT(*) FILTER (WHERE lower(c.status::text) = 'yes') AS total_completed_tasks,
          COUNT(*) FILTER (
              WHERE lower(c.status::text) = 'yes'
                AND c.submission_date::date <= c.task_start_date::date
          ) AS total_done_on_time
      FROM public.checklist c
      WHERE c.task_start_date::date >= $1::date
        AND c.task_start_date::date <  $2::date
        AND c.task_start_date::date < CURRENT_DATE
      GROUP BY c.name
    `;

    const maintenanceSummaryQuery = `
      SELECT
          c.doer_name AS name,
          COUNT(*) AS total_tasks,
          COUNT(*) FILTER (WHERE lower(c.task_status::text) = 'yes') AS total_completed_tasks,
          COUNT(*) FILTER (
              WHERE lower(c.task_status::text) = 'yes'
                AND c.actual_date::date <= c.task_start_date::date
          ) AS total_done_on_time
      FROM public.maintenance_task_assign c
      WHERE c.task_start_date::date >= $1::date
        AND c.task_start_date::date <  $2::date
        AND c.task_start_date::date <= CURRENT_DATE
      GROUP BY c.doer_name
    `;

    const [chkRes, mntRes] = await Promise.all([
      pool.query(checklistSummaryQuery, [startDate, endDate]),
      maintenancePool.query(maintenanceSummaryQuery, [startDate, endDate])
    ]);

    const chkMap = new Map(chkRes.rows.map(r => [r.name?.toLowerCase(), r]));
    const mntMap = new Map(mntRes.rows.map(r => [r.name?.toLowerCase(), r]));

    // 4. Merge and Paginate
    const mergedData = allUsers.map(user => {
      const nameKey = user.name?.toLowerCase();
      const chk = chkMap.get(nameKey) || { total_tasks: 0, total_completed_tasks: 0, total_done_on_time: 0 };
      const mnt = mntMap.get(nameKey) || { total_tasks: 0, total_completed_tasks: 0, total_done_on_time: 0 };

      const totalTasks = Number(chk.total_tasks) + Number(mnt.total_tasks);
      const completedTasks = Number(chk.total_completed_tasks) + Number(mnt.total_completed_tasks);
      const doneOnTime = Number(chk.total_done_on_time) + Number(mnt.total_done_on_time);

      const completionScore = totalTasks > 0 ? Math.max(Math.round((completedTasks * 100) / totalTasks - 100), -100) : 0;
      const ontimeScore = completedTasks > 0 ? Math.max(Math.round((doneOnTime * 100) / completedTasks - 100), -100) : 0;
      const totalScore = Math.max(completionScore + ontimeScore, -100);

      return {
        id: nameKey.replace(/\s+/g, "-"),
        name: user.name,
        employee_id: user.employee_id,
        email: user.email || `${nameKey.replace(/\s+/g, ".")}@example.com`,
        department: user.department,
        totalTasks,
        completedTasks,
        doneOnTime,
        completion_score: completionScore,
        ontime_score: ontimeScore,
        totalScore,
        pendingTasks: totalTasks - completedTasks,
        onTimeScore: totalScore
      };
    });

    mergedData.sort((a, b) => a.name.localeCompare(b.name));
    const totalCount = mergedData.length;
    const paginatedData = mergedData.slice((pageNumber - 1) * limitNumber, pageNumber * limitNumber);

    return res.json(paginatedData.map(d => ({ ...d, total_count: totalCount })));

  } catch (err) {
    console.error("🔥 STAFF TASKS ERROR →", err);
    res.status(500).json({ error: err.message });
  }
};

// NEW: Export all staff data for CSV download (production-safe with limit)
export const exportAllStaffTasks = async (req, res) => {
  try {
    const {
      dashboardType = "checklist",
      staffFilter = "all",
      monthYear = "",
      departmentFilter = "all"
    } = req.query;

    // Production safety: Maximum 10,000 records
    const MAX_EXPORT_LIMIT = 10000;

    // 1. Determine Date Range (same as getStaffTasks)
    let startDate, endDate;
    if (monthYear) {
      const range = getMonthDateRange(monthYear);
      if (range) {
        startDate = range.start;
        const e = new Date(range.end);
        e.setDate(e.getDate() + 1);
        endDate = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
      }
    }

    if (!startDate) {
      const now = new Date();
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      endDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
    }

    // 2. Use same queries as getStaffTasks
    const checklistDeptCondition = departmentFilter !== "all"
      ? `AND c.department = $3`
      : '';

    const checklistQuery = `
      WITH base_tasks AS (
          SELECT
              c.name AS name,
              u.employee_id,
              c.status AS status,
              c.task_start_date::date AS task_date,
              c.submission_date::date AS submission_date_only,
              c.department AS department
          FROM public.checklist c
          LEFT JOIN public.users u
              ON c.name = u.user_name
          WHERE c.task_start_date::date >= $1::date
            AND c.task_start_date::date <  $2::date
            AND c.task_start_date::date < CURRENT_DATE
            AND c.name <> 'Sheelesh Marele'
            ${checklistDeptCondition}
      ),
      summary AS (
          SELECT
              department,
              name AS doer,
              employee_id,
              COUNT(*) AS total_tasks,
              COUNT(*) FILTER (WHERE lower(status::text) = 'yes') AS total_completed_tasks,
              COUNT(*) FILTER (
                  WHERE lower(status::text) = 'yes'
                    AND submission_date_only <= task_date
              ) AS total_done_on_time
          FROM base_tasks
          GROUP BY department, name, employee_id
      ),
      scores AS (
          SELECT
              department,
              doer,
              employee_id,
              total_tasks,
              total_completed_tasks,
              total_done_on_time,
              GREATEST(
                  COALESCE(
                      ROUND((total_completed_tasks::numeric / NULLIF(total_tasks,0)) * 100 - 100, 2),
                      0
                  ),
                  -100
              ) AS completion_score,
              GREATEST(
                  COALESCE(
                      ROUND((total_done_on_time::numeric / NULLIF(total_completed_tasks,0)) * 100 - 100, 2),
                      0
                  ),
                  -100
              ) AS ontime_score
          FROM summary
      )
      SELECT
          department,
          doer,
          employee_id,
          total_tasks,
          total_completed_tasks,
          total_done_on_time,
          completion_score,
          ontime_score,
          GREATEST(
              ROUND(COALESCE(completion_score,0) + COALESCE(ontime_score,0), 2),
              -100
          ) AS total_score
      FROM scores
    `;

    const maintenanceDeptCondition = departmentFilter !== "all"
      ? `AND c.doer_department = $3`
      : '';

    const maintenanceQuery = `
      WITH base_tasks AS (
          SELECT
              c.doer_name AS name,
              c.task_status AS status,
              c.task_start_date::date AS task_date,
              c.actual_date::date AS submission_date_only,
              c.doer_department AS department
          FROM public.maintenance_task_assign c
          WHERE c.task_start_date::date >= $1::date
            AND c.task_start_date::date <  $2::date
            AND c.task_start_date::date <= CURRENT_DATE
            AND c.doer_name <> 'Sheelesh Marele'
            ${maintenanceDeptCondition}
      ),
      summary AS (
          SELECT
              department,
              name AS doer,
              COUNT(*) AS total_tasks,
              COUNT(*) FILTER (WHERE lower(status::text) = 'yes') AS total_completed_tasks,
              COUNT(*) FILTER (
                  WHERE lower(status::text) = 'yes'
                    AND submission_date_only <= task_date
              ) AS total_done_on_time
          FROM base_tasks
          GROUP BY department, name
      ),
      scores AS (
          SELECT
              department,
              doer,
              total_tasks,
              total_completed_tasks,
              total_done_on_time,
              GREATEST(
                  COALESCE(
                      ROUND((total_completed_tasks::numeric / NULLIF(total_tasks,0)) * 100 - 100, 2),
                      0
                  ),
                  -100
              ) AS completion_score,
              GREATEST(
                  COALESCE(
                      ROUND((total_done_on_time::numeric / NULLIF(total_completed_tasks,0)) * 100 - 100, 2),
                      0
                  ),
                  -100
              ) AS ontime_score
          FROM summary
      )
      SELECT
          department,
          doer,
          total_tasks,
          total_completed_tasks,
          total_done_on_time,
          completion_score,
          ontime_score,
          GREATEST(
              ROUND(COALESCE(completion_score,0) + COALESCE(ontime_score,0), 2),
              -100
          ) AS total_score
      FROM scores
    `;

    // 3. Execute queries
    let checklistRows = [];
    let maintenanceRows = [];

    const queryParams = departmentFilter !== "all"
      ? [startDate, endDate, departmentFilter]
      : [startDate, endDate];

    try {
      const cRes = await pool.query(checklistQuery, queryParams);
      checklistRows = cRes.rows;
    } catch (e) {
      console.error("Export Checklist Query Error:", e.message);
    }

    try {
      const mRes = await maintenancePool.query(maintenanceQuery, queryParams);
      maintenanceRows = mRes.rows;
    } catch (e) {
      console.error("Export Maintenance Query Error:", e.message);
    }

    // 4. Merge data (same logic as getStaffTasks)
    const staffMap = new Map();

    const processRow = (row, type) => {
      const name = row.doer?.trim();
      if (!name) return;
      const key = name.toLowerCase();

      if (!staffMap.has(key)) {
        staffMap.set(key, {
          id: key.replace(/\s+/g, "-"),
          name: name,
          employee_id: row.employee_id || null,
          email: `${key.replace(/\s+/g, ".")}@example.com`,
          department: row.department,
          totalTasks: 0,
          completedTasks: 0,
          doneOnTime: 0,
          totalScore: 0,
          completion_score: 0,
          ontime_score: 0,
          checklistScore: 0,
          maintenanceScore: 0
        });
      }

      const staff = staffMap.get(key);

      if (row.employee_id && !staff.employee_id) {
        staff.employee_id = row.employee_id;
      }

      staff.totalTasks += Number(row.total_tasks || 0);
      staff.completedTasks += Number(row.total_completed_tasks || 0);
      staff.doneOnTime += Number(row.total_done_on_time || 0);

      const completionScore = Number(row.completion_score || 0);
      const ontimeScore = Number(row.ontime_score || 0);
      const totalScore = Number(row.total_score || 0);

      staff.totalScore += totalScore;

      if (type === 'checklist') {
        staff.checklistScore = totalScore;
        staff.completion_score += completionScore;
        staff.ontime_score += ontimeScore;
      }
      if (type === 'maintenance') {
        staff.maintenanceScore = totalScore;
        staff.completion_score += completionScore;
        staff.ontime_score += ontimeScore;
      }
    };

    checklistRows.forEach(r => processRow(r, 'checklist'));
    maintenanceRows.forEach(r => processRow(r, 'maintenance'));

    let finalData = Array.from(staffMap.values());

    // 5. Apply staff filter
    if (staffFilter && staffFilter !== "all") {
      finalData = finalData.filter(
        (s) => s.name.toLowerCase() === staffFilter.toLowerCase()
      );
    }

    // 6. Sort by name
    finalData.sort((a, b) => a.name.localeCompare(b.name));

    // 7. Production safety: Limit to MAX_EXPORT_LIMIT
    if (finalData.length > MAX_EXPORT_LIMIT) {
      console.warn(`Export limited to ${MAX_EXPORT_LIMIT} records (total: ${finalData.length})`);
      finalData = finalData.slice(0, MAX_EXPORT_LIMIT);
    }

    // 8. Map to final format
    const mappedData = finalData.map(s => ({
      ...s,
      pendingTasks: s.totalTasks - s.completedTasks,
      onTimeScore: Number(s.totalScore.toFixed(2))
    }));

    return res.json({
      data: mappedData,
      total: mappedData.length,
      limited: finalData.length === MAX_EXPORT_LIMIT
    });

  } catch (err) {
    console.error("🔥 EXPORT ERROR →", err);
    res.status(500).json({ error: err.message });
  }
};


export const getStaffCount = async (req, res) => {
  try {
    const { departmentFilter = "all", search = "" } = req.query;

    let query = `
      SELECT COUNT(*) FROM users
      WHERE user_name IS NOT NULL AND user_name != ''
      AND LOWER(role::text) = 'user'
      AND user_name <> 'Sheelesh Marele'
    `;

    const params = [];
    if (departmentFilter !== "all") {
      params.push(departmentFilter);
      query += ` AND department = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(user_name) LIKE $${params.length} 
                 OR LOWER(employee_id) LIKE $${params.length} 
                 OR LOWER(department) LIKE $${params.length})`;
    }

    const result = await pool.query(query, params);
    return res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("Error in getStaffCount:", err);
    res.status(500).json({ error: "Error fetching total users count" });
  }
};

export const getUsersCount = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) FROM users
      WHERE user_name IS NOT NULL AND user_name != ''
      AND LOWER(role::text) = 'user'
    `);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("Error in getUsersCount:", err);
    res.status(500).json({ error: "Error fetching total users count" });
  }
};
