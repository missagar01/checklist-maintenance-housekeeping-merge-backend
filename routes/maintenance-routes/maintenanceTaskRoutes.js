import express from "express";
import {
  createMaintenanceTask,
  fetchAllMaintenanceTasks,
  bulkCreateMaintenanceTasks,
} from "../../controllers/maintenance-controller/MaintenanceTaskController.js";

const router = express.Router();

// POST → create single maintenance task
router.post("/", createMaintenanceTask);

// POST → bulk create multiple maintenance tasks (faster)
router.post("/bulk", bulkCreateMaintenanceTasks);

// GET → fetch all tasks
router.get("/", fetchAllMaintenanceTasks);

export default router;
