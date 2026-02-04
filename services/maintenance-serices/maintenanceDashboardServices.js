import { maintenancePool } from "../../config/db.js";

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

const getCurrentMonthRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  
  const firstDayStr = `${y}-${m}-01`;
  const currentDayStr = `${y}-${m}-${d}`;

  return {
    start: dayStart(firstDayStr),
    end: dayEnd(currentDayStr)
  };
};



// ─────────────────────────────────────────────
// MAIN DATA - Fetch tasks with filters
// ─────────────────────────────────────────────
export const fetchMaintenanceDashboardDataService = async ({
  staffFilter = "all",
  page = 1,
  limit = 50,
  taskView = "recent",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { date: todayDate, start: todayStart, end: todayEnd } = getToday();
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let i = 1;

    // Role-based filter
    if (role === "user" && username) {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(username);
      i++;
    }

    // Staff filter (admin)
    if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    // Department filter
    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER("machine_department") = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }
    // Task view filters
    if (taskView === "recent") {
      // Today's tasks
      conditions.push(`"Task_Start_Date"::date = CURRENT_DATE`);
      conditions.push(`"Actual_Date" IS NULL`);
    } else if (taskView === "upcoming") {
      // Tomorrow's tasks
      const t = new Date();
      t.setDate(t.getDate() + 1);
      const y = t.getFullYear();
      const m = String(t.getMonth() + 1).padStart(2, '0');
      const d = String(t.getDate()).padStart(2, '0');
      const tStr = `${y}-${m}-${d}`;

      conditions.push(`"Task_Start_Date"::date = $${i}::date`);
      params.push(tStr);
      i++;
      conditions.push(`"Actual_Date" IS NULL`);
    } else if (taskView === "overdue") {
      // Past due tasks
      conditions.push(`"Task_Start_Date"::date < CURRENT_DATE`);
      conditions.push(`"Actual_Date" IS NULL`);
    } else if (taskView === "notdone") {
      // Condition: status 'No' and Actual_Date IS NOT NULL
      conditions.push(`LOWER("Task_Status") = 'no'`);
      conditions.push(`"Actual_Date" IS NOT NULL`);

      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
      conditions.push(`"Task_Start_Date"::date >= $${i}::date`);
      params.push(monthStart);
      i++;
      conditions.push(`"Task_Start_Date"::date <= $${i}::date`);
      params.push(monthEnd);
      i++;
    } else {
      // default: all from start of current month up to today
      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
      conditions.push(`"Task_Start_Date"::date >= $${i}::date`);
      params.push(monthStart);
      i++;
      conditions.push(`"Task_Start_Date"::date <= $${i}::date`);
      params.push(monthEnd);
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
      FROM maintenance_task_assign
      ${where}
      ORDER BY "Task_Start_Date" DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const { rows } = await maintenancePool.query(query, params);
    return rows;
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// TOTAL COUNT
// ─────────────────────────────────────────────
export const countTotalMaintenanceTaskService = async ({
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

    let conditions = [
      `"Task_Start_Date" >= $1`,
      `"Task_Start_Date" <= $2`
    ];
    let params = [monthStart, monthEnd];
    let i = 3;

    if (role === "user" && username) {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER("machine_department") = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `SELECT COUNT(*) FROM maintenance_task_assign ${where}`;
    const { rows } = await maintenancePool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// COMPLETED COUNT
// ─────────────────────────────────────────────
export const countCompleteMaintenanceTaskService = async ({
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

    let conditions = [
      `"Task_Start_Date" >= $1`,
      `"Task_Start_Date" <= $2`,
      `"Actual_Date" IS NOT NULL`
    ];
    let params = [monthStart, monthEnd];
    let i = 3;

    if (role === "user" && username) {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER("machine_department") = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const query = `SELECT COUNT(*) FROM maintenance_task_assign ${where}`;
    const { rows } = await maintenancePool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// PENDING / TODAY COUNT
// ─────────────────────────────────────────────
export const countPendingMaintenanceTaskService = async ({
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { date: todayDate } = getToday();

    let conditions = [
      `"Task_Start_Date"::date = $1::date`,
      `"Actual_Date" IS NULL`
    ];
    let params = [todayDate];
    let i = 2;

    if (role === "user" && username) {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER("machine_department") = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const query = `SELECT COUNT(*) FROM maintenance_task_assign ${where}`;
    const { rows } = await maintenancePool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

export const countUpcomingMaintenanceTaskService = async ({
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { start: tomorrowStart, end: tomorrowEnd } = getTomorrow();

    let conditions = [
      `"Task_Start_Date" >= $1`,
      `"Task_Start_Date" <= $2`,
      `"Actual_Date" IS NULL`
    ];
    let params = [tomorrowStart, tomorrowEnd];
    let i = 3;

    if (role === "user" && username) {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER("machine_department") = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const query = `SELECT COUNT(*) FROM maintenance_task_assign ${where}`;
    const { rows } = await maintenancePool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// NOT DONE COUNT (Absent Day's tasks)
// ─────────────────────────────────────────────
export const countNotDoneMaintenanceTaskService = async ({
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

    // Count where Status is 'No' (or equivalent for Not Done)
    // AND within current month range

    let conditions = [
      `LOWER("Task_Status") = 'no'`,
      `"Actual_Date" IS NOT NULL`,
      `"Task_Start_Date" >= $1`,
      `"Task_Start_Date" <= $2`
    ];
    let params = [monthStart, monthEnd];
    let i = 3;

    if (role === "user" && username) {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER("machine_department") = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const query = `SELECT COUNT(*) FROM maintenance_task_assign ${where}`;
    const { rows } = await maintenancePool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    // Fallback if Status column doesn't exist or error
    console.error("Error counting Not Done maintenance tasks:", error.message);
    return 0;
  }
};

// ─────────────────────────────────────────────
// OVERDUE COUNT
// ─────────────────────────────────────────────
export const countOverDueMaintenanceTaskService = async ({
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { date: todayDate } = getToday();

    let conditions = [
      `"Task_Start_Date"::date < $1::date`,
      `"Actual_Date" IS NULL`
    ];
    let params = [todayDate];
    let i = 2;

    if (role === "user" && username) {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER("machine_department") = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const query = `SELECT COUNT(*) FROM maintenance_task_assign ${where}`;
    const { rows } = await maintenancePool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};

// ─────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────
export const getMaintenanceDashboardSummaryService = async (params) => {
  // ✅ OPTIMIZED: Run all count queries in parallel (Added missing overdueTasks)
  const [
    totalTasks,
    completedTasks,
    pendingTasks,
    notDoneTasks,
    upcomingTasks,
    overdueTasks // Added this
  ] = await Promise.all([
    countTotalMaintenanceTaskService(params),
    countCompleteMaintenanceTaskService(params),
    countPendingMaintenanceTaskService(params),
    countNotDoneMaintenanceTaskService(params),
    countUpcomingMaintenanceTaskService(params),
    countOverDueMaintenanceTaskService(params) // Added this call
  ]);

  console.log(upcomingTasks);
  const completionRate =
    totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 0;

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    completionRate,
    upcomingTasks,
    notDoneTasks
  };
};

// ─────────────────────────────────────────────
// COUNT FOR TASK VIEW
// ─────────────────────────────────────────────
export const countMaintenanceTaskByViewService = async ({
  taskView = "recent",
  staffFilter = "all",
  departmentFilter = "all",
  role = "admin",
  username = null,
}) => {
  try {
    const { date: todayDate } = getToday();

    let conditions = [];
    let params = [];
    let i = 1;

    // Role-based filter
    if (role === "user" && username) {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(username);
      i++;
    }

    // Staff filter (admin)
    if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER("Doer_Name") = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    // Department filter
    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER("machine_department") = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    // Task view filters
    if (taskView === "recent") {
      conditions.push(`"Task_Start_Date"::date = CURRENT_DATE`);
      conditions.push(`"Actual_Date" IS NULL`);
    } else if (taskView === "upcoming") {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      const tStr = t.toISOString().split("T")[0];
      conditions.push(`"Task_Start_Date"::date = $${i}::date`);
      params.push(tStr);
      i++;
      conditions.push(`"Actual_Date" IS NULL`);
    } else if (taskView === "overdue") {
      conditions.push(`"Task_Start_Date"::date < CURRENT_DATE`);
      conditions.push(`"Actual_Date" IS NULL`);
    } else if (taskView === "notdone") {
      conditions.push(`LOWER("Task_Status") = 'no'`);
      conditions.push(`"Actual_Date" IS NOT NULL`);
      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
      conditions.push(`"Task_Start_Date"::date >= $${i}::date`);
      params.push(monthStart);
      i++;
      conditions.push(`"Task_Start_Date"::date <= $${i}::date`);
      params.push(monthEnd);
      i++;
    } else {
      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
      conditions.push(`"Task_Start_Date"::date >= $${i}::date`);
      params.push(monthStart);
      i++;
      conditions.push(`"Task_Start_Date"::date <= $${i}::date`);
      params.push(monthEnd);
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `SELECT COUNT(*) FROM maintenance_task_assign ${where}`;
    const { rows } = await maintenancePool.query(query, params);

    return Number(rows[0]?.count || 0);
  } catch (error) {
    throw new Error(error.message);
  }
};





