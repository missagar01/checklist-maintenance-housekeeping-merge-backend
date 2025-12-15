import express from "express";
import {
  createMaintenanceTask,
  fetchAllMaintenanceTasks,
} from "../../controllers/maintenance-controller/MaintenanceTaskController.js";

const router = express.Router();

// POST → create maintenance task
router.post("/", createMaintenanceTask);

// GET → fetch all tasks
router.get("/", fetchAllMaintenanceTasks);

export default router;
