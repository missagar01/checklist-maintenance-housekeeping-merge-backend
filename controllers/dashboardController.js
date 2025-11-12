import pool from "../config/db.js";

/**
 * ✅ Get overall dashboard summary stats
 */
export const getDashboardStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) AS total_tasks,
        COUNT(DISTINCT "Serial_No") AS total_machines,
        COUNT(*) FILTER (WHERE "Actual_Date" IS NOT NULL) AS completed_tasks,
        COUNT(*) FILTER (WHERE "Actual_Date" IS NULL) AS pending_tasks,
        COUNT(*) FILTER (WHERE "Task_Start_Date" < NOW() AND "Actual_Date" IS NULL) AS overdue_tasks,
        COALESCE(SUM("Maintenance_Cost"), 0) AS total_maintenance_cost
      FROM maintenance_task_assign;
    `;
    const { rows } = await pool.query(query);
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Get maintenance cost grouped by machine
 */
export const getMaintenanceCostByMachine = async (req, res) => {
  try {
    const query = `
      SELECT 
        "Serial_No" AS name, 
        SUM("Maintenance_Cost") AS maintenance_cost
      FROM maintenance_task_assign
      WHERE "Actual_Date" IS NOT NULL
      GROUP BY "Serial_No"
      ORDER BY maintenance_cost DESC;
    `;
    const { rows } = await pool.query(query);
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
 * ✅ Get cost breakdown by department
 */
export const getDepartmentCostBreakdown = async (req, res) => {
  try {
    const query = `
      SELECT 
        "Department" AS name, 
        SUM(COALESCE("Maintenance_Cost", 0)) AS cost
      FROM maintenance_task_assign
      WHERE "Actual_Date" IS NOT NULL
      GROUP BY "Department"
      ORDER BY cost DESC;
    `;
    const { rows } = await pool.query(query);
    res.json({ success: true, data: rows.map(r => ({
      name: r.name || "Unknown",
      cost: Number(r.cost) || 0
    })) });
  } catch (error) {
    console.error("Error fetching department cost breakdown:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Get maintenance frequency statistics
 */
export const getFrequencyStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        LOWER("Frequency") AS name, 
        COUNT(*) AS repairs
      FROM maintenance_task_assign
      WHERE "Actual_Date" IS NOT NULL
      GROUP BY LOWER("Frequency");
    `;
    const { rows } = await pool.query(query);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching frequency stats:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
