import express from "express";
import { fetchDropdownData } from "../../controllers/maintenance-controller/dropdownController.js";

const router = express.Router();

router.get("/", fetchDropdownData);

export default router;
