import express from "express";
import {
  getDashboardData,
  getTotalTask,
  getCompletedTask,
  getPendingTask,

  getPendingToday,
  getCompletedToday,
  getOverdueTask,
  getUniqueDepartments,
  getStaffByDepartment,
  getChecklistByDateRange,
  getChecklistStatsByDate,
  getUpcomingTask,
  getDashboardDataCount,
  getChecklistDateRangeCount,
  getStaffTaskSummary,
  getNotDoneTask,
  getNotDoneTaskList,
  getDivisionWiseTaskCounts
} from "../controllers/dashboardController.js";

const router = express.Router();

// MAIN FETCH
router.get("/", getDashboardData);

// COUNT APIs
router.get("/total", getTotalTask);
router.get("/completed", getCompletedTask);
router.get("/pending", getPendingTask);
router.get("/pendingtoday", getPendingToday);
router.get("/completedtoday", getCompletedToday);
router.get("/overdue", getOverdueTask);
router.get("/upcoming", getUpcomingTask);
router.get("/notdone", getNotDoneTask);
router.get("/notdone/list", getNotDoneTaskList);


// // FILTER LISTS
router.get("/departments", getUniqueDepartments);
router.get("/staff", getStaffByDepartment);
router.get("/staff-summary", getStaffTaskSummary);

// DATE RANGE
router.get("/checklist/date-range", getChecklistByDateRange);
router.get("/checklist/date-range/stats", getChecklistStatsByDate);
router.get("/checklist/date-range/count", getChecklistDateRangeCount);
router.get("/count", getDashboardDataCount);
router.get("/division-wise-counts", getDivisionWiseTaskCounts);


export default router;
