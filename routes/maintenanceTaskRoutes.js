import express from "express";
import {
  createMaintenanceTask,
  fetchAllMaintenanceTasks,
} from "../controllers/maintenanceTaskController.js";

const router = express.Router();

// POST → create maintenance task
router.post("/", createMaintenanceTask);

// GET → fetch all tasks
router.get("/", fetchAllMaintenanceTasks);

export default router;
