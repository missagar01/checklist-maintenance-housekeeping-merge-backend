import { maintenancePool } from "../../config/db.js";

const dayStart = (d) => `${d} 00:00:00`;
const dayEnd = (d) => `${d} 23:59:59`;

const getToday = () => {
  const today = new Date();
  const d = today.toISOString().split("T")[0];
  return {
    date: d,
    start: dayStart(d),
    end: dayEnd(d),
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
      const tStr = t.toISOString().split("T")[0];
      conditions.push(`"Task_Start_Date"::date = $${i}::date`);
      params.push(tStr);
      i++;
      conditions.push(`"Actual_Date" IS NULL`);
    } else if (taskView === "overdue") {
      // Past due tasks
      conditions.push(`"Task_Start_Date"::date < CURRENT_DATE`);
      conditions.push(`"Actual_Date" IS NULL`);
    } else {
      // default: all up to today
      conditions.push(`"Task_Start_Date"::date <= $${i}::date`);
      params.push(todayDate);
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
    const { date: todayDate } = getToday();

    let conditions = [`"Task_Start_Date"::date <= $1::date`];
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
    const { date: todayDate } = getToday();

    let conditions = [
      `"Task_Start_Date"::date <= $1::date`,
      `"Actual_Date" IS NOT NULL`
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
export const getMaintenanceDashboardSummaryService = async (params) => {
  const totalTasks = await countTotalMaintenanceTaskService(params);
  const completedTasks = await countCompleteMaintenanceTaskService(params);
  const pendingTasks = await countPendingMaintenanceTaskService(params);
  const notDoneTasks = await countNotDoneMaintenanceTaskService(params);
  const overdueTasks = await countOverDueMaintenanceTaskService(params);

  const completionRate =
    totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 0;

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    notDone: notDoneTasks,
    overdueTasks,
    completionRate,
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
    } else {
      conditions.push(`"Task_Start_Date"::date <= $${i}::date`);
      params.push(todayDate);
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



