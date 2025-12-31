import express from "express";
import {
  getDashboardStats,
  getMaintenanceCostByMachine,
  getDepartmentCostBreakdown,
  getFrequencyStats,
  getTodayTasks,
  getUpcomingTasks,
  getOverdueTasks,
  getDashboardData,
  getMaintenanceDepartments,
  getMaintenanceStaffByDepartment,
} from "../../controllers/maintenance-controller/maintenanceDashboardController.js";

const router = express.Router();

// ✅ Dashboard summary stats
router.get("/stats", getDashboardStats);

// ✅ Dashboard data with taskView filter
router.get("/data", getDashboardData);

// ✅ Today tasks (Recent tasks)
router.get("/today-tasks", getTodayTasks);

// ✅ Upcoming tasks (Tomorrow tasks)
router.get("/upcoming-tasks", getUpcomingTasks);

// ✅ Overdue tasks
router.get("/overdue-tasks", getOverdueTasks);

// ✅ Maintenance cost grouped by machine
router.get("/maintenance-costs", getMaintenanceCostByMachine);

// ✅ Department cost breakdown
router.get("/department-costs", getDepartmentCostBreakdown);

// ✅ Frequency stats
router.get("/frequencies", getFrequencyStats);

// ✅ Get unique departments from maintenance_task_assign
router.get("/departments", getMaintenanceDepartments);

// ✅ Get staff names by department from maintenance_task_assign
router.get("/staff", getMaintenanceStaffByDepartment);

export default router;


