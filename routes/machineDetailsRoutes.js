import express from "express";
import {
  getAllMachines,
  getMachineBySerial,
  updateMachine,
  getMachineHistory,
} from "../controllers/machineDetailsController.js";

const router = express.Router();

router.get("/", getAllMachines);
router.get("/:serialNo", getMachineBySerial);
router.put("/:serialNo", updateMachine);
router.get("/:serialNo/history", getMachineHistory);

export default router;
