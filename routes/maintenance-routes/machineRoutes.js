import express from "express";
import upload from "../../middleware/s3Upload.js";
import { createMachine, fetchAllMachines } from "../../controllers/maintenance-controller/machineController.js";

const router = express.Router();

router.post(
  "/",
  upload.fields([
    { name: "user_manual", maxCount: 1 },
    { name: "purchase_bill", maxCount: 1 },
  ]),
  createMachine
);

router.get("/", fetchAllMachines);

export default router;
