import express from "express";
import { getMaintenanceCostReport } from "../controllers/reportController.js";

const router = express.Router();

// ✅ Get monthly maintenance cost summary
router.get("/maintenance-costs", getMaintenanceCostReport);

export default router;
