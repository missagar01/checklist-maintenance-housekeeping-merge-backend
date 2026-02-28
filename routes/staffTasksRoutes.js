import express from "express";
import {
  getStaffTasks,
  getStaffCount,
  getUsersCount,
  exportAllStaffTasks
} from "../controllers/staffTasksController.js";

const router = express.Router();

router.get("/tasks", getStaffTasks);
router.get("/tasks/export", exportAllStaffTasks); // Export endpoint
router.get("/count", getStaffCount);
router.get("/users-count", getUsersCount);

export default router;
