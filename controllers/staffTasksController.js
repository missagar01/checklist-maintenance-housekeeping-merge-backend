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
      dashboardType = "checklist",
      staffFilter = "all",
      page = 1,
      limit = 50,
      monthYear = "",
      departmentFilter = "all"
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 50, 1);

    // 1. Determine Date Range
    let startDate, endDate;
    if (monthYear) {
      const range = getMonthDateRange(monthYear);
      if (range) {
        startDate = range.start;
        // User query is < EndDate (Exclusive). 
        // Helper returns "2026-01-31". To make it exclusive for whole month, we want < "2026-02-01".
        const e = new Date(range.end);
        e.setDate(e.getDate() + 1);
        endDate = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
      }
    }

    // Default to Current Month if no range provided
    if (!startDate) {
      const now = new Date();
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      endDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
    }


    // 2. Checklist Query with Department Filter
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


    // 3. Maintenance Query with Department Filter
    const maintenanceDeptCondition = departmentFilter !== "all"
      ? `AND c.doer_department = $3`
      : '';

    const maintenanceQuery = `
      WITH base_tasks AS (
          SELECT
              c."Doer_Name" AS name,
              c."Task_Status" AS status,
              c."Task_Start_Date"::date AS task_date,
              c."Actual_Date"::date AS submission_date_only,
              c.doer_department AS department
          FROM public.maintenance_task_assign c
          WHERE c."Task_Start_Date"::date >= $1::date
            AND c."Task_Start_Date"::date <  $2::date
            AND c."Task_Start_Date"::date <= CURRENT_DATE
            AND c."Doer_Name" <> 'Sheelesh Marele'
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



    // 4. Execution
    // Note: maintenancePool is needed if they are different DBs.
    // Based on imports, maintenancePool exists.
    let checklistRows = [];
    let maintenanceRows = [];

    // Prepare query parameters based on department filter
    const queryParams = departmentFilter !== "all"
      ? [startDate, endDate, departmentFilter]
      : [startDate, endDate];

    try {
      const cRes = await pool.query(checklistQuery, queryParams);
      checklistRows = cRes.rows;
    } catch (e) {
      console.error("Checklist Query Error:", e.message);
    }

    try {
      const mRes = await maintenancePool.query(maintenanceQuery, queryParams);
      maintenanceRows = mRes.rows;
    } catch (e) {
      console.error("Maintenance Query Error:", e.message);
    }


    // 5. Merging Logic
    const staffMap = new Map();

    const processRow = (row, type) => {
      const name = row.doer?.trim();
      if (!name) return;
      const key = name.toLowerCase();

      if (!staffMap.has(key)) {
        staffMap.set(key, {
          id: key.replace(/\s+/g, "-"),
          name: name,
          employee_id: row.employee_id || null, // Preserve employee_id from checklist
          email: `${key.replace(/\s+/g, ".")}@example.com`,
          department: row.department,
          totalTasks: 0,
          completedTasks: 0,
          doneOnTime: 0,
          totalScore: 0,
          completion_score: 0,
          ontime_score: 0,
          // Debug info
          checklistScore: 0,
          maintenanceScore: 0
        });
      }

      const staff = staffMap.get(key);

      // Update employee_id if found in this row (from checklist)
      if (row.employee_id && !staff.employee_id) {
        staff.employee_id = row.employee_id;
      }

      staff.totalTasks += Number(row.total_tasks || 0);
      staff.completedTasks += Number(row.total_completed_tasks || 0);
      staff.doneOnTime += Number(row.total_done_on_time || 0);

      // Store individual scores
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

    // 6. Filtering (Staff Filter)
    if (staffFilter && staffFilter !== "all") {
      finalData = finalData.filter(
        (s) => s.name.toLowerCase() === staffFilter.toLowerCase()
      );
    }

    // 7. Sorting (Default by Name)
    finalData.sort((a, b) => a.name.localeCompare(b.name));

    // 8. Pagination (In Memory)
    const totalCount = finalData.length;
    const offset = (pageNumber - 1) * limitNumber;
    const paginatedData = finalData.slice(offset, offset + limitNumber);

    // Map to final format EXPECTED by frontend
    const mappedData = paginatedData.map(s => ({
      ...s,
      pendingTasks: s.totalTasks - s.completedTasks,
      onTimeScore: Number(s.totalScore.toFixed(2)), // Frontend expects "onTimeScore"
      total_count: totalCount // Include total count in response
    }));

    return res.json(mappedData);

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
              c."Doer_Name" AS name,
              c."Task_Status" AS status,
              c."Task_Start_Date"::date AS task_date,
              c."Actual_Date"::date AS submission_date_only,
              c.doer_department AS department
          FROM public.maintenance_task_assign c
          WHERE c."Task_Start_Date"::date >= $1::date
            AND c."Task_Start_Date"::date <  $2::date
            AND c."Task_Start_Date"::date <= CURRENT_DATE
            AND c."Doer_Name" <> 'Sheelesh Marele'
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
    const { monthYear, departmentFilter = "all" } = req.query;
    let startDate, endDate;

    if (monthYear) {
      const range = getMonthDateRange(monthYear);
      if (range) {
        startDate = range.start;
        const e = new Date(range.end);
        e.setDate(e.getDate() + 1);
        endDate = e.toISOString().split('T')[0];
      }
    }

    if (!startDate) {
      const now = new Date();
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      endDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
    }

    // Get distinct count from both tables
    const deptCondition = departmentFilter !== "all" ? "AND department = $3" : "";
    const params = departmentFilter !== "all" ? [startDate, endDate, departmentFilter] : [startDate, endDate];

    const checklistCountQuery = `
      SELECT COUNT(DISTINCT c.name) as count
      FROM public.checklist c
      WHERE c.task_start_date::date >= $1::date
        AND c.task_start_date::date < $2::date
        AND c.task_start_date::date < CURRENT_DATE
        AND c.name <> 'Sheelesh Marele'
        ${deptCondition}
    `;

    const maintenanceCountQuery = `
      SELECT COUNT(DISTINCT "Doer_Name") as count
      FROM public.maintenance_task_assign
      WHERE "Task_Start_Date"::date >= $1::date
        AND "Task_Start_Date"::date < $2::date
        AND "Task_Start_Date"::date <= CURRENT_DATE
        AND "Doer_Name" <> 'Sheelesh Marele'
        ${deptCondition.replace('department', 'doer_department')}
    `;

    const [checklistRes, maintenanceRes] = await Promise.all([
      pool.query(checklistCountQuery, params),
      maintenancePool.query(maintenanceCountQuery, params)
    ]);

    // Get unique names from both
    const checklistCount = Number(checklistRes.rows[0]?.count || 0);
    const maintenanceCount = Number(maintenanceRes.rows[0]?.count || 0);

    // Approximate total (may have some overlap)
    const totalCount = checklistCount + maintenanceCount;

    return res.json(totalCount);
  } catch (e) {
    console.error("Count Error:", e);
    return res.json(0);
  }
};

export const getUsersCount = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) FROM users
      WHERE user_name IS NOT NULL AND user_name != ''
    `);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("Error in getUsersCount:", err);
    res.status(500).json({ error: "Error fetching total users count" });
  }
};
