import express from "express";
import {
  getUniqueDepartments,
  getUniqueDivisions,
  getUniqueGivenBy,
  getUniqueDoerNames,
  getWorkingDays,
  postAssignTasks
} from "../controllers/assignTaskController.js";
import upload from "../middleware/s3Upload.js"

const router = express.Router();

// Departments
router.get("/departments/:user_name", getUniqueDepartments);

// Divisions
router.get("/divisions", getUniqueDivisions);

// Given By
router.get("/given-by", getUniqueGivenBy);

// Doer Names
router.get("/doer/:department", getUniqueDoerNames);

// Working Days
router.get("/working-days", getWorkingDays);

// Insert Tasks
router.post("/assign", postAssignTasks);
router.post("/assign", upload.single("image"), postAssignTasks);

export default router;
