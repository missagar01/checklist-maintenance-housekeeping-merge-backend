import { maintenancePool } from "../../config/db.js";
import {
  getMaintenanceDashboardSummaryService,
  fetchMaintenanceDashboardDataService,
  countMaintenanceTaskByViewService,
} from "../../services/maintenance-serices/maintenanceDashboardServices.js";

/**
 * helper → user filter
 */
const getUserFilter = (req) => {
  const role = req.query.role;
  const username = req.query.username;

  if (role === "user" && username) {
    return {
      condition: ` AND LOWER("Doer_Name") = LOWER($1) `,
      params: [username]
    };
  }

  return { condition: "", params: [] };
};

/**
 * ✅ Get overall dashboard summary stats (Updated to match checklist pattern)
 */
export const getDashboardStats = async (req, res) => {
  try {
    const {
      staffFilter = "all",
      departmentFilter = "all",
      role = "admin",
      username = null,
    } = req.query;

    const params = {
      staffFilter,
      departmentFilter,
      role,
      username,
    };

    // Get summary stats using service
    const summary = await getMaintenanceDashboardSummaryService(params);

    // Get total machines count
    const totalMachineQuery = `
      SELECT COUNT(*) AS total_machines
      FROM form_responses;
    `;
    const machinesRes = await maintenancePool.query(totalMachineQuery);
    const totalMachines = machinesRes.rows[0].total_machines;

    // Calculate total maintenance cost
    let totalMaintenanceCost = 0;
    if (role === "user" && username) {
      const costQuery = `
        SELECT COALESCE(SUM("Maintenance_Cost"), 0) AS total_maintenance_cost
        FROM maintenance_task_assign
        WHERE "Actual_Date" IS NOT NULL
        AND LOWER("Doer_Name") = LOWER($1)
      `;
      const costRes = await maintenancePool.query(costQuery, [username]);
      totalMaintenanceCost = Number(costRes.rows[0]?.total_maintenance_cost || 0);
    } else if (staffFilter && staffFilter !== "all" && role === "admin") {
      const costQuery = `
        SELECT COALESCE(SUM("Maintenance_Cost"), 0) AS total_maintenance_cost
        FROM maintenance_task_assign
        WHERE "Actual_Date" IS NOT NULL
        AND LOWER("Doer_Name") = LOWER($1)
      `;
      const costRes = await maintenancePool.query(costQuery, [staffFilter]);
      totalMaintenanceCost = Number(costRes.rows[0]?.total_maintenance_cost || 0);
    } else {
      const costQuery = `
        SELECT COALESCE(SUM("Maintenance_Cost"), 0) AS total_maintenance_cost
        FROM maintenance_task_assign
        WHERE "Actual_Date" IS NOT NULL
      `;
      const costRes = await maintenancePool.query(costQuery);
      totalMaintenanceCost = Number(costRes.rows[0]?.total_maintenance_cost || 0);
    }

    res.json({
      success: true,
      data: {
        total_machines: Number(totalMachines),
        totalTasks: summary.totalTasks,
        completedTasks: summary.completedTasks,
        pendingTasks: summary.pendingTasks,
        overdueTasks: summary.overdueTasks,
        completionRate: summary.completionRate,
        upcomingTasks: summary.upcomingTasks,
        total_maintenance_cost: totalMaintenanceCost,
      }
    });

  } catch (error) {
    console.error("Error fetching dashboard stats:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * ✅ Maintenance Cost by Machine
 */
export const getMaintenanceCostByMachine = async (req, res) => {
  try {

    const { condition, params } = getUserFilter(req);

    const query = `
      SELECT
        "Serial_No" AS name,
        SUM("Maintenance_Cost") AS maintenance_cost
      FROM maintenance_task_assign
      WHERE "Actual_Date" IS NOT NULL
      ${condition}
      GROUP BY "Serial_No"
      ORDER BY maintenance_cost DESC;
    `;

    const { rows } = await maintenancePool.query(query, params);

    const formatted = rows.map(r => ({
      name: r.name || "Unknown",
      maintenanceCost: Number(r.maintenance_cost) || 0
    }));

    res.json({ success: true, data: formatted });

  } catch (error) {
    console.error("Error fetching maintenance cost by machine:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * ✅ Cost Breakdown by Department
 */
export const getDepartmentCostBreakdown = async (req, res) => {
  try {

    const { condition, params } = getUserFilter(req);

    const query = `
      SELECT 
        "machine_department" AS name, 
        SUM(COALESCE("Maintenance_Cost", 0)) AS cost
      FROM maintenance_task_assign
      WHERE "Actual_Date" IS NOT NULL
      ${condition}
      GROUP BY "machine_department"
      ORDER BY cost DESC;
    `;

    const { rows } = await maintenancePool.query(query, params);

    res.json({
      success: true,
      data: rows.map(r => ({
        name: r.name || "Unknown",
        cost: Number(r.cost) || 0
      }))
    });

  } catch (error) {
    console.error("Error fetching department cost breakdown:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};


/**
 * ✅ Maintenance Frequency Statistics
 */
export const getFrequencyStats = async (req, res) => {
  try {

    const { condition, params } = getUserFilter(req);

    const query = `
      SELECT 
        LOWER("Frequency") AS name, 
        COUNT(*) AS repairs
      FROM maintenance_task_assign
      WHERE "Actual_Date" IS NOT NULL
      ${condition}
      GROUP BY LOWER("Frequency");
    `;

    const { rows } = await maintenancePool.query(query, params);

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error("Error fetching frequency stats:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Get Today Tasks (Recent Tasks)
 */
export const getTodayTasks = async (req, res) => {
  try {
    const {
      staffFilter = "all",
      departmentFilter = "all",
      page = 1,
      limit = 50,
      role = "admin",
      username = null,
    } = req.query;

    const tasks = await fetchMaintenanceDashboardDataService({
      staffFilter,
      departmentFilter,
      page: Number(page),
      limit: Number(limit),
      taskView: "recent",
      role,
      username,
    });

    const totalCount = await countMaintenanceTaskByViewService({
      taskView: "recent",
      staffFilter,
      departmentFilter,
      role,
      username,
    });

    res.json({
      success: true,
      data: tasks,
      total: totalCount,
      page: Number(page),
      limit: Number(limit),
    });

  } catch (error) {
    console.error("Error fetching today tasks:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Get Upcoming Tasks (Tomorrow Tasks)
 */
export const getUpcomingTasks = async (req, res) => {
  try {
    const {
      staffFilter = "all",
      departmentFilter = "all",
      page = 1,
      limit = 50,
      role = "admin",
      username = null,
    } = req.query;

    const tasks = await fetchMaintenanceDashboardDataService({
      staffFilter,
      departmentFilter,
      page: Number(page),
      limit: Number(limit),
      taskView: "upcoming",
      role,
      username,
    });

    const totalCount = await countMaintenanceTaskByViewService({
      taskView: "upcoming",
      staffFilter,
      departmentFilter,
      role,
      username,
    });

    res.json({
      success: true,
      data: tasks,
      total: totalCount,
      page: Number(page),
      limit: Number(limit),
    });

  } catch (error) {
    console.error("Error fetching upcoming tasks:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Get Overdue Tasks
 */
export const getOverdueTasks = async (req, res) => {
  try {
    const {
      staffFilter = "all",
      departmentFilter = "all",
      page = 1,
      limit = 50,
      role = "admin",
      username = null,
    } = req.query;

    const tasks = await fetchMaintenanceDashboardDataService({
      staffFilter,
      departmentFilter,
      page: Number(page),
      limit: Number(limit),
      taskView: "overdue",
      role,
      username,
    });

    const totalCount = await countMaintenanceTaskByViewService({
      taskView: "overdue",
      staffFilter,
      departmentFilter,
      role,
      username,
    });

    res.json({
      success: true,
      data: tasks,
      total: totalCount,
      page: Number(page),
      limit: Number(limit),
    });

  } catch (error) {
    console.error("Error fetching overdue tasks:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Get Dashboard Data (with taskView filter)
 */
export const getDashboardData = async (req, res) => {
  try {
    const {
      staffFilter = "all",
      departmentFilter = "all",
      page = 1,
      limit = 50,
      taskView = "recent",
      role = "admin",
      username = null,
    } = req.query;

    const tasks = await fetchMaintenanceDashboardDataService({
      staffFilter,
      departmentFilter,
      page: Number(page),
      limit: Number(limit),
      taskView,
      role,
      username,
    });

    const totalCount = await countMaintenanceTaskByViewService({
      taskView,
      staffFilter,
      departmentFilter,
      role,
      username,
    });

    res.json({
      success: true,
      data: tasks,
      total: totalCount,
      page: Number(page),
      limit: Number(limit),
    });

  } catch (error) {
    console.error("Error fetching dashboard data:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Get Unique Departments from maintenance_task_assign
 */
export const getMaintenanceDepartments = async (req, res) => {
  try {
    const role = req.query.role;
    const username = req.query.username;

    let whereConditions = [
      `"doer_department" IS NOT NULL`,
      `TRIM("doer_department") <> ''`
    ];
    let queryParams = [];
    let paramIndex = 1;

    // Add user filter if role is user
    if (role === "user" && username) {
      whereConditions.push(`LOWER("Doer_Name") = LOWER($${paramIndex})`);
      queryParams.push(username);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

    const query = `
      SELECT DISTINCT "doer_department" AS department
      FROM maintenance_task_assign
      ${whereClause}
      ORDER BY "doer_department" ASC
    `;

    const { rows } = await maintenancePool.query(query, queryParams);

    const departments = rows
      .map((r) => r.department?.trim())
      .filter((d) => d && d.length > 0)
      .sort((a, b) => a.localeCompare(b));

    res.json({
      success: true,
      data: departments,
    });
  } catch (error) {
    console.error("Error fetching maintenance departments:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Get Staff Names by Department from maintenance_task_assign
 */
export const getMaintenanceStaffByDepartment = async (req, res) => {
  try {
    const { departmentFilter = "all" } = req.query;
    const role = req.query.role;
    const username = req.query.username;

    let whereConditions = [
      `"Doer_Name" IS NOT NULL`,
      `TRIM("Doer_Name") <> ''`
    ];
    let queryParams = [];
    let paramIndex = 1;

    // Add user filter if role is user
    if (role === "user" && username) {
      whereConditions.push(`LOWER("Doer_Name") = LOWER($${paramIndex})`);
      queryParams.push(username);
      paramIndex++;
    }

    // Add department filter
    if (departmentFilter && departmentFilter !== "all") {
      whereConditions.push(`LOWER("doer_department") = LOWER($${paramIndex})`);
      queryParams.push(departmentFilter);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

    const query = `
      SELECT DISTINCT "Doer_Name" AS name
      FROM maintenance_task_assign
      ${whereClause}
      ORDER BY "Doer_Name" ASC
    `;

    const { rows } = await maintenancePool.query(query, queryParams);

    const staffNames = rows
      .map((r) => r.name?.trim())
      .filter((n) => n && n.length > 0)
      .sort((a, b) => a.localeCompare(b));

    res.json({
      success: true,
      data: staffNames,
    });
  } catch (error) {
    console.error("Error fetching maintenance staff:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
