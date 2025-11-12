import express from "express";
import {
  fetchPendingTasks,
} from "../controllers/taskController.js";

const router = express.Router();

router.get("/pending", fetchPendingTasks); // ✅ your new pending route

export default router;
