import express from "express";
import {
  getAllMachines,
  getMachineBySerial,
  getMachineByTag,
  updateMachine,
  updateMachineByTag,
  getMachineHistory,
  getMachineHistoryByTag,
} from "../../controllers/maintenance-controller/machineDetailsController.js";

const router = express.Router();

router.get("/", getAllMachines);
router.get("/tag/:tagNo/history", getMachineHistoryByTag);
router.get("/tag/:tagNo", getMachineByTag);
router.put("/tag/:tagNo", updateMachineByTag);
router.get("/:serialNo/history", getMachineHistory);
router.get("/:serialNo", getMachineBySerial);
router.put("/:serialNo", updateMachine);

export default router;

