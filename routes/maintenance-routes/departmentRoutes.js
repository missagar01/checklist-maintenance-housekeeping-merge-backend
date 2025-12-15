import express from "express";
import { fetchDepartments } from "../../controllers/maintenance-controller/departmentController.js";

const router = express.Router();

router.get("/", fetchDepartments);

export default router;
