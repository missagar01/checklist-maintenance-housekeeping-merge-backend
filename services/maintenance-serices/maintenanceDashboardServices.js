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
  startDate = null,
  endDate = null,
}) => {
  try {
    const { date: todayDate, start: todayStart, end: todayEnd } = getToday();
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let i = 1;

    // Role-based filter
    if (role === "user" && username) {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(username);
      i++;
    }

    // Staff filter (admin)
    if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    // Department filter
    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(machine_department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }
    // Task view filters
    const useRange = startDate && endDate;

    if (taskView === "recent") {
      // Today's tasks (or range's pending tasks)
      if (useRange) {
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(startDate);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(endDate);
        i++;
      } else {
        conditions.push(`task_start_date::date = CURRENT_DATE`);
      }
      conditions.push(`actual_date IS NULL`);
    } else if (taskView === "upcoming") {
      // Tomorrow's tasks (or range's upcoming tasks)
      if (useRange) {
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(startDate);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(endDate);
        i++;
      } else {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        const tStr = t.toISOString().split("T")[0];
        conditions.push(`task_start_date::date = $${i}::date`);
        params.push(tStr);
        i++;
      }
      conditions.push(`actual_date IS NULL`);
    } else if (taskView === "overdue") {
      // Past due tasks within range
      if (useRange) {
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(startDate);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(endDate);
        i++;
      }
      conditions.push(`task_start_date::date < CURRENT_DATE`);
      conditions.push(`actual_date IS NULL`);
    } else if (taskView === "notdone") {
      // Condition: status 'No' and actual_date IS NOT NULL
      conditions.push(`LOWER(task_status) = 'no'`);
      conditions.push(`actual_date IS NOT NULL`);

      if (useRange) {
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(startDate);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(endDate);
        i++;
      } else {
        const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(monthStart);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(monthEnd);
        i++;
      }
    } else if (useRange) {
      // Custom date range filtering (no specific view)
      conditions.push(`task_start_date::date >= $${i}::date`);
      params.push(startDate);
      i++;
      conditions.push(`task_start_date::date <= $${i}::date`);
      params.push(endDate);
      i++;
    } else {
      // default: all from start of current month up to today
      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
      conditions.push(`task_start_date::date >= $${i}::date`);
      params.push(monthStart);
      i++;
      conditions.push(`task_start_date::date <= $${i}::date`);
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
      ORDER BY task_start_date DESC, id DESC
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
  startDate = null,
  endDate = null,
}) => {
  try {
    let start, end;
    if (startDate && endDate) {
      start = startDate;
      end = endDate;
    } else {
      const range = getCurrentMonthRange();
      start = range.start;
      end = range.end;
    }

    let conditions = [
      `task_start_date::date >= $1::date`,
      `task_start_date::date <= $2::date`
    ];
    let params = [start, end];
    let i = 3;

    if (role === "user" && username) {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(machine_department) = LOWER($${i})`);
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
  startDate = null,
  endDate = null,
}) => {
  try {
    let start, end;
    if (startDate && endDate) {
      start = startDate;
      end = endDate;
    } else {
      const range = getCurrentMonthRange();
      start = range.start;
      end = range.end;
    }

    let conditions = [
      `task_start_date::date >= $1::date`,
      `task_start_date::date <= $2::date`,
      `actual_date IS NOT NULL`,
      `LOWER(task_status) = 'yes'`
    ];
    let params = [start, end];
    let i = 3;

    if (role === "user" && username) {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(machine_department) = LOWER($${i})`);
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
  startDate = null,
  endDate = null,
}) => {
  try {
    let conditions = [];
    let params = [];
    let i = 1;

    if (startDate && endDate) {
      conditions.push(`task_start_date::date >= CURRENT_DATE`);
      conditions.push(`task_start_date::date <= $${i}::date`);
      params.push(endDate);
      i++;
    } else {
      const { date: todayDate } = getToday();
      conditions.push(`task_start_date::date = $${i}::date`);
      params.push(todayDate);
      i++;
    }

    conditions.push(`actual_date IS NULL`);

    if (role === "user" && username) {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(machine_department) = LOWER($${i})`);
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
  startDate = null,
  endDate = null,
}) => {
  try {
    let conditions = [];
    let params = [];
    let i = 1;

    if (startDate && endDate) {
      conditions.push(`task_start_date::date >= $${i}::date`);
      params.push(startDate);
      i++;
      conditions.push(`task_start_date::date <= $${i}::date`);
      params.push(endDate);
      i++;
    } else {
      const { start: tomorrowStart, end: tomorrowEnd } = getTomorrow();
      conditions.push(`task_start_date >= $${i}`);
      params.push(tomorrowStart);
      i++;
      conditions.push(`task_start_date <= $${i}`);
      params.push(tomorrowEnd);
      i++;
    }

    conditions.push(`actual_date IS NULL`);

    if (role === "user" && username) {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(machine_department) = LOWER($${i})`);
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
  startDate = null,
  endDate = null,
}) => {
  try {
    let start, end;
    if (startDate && endDate) {
      start = startDate;
      end = endDate;
    } else {
      const range = getCurrentMonthRange();
      start = range.start;
      end = range.end;
    }

    let conditions = [
      `LOWER(task_status) = 'no'`,
      `actual_date IS NOT NULL`,
      `task_start_date::date >= $1::date`,
      `task_start_date::date <= $2::date`
    ];
    let params = [start, end];
    let i = 3;

    if (role === "user" && username) {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(machine_department) = LOWER($${i})`);
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
  startDate = null,
  endDate = null,
}) => {
  try {
    let conditions = [];
    let params = [];
    let i = 1;

    if (startDate && endDate) {
      conditions.push(`task_start_date::date >= $${i}::date`);
      params.push(startDate);
      i++;
      conditions.push(`task_start_date::date <= $${i}::date`);
      params.push(endDate);
      i++;
    } else {
      const { date: todayDate } = getToday();
      conditions.push(`task_start_date::date < $${i}::date`);
      params.push(todayDate);
      i++;
    }

    conditions.push(`actual_date IS NULL`);

    if (role === "user" && username) {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(username);
      i++;
    } else if (staffFilter && staffFilter !== "all") {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(machine_department) = LOWER($${i})`);
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
  startDate = null,
  endDate = null,
}) => {
  try {
    const { date: todayDate } = getToday();

    let conditions = [];
    let params = [];
    let i = 1;

    // Role-based filter
    if (role === "user" && username) {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(username);
      i++;
    }

    // Staff filter (admin)
    if (staffFilter && staffFilter !== "all" && role === "admin") {
      conditions.push(`LOWER(doer_name) = LOWER($${i})`);
      params.push(staffFilter);
      i++;
    }

    // Department filter
    if (departmentFilter && departmentFilter !== "all") {
      conditions.push(`LOWER(machine_department) = LOWER($${i})`);
      params.push(departmentFilter);
      i++;
    }

    // Task view filters
    const useRange = startDate && endDate;

    if (taskView === "recent") {
      if (useRange) {
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(startDate);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(endDate);
        i++;
      } else {
        conditions.push(`task_start_date::date = CURRENT_DATE`);
      }
      conditions.push(`actual_date IS NULL`);
    } else if (taskView === "upcoming") {
      if (useRange) {
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(startDate);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(endDate);
        i++;
      } else {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        const tStr = t.toISOString().split("T")[0];
        conditions.push(`task_start_date::date = $${i}::date`);
        params.push(tStr);
        i++;
      }
      conditions.push(`actual_date IS NULL`);
    } else if (taskView === "overdue") {
      if (useRange) {
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(startDate);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(endDate);
        i++;
      }
      conditions.push(`task_start_date::date < CURRENT_DATE`);
      conditions.push(`actual_date IS NULL`);
    } else if (taskView === "notdone") {
      conditions.push(`LOWER(task_status) = 'no'`);
      conditions.push(`actual_date IS NOT NULL`);
      if (useRange) {
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(startDate);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(endDate);
        i++;
      } else {
        const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
        conditions.push(`task_start_date::date >= $${i}::date`);
        params.push(monthStart);
        i++;
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(monthEnd);
        i++;
      }
    } else if (taskView === "pending") {
      conditions.push(`actual_date IS NULL`); // Pending tasks are not yet completed
      if (useRange) {
        // For pending in a range, we only want tasks from today onwards within that range
        conditions.push(`task_start_date::date >= CURRENT_DATE`);
        conditions.push(`task_start_date::date <= $${i}::date`);
        params.push(endDate);
        i++;
      } else {
        // If no range, pending tasks are from today onwards indefinitely, or for the current month
        conditions.push(`task_start_date::date >= CURRENT_DATE`);
      }
    } else if (useRange) {
      conditions.push(`task_start_date::date >= $${i}::date`);
      params.push(startDate);
      i++;
      conditions.push(`task_start_date::date <= $${i}::date`);
      params.push(endDate);
      i++;
    } else {
      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
      conditions.push(`task_start_date::date >= $${i}::date`);
      params.push(monthStart);
      i++;
      conditions.push(`task_start_date::date <= $${i}::date`);
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





