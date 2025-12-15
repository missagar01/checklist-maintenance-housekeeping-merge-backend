import express from "express";
import {
  getDashboardStats,
  getMaintenanceCostByMachine,
  getDepartmentCostBreakdown,
  getFrequencyStats,
} from "../../controllers/maintenance-controller/maintenanceDashboardController.js";

const router = express.Router();

// ✅ Dashboard summary stats
router.get("/stats", getDashboardStats);

// ✅ Maintenance cost grouped by machine
router.get("/maintenance-costs", getMaintenanceCostByMachine);

// ✅ Department cost breakdown
router.get("/department-costs", getDepartmentCostBreakdown);

// ✅ Frequency stats
router.get("/frequencies", getFrequencyStats);

export default router;
