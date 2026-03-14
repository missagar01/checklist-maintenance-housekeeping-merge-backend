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
      search = "",
      sortBy = "name", // 'name', 'score', 'division', 'department'
      sortOrder = "asc" // 'asc', 'desc'
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 50, 1);

    const { startDate, endDate } = resolveDateRange(monthYear);

    const queryParams = [startDate, endDate];
    let filterIdx = 3;
    let deptClause = "";
    let divClause = "";
    let staffClause = "";
    let searchClause = "";

    if (departmentFilter !== "all") {
      deptClause = `AND LOWER(department) = LOWER($${filterIdx++})`;
      queryParams.push(departmentFilter);
    }
    if (divisionFilter && divisionFilter !== "all") {
      divClause = `AND LOWER(division) = LOWER($${filterIdx++})`;
      queryParams.push(divisionFilter);
    }
    if (staffFilter !== "all") {
      staffClause = `AND LOWER(user_name) = LOWER($${filterIdx++})`;
      queryParams.push(staffFilter);
    }
    if (search && search.trim()) {
      searchClause = `AND (LOWER(user_name) LIKE $${filterIdx} OR LOWER(employee_id) LIKE $${filterIdx} OR LOWER(department) LIKE $${filterIdx})`;
      queryParams.push(`%${search.trim().toLowerCase()}%`);
      filterIdx++;
    }

    // Unified query to calculate scores for ALL filtered users
    const unifiedScoreQuery = `
      WITH filtered_users AS (
          SELECT user_name, employee_id, department, division, email_id
          FROM public.users
          WHERE LOWER(role::text) = 'user'
            AND user_name IS NOT NULL
            AND user_name <> 'Sheelesh Marele'
            ${deptClause}
            ${divClause}
            ${staffClause}
            ${searchClause}
      ),
      base_tasks AS (
          SELECT u.user_name AS doer, c.status, 'checklist' AS source
          FROM public.checklist c
          JOIN filtered_users u ON c.name = u.user_name
          WHERE c.task_start_date::date >= $1::date
            AND c.task_start_date::date <  $2::date
            AND c.task_start_date::date <= CURRENT_DATE

          UNION ALL

          SELECT u.user_name AS doer, m.task_status AS status, 'maintenance' AS source
          FROM public.maintenance_task_assign m
          JOIN filtered_users u ON m.doer_name = u.user_name
          WHERE m.task_start_date::date >= $1::date
            AND m.task_start_date::date <  $2::date
            AND m.task_start_date::date <= CURRENT_DATE

          UNION ALL

          SELECT u.user_name AS doer, a.status, 'housekeeping' AS source
          FROM public.assign_task a
          CROSS JOIN unnest(
              string_to_array(
                  regexp_replace(a.hod, '\\s*(and|&)\\s*', ',', 'gi'), ','
              )
          ) AS hod_name
          JOIN filtered_users u ON trim(hod_name) = u.user_name
          WHERE a.task_start_date::date >= $1::date
            AND a.task_start_date::date <  $2::date
            AND a.task_start_date::date <= CURRENT_DATE
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
      ),
      user_scores AS (
          SELECT
              fu.user_name AS name,
              fu.employee_id,
              fu.department,
              fu.division,
              fu.email_id AS email,
              COALESCE(s.total_tasks, 0) AS total_tasks,
              COALESCE(s.total_completed_tasks, 0) AS total_completed_tasks,
              COALESCE(s.checklist_total, 0) AS checklist_total,
              COALESCE(s.checklist_done, 0) AS checklist_done,
              COALESCE(s.maintenance_total, 0) AS maintenance_total,
              COALESCE(s.maintenance_done, 0) AS maintenance_done,
              COALESCE(s.housekeeping_total, 0) AS housekeeping_total,
              COALESCE(s.housekeeping_done, 0) AS housekeeping_done,
              GREATEST(
                  COALESCE(ROUND((s.total_completed_tasks::numeric / NULLIF(s.total_tasks,0)) * 100 - 100, 2), 0),
                  -100
              ) AS completion_score
          FROM filtered_users fu
          LEFT JOIN summary s ON fu.user_name = s.doer
      )
      SELECT *, COUNT(*) OVER() as full_count FROM user_scores
    `;

    const result = await pool.query(unifiedScoreQuery, queryParams);
    const allRows = result.rows;

    if (allRows.length === 0) return res.json([]);

    const totalCount = parseInt(allRows[0].full_count);

    // 3. Sort all data
    allRows.sort((a, b) => {
      let valA, valB;
      
      if (sortBy === 'score' || sortBy === 'completion_score') {
        valA = Number(a.completion_score || 0);
        valB = Number(b.completion_score || 0);
      } else if (sortBy === 'division') {
        valA = (a.division || '').toLowerCase();
        valB = (b.division || '').toLowerCase();
      } else if (sortBy === 'department') {
        valA = (a.department || '').toLowerCase();
        valB = (b.department || '').toLowerCase();
      } else {
        // Default to name
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'desc' ? 1 : -1;
      if (valA > valB) return sortOrder === 'desc' ? -1 : 1;
      
      // Secondary sort by name
      if (sortBy !== 'name') {
          return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
      }
      return 0;
    });

    // 4. Paginate
    const startIndex = (pageNumber - 1) * limitNumber;
    const paginatedRows = allRows.slice(startIndex, startIndex + limitNumber);

    // 5. Map to final structure
    const mergedData = paginatedRows.map(row => {
      const nameKey = row.name?.toLowerCase();
      const totalTasks = Number(row.total_tasks || 0);
      const completedTasks = Number(row.total_completed_tasks || 0);
      const completionScore = Number(row.completion_score || 0);

      return {
        id: nameKey.replace(/\s+/g, "-"),
        name: row.name,
        employee_id: row.employee_id,
        email: row.email || `${nameKey.replace(/\s+/g, ".")}@example.com`,
        department: row.department,
        division: row.division,
        totalTasks,
        completedTasks,
        doneOnTime: 0,
        pendingTasks: totalTasks - completedTasks,
        completion_score: completionScore,
        ontime_score: 0,
        totalScore: completionScore,
        onTimeScore: completionScore,
        total_count: totalCount,
        breakdown: {
          checklist: { total: Number(row.checklist_total || 0), done: Number(row.checklist_done || 0) },
          maintenance: { total: Number(row.maintenance_total || 0), done: Number(row.maintenance_done || 0) },
          housekeeping: { total: Number(row.housekeeping_total || 0), done: Number(row.housekeeping_done || 0) }
        }
      };
    });

    return res.json(mergedData);

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
