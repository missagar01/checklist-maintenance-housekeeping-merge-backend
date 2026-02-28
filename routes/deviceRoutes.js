import express from "express";
import { syncDeviceLogs } from "../controllers/deviceController.js";

const router = express.Router();

router.get("/device-sync", syncDeviceLogs);

export default router;
