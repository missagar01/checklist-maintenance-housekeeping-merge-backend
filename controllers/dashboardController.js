import { pool, maintenancePool } from "../config/db.js";
import { query as housekeepingQuery } from "../config/housekeppingdb.js";
import { refreshDeviceSync } from "../services/deviceSync.js";
import { getUniqueDepartmentsService } from "../services/dashboardServices.js";

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const logQueries = process.env.LOG_QUERIES === "true";
const log = (...args) => {
  if (logQueries) console.log(...args);
};

const getCurrentMonthRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const firstDayStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const currentDayStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  
  return { firstDayStr, currentDayStr };
};

const CHECKLIST_SOURCES = [
  {
    name: "checklist",
    db: "main",
    table: "checklist",
    selectClause:
      "task_id, task_description, name, department, frequency, task_start_date, submission_date, status",
    dateColumn: `"task_start_date"`,
    submissionColumn: `"submission_date"`,
    nameColumn: `"name"`,
    departmentColumn: `"department"`,
    statusColumn: `"status"`,
    statusColumnSafe: true
  },
  {
    name: "housekeeping",
    db: "housekeeping",
    table: "assign_task",
    selectClause:
      "task_id, task_description, name, department, frequency, task_start_date, submission_date, status",
    dateColumn: `"task_start_date"`,
    submissionColumn: `"submission_date"`,
    nameColumn: `"name"`,
    departmentColumn: `"department"`,
    statusColumn: `"status"`,
    statusColumnSafe: true
  },
  {
    name: "maintenance",
    db: "maintenance",
    table: "maintenance_task_assign",
    selectClause:
      `"Task_No" AS task_id,
       COALESCE("Description", '') AS task_description,
       "Doer_Name" AS name,
       COALESCE("doer_department", "machine_department") AS department,
       "Frequency" AS frequency,
       "Task_Start_Date" AS task_start_date,
       "Actual_Date" AS submission_date,
       "Task_Status" AS status`,
    dateColumn: `"Task_Start_Date"`,
    submissionColumn: `"Actual_Date"`,
    nameColumn: `"Doer_Name"`,
    departmentColumn: `COALESCE("doer_department", "machine_department")`,
    statusColumn: `"Task_Status"`,
    statusColumnSafe: false
  }
];

const buildTaskViewClause = ({
  taskView = "recent",
  dateColumn,
  submissionColumn,
  statusColumn,
  statusColumnSafe,
  sourceName,
  firstDayStr,
  currentDayStr,
  params,
  startIndex = 1
}) => {
  const conditions = [];
  let idx = startIndex;
  const view = taskView || "recent";

  if (view === "recent") {
    conditions.push(`${dateColumn}::date = CURRENT_DATE`);
    conditions.push(`${submissionColumn} IS NULL`);
  } else if (view === "upcoming") {
    conditions.push(`${dateColumn}::date = (CURRENT_DATE + INTERVAL '1 day')::date`);
    conditions.push(`${submissionColumn} IS NULL`);
  } else if (view === "overdue") {
    conditions.push(`${dateColumn}::date < CURRENT_DATE`);
    conditions.push(`${submissionColumn} IS NULL`);
    // Combine with 'current month' (on or after 1st)
    if (firstDayStr) {
      conditions.push(`${dateColumn} >= $${idx++}`);
      params.push(`${firstDayStr} 00:00:00`);
    }
  } else if (view === "notdone") {
    // Condition: status 'No' and submission_date IS NOT NULL
    // Strict Current Month Filter: 1st of Current Month -> 1st of Next Month (Exclusive)
    
    // 1. Status Check
    if (sourceName === "maintenance") {
      conditions.push(`LOWER("Task_Status") = 'no'`);
    } else if (statusColumn) {
      conditions.push(`LOWER(${statusColumn}::text) = 'no'`);
    }
    
    // 2. Submission Check
    conditions.push(`${submissionColumn} IS NOT NULL`);

    // 3. Date Range Check (Calculated locally to ensure consistency with Count API)
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startOfMonth = new Date(y, m, 1);
    const startOfNextMonth = new Date(y, m + 1, 1);

    const fmt = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    conditions.push(`${dateColumn} >= $${idx++}`);
    params.push(`${fmt(startOfMonth)} 00:00:00`);
    
    conditions.push(`${dateColumn} < $${idx++}`);
    params.push(`${fmt(startOfNextMonth)} 00:00:00`);

  } else if (view === "ignore_date") {
    // No date filter - allows custom conditions to work without conflicts
  } else {
    if (firstDayStr && currentDayStr) {
      conditions.push(`${dateColumn} >= $${idx++}`);
      params.push(`${firstDayStr} 00:00:00`);
      conditions.push(`${dateColumn} <= $${idx++}`);
      params.push(`${currentDayStr} 23:59:59`);
    }
  }

  return { conditions, nextIndex: idx };
};

const buildChecklistFilterConditions = (
  source,
  options,
  startIndex = 1
) => {
  const {
    role,
    staffFilter,
    username,
    departmentFilter,
    taskView,
    firstDayStr,
    currentDayStr
  } = options;

  const conditions = [];
  const params = [];
  let idx = startIndex;

  if (role === "user" && username) {
    conditions.push(`${source.nameColumn} = $${idx++}`);
    params.push(username);
  } else if (role === "admin" && staffFilter && staffFilter !== "all") {
    conditions.push(`${source.nameColumn} = $${idx++}`);
    params.push(staffFilter);
  }

  if (departmentFilter && departmentFilter !== "all") {
    conditions.push(`${source.departmentColumn} = $${idx++}`);
    params.push(departmentFilter);
  }

  const viewClause = buildTaskViewClause({
    taskView,
    dateColumn: source.dateColumn,
    submissionColumn: source.submissionColumn,
    statusColumn: source.statusColumn,
    statusColumnSafe: source.statusColumnSafe,
    sourceName: source.name,
    firstDayStr,
    currentDayStr,
    params,
    startIndex: idx
  });

  conditions.push(...viewClause.conditions);
  idx = viewClause.nextIndex;

  return { conditions, params };
};

const buildWhereClause = (conditions) =>
  conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

const executeSourceQuery = (source, text, params) => {
  if (source.db === "main") {
    return pool.query(text, params);
  }
  if (source.db === "housekeeping") {
    return housekeepingQuery(text, params);
  }
  if (source.db === "maintenance") {
    return maintenancePool.query(text, params);
  }
  throw new Error(`Unknown source DB: ${source.db}`);
};

const fetchUnifiedChecklistRows = async ({
  staffFilter,
  departmentFilter,
  role,
  taskView,
  username,
  page = 1,
  limit = 50
}) => {
  const { firstDayStr, currentDayStr } = getCurrentMonthRange();
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.max(Number(limit) || 50, 1);
  const offset = (normalizedPage - 1) * normalizedLimit;
  const perSourceLimit = offset + normalizedLimit;

  const sourcePromises = CHECKLIST_SOURCES.map(async (source) => {
    const { conditions, params } = buildChecklistFilterConditions(source, {
      role,
      staffFilter,
      departmentFilter,
      username,
      taskView,
      firstDayStr,
      currentDayStr
    });

    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    const query = `
      SELECT ${source.selectClause}
      FROM ${source.table}
      ${buildWhereClause(conditions)}
      ORDER BY ${source.dateColumn} ASC
      LIMIT $${limitParam}
      OFFSET $${offsetParam}
    `;

    const result = await executeSourceQuery(source, query, [
      ...params,
      perSourceLimit,
      0
    ]);

    return result.rows.map((row) => ({ ...row, source: source.name }));
  });

  const results = await Promise.all(sourcePromises);
  const combined = results.flat();

  const sorted = combined.sort((a, b) => {
    const aDate = new Date(a.task_start_date || 0);
    const bDate = new Date(b.task_start_date || 0);
    if (Number.isNaN(aDate.getTime())) return 1;
    if (Number.isNaN(bDate.getTime())) return -1;
    return aDate - bDate;
  });

  return sorted.slice(offset, offset + normalizedLimit);
};

const countUnifiedChecklistRows = async ({
  staffFilter,
  departmentFilter,
  role,
  taskView,
  username
}) => {
  const { firstDayStr, currentDayStr } = getCurrentMonthRange();

  const results = await Promise.all(
    CHECKLIST_SOURCES.map(async (source) => {
      const { conditions, params } = buildChecklistFilterConditions(source, {
        role,
        staffFilter,
        departmentFilter,
        username,
        taskView,
        firstDayStr,
        currentDayStr
      });

      const query = `SELECT COUNT(*) AS count FROM ${source.table} ${buildWhereClause(conditions)}`;
      // log("COUNT QUERY SOURCE =>", source.name, query, params); // Keep log
      try {
        const result = await executeSourceQuery(source, query, params);
        return { name: source.name, count: Number(result.rows[0]?.count || 0) };
      } catch (err) {
        console.error(`Error counting ${source.name}:`, err.message);
        return { name: source.name, count: 0 };
      }
    })
  );

  const total = results.reduce((a, b) => a + b.count, 0);
  const breakdown = results.reduce((acc, item) => {
    acc[item.name] = item.count;
    return acc;
  }, {});

  return { count: total, breakdown };
};

const countChecklistSources = async (options, conditionAugmenter) => {
  const { firstDayStr, currentDayStr } = getCurrentMonthRange();

  const results = await Promise.all(
    CHECKLIST_SOURCES.map(async (source) => {
      let { conditions, params } = buildChecklistFilterConditions(source, {
        ...options,
        firstDayStr,
        currentDayStr
      });

      if (conditionAugmenter) {
        const augmented = conditionAugmenter({ source, conditions, params });
        conditions = augmented.conditions;
        params = augmented.params;
      }

      const query = `SELECT COUNT(*) AS count FROM ${source.table} ${buildWhereClause(conditions)}`;
      try {
        const result = await executeSourceQuery(source, query, params);
        return { name: source.name, count: Number(result.rows[0]?.count || 0) };
      } catch (err) {
        console.error(`Error counting ${source.name}:`, err.message);
        return { name: source.name, count: 0 };
      }
    })
  );

  const total = results.reduce((a, b) => a + b.count, 0);
  const breakdown = results.reduce((acc, item) => {
    acc[item.name] = item.count;
    return acc;
  }, {});

  return { count: total, breakdown };
};

export const getDashboardData = async (req, res) => {
  try {
    const {
      dashboardType,
      staffFilter,
      page = 1,
      limit = 50,
      departmentFilter,
      role,
      username,
      taskView = "recent"
    } = req.query;

    if (dashboardType === "checklist") {
      const rows = await fetchUnifiedChecklistRows({
        staffFilter,
        departmentFilter,
        page,
        limit,
        taskView,
        role,
        username,
      });

      return res.json(rows);
    }

    const table = dashboardType;
    const offset = (page - 1) * limit;

    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    let query = `SELECT * FROM ${table} WHERE 1=1`;

    // ---------------------------
    // ROLE FILTER (USER)
    // ---------------------------
    if (role === "user" && username) {
      query += ` AND name = '${username}'`;
    }

    // ---------------------------
    // ADMIN STAFF FILTER
    // ---------------------------
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND name = '${staffFilter}'`;
    }

    // ---------------------------
    // DEPARTMENT FILTER
    // ---------------------------
    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND department = '${departmentFilter}'`;
    }

    // ---------------------------
    // TASK VIEW FILTERS
    // ---------------------------
    if (taskView === "recent") {
      // TODAY TASKS
      query += `
        AND task_start_date::date = CURRENT_DATE
      `;

      // For checklist: status is enum 'yes'/'no', compare directly
      if (dashboardType === "checklist") {
        // query += ` AND (status IS NULL OR status <> 'yes')`;
        query += ` AND submission_date IS NULL`;
      }
    }
    else if (taskView === "upcoming") {
      // TOMORROW TASKS - Use the exact query that works in DB
      query += `
        AND task_start_date::date = (CURRENT_DATE + INTERVAL '1 day')::date
      `;

      // For checklist: exclude completed tasks
      if (dashboardType === "checklist") {
        // query += ` AND (status IS NULL OR status <> 'yes')`;
        query += ` AND submission_date IS NULL`;
      }
    }
    else if (taskView === "overdue") {
      // PAST DUE + NOT COMPLETED
      query += `
        AND task_start_date::date < CURRENT_DATE
      `;

      if (dashboardType === "checklist") {
        // query += ` AND (status IS NULL OR status <> 'yes')`;
        query += ` AND submission_date IS NULL`;
      } else {
        query += ` AND submission_date IS NULL`;
      }
    }
    else if (taskView === "notdone") {
      // NOT DONE Tasks
      query += `
        AND LOWER(status::text) = 'no'
        AND submission_date IS NOT NULL
        AND task_start_date >= '${firstDayStr} 00:00:00'
        AND task_start_date <= '${currentDayStr} 23:59:59'
      `;
    }
    else if (taskView === "all") {
      // ALL TASKS IN CURRENT MONTH
      query += `
        AND task_start_date >= '${firstDayStr} 00:00:00'
        AND task_start_date <= '${currentDayStr} 23:59:59'
      `;
    }

    // ORDER + PAGINATION
    query += ` ORDER BY task_start_date ASC LIMIT ${limit} OFFSET ${offset}`;

    log("FINAL QUERY =>", query);

    const result = await pool.query(query);
    res.json(result.rows);

  } catch (err) {
    console.error("ERROR in getDashboardData:", err);
    res.status(500).send("Error fetching dashboard data");
  }
};

export const getTotalTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;

    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    if (dashboardType === "checklist") {
      const result = await countUnifiedChecklistRows({
        staffFilter,
        departmentFilter,
        role,
        username,
        taskView: "all"
      });
      return res.json(result);
    }

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
    `;

    // ROLE FILTER
    if (role === "user" && username) {
      query += ` AND name='${username}'`;
    }

    // STAFF FILTER (admin only)
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND name='${staffFilter}'`;
    }

    // DEPARTMENT FILTER (checklist only)
    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND department='${departmentFilter}'`;
    }

    const result = await pool.query(query);
    res.json({ count: Number(result.rows[0].count) });
  } catch (err) {
    console.error("TOTAL ERROR:", err.message);
    res.status(500).json({ error: "Error fetching total tasks" });
  }
};

export const getCompletedTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;

    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    if (dashboardType === "checklist") {
      const result = await countChecklistSources(
        {
          staffFilter,
          departmentFilter,
          role,
          username,
          taskView: "all"
        },
        ({ source, conditions, params }) => {
          if (source.name === "maintenance") {
            conditions.push(`${source.submissionColumn} IS NOT NULL`);
          } else if (source.statusColumnSafe && source.statusColumn) {
            conditions.push(`LOWER(${source.statusColumn}::text) = 'yes'`);
          }

          return { conditions, params };
        }
      );

      return res.json(result);
    }

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
    `;

    if (dashboardType === "checklist") {
      query += ` AND status = 'yes' `;
    } else {
      query += ` AND submission_date IS NOT NULL `;
    }

    if (role === "user" && username) query += ` AND name='${username}'`;
    if (role === "admin" && staffFilter !== "all") query += ` AND name='${staffFilter}'`;
    if (dashboardType === "checklist" && departmentFilter !== "all")
      query += ` AND department='${departmentFilter}'`;

    const result = await pool.query(query);
    res.json({ count: Number(result.rows[0].count) });
  } catch (err) {
    console.error("COMPLETED ERROR:", err.message);
    res.status(500).json({ error: "Error fetching completed tasks" });
  }
};

export const getPendingTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;
    const table = dashboardType;

    if (dashboardType === "checklist") {
      const result = await countUnifiedChecklistRows({
        staffFilter,
        departmentFilter,
        role,
        username,
        taskView: "recent"
      });

      return res.json(result);
    }

    // Align with "recent" list logic: only today's tasks that are not submitted
    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date::date = CURRENT_DATE
      AND submission_date IS NULL
    `;

    // Role filter
    if (role === "user" && username)
      query += ` AND name='${username}'`;

    if (role === "admin" && staffFilter !== "all")
      query += ` AND name='${staffFilter}'`;

    // Department filter
    if (dashboardType === "checklist" && departmentFilter !== "all")
      query += ` AND department='${departmentFilter}'`;

    const result = await pool.query(query);
    res.json({ count: Number(result.rows[0].count) });

  } catch (err) {
    console.error("PENDING ERROR:", err.message);
    res.status(500).json({ error: "Error fetching pending tasks" });
  }
};

export const getPendingToday = async (req, res) => {
  try {
    const { dashboardType, staffFilter = "all", departmentFilter = "all", role, username } = req.query;
    const table = dashboardType;

    const params = [];
    let idx = 1;

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date::date = CURRENT_DATE
      AND submission_date IS NULL
    `;

    if (role === "user" && username) {
      query += ` AND name=$${idx++}`;
      params.push(username);
    }

    if (role === "admin" && staffFilter !== "all") {
      query += ` AND name=$${idx++}`;
      params.push(staffFilter);
    }

    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND department=$${idx++}`;
      params.push(departmentFilter);
    }

    const result = await pool.query(query, params);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("PENDING TODAY ERROR:", err.message);
    res.status(500).json({ error: "Error fetching pending today tasks" });
  }
};

export const getCompletedToday = async (req, res) => {
  try {
    const { dashboardType, staffFilter = "all", departmentFilter = "all", role, username } = req.query;
    const table = dashboardType;

    const params = [];
    let idx = 1;

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE submission_date::date = CURRENT_DATE
    `;

    if (role === "user" && username) {
      query += ` AND name=$${idx++}`;
      params.push(username);
    }

    if (role === "admin" && staffFilter !== "all") {
      query += ` AND name=$${idx++}`;
      params.push(staffFilter);
    }

    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND department=$${idx++}`;
      params.push(departmentFilter);
    }

    const result = await pool.query(query, params);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("COMPLETED TODAY ERROR:", err.message);
    res.status(500).json({ error: "Error fetching completed today tasks" });
  }
};


export const getUpcomingTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;
    const table = dashboardType;

    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    if (dashboardType === "checklist") {
      const result = await countChecklistSources(
        {
          staffFilter,
          departmentFilter,
          role,
          username,
          taskView: "ignore_date" // use ignore_date to avoid default month/today restrictions
        },
        ({ source, conditions, params }) => {
          // For specific upcoming logic (tomorrow):
          conditions.push(`${source.dateColumn}::date = (CURRENT_DATE + INTERVAL '1 day')::date`);

          // For general "Upcoming" (Start Date > Today):
          // conditions.push(`${source.dateColumn}::date > CURRENT_DATE`);
          conditions.push(`${source.submissionColumn} IS NULL`);

          return { conditions, params };
        }
      );

      return res.json(result);
    }

    if (dashboardType === "maintenance") {
      let query = `
        SELECT COUNT(*) AS count
        FROM maintenance_task_assign
        WHERE "Task_Start_Date"::date = (CURRENT_DATE + INTERVAL '1 day')::date
        AND "Actual_Date" IS NULL
      `;

      if (role === "user" && username) {
        query += ` AND "Doer_Name" = '${username}'`;
      }
      // Note: Department filter might be tricky for maintenance if column names differ, 
      // but usually maintenance dashboard doesn't filter by department in the same way or uses 'doer_department'.

      const result = await maintenancePool.query(query);
      return res.json({ count: Number(result.rows[0].count || 0) });
    }

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date::date = (CURRENT_DATE + INTERVAL '1 day')::date
      AND submission_date IS NULL
    `;

    if (role === "user" && username) {
      query += ` AND name = '${username}'`;
    }

    if (role === "admin" && staffFilter !== "all") {
      query += ` AND name = '${staffFilter}'`;
    }

    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND department = '${departmentFilter}'`;
    }

    const result = await pool.query(query);
    res.json({ count: Number(result.rows[0].count || 0) });

  } catch (err) {
    console.error("❌ UPCOMING ERROR:", err.message);
    res.status(500).json({ error: "Error fetching upcoming tasks" });
  }
};

export const getOverdueTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;
    const params = [];
    let idx = 1;

    if (dashboardType === "checklist") {
      const result = await countUnifiedChecklistRows({
        staffFilter,
        departmentFilter,
        role,
        username,
        taskView: "overdue"
      });
      return res.json(result);
    }

    // Align with task list overdue view: before today and not submitted
    // AND within current month
    const { firstDayStr } = getCurrentMonthRange();
    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date::date < CURRENT_DATE
      AND submission_date IS NULL
      AND task_start_date >= '${firstDayStr} 00:00:00'
    `;

    // Role filter
    if (role === "user" && username) {
      query += ` AND name=$${idx++}`;
      params.push(username);
    }

    if (role === "admin" && staffFilter !== "all") {
      query += ` AND name=$${idx++}`;
      params.push(staffFilter);
    }

    // Department filter
    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND department=$${idx++}`;
      params.push(departmentFilter);
    }

    const result = await pool.query(query, params);
    res.json({ count: Number(result.rows[0].count) });

  } catch (err) {
    console.error("OVERDUE ERROR:", err.message);
    res.status(500).json({ error: "Error fetching overdue tasks" });
  }
};

export const getUniqueDepartments = async (req, res) => {
  try {
    const departments = await getUniqueDepartmentsService();
    res.json(departments);
  } catch (err) {
    console.error("DEPARTMENTS ERROR:", err.message);
    res.status(500).json({ error: "Error fetching departments" });
  }
};

export const getStaffByDepartment = async (req, res) => {
  try {
    const { department } = req.query;

    // Exclude admin users - simple comparison that works with text/varchar/enum
    let query = `SELECT user_name, user_access, role FROM users WHERE role IS NULL OR role != 'admin'`;

    const result = await pool.query(query);

    let staff = result.rows || [];

    if (department && department !== "all") {
      staff = staff.filter(u =>
        u.user_access &&
        u.user_access.toLowerCase().includes(department.toLowerCase())
      );
    }

    // Map to user names and filter out any null/undefined values
    const staffNames = staff
      .map(s => s?.user_name)
      .filter(name => name != null && name.trim() !== "");

    res.json(staffNames);
  } catch (err) {
    console.error("STAFF BY DEPARTMENT ERROR:", err.message);
    console.error("Full error:", err);
    res.status(500).json({ error: "Error fetching staff by department", details: err.message });
  }
};

export const getChecklistByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, staffFilter = "all", departmentFilter = "all" } = req.query;

    // If no specific date range is provided, default to current month
    let start = startDate;
    let end = endDate;

    if (!startDate || !endDate) {
      const { firstDayStr, currentDayStr } = getCurrentMonthRange();
      start = firstDayStr;
      end = currentDayStr;
    }

    // Build parameterized query to avoid string-based date comparisons
    // Compare on date-only to avoid timezone boundary misses
    const params = [start, end];
    let idx = 3;

    let query = `
      SELECT * FROM checklist
      WHERE task_start_date::date >= $1::date
      AND task_start_date::date <= $2::date
    `;

    if (staffFilter && staffFilter !== "all") {
      query += ` AND LOWER(name)=LOWER($${idx++})`;
      params.push(staffFilter);
    }

    if (departmentFilter && departmentFilter !== "all") {
      query += ` AND LOWER(department)=LOWER($${idx++})`;
      params.push(departmentFilter);
    }

    // Keep the payload bounded to avoid overwhelming the client
    query += " ORDER BY task_start_date ASC LIMIT 5000";

    const result = await pool.query(query, params);
    log("DATE RANGE QUERY =>", query, "PARAMS =>", params, "ROWS =>", result.rowCount);
    res.json(result.rows);
  } catch (err) {
    console.error("CHECKLIST DATE RANGE ERROR:", err.message);
    res.status(500).json({ error: "Error fetching checklist by date range" });
  }
};

export const getChecklistStatsByDate = async (req, res) => {
  try {
    const { startDate, endDate, staffFilter = "all", departmentFilter = "all" } = req.query;

    // If no date range provided, default to current month
    let start = startDate;
    let end = endDate;

    if (!startDate || !endDate) {
      const { firstDayStr, currentDayStr } = getCurrentMonthRange();
      start = firstDayStr;
      end = currentDayStr;
    }

    // Compare on date-only to avoid timezone boundary misses
    const params = [start, end];
    let idx = 3;
    const filters = [];

    if (staffFilter && staffFilter !== "all") {
      filters.push(`LOWER(name)=LOWER($${idx++})`);
      params.push(staffFilter);
    }
    if (departmentFilter && departmentFilter !== "all") {
      filters.push(`LOWER(department)=LOWER($${idx++})`);
      params.push(departmentFilter);
    }

    const whereClause = filters.length ? ` AND ${filters.join(" AND ")}` : "";

    const query = `
      SELECT
        COUNT(*) AS total_tasks,
        SUM(CASE WHEN LOWER(status::text) = 'yes' THEN 1 ELSE 0 END) AS completed_tasks,
        (
          SELECT COUNT(*)
          FROM checklist c_up
          WHERE c_up.task_start_date::date = (CURRENT_DATE + INTERVAL '1 day')::date
          AND c_up.submission_date IS NULL
          ${staffFilter && staffFilter !== 'all' ? `AND LOWER(c_up.name)=LOWER($${idx - (departmentFilter && departmentFilter !== 'all' ? 2 : 1)})` : ''} 
          ${departmentFilter && departmentFilter !== 'all' ? `AND LOWER(c_up.department)=LOWER($${idx - 1})` : ''}
        ) AS upcoming_tasks,
        (
          SELECT COUNT(*)
          FROM checklist c_ov
          WHERE c_ov.task_start_date::date < CURRENT_DATE
          AND (c_ov.status IS NULL OR LOWER(c_ov.status::text) <> 'yes')
          AND c_ov.submission_date IS NULL
          ${staffFilter && staffFilter !== 'all' ? `AND LOWER(c_ov.name)=LOWER($${idx - (departmentFilter && departmentFilter !== 'all' ? 2 : 1)})` : ''} 
          ${departmentFilter && departmentFilter !== 'all' ? `AND LOWER(c_ov.department)=LOWER($${idx - 1})` : ''}
        ) AS overdue_tasks,
        (
          SELECT COUNT(*)
          FROM checklist c_nd
          WHERE LOWER(c_nd.status::text) = 'no'
          ${staffFilter && staffFilter !== 'all' ? `AND LOWER(c_nd.name)=LOWER($${idx - (departmentFilter && departmentFilter !== 'all' ? 2 : 1)})` : ''} 
          ${departmentFilter && departmentFilter !== 'all' ? `AND LOWER(c_nd.department)=LOWER($${idx - 1})` : ''}
        ) AS not_done_tasks
      FROM checklist
      WHERE task_start_date::date >= $1::date
      AND task_start_date::date <= $2::date
      ${whereClause}
    `;

    const result = await pool.query(query, params);
    log("DATE RANGE STATS QUERY =>", query, "PARAMS =>", params, "ROWS =>", result.rowCount);

    const row = result.rows[0] || {};
    const totalTasks = Number(row.total_tasks || 0);
    const completedTasks = Number(row.completed_tasks || 0);
    const overdueTasks = Number(row.overdue_tasks || 0);
    const upcomingTasks = Number(row.upcoming_tasks || 0);
    const notDoneTasks = Number(row.not_done_tasks || 0);
    const pendingTasks = Math.max(totalTasks - completedTasks, 0);
    // console.log(upcomingTasks)
    res.json({
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      upcomingTasks,
      notDoneTasks,
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0
    });
  } catch (err) {
    console.error("CHECKLIST STATS ERROR:", err.message);
    res.status(500).json({ error: "Error fetching checklist stats" });
  }
};

export const getStaffTaskSummary = async (req, res) => {
  try {
    const { dashboardType } = req.query;
    const table = dashboardType;

    // Get current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    const query = `
      SELECT name,
        COUNT(*) AS total,
        SUM(
          CASE 
            WHEN submission_date IS NOT NULL THEN 1
            WHEN status = 'Yes' THEN 1
            ELSE 0 
          END
        ) AS completed
      FROM ${table}
      WHERE task_start_date >= '${firstDayStr} 00:00:00'
      AND task_start_date <= '${currentDayStr} 23:59:59'
      GROUP BY name
      ORDER BY name ASC
    `;

    const result = await pool.query(query);

    const formatted = result.rows.map(r => ({
      id: r.name?.toLowerCase().replace(/\s+/g, "-"),
      name: r.name,
      email: `${r.name?.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      totalTasks: Number(r.total),
      completedTasks: Number(r.completed),
      pendingTasks: Number(r.total) - Number(r.completed),
      progress: Math.round((Number(r.completed) / Number(r.total)) * 100)
    }));

    res.json(formatted);

  } catch (err) {
    console.error("STAFF SUMMARY ERROR:", err.message);
    res.status(500).json({ error: "Error fetching staff task summary" });
  }
};

export const getDashboardDataCount = async (req, res) => {
  try {
    const {
      dashboardType,
      staffFilter = "all",
      taskView = "recent",
      departmentFilter = "all"
    } = req.query;

    const role = req.query.role;
    const username = req.query.username;

    if (dashboardType === "checklist") {
      const count = await countUnifiedChecklistRows({
        staffFilter,
        departmentFilter,
        role,
        username,
        taskView
      });

      return res.json(count);
    }

    // Base query (no month cap) so it matches list view filters exactly
    let query = `
    SELECT COUNT(*) AS count
      FROM ${dashboardType}
      WHERE 1=1
    `;

    // ROLE FILTER (USER)
    if (role === "user" && username) {
      query += ` AND name = '${username}'`;
    }

    // ADMIN STAFF FILTER
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND name = '${staffFilter}'`;
    }

    // DEPARTMENT FILTER (checklist only)
    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND department = '${departmentFilter}'`;
    }

    // TASK VIEW LOGIC
    if (taskView === "recent") {
      query += `
        AND DATE(task_start_date) = CURRENT_DATE
      `;

      if (dashboardType === "checklist") {
        // query += ` AND (status IS NULL OR status <> 'yes')`;
        query += ` AND submission_date IS NULL`;
      }
    }
    else if (taskView === "upcoming") {
      query += `
        AND DATE(task_start_date) = CURRENT_DATE + INTERVAL '1 day'
      `;

      if (dashboardType === "checklist") {
        query += ` AND submission_date IS NULL`;
      }
    }
    else if (taskView === "overdue") {
      query += `
        AND DATE(task_start_date) < CURRENT_DATE
        AND submission_date IS NULL
      `;

      if (dashboardType === "checklist") {
        // query += ` AND (status IS NULL OR status <> 'yes')`;
        query += ` AND submission_date IS NULL`;
      }
    }
    else if (taskView === "notdone") {
      const { firstDayStr, currentDayStr } = getCurrentMonthRange();
      query += `
        AND LOWER(status::text) = 'no'
        AND submission_date IS NOT NULL
        AND task_start_date >= '${firstDayStr} 00:00:00'
        AND task_start_date <= '${currentDayStr} 23:59:59'
      `;
    }

    const result = await pool.query(query);
    const count = Number(result.rows[0].count || 0);

    log("COUNT QUERY for", taskView, "=>", query);
    log("COUNT RESULT:", count);

    res.json(count);

  } catch (err) {
    console.error("DASHBOARD COUNT ERROR:", err.message);
    res.status(500).json({ error: "Error fetching dashboard count" });
  }
};

export const getChecklistDateRangeCount = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      staffFilter = "all",
      departmentFilter = "all",
      statusFilter = "all"
    } = req.query;

    const role = req.query.role;
    const username = req.query.username;

    // If no date range provided, default to current month
    let start = startDate;
    let end = endDate;

    if (!startDate || !endDate) {
      const { firstDayStr, currentDayStr } = getCurrentMonthRange();
      start = firstDayStr;
      end = currentDayStr;
    }

    // Compare on date-only to avoid timezone boundary misses
    const params = [start, end];
    let idx = 3;

    let query = `
      SELECT COUNT(*) AS count
      FROM checklist
      WHERE task_start_date::date >= $1::date
      AND task_start_date::date <= $2::date
    `;

    // ROLE FILTER (USER)
    if (role === "user" && username) {
      query += ` AND name = $${idx++}`;
      params.push(username);
    }

    // ADMIN STAFF FILTER
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND name = $${idx++}`;
      params.push(staffFilter);
    }

    // DEPARTMENT FILTER
    if (departmentFilter !== "all") {
      query += ` AND department = $${idx++}`;
      params.push(departmentFilter);
    }

    // STATUS FILTER
    switch (statusFilter) {
      case "completed":
        query += ` AND LOWER(status::text) = 'yes'`;
        break;
      case "pending":
        query += ` AND (status IS NULL OR LOWER(status::text) <> 'yes')`;
        break;
      case "overdue":
        query += ` 
          AND (status IS NULL OR LOWER(status::text) <> 'yes')
          AND submission_date IS NULL
          AND task_start_date < CURRENT_DATE
        `;
        break;
    }

    const result = await pool.query(query, params);
    const count = Number(result.rows[0].count || 0);

    res.json(count);

  } catch (err) {
    console.error("DATE RANGE COUNT ERROR:", err.message);
    res.status(500).json({ error: "Error fetching date range count" });
  }
};

export const getNotDoneTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;
    const debug = req.query.debug === "true";

    // Current Month Filter Logic
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startOfMonth = new Date(y, m, 1);
    const startOfNextMonth = new Date(y, m + 1, 1);

    const fmt = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (dashboardType === "checklist") {
      try {
        await refreshDeviceSync();
      } catch (e) {
        console.error("NotDone Sync Error (continuing):", e);
      }

      const result = await countChecklistSources(
        {
          staffFilter,
          departmentFilter,
          role,
          username,
          taskView: "ignore_date"
        },
        ({ source, conditions, params }) => {
          // Add Not Done logic: status 'no' AND submission_date IS NOT NULL
          if (source.name === "maintenance") {
            conditions.push(`LOWER("Task_Status") = 'no'`);
          } else {
            conditions.push(`LOWER(status::text) = 'no'`);
          }
          conditions.push(`${source.submissionColumn} IS NOT NULL`);

          // Limit to current month
          const pIdx = params.length + 1;
          conditions.push(`${source.dateColumn} >= $${pIdx}`);
          conditions.push(`${source.dateColumn} < $${pIdx + 1}`);
          params.push(`${fmt(startOfMonth)} 00:00:00`);
          params.push(`${fmt(startOfNextMonth)} 00:00:00`);

          return { conditions, params };
        }
      );

      return res.json(result);
    }

    if (dashboardType === "maintenance") {
      // Maintenance logic for Not Done
      // Assuming status column exists in maintenance_task_assign
      let params = [];
      let idx = 1;

      let query = `
         SELECT COUNT(*) AS count
         FROM maintenance_task_assign
         WHERE LOWER("Task_Status") = 'no'
         AND "Actual_Date" IS NOT NULL
         AND "Task_Start_Date" >= $${idx++}
         AND "Task_Start_Date" < $${idx++}
       `;
      params.push(`${fmt(startOfMonth)} 00:00:00`);
      params.push(`${fmt(startOfNextMonth)} 00:00:00`);

      if (role === "admin" && staffFilter !== "all") {
        query += ` AND "Doer_Name" = $${idx++}`;
        params.push(staffFilter);
      }

      if (role === "user" && username) {
        query += ` AND "Doer_Name" = $${idx++}`;
        params.push(username);
      }

      if (departmentFilter !== "all") {
        query += ` AND "machine_department" = $${idx++}`;
        params.push(departmentFilter);
      }

      log("NOT DONE (maintenance) QUERY =>", query, "PARAMS =>", params);
      const result = await maintenancePool.query(query, params);
      const count = Number(result.rows[0].count || 0);
      log("NOT DONE (maintenance) COUNT =>", count);
      return res.json({ count });
    }

    return res.json({ count: 0 });

  } catch (err) {
    console.error("NOT DONE TASK COUNT ERROR:", err.message);
    res.status(500).json({ error: "Error fetching not done task count" });
  }
};

export const getNotDoneTaskList = async (req, res) => {
  try {
    // ✅ Optional: Keep if you REALLY want list call to also force sync
    // If you already run sync in setInterval, you can remove this line to reduce load.
    // Optimization: Fire and forget to avoid blocking UI
    refreshDeviceSync().catch(err => console.error("Background sync error:", err));

    const {
      role,
      username,
      staffFilter = "all",
      departmentFilter = "all",
      date,
      page = 1,
      limit = 50
    } = req.query;

    // ✅ IST-safe current month range
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();

    const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
    const normalizedLimit = Math.max(parseInt(limit, 10) || 50, 1);
    const offset = (normalizedPage - 1) * normalizedLimit;

    // ✅ Match user criteria: status='no' AND submission_date IS NOT NULL
    const conditions = [
      `LOWER(status::text) = 'no'`,
      `submission_date IS NOT NULL`,
      `task_start_date >= $1`,
      `task_start_date <= $2`
    ];

    const params = [`${firstDayStr} 00:00:00`, `${currentDayStr} 23:59:59` ];
    let idx = 3;

    if (role === "user" && username) {
      conditions.push(`name = $${idx++}`);
      params.push(username);
    } else if (role === "admin" && staffFilter !== "all") {
      conditions.push(`name = $${idx++}`);
      params.push(staffFilter);
    }

    if (departmentFilter !== "all") {
      conditions.push(`department = $${idx++}`);
      params.push(departmentFilter);
    }

    const query = `
      SELECT *,
        COUNT(*) OVER() AS total_count
      FROM checklist
      WHERE ${conditions.join(" AND ")}
      ORDER BY task_start_date ASC
      LIMIT $${idx++}
      OFFSET $${idx++}
    `;

    params.push(normalizedLimit, offset);

    const result = await pool.query(query, params);
    const total = Number(result.rows[0]?.total_count || 0);

    const cleanRows = result.rows.map(({ total_count, ...rest }) => rest);

    return res.json({
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      date: targetDate,      // ✅ helpful for UI debugging
      data: cleanRows
    });
  } catch (err) {
    console.error("NOT DONE TASK LIST ERROR:", err);
    return res.status(500).json({ error: "Error fetching not done task list" });
  }
};

