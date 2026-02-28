import { pool, maintenancePool } from "../config/db.js";
import { query as housekeepingQuery } from "../config/housekeppingdb.js";
import { refreshDeviceSync } from "../services/deviceSync.js";
import { getUniqueDepartmentsService, getDivisionWiseTaskCountsService } from "../services/dashboardServices.js";

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
      "CONCAT('checklist_', task_id) AS db_id, task_id, task_description, name, department, frequency, task_start_date, submission_date, status",
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
      "CONCAT('housekeeping_', id) AS db_id, task_id, task_description, name, department, frequency, task_start_date, submission_date, status",
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
      `CONCAT('maintenance_', id) AS db_id,
       task_no AS task_id,
       COALESCE(description, '') AS task_description,
       doer_name AS name,
       COALESCE(doer_department, machine_department) AS department,
       frequency AS frequency,
       task_start_date AS task_start_date,
       actual_date AS submission_date,
       task_status AS status`,
    dateColumn: `task_start_date`,
    submissionColumn: `actual_date`,
    nameColumn: `doer_name`,
    departmentColumn: `COALESCE(doer_department, machine_department)`,
    statusColumn: `task_status`,
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
    if (firstDayStr && currentDayStr) {
      conditions.push(`${dateColumn}::date >= '${firstDayStr}'::date`);
      conditions.push(`${dateColumn}::date <= '${currentDayStr}'::date`);
    }
  } else if (view === "upcoming") {
    // Strictly Tomorrow as per user request
    conditions.push(`${dateColumn}::date = (CURRENT_DATE + INTERVAL '1 day')::date`);
    conditions.push(`${submissionColumn} IS NULL`);
  } else if (view === "overdue") {
    conditions.push(`${dateColumn}::date < CURRENT_DATE`);
    conditions.push(`${submissionColumn} IS NULL`);
    if (firstDayStr && currentDayStr) {
      conditions.push(`${dateColumn}::date >= '${firstDayStr}'::date`);
      conditions.push(`${dateColumn}::date <= '${currentDayStr}'::date`);
    }
  } else if (view === "notdone") {
    if (sourceName === "maintenance") {
      conditions.push(`LOWER(task_status) = 'no'`);
    } else if (statusColumn) {
      conditions.push(`LOWER(${statusColumn}::text) = 'no'`);
    }

    if (firstDayStr && currentDayStr) {
      conditions.push(`${dateColumn}::date >= '${firstDayStr}'::date`);
      conditions.push(`${dateColumn}::date <= '${currentDayStr}'::date`);
    }
  } else if (view === "date_range") {
    if (firstDayStr && currentDayStr) {
      conditions.push(`${dateColumn}::date >= '${firstDayStr}'::date`);
      conditions.push(`${dateColumn}::date <= '${currentDayStr}'::date`);
    }
  } else if (view === "ignore_date") {
    // Truly ignore the date - do nothing
  } else {
    // Fallback? Original logic often restricted to month
    if (firstDayStr && currentDayStr) {
      conditions.push(`${dateColumn}::date >= '${firstDayStr}'::date`);
      conditions.push(`${dateColumn}::date <= '${currentDayStr}'::date`);
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
    startDate: qStart,
    endDate: qEnd,
    firstDayStr: fDayStr,
    currentDayStr: cDayStr
  } = options;

  const { firstDayStr: monthStart, currentDayStr: monthEnd } = getCurrentMonthRange();
  const firstDayStr = qStart || fDayStr || monthStart;
  const currentDayStr = qEnd || cDayStr || monthEnd;

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
  limit = 50,
  startDate, // Optional override
  endDate    // Optional override
}) => {
  // Use provided range OR default to current month
  let firstDayStr, currentDayStr;

  if (startDate && endDate) {
    firstDayStr = startDate;
    currentDayStr = endDate;
  } else {
    const range = getCurrentMonthRange();
    firstDayStr = range.firstDayStr;
    currentDayStr = range.currentDayStr;
  }

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
      ORDER BY ${source.dateColumn} ASC, ${source.name === 'checklist' ? 'task_id' : 'id'} ASC
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

    // Primary sort by date
    const dateDiff = aDate - bDate;
    if (dateDiff !== 0) return dateDiff;

    // Secondary sort by db_id to ensure stability
    return (a.db_id || "").toString().localeCompare((b.db_id || "").toString());
  });

  return sorted.slice(offset, offset + normalizedLimit);
};

const countUnifiedChecklistRows = async ({
  staffFilter,
  departmentFilter,
  role,
  taskView,
  username,
  startDate,
  endDate
}) => {
  const { firstDayStr: monthStart, currentDayStr: monthEnd } = getCurrentMonthRange();
  const fDayStr = startDate || monthStart;
  const cDayStr = endDate || monthEnd;

  const results = await Promise.all(
    CHECKLIST_SOURCES.map(async (source) => {
      const { conditions, params } = buildChecklistFilterConditions(source, {
        role,
        staffFilter,
        departmentFilter,
        username,
        taskView,
        firstDayStr: fDayStr,
        currentDayStr: cDayStr
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
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      });

      return res.json(rows);
    }

    const normalizedLimit = Math.max(Number(limit) || 50, 1);
    const table = dashboardType;
    const offset = (page - 1) * normalizedLimit;

    // Range with overrides
    const { firstDayStr: monthStart, currentDayStr: monthEnd } = getCurrentMonthRange();
    const startDate = req.query.startDate || monthStart;
    const endDate = req.query.endDate || monthEnd;

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
      query += ` AND task_start_date::date = CURRENT_DATE`;
      if (startDate && endDate) {
        query += ` AND task_start_date::date >= '${startDate}' AND task_start_date::date <= '${endDate}'`;
      }
      if (dashboardType === "checklist") {
        query += ` AND submission_date IS NULL`;
      }
    }
    else if (taskView === "upcoming") {
      // Strictly Tomorrow as per user request
      query += ` AND task_start_date::date = (CURRENT_DATE + INTERVAL '1 day')::date`;
      if (dashboardType === "checklist") {
        query += ` AND submission_date IS NULL`;
      }
    }
    else if (taskView === "overdue") {
      query += ` AND task_start_date::date < CURRENT_DATE`;
      if (startDate && endDate) {
        query += ` AND task_start_date::date >= '${startDate}' AND task_start_date::date <= '${endDate}'`;
      }
      query += ` AND submission_date IS NULL`;
    }
    else if (taskView === "notdone") {
      // NOT DONE Tasks: Status 'no' strictly
      if (dashboardType === "maintenance") {
        query += ` AND LOWER(task_status) = 'no'`;
      } else {
        query += ` AND LOWER(status::text) = 'no'`;
      }
      if (startDate && endDate) {
        query += ` AND task_start_date::date >= '${startDate}' AND task_start_date::date <= '${endDate}'`;
      }
    }
    else if (taskView === "all") {
      // ALL TASKS IN RANGE
      if (startDate && endDate) {
        query += ` AND task_start_date::date >= '${startDate}' AND task_start_date::date <= '${endDate}'`;
      }
    }

    // ORDER + PAGINATION
    query += ` ORDER BY task_start_date ASC, id ASC LIMIT ${limit} OFFSET ${offset}`;

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
            conditions.push(`LOWER(task_status) = 'yes'`);
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
      query += ` AND LOWER(status::text) = 'yes' `;
    } else if (dashboardType === "maintenance") {
      query += ` AND LOWER(task_status) = 'yes' `;
    } else {
      query += ` AND LOWER(status::text) = 'yes' `;
    }

    if (role === "user" && username) query += ` AND LOWER(name)=LOWER('${username}')`;
    if (role === "admin" && staffFilter !== "all") query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    if (dashboardType === "checklist" && departmentFilter !== "all")
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;

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
        WHERE task_start_date::date = (CURRENT_DATE + INTERVAL '1 day')::date
        AND actual_date IS NULL
      `;

      if (role === "user" && username) {
        query += ` AND doer_name = '${username}'`;
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
      const depLower = department.toLowerCase();
      staff = staff.filter(u => {
        if (!u.user_access) return false;
        // Split by comma and trim each department, then check for exact match
        const userDeps = u.user_access.split(',').map(d => d.trim().toLowerCase());
        return userDeps.includes(depLower);
      });
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
    const { startDate, endDate, staffFilter, departmentFilter, role, username } = req.query;

    // Use unified fetcher which handles all 3 sources (checklist, housekeeping, maintenance)
    // Pass startDate/endDate to override default month logic
    const rows = await fetchUnifiedChecklistRows({
      staffFilter,
      departmentFilter,
      role,
      username,
      page: 1,
      limit: 5000, // Keep high limit as originally requested
      taskView: "date_range", // Special view to trigger date range logic
      startDate,
      endDate
    });

    res.json(rows);
  } catch (err) {
    console.error("CHECKLIST DATE RANGE ERROR:", err.message);
    res.status(500).json({ error: "Error fetching checklist by date range" });
  }
};

export const getChecklistStatsByDate = async (req, res) => {
  try {
    const { startDate, endDate, staffFilter, departmentFilter } = req.query;

    // Default range logic
    let start = startDate;
    let end = endDate;
    if (!startDate || !endDate) {
      const { firstDayStr, currentDayStr } = getCurrentMonthRange();
      start = firstDayStr;
      end = currentDayStr;
    }

    const role = req.query.role; // Extract role from req if passed (or handle in buildChecklistFilterConditions)
    const username = req.query.username;

    // Iterate sources and aggregate stats
    // Use unified structure for accumulation
    const initialStats = {
      totalTasks: { count: 0, breakdown: { checklist: 0, housekeeping: 0, maintenance: 0 } },
      completedTasks: { count: 0, breakdown: { checklist: 0, housekeeping: 0, maintenance: 0 } },
      pendingTasks: { count: 0, breakdown: { checklist: 0, housekeeping: 0, maintenance: 0 } },
      overdueTasks: { count: 0, breakdown: { checklist: 0, housekeeping: 0, maintenance: 0 } },
      upcomingTasks: { count: 0, breakdown: { checklist: 0, housekeeping: 0, maintenance: 0 } },
      notDoneTasks: { count: 0, breakdown: { checklist: 0, housekeeping: 0, maintenance: 0 } }
    };

    const statsPromises = CHECKLIST_SOURCES.map(async (source) => {
      const { conditions, params } = buildChecklistFilterConditions(source, {
        role,
        staffFilter,
        departmentFilter,
        username,
        taskView: "ignore_date",
        firstDayStr: start,
        currentDayStr: end
      });

      const baseWhere = buildWhereClause(conditions);
      const wherePrefix = baseWhere ? `${baseWhere} AND` : "WHERE";

      const pStartIdx = params.length + 1;
      const pEndIdx = params.length + 2;
      const dateRangeClause = `${source.dateColumn}::date >= $${pStartIdx}::date AND ${source.dateColumn}::date <= $${pEndIdx}::date`;

      const queryParams = [...params, start, end];
      const statusCol = source.statusColumnSafe ? `LOWER(${source.statusColumn}::text)` : `LOWER(${source.statusColumn})`;

      const query = `
        SELECT
          -- Range bound metrics
          SUM(CASE WHEN ${source.dateColumn}::date >= $${pStartIdx}::date AND ${source.dateColumn}::date <= $${pEndIdx}::date THEN 1 ELSE 0 END) AS total_tasks,
          
          -- Completed: (In Range) AND (Status Yes OR (Submitted AND Not 'No'))
          SUM(CASE WHEN (${source.dateColumn}::date >= $${pStartIdx}::date AND ${source.dateColumn}::date <= $${pEndIdx}::date) 
                   AND (${statusCol} = 'yes' OR (${source.submissionColumn} IS NOT NULL AND ${statusCol} <> 'no')) THEN 1 ELSE 0 END) AS completed_tasks,
          
          -- Not Done: (In Range) AND (Status No strictly)
          SUM(CASE WHEN (${source.dateColumn}::date >= $${pStartIdx}::date AND ${source.dateColumn}::date <= $${pEndIdx}::date) 
                   AND ${statusCol} = 'no' THEN 1 ELSE 0 END) AS not_done_tasks,

          -- Overdue: (In Range) AND (Open) AND Date < Today
          SUM(CASE 
            WHEN (${source.dateColumn}::date >= $${pStartIdx}::date AND ${source.dateColumn}::date <= $${pEndIdx}::date)
            AND ${source.dateColumn}::date < CURRENT_DATE 
            AND ${source.submissionColumn} IS NULL 
            AND (${source.statusColumn} IS NULL OR (${statusCol} <> 'yes' AND ${statusCol} <> 'no'))
            THEN 1 ELSE 0 
          END) AS overdue_tasks,

          -- Pending Today: Open (No Submission, Not Yes, Not No) AND Date = Today
          SUM(CASE 
            WHEN ${source.dateColumn}::date = CURRENT_DATE 
            AND ${source.submissionColumn} IS NULL 
            AND (${source.statusColumn} IS NULL OR (${statusCol} <> 'yes' AND ${statusCol} <> 'no'))
            THEN 1 ELSE 0 
          END) AS pending_tasks,

          -- Upcoming: Open AND Date = Tomorrow (Strictly)
          SUM(CASE 
            WHEN ${source.dateColumn}::date = (CURRENT_DATE + INTERVAL '1 day')::date 
            AND ${source.submissionColumn} IS NULL 
            AND (${source.statusColumn} IS NULL OR (${statusCol} <> 'yes' AND ${statusCol} <> 'no'))
            THEN 1 ELSE 0 
          END) AS upcoming_tasks

        FROM ${source.table}
        ${wherePrefix} (
          (${source.dateColumn}::date >= $${pStartIdx}::date AND ${source.dateColumn}::date <= $${pEndIdx}::date)
          OR ${source.dateColumn}::date = CURRENT_DATE
          OR ${source.dateColumn}::date = (CURRENT_DATE + INTERVAL '1 day')::date
        )
      `;

      try {
        const result = await executeSourceQuery(source, query, queryParams);
        return { name: source.name, stats: result.rows[0] };
      } catch (err) {
        console.error(`Error fetching stats for ${source.name}:`, err.message);
        return { name: source.name, stats: null };
      }
    });

    const results = await Promise.all(statsPromises);

    // Aggregate into breakdown structure
    const aggregated = results.reduce((acc, { name, stats }) => {
      if (!stats) return acc;

      const keys = [
        ['total_tasks', 'totalTasks'],
        ['completed_tasks', 'completedTasks'],
        ['pending_tasks', 'pendingTasks'],
        ['overdue_tasks', 'overdueTasks'],
        ['upcoming_tasks', 'upcomingTasks'],
        ['not_done_tasks', 'notDoneTasks']
      ];

      keys.forEach(([sqlKey, jsKey]) => {
        const val = Number(stats[sqlKey] || 0);
        acc[jsKey].count += val;
        acc[jsKey].breakdown[name] = val;
      });

      return acc;
    }, initialStats);

    const total = aggregated.totalTasks.count;
    const completed = aggregated.completedTasks.count;
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;

    res.json({
      ...aggregated,
      completionRate
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
        taskView,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      });

      return res.json(count);
    }

    const { firstDayStr: monthStart, currentDayStr: monthEnd } = getCurrentMonthRange();
    const startDate = req.query.startDate || monthStart;
    const endDate = req.query.endDate || monthEnd;

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
      query += ` AND DATE(task_start_date) = CURRENT_DATE`;
      if (startDate && endDate) {
        query += ` AND DATE(task_start_date) >= '${startDate}' AND DATE(task_start_date) <= '${endDate}'`;
      }
      if (dashboardType === "checklist") {
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
      // NOT DONE Tasks: Status 'no' strictly
      if (dashboardType === "maintenance") {
        query += ` AND LOWER(task_status) = 'no'`;
      } else {
        query += ` AND LOWER(status::text) = 'no'`;
      }
      if (startDate && endDate) {
        query += ` AND task_start_date::date >= '${startDate}' AND task_start_date::date <= '${endDate}'`;
      }
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
    const {
      dashboardType,
      staffFilter = "all",
      departmentFilter = "all",
      role,
      username,
      startDate: qStart,
      endDate: qEnd
    } = req.query;

    const { firstDayStr: monthStart, currentDayStr: monthEnd } = getCurrentMonthRange();
    const startDate = qStart || monthStart;
    const endDate = qEnd || monthEnd;

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
          // Add Not Done logic: status 'no'
          if (source.name === "maintenance") {
            conditions.push(`LOWER(task_status) = 'no'`);
          } else {
            conditions.push(`LOWER(status::text) = 'no'`);
          }

          // Limit to range
          conditions.push(`${source.dateColumn}::date >= '${startDate}'`);
          conditions.push(`${source.dateColumn}::date <= '${endDate}'`);

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
         WHERE LOWER(task_status) = 'no'
         AND task_start_date::date >= '${startDate}'
         AND task_start_date::date <= '${endDate}'
       `;

      if (role === "admin" && staffFilter !== "all") {
        query += ` AND doer_name = $${idx++}`;
        params.push(staffFilter);
      }

      if (role === "user" && username) {
        query += ` AND doer_name = $${idx++}`;
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
      page = 1,
      limit = 50,
      startDate: qStart,
      endDate: qEnd
    } = req.query;

    const { firstDayStr: monthStart, currentDayStr: monthEnd } = getCurrentMonthRange();
    const startDate = qStart || monthStart;
    const endDate = qEnd || monthEnd;

    const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
    const normalizedLimit = Math.max(parseInt(limit, 10) || 50, 1);
    const offset = (normalizedPage - 1) * normalizedLimit;

    // ✅ Match user criteria: status='no'
    const conditions = [
      `LOWER(status::text) = 'no'`,
      `task_start_date::date >= '${startDate}'`,
      `task_start_date::date <= '${endDate}'`
    ];

    const params = [];
    let idx = 1;

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
      startDate,
      endDate,
      data: cleanRows
    });
  } catch (err) {
    console.error("NOT DONE TASK LIST ERROR:", err);
    return res.status(500).json({ error: "Error fetching not done task list" });
  }
};

export const getDivisionWiseTaskCounts = async (req, res) => {
  try {
    const { startDate, endDate, role, username } = req.query;
    const counts = await getDivisionWiseTaskCountsService({
      startDate,
      endDate,
      role,
      username
    });
    res.json(counts);
  } catch (err) {
    console.error("DIVISION WISE COUNTS ERROR:", err.message);
    res.status(500).json({ error: "Error fetching division-wise task counts" });
  }
};


