import express from "express";
import {
  getAllUserScores,
  getUserScoreById
} from "../controllers/userScoreController.js";

const router = express.Router();

/**
 * GET ALL USERS
 * /api/user-scores?startDate=2025-12-01&endDate=2026-01-01
 */
router.get("/", getAllUserScores);

/**
 * GET SINGLE USER
 * /api/user-scores/:id?startDate=2025-12-01&endDate=2026-01-01
 */
router.get("/:id", getUserScoreById);

export default router;
