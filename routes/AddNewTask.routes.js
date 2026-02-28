import express from "express";
import { addNewTaskController } from "../controllers/AddNewTask.controller.js";

const router = express.Router();

router.post("/", addNewTaskController);

export default router;
