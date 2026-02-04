import { pool } from "../config/db.js";

const getTableName = (dashboardType) =>
  dashboardType === "delegation" ? "delegation" : "checklist";

const dayStart = (d) => `${d} 00:00:00`;
const dayEnd = (d) => `${d} 23:59:59`;

const getToday = () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  return {
    date: dateStr,
    start: dayStart(dateStr),
    end: dayEnd(dateStr),
  };
};

const getTomorrow = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  return {
    date: dateStr,
    start: dayStart(dateStr),
    end: dayEnd(dateStr),
  };
};

// ─────────────────────────────────────────────
// MAIN DATA
// ─────────────────────────────────────────────
export const fetchDashboardDataService = async ({
  dashboardType,
  staffFilter = "all",
  page = 1,
  limit = 50,
  taskView = "recent",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const table = getTableName(dashboardType);
    const { date: todayDate, start: todayStart, end: todayEnd } = getToday();

    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let i = 1;

    // Role-based filter
    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    }

    // Staff filter (admin)
    if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    // Department filter (only checklist)
    if (dashboardType === "checklist" && departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    // Task view filters
    if (taskView === "recent") {
      conditions.push(`task_start_date BETWEEN $${i} AND $${i + 1}`);
      params.push(todayStart, todayEnd);
      i += 2;

      if (dashboardType === "checklist") {
        conditions.push(`(status IS NULL OR status <> 'Yes')`);
      }
    } else if (taskView === "upcoming") {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      const y = t.getFullYear();
      const m = String(t.getMonth() + 1).padStart(2, '0');
      const d = String(t.getDate()).padStart(2, '0');
      const tStr = `${y}-${m}-${d}`;

      conditions.push(`task_start_date BETWEEN $${i} AND $${i + 1}`);
      params.push(dayStart(tStr), dayEnd(tStr));
      i += 2;
    } else if (taskView === "overdue") {
      conditions.push(`task_start_date < $${i}`);
      params.push(todayStart);
      i++;

      conditions.push(`submission_date IS NULL`);

      if (dashboardType === "checklist") {
        conditions.push(`(status IS NULL OR status <> 'Yes')`);
      } else if (dashboardType === "delegation") {
        conditions.push(`status <> 'done'`);
      }
    } else {
      // default: all up to today
      conditions.push(`task_start_date <= $${i}`);
      params.push(todayEnd);
      i++;
    }

    const limitIndex = i;
    params.push(Number(limit));
    i++;

    const offsetIndex = i;
    params.push(Number(offset));
    i++;

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT *
      FROM ${table}
      ${where}
      ORDER BY task_start_date DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// TOTAL COUNT
// ─────────────────────────────────────────────
export const countTotalTaskService = async ({
  dashboardType,
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const table = getTableName(dashboardType);
    const { end: todayEnd } = getToday();

    let conditions = [`task_start_date <= $1`];
    let params = [todayEnd];
    let i = 2;

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (dashboardType === "checklist" && departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `SELECT COUNT(*) FROM ${table} ${where}`;
    const { rows } = await pool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// COMPLETED COUNT
// ─────────────────────────────────────────────
export const countCompleteTaskService = async ({
  dashboardType,
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { end: todayEnd } = getToday();

    const table =
      dashboardType === "delegation" ? "delegation" : "checklist";

    let conditions = [`task_start_date <= $1`];
    let params = [todayEnd];
    let i = 2;

    if (dashboardType === "delegation") {
      conditions.push(`submission_date IS NOT NULL`);
    } else {
      conditions.push(`status = 'Yes'`);
    }

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (dashboardType === "checklist" && departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const query = `SELECT COUNT(*) FROM ${table} ${where}`;
    const { rows } = await pool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// PENDING / TODAY COUNT
// ─────────────────────────────────────────────
export const countPendingOrDelayTaskService = async ({
  dashboardType,
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { start: todayStart, end: todayEnd } = getToday();
    const table =
      dashboardType === "delegation" ? "delegation" : "checklist";

    let conditions = [
      `task_start_date BETWEEN $1 AND $2`,
    ];
    let params = [todayStart, todayEnd];
    let i = 3;

    if (dashboardType === "delegation") {
      conditions.push(`submission_date IS NULL`);
    } else {
      conditions.push(`(status IS NULL OR status <> 'Yes')`);
    }

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (dashboardType === "checklist" && departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const query = `SELECT COUNT(*) FROM ${table} ${where}`;
    const { rows } = await pool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

export const countUpcomingTaskService = async ({
  dashboardType,
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { start: tomorrowStart, end: tomorrowEnd } = getTomorrow();
    const table = getTableName(dashboardType);

    let conditions = [`task_start_date BETWEEN $1 AND $2`];
    let params = [tomorrowStart, tomorrowEnd];
    let i = 3;

    conditions.push(`submission_date IS NULL`);

    if (dashboardType === "checklist") {
      conditions.push(`(status IS NULL OR status <> 'Yes')`);
    }

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (dashboardType === "checklist" && departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const query = `SELECT COUNT(*) FROM ${table} ${where}`;
    const { rows } = await pool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// OVERDUE COUNT
// ─────────────────────────────────────────────
export const countOverDueORExtendedTaskService = async ({
  dashboardType,
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
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

    const table =
      dashboardType === "delegation" ? "delegation" : "checklist";

    // Corrected: Overdue (Before Today) AND Within Current Month (>= Start of Month)
    let conditions = [`task_start_date >= $1 AND task_start_date < $2`];
    // $2 becomes today's start, so tasks on today are not overdue
    const { start: todayStart } = getToday();
    let params = [dayStart(fmt(startOfMonth)), todayStart];
    let i = 3;

    if (dashboardType === "delegation") {
      conditions.push(`submission_date IS NULL`);
    } else {
      conditions.push(`(status IS NULL OR status <> 'Yes')`);
      conditions.push(`submission_date IS NULL`);
    }

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (dashboardType === "checklist" && departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const query = `SELECT COUNT(*) FROM ${table} ${where}`;
    const { rows } = await pool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────
export const getDashboardSummaryService = async (params) => {
  // ✅ OPTIMIZED: Run all count queries in parallel
  const [
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    upcomingTasks
  ] = await Promise.all([
    countTotalTaskService(params),
    countCompleteTaskService(params),
    countPendingOrDelayTaskService(params),
    countOverDueORExtendedTaskService(params),
    countUpcomingTaskService(params)
  ]);

  const completionRate =
    totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 0;

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    completionRate,
    upcomingTasks,
  };
};

// ─────────────────────────────────────────────
// STAFF TASKS DATA
// ─────────────────────────────────────────────
export const fetchStaffTasksDataService = async ({
  dashboardType,
  staffFilter = "all",
  page = 1,
  limit = 20,
  role = "admin",
  username = null,
}) => {
  try {
    const table = getTableName(dashboardType);
    const { end: todayEnd } = getToday();

    // 1) Fetch all names up to today
    let conditions = [`task_start_date <= $1`, `name IS NOT NULL`];
    let params = [todayEnd];
    let i = 2;

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const queryNames = `
      SELECT name
      FROM ${table}
      ${where}
    `;

    const { rows: nameRows } = await pool.query(queryNames, params);
    const allNames = [...new Set(nameRows.map((r) => r.name).filter(Boolean))];

    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit;
    const paginatedNames = allNames.slice(fromIndex, toIndex);

    if (paginatedNames.length === 0) return [];

    // 2) For each staff, fetch stats
    const staffResults = await Promise.all(
      paginatedNames.map(async (staffName) => {
        const q = `
          SELECT *
          FROM ${table}
          WHERE LOWER(name) = LOWER($1)
            AND task_start_date <= $2
        `;
        const { rows: tasks } = await pool.query(q, [staffName, todayEnd]);

        const totalTasks = tasks.length;
        let completedTasks = 0;

        tasks.forEach((task) => {
          if (dashboardType === "checklist") {
            if (task.status === "Yes") completedTasks++;
          } else {
            if (task.status === "done") completedTasks++;
          }
        });

        const pendingTasks = totalTasks - completedTasks;
        const progress =
          totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        return {
          id: staffName.replace(/\s+/g, "-").toLowerCase(),
          name: staffName,
          email: `${staffName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          totalTasks,
          completedTasks,
          pendingTasks,
          progress,
        };
      })
    );

    return staffResults;
  } catch (error) {
    throw new Error(error.message);
  }
};

export const getStaffTasksCountService = async ({
  dashboardType,
  staffFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const table = getTableName(dashboardType);
    const { end: todayEnd } = getToday();

    let conditions = [`task_start_date <= $1`, `name IS NOT NULL`];
    let params = [todayEnd];
    let i = 2;

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const query = `
      SELECT name
      FROM ${table}
      ${where}
    `;

    const { rows } = await pool.query(query, params);

    const uniqueCount = [...new Set(rows.map((r) => r.name).filter(Boolean))]
      .length;

    return uniqueCount;
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// DEPARTMENTS & STAFF
// ─────────────────────────────────────────────
export const getUniqueDepartmentsService = async () => {
  try {
    const query = `
      SELECT department
      FROM users
      WHERE department IS NOT NULL
        AND TRIM(department) <> ''
    `;
    const { rows } = await pool.query(query);

    const unique = [
      ...new Set(
        rows
          .map((r) => r.department.trim())
          .filter((d) => d && d.length > 0)
      ),
    ].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    return unique;
  } catch (error) {
    throw new Error(error.message);
  }
};

export const getStaffNamesByDepartmentService = async ({
  departmentFilter = "all",
}) => {
  try {
    const query = `
      SELECT user_name, user_access
      FROM users
      WHERE user_name IS NOT NULL
        AND TRIM(user_name) <> ''
        AND user_access IS NOT NULL
    `;
    const { rows } = await pool.query(query);

    let filtered = rows;

    if (departmentFilter && departmentFilter !== "all") {
      const depLower = departmentFilter.toLowerCase();
      filtered = rows.filter((user) => {
        if (!user.user_access) return false;
        const userDeps = user.user_access
          .split(",")
          .map((d) => d.trim().toLowerCase());
        return userDeps.includes(depLower);
      });
    }

    const names = [
      ...new Set(filtered.map((u) => u.user_name).filter(Boolean)),
    ];

    return names;
  } catch (error) {
    throw new Error(error.message);
  }
};

export const getTotalUsersCountService = async () => {
  try {
    const query = `
      SELECT COUNT(*) 
      FROM users
      WHERE user_name IS NOT NULL
        AND TRIM(user_name) <> ''
    `;
    const { rows } = await pool.query(query);
    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// CHECKLIST DATE RANGE + FILTERS
// ─────────────────────────────────────────────
export const fetchChecklistDateRangeService = async ({
  startDate,
  endDate,
  staffFilter = "all",
  departmentFilter = "all",
  page = 1,
  limit = 50,
  statusFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const table = "checklist";
    const { date: todayDate } = getToday();
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let i = 1;

    if (startDate && endDate) {
      conditions.push(`task_start_date BETWEEN $${i} AND $${i + 1}`);
      params.push(dayStart(startDate), dayEnd(endDate));
      i += 2;
    } else if (startDate) {
      conditions.push(`task_start_date >= $${i}`);
      params.push(dayStart(startDate));
      i++;
    } else if (endDate) {
      conditions.push(`task_start_date <= $${i}`);
      params.push(dayEnd(endDate));
      i++;
    }

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (statusFilter === "completed") {
      conditions.push(`status = 'Yes'`);
    } else if (statusFilter === "pending") {
      conditions.push(`(status IS NULL OR status <> 'Yes')`);
      conditions.push(`task_start_date >= $${i}`);
      params.push(dayStart(todayDate));
      i++;
    } else if (statusFilter === "overdue") {
      conditions.push(`(status IS NULL OR status <> 'Yes')`);
      conditions.push(`submission_date IS NULL`);
      conditions.push(`task_start_date < $${i}`);
      params.push(dayStart(todayDate));
      i++;
    }

    const limitIndex = i;
    params.push(Number(limit));
    i++;

    const offsetIndex = i;
    params.push(Number(offset));
    i++;

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT *
      FROM ${table}
      ${where}
      ORDER BY task_start_date DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    throw new Error(error.message);
  }
};

export const getChecklistDateRangeCountService = async ({
  startDate,
  endDate,
  staffFilter = "all",
  departmentFilter = "all",
  statusFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const table = "checklist";
    const { date: todayDate } = getToday();

    let conditions = [];
    let params = [];
    let i = 1;

    if (startDate && endDate) {
      conditions.push(`task_start_date BETWEEN $${i} AND $${i + 1}`);
      params.push(dayStart(startDate), dayEnd(endDate));
      i += 2;
    } else if (startDate) {
      conditions.push(`task_start_date >= $${i}`);
      params.push(dayStart(startDate));
      i++;
    } else if (endDate) {
      conditions.push(`task_start_date <= $${i}`);
      params.push(dayEnd(endDate));
      i++;
    }

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (statusFilter === "completed") {
      conditions.push(`status = 'Yes'`);
    } else if (statusFilter === "pending") {
      conditions.push(`(status IS NULL OR status <> 'Yes')`);
      conditions.push(`task_start_date >= $${i}`);
      params.push(dayStart(todayDate));
      i++;
    } else if (statusFilter === "overdue") {
      conditions.push(`(status IS NULL OR status <> 'Yes')`);
      conditions.push(`submission_date IS NULL`);
      conditions.push(`task_start_date < $${i}`);
      params.push(dayStart(todayDate));
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT COUNT(*) 
      FROM ${table}
      ${where}
    `;

    const { rows } = await pool.query(query, params);
    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

export const fetchChecklistDateRangeStatsService = async ({
  startDate,
  endDate,
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const table = "checklist";
    const { date: todayDate } = getToday();

    let conditions = [];
    let params = [];
    let i = 1;

    if (startDate && endDate) {
      conditions.push(`task_start_date BETWEEN $${i} AND $${i + 1}`);
      params.push(dayStart(startDate), dayEnd(endDate));
      i += 2;
    } else if (startDate) {
      conditions.push(`task_start_date >= $${i}`);
      params.push(dayStart(startDate));
      i++;
    } else if (endDate) {
      conditions.push(`task_start_date <= $${i}`);
      params.push(dayEnd(endDate));
      i++;
    }

    if (role === "user" && username) {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(username);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER(name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT *
      FROM ${table}
      ${where}
    `;

    const { rows: allTasks } = await pool.query(query, params);

    const totalTasks = allTasks.length;

    const completedTasks = allTasks.filter(
      (t) => t.status === "Yes"
    ).length;

    const pendingTasks = allTasks.filter(
      (t) =>
        (t.status === null || t.status !== "Yes") &&
        new Date(t.task_start_date) >= new Date(`${todayDate}T00:00:00`)
    ).length;

    const overdueTasks = allTasks.filter(
      (t) =>
        (t.status === null || t.status !== "Yes") &&
        t.submission_date === null &&
        new Date(t.task_start_date) < new Date(`${todayDate}T00:00:00`)
    ).length;

    const completionRate =
      totalTasks > 0
        ? Number(((completedTasks / totalTasks) * 100).toFixed(1))
        : 0;

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      completionRate,
      dateRange: { startDate, endDate },
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

