import express from "express";
import { createMachine, getMachines } from "../../controllers/maintenance-controller/machineController.js";

const router = express.Router();

router.post(
  "/",
  createMachine
);

router.get("/", getMachines);

export default router;
