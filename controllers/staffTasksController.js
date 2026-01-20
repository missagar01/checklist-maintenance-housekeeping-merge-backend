import { pool } from "../config/db.js";

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
      monthYear = ""
    } = req.query;

    const tableName = getTableName(dashboardType);
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 50, 1);
    const offset = (pageNumber - 1) * limitNumber;

    const conditions = [];
    const params = [];

    const appendParam = (clause, value) => {
      params.push(value);
      conditions.push(`${clause}$${params.length}`);
    };

    const monthRange = getMonthDateRange(monthYear);

    if (monthRange) {
      appendParam("task_start_date::date >= ", monthRange.start);
      appendParam("task_start_date::date <= ", monthRange.end);
    } else {
      conditions.push("task_start_date <= NOW()");
    }

    conditions.push("task_start_date IS NOT NULL");
    conditions.push("name IS NOT NULL");
    conditions.push("TRIM(name) <> ''");
    conditions.push("name <> 'Sheelesh Marele'");

    if (staffFilter && staffFilter !== "all") {
      params.push(staffFilter);
      conditions.push(`LOWER(name) = LOWER($${params.length})`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const limitPlaceholder = params.length + 1;
    const offsetPlaceholder = params.length + 2;
    params.push(limitNumber, offset);

    const query = `
      WITH base_tasks AS (
        SELECT
          c.*,
          c.task_start_date::date AS task_date,
          c.submission_date::date AS submission_date_only
        FROM ${tableName} c
        ${whereClause}
      ),
      summary AS (
        SELECT
          department,
          name AS doer,
          COUNT(*) AS total_tasks,
          COUNT(*) FILTER (
            WHERE lower(status::text) = 'yes'
          ) AS total_completed_tasks,
          COUNT(*) FILTER (
            WHERE lower(status::text) = 'yes'
              AND submission_date_only IS NOT NULL
              AND task_date IS NOT NULL
              AND submission_date_only <= task_date
          ) AS total_done_on_time
        FROM base_tasks
        GROUP BY department, name
      )
      SELECT
        department,
        doer,
        total_tasks,
        total_completed_tasks,
        total_done_on_time,
        ROUND(
          (total_done_on_time::numeric / NULLIF(total_tasks,0)) * 100 - 100,
          2
        ) AS total_score
      FROM summary
      ORDER BY department, doer
      LIMIT $${limitPlaceholder}
      OFFSET $${offsetPlaceholder};
    `;

    const result = await pool.query(query, params);

    const finalData = result.rows.map((row) => {
      const total = Number(row.total_tasks);
      const completed = Number(row.total_completed_tasks);
      const doneOnTime = Number(row.total_done_on_time);
      const score = Number(row.total_score || 0);
      const pending = total - completed;

      return {
        id: row.doer.toLowerCase().replace(/\s+/g, "-"),
        name: row.doer,
        email: `${row.doer.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: pending,
        doneOnTime: doneOnTime,
        onTimeScore: score,
      };
    });

    return res.json(finalData);
  } catch (err) {
    console.error("🔥 REAL ERROR →", err);
    res.status(500).json({ error: err.message });
  }
};


export const getStaffCount = async (req, res) => {
  try {
    const { dashboardType = "checklist", staffFilter = "all" } = req.query;
    const tableName = getTableName(dashboardType);

    const conditions = [
      "name IS NOT NULL",
      "TRIM(name) <> ''",
      "name <> 'Sheelesh Marele'",
      "task_start_date IS NOT NULL",
      "task_start_date <= NOW()",
    ];
    const params = [];

    if (staffFilter && staffFilter !== "all") {
      params.push(staffFilter);
      conditions.push(`LOWER(name) = LOWER($${params.length})`);
    }

    const query = `
      SELECT DISTINCT name 
      FROM ${tableName}
      WHERE ${conditions.join(" AND ")}
    `;

    const result = await pool.query(query, params);
    const count = result.rows.length;

    return res.json(count);
  } catch (err) {
    console.error("Error in getStaffCount:", err);
    return res.status(500).json({ error: "Error fetching staff count" });
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
