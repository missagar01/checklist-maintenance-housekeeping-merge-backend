import express from "express";
import { fetchMachinesByDepartment } from "../controllers/formResponsesController.js";

const router = express.Router();

// ✅ Handles GET /api/form-responses?department=XYZ
router.get("/", fetchMachinesByDepartment);

export default router;
