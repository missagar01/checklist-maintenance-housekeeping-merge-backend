import express from "express";
import { getWorkingDays, addWorkingDay } from "../controllers/workingDayController.js";

const router = express.Router();

router.get("/", getWorkingDays);   // GET all working days
router.post("/", addWorkingDay);   // Add a new working day

export default router;
