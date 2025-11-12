import express from "express";
import { fetchDepartments } from "../controllers/departmentController.js";

const router = express.Router();

router.get("/", fetchDepartments);

export default router;
