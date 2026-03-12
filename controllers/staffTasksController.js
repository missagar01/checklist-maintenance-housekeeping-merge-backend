import { pool } from "../config/db.js";

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

// ─────────────────────────────────────────────
// Helper: build date range from monthYear param
// ─────────────────────────────────────────────
const resolveDateRange = (monthYear) => {
  let startDate, endDate;
  if (monthYear) {
    const range = getMonthDateRange(monthYear);
    if (range) {
      startDate = range.start;
      const e = new Date(range.end);
      e.setDate(e.getDate() + 1);
      endDate = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
    }
  }
  if (!startDate) {
    const now = new Date();
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    endDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return { startDate, endDate };
};

// ─────────────────────────────────────────────
// GET STAFF TASKS (paginated, for dashboard)
// ─────────────────────────────────────────────
export const getStaffTasks = async (req, res) => {
  try {
    const {
      staffFilter = "all",
      page = 1,
      limit = 50,
      monthYear = "",
      departmentFilter = "all",
      divisionFilter = "all",
      search = ""
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 50, 1);

    const { startDate, endDate } = resolveDateRange(monthYear);

    // 1. Query users table for pagination + total count
    const userParams = [];
    let userQuery = `
      SELECT
          u.user_name AS name,
          u.employee_id,
          u.department,
          u.division,
          u.email_id AS email
      FROM public.users u
      WHERE LOWER(u.role::text) = 'user'
        AND u.user_name IS NOT NULL
        AND u.user_name <> 'Sheelesh Marele'
    `;

    if (departmentFilter !== "all") {
      userParams.push(departmentFilter);
      userQuery += ` AND LOWER(u.department) = LOWER($${userParams.length})`;
    }
    if (divisionFilter && divisionFilter !== "all") {
      userParams.push(divisionFilter);
      userQuery += ` AND LOWER(u.division) = LOWER($${userParams.length})`;
    }
    if (search && search.trim()) {
      userParams.push(`%${search.trim().toLowerCase()}%`);
      userQuery += ` AND (LOWER(u.user_name) LIKE $${userParams.length}
                   OR LOWER(u.employee_id) LIKE $${userParams.length}
                   OR LOWER(u.department) LIKE $${userParams.length})`;
    }
    if (staffFilter !== "all") {
      userParams.push(staffFilter);
      userQuery += ` AND LOWER(u.user_name) = LOWER($${userParams.length})`;
    }
    userQuery += ` ORDER BY u.division ASC NULLS LAST, u.department ASC NULLS LAST, u.user_name ASC`;

    const usersRes = await pool.query(userQuery, userParams);
    const allUsers = usersRes.rows;

    if (allUsers.length === 0) return res.json([]);

    const startIndex = (pageNumber - 1) * limitNumber;
    const paginatedUsers = allUsers.slice(startIndex, startIndex + limitNumber);

    if (paginatedUsers.length === 0) return res.json([]);

    const userNames = paginatedUsers.map(u => u.name);

    // 2. Single unified score query for only the paginated users
    const unifiedQuery = `
      WITH base_tasks AS (
          SELECT u.user_name AS doer, c.status, 'checklist' AS source
          FROM public.checklist c
          JOIN public.users u ON c.name = u.user_name
          WHERE c.task_start_date::date >= $1::date
            AND c.task_start_date::date <  $2::date
            AND c.task_start_date::date <= CURRENT_DATE
            AND u.user_name = ANY($3)

          UNION ALL

          SELECT u.user_name AS doer, m.task_status AS status, 'maintenance' AS source
          FROM public.maintenance_task_assign m
          JOIN public.users u ON m.doer_name = u.user_name
          WHERE m.task_start_date::date >= $1::date
            AND m.task_start_date::date <  $2::date
            AND m.task_start_date::date <= CURRENT_DATE
            AND u.user_name = ANY($3)

          UNION ALL

          SELECT u.user_name AS doer, a.status, 'housekeeping' AS source
          FROM public.assign_task a
          CROSS JOIN unnest(
              string_to_array(
                  regexp_replace(a.hod, '\\s*(and|&)\\s*', ',', 'gi'), ','
              )
          ) AS hod_name
          JOIN public.users u ON trim(hod_name) = u.user_name
          WHERE a.task_start_date::date >= $1::date
            AND a.task_start_date::date <  $2::date
            AND a.task_start_date::date <= CURRENT_DATE
            AND u.user_name = ANY($3)
      ),
      summary AS (
          SELECT
              doer,
              COUNT(*) AS total_tasks,
              COUNT(*) FILTER (WHERE lower(status::text) = 'yes') AS total_completed_tasks,
              COUNT(*) FILTER (WHERE source = 'checklist') AS checklist_total,
              COUNT(*) FILTER (WHERE source = 'checklist' AND lower(status::text) = 'yes') AS checklist_done,
              COUNT(*) FILTER (WHERE source = 'maintenance') AS maintenance_total,
              COUNT(*) FILTER (WHERE source = 'maintenance' AND lower(status::text) = 'yes') AS maintenance_done,
              COUNT(*) FILTER (WHERE source = 'housekeeping') AS housekeeping_total,
              COUNT(*) FILTER (WHERE source = 'housekeeping' AND lower(status::text) = 'yes') AS housekeeping_done
          FROM base_tasks
          GROUP BY doer
      )
      SELECT
          doer,
          total_tasks,
          total_completed_tasks,
          checklist_total, checklist_done,
          maintenance_total, maintenance_done,
          housekeeping_total, housekeeping_done,
          GREATEST(
              COALESCE(ROUND((total_completed_tasks::numeric / NULLIF(total_tasks,0)) * 100 - 100, 2), 0),
              -100
          ) AS completion_score
      FROM summary
    `;

    const scoreRes = await pool.query(unifiedQuery, [startDate, endDate, userNames]);
    const scoreMap = new Map(scoreRes.rows.map(r => [r.doer?.toLowerCase(), r]));

    // 3. Merge score data with user info
    const mergedData = paginatedUsers.map(user => {
      const nameKey = user.name?.toLowerCase();
      const score = scoreMap.get(nameKey);
      const totalTasks     = Number(score?.total_tasks || 0);
      const completedTasks = Number(score?.total_completed_tasks || 0);
      const completionScore = Number(score?.completion_score || 0);

      return {
        id: nameKey.replace(/\s+/g, "-"),
        name: user.name,
        employee_id: user.employee_id,
        email: user.email || `${nameKey.replace(/\s+/g, ".")}@example.com`,
        department: user.department,
        division: user.division,
        totalTasks,
        completedTasks,
        doneOnTime: 0,
        pendingTasks: totalTasks - completedTasks,
        completion_score: completionScore,
        ontime_score: 0,
        totalScore: completionScore,
        onTimeScore: completionScore,
        // Breakdown for modal
        breakdown: {
          checklist: { total: Number(score?.checklist_total || 0), done: Number(score?.checklist_done || 0) },
          maintenance: { total: Number(score?.maintenance_total || 0), done: Number(score?.maintenance_done || 0) },
          housekeeping: { total: Number(score?.housekeeping_total || 0), done: Number(score?.housekeeping_done || 0) }
        }
      };
    });

    mergedData.sort((a, b) => {
      const divA = (a.division || '').toLowerCase();
      const divB = (b.division || '').toLowerCase();
      if (divA !== divB) return divA.localeCompare(divB);
      const deptA = (a.department || '').toLowerCase();
      const deptB = (b.department || '').toLowerCase();
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      return (a.name || '').localeCompare(b.name || '');
    });
    const totalCount = allUsers.length;

    return res.json(mergedData.map(d => ({ ...d, total_count: totalCount })));

  } catch (err) {
    console.error("🔥 STAFF TASKS ERROR →", err);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
// EXPORT ALL STAFF TASKS (for CSV download)
// ─────────────────────────────────────────────
export const exportAllStaffTasks = async (req, res) => {
  try {
    const {
      staffFilter = "all",
      monthYear = "",
      departmentFilter = "all",
      divisionFilter = "all"
    } = req.query;

    const MAX_EXPORT_LIMIT = 10000;

    const { startDate, endDate } = resolveDateRange(monthYear);

    // Build optional filter conditions
    const queryParams = [startDate, endDate];
    let deptCondition = "";
    let staffCondition = "";

    if (departmentFilter !== "all") {
      queryParams.push(departmentFilter);
      deptCondition = `AND LOWER(u.department) = LOWER($${queryParams.length})`;
    }
    let divCondition = "";
    if (divisionFilter && divisionFilter !== "all") {
      queryParams.push(divisionFilter);
      divCondition = `AND LOWER(u.division) = LOWER($${queryParams.length})`;
    }
    if (staffFilter !== "all") {
      queryParams.push(staffFilter);
      staffCondition = `AND LOWER(u.user_name) = LOWER($${queryParams.length})`;
    }

    // Single unified query across all 3 task sources
    const unifiedQuery = `
      WITH base_tasks AS (
          SELECT u.division, u.department, u.user_name AS doer, u.employee_id, c.status
          FROM public.checklist c
          JOIN public.users u ON c.name = u.user_name
          WHERE c.task_start_date::date >= $1::date
            AND c.task_start_date::date <  $2::date
            AND c.task_start_date::date <= CURRENT_DATE
            AND u.user_name <> 'Sheelesh Marele'
            ${deptCondition} ${divCondition} ${staffCondition}

          UNION ALL

          SELECT u.division, u.department, u.user_name AS doer, u.employee_id, m.task_status AS status
          FROM public.maintenance_task_assign m
          JOIN public.users u ON m.doer_name = u.user_name
          WHERE m.task_start_date::date >= $1::date
            AND m.task_start_date::date <  $2::date
            AND m.task_start_date::date <= CURRENT_DATE
            AND u.user_name <> 'Sheelesh Marele'
            ${deptCondition} ${divCondition} ${staffCondition}

          UNION ALL

          SELECT u.division, u.department, u.user_name AS doer, u.employee_id, a.status
          FROM public.assign_task a
          CROSS JOIN unnest(
              string_to_array(
                  regexp_replace(a.hod, '\\s*(and|&)\\s*', ',', 'gi'), ','
              )
          ) AS hod_name
          JOIN public.users u ON trim(hod_name) = u.user_name
          WHERE a.task_start_date::date >= $1::date
            AND a.task_start_date::date <  $2::date
            AND a.task_start_date::date <= CURRENT_DATE
            AND u.user_name <> 'Sheelesh Marele'
            ${deptCondition} ${divCondition} ${staffCondition}
      ),
      summary AS (
          SELECT
              division, department, doer, employee_id,
              COUNT(*) AS total_tasks,
              COUNT(*) FILTER (WHERE lower(status::text) = 'yes') AS total_completed_tasks,
              COUNT(*) FILTER (WHERE lower(status::text) <> 'yes' OR status IS NULL) AS not_completed_tasks
          FROM base_tasks
          GROUP BY division, department, doer, employee_id
      )
      SELECT
          division, department, doer, employee_id,
          total_tasks, total_completed_tasks, not_completed_tasks,
          GREATEST(
              COALESCE(ROUND((total_completed_tasks::numeric / NULLIF(total_tasks,0)) * 100 - 100, 2), 0),
              -100
          ) AS completion_score
      FROM summary
      ORDER BY division, department, doer
      LIMIT ${MAX_EXPORT_LIMIT}
    `;

    const result = await pool.query(unifiedQuery, queryParams);
    const rows = result.rows;

    const mappedData = rows.map(r => ({
      id: r.doer?.toLowerCase().replace(/\s+/g, "-"),
      name: r.doer,
      employee_id: r.employee_id,
      department: r.department,
      division: r.division,
      totalTasks: Number(r.total_tasks),
      completedTasks: Number(r.total_completed_tasks),
      pendingTasks: Number(r.not_completed_tasks),
      completion_score: Number(r.completion_score),
      ontime_score: 0,
      totalScore: Number(r.completion_score),
      onTimeScore: Number(r.completion_score)
    }));

    return res.json({
      data: mappedData,
      total: mappedData.length,
      limited: rows.length === MAX_EXPORT_LIMIT
    });

  } catch (err) {
    console.error("🔥 EXPORT ERROR →", err);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
// STAFF COUNT (for pagination)
// ─────────────────────────────────────────────
export const getStaffCount = async (req, res) => {
  try {
    const { departmentFilter = "all", divisionFilter = "all", search = "" } = req.query;

    let query = `
      SELECT COUNT(*) FROM users
      WHERE user_name IS NOT NULL AND user_name != ''
      AND LOWER(role::text) = 'user'
      AND user_name <> 'Sheelesh Marele'
    `;

    const params = [];
    if (departmentFilter !== "all") {
      params.push(departmentFilter);
      query += ` AND LOWER(department) = LOWER($${params.length})`;
    }

    if (divisionFilter && divisionFilter !== "all") {
      params.push(divisionFilter);
      query += ` AND LOWER(division) = LOWER($${params.length})`;
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
