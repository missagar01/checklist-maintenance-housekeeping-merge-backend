import express from "express";
import multer from "multer";
import {
  getMaintenanceTasksController,
  getPendingMaintenanceTasksController,
  getCompletedMaintenanceTasksController,
  updateMaintenanceTaskController,
  updateMultipleMaintenanceTasksController,
  getUniqueMachineNamesController,
  getUniqueAssignedPersonnelController,
  getMaintenanceStatisticsController,
  getUniqueMaintenanceDepartmentsController,
  getUniqueMaintenanceDoerNameController
} from "../controllers/maintenanceController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all maintenance tasks
router.get("/tasks", getMaintenanceTasksController);

// Get pending maintenance tasks
router.get("/tasks/pending", getPendingMaintenanceTasksController);

// Get completed maintenance tasks (history)
router.get("/tasks/completed", getCompletedMaintenanceTasksController);

// Update single maintenance task
router.put("/tasks/:taskId", upload.single("image"), updateMaintenanceTaskController);

// Update multiple maintenance tasks
router.put("/tasks/bulk/update", updateMultipleMaintenanceTasksController);

// Get unique machine names
router.get("/machines/unique", getUniqueMachineNamesController);

// Get unique assigned personnel
router.get("/personnel/unique", getUniqueAssignedPersonnelController);

// Get maintenance statistics
router.get("/statistics", getMaintenanceStatisticsController);

// Get unique maintenance departments
router.get("/departments/unique", getUniqueMaintenanceDepartmentsController);

router.get("/doers/unique", getUniqueMaintenanceDoerNameController);

export default router;