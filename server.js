import express from "express";
import cors from "cors";
import dotenv from "dotenv";


dotenv.config();
const app = express();
const DEPLOY_MODE = process.env.DEPLOY_MODE === "true";

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

/* =======================
   ROUTES IMPORT
======================= */
import dashboardRoutes from "./routes/dashboardRoutes.js";
import assignTaskRoutes from "./routes/assignTaskRoutes.js";
import checklistRoutes from "./routes/checklistRoutes.js";
import delegationRoutes from "./routes/delegationRoutes.js";
import settingRoutes from "./routes/settingRoutes.js";
import staffTasksRoutes from "./routes/staffTasksRoutes.js";
import quickTaskRoutes from "./routes/quickTaskRoutes.js";
import loginRoutes from "./routes/loginRoutes.js";
import deviceRoutes from "./routes/deviceRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import userScore from "./routes/userScoreRoutes.js";
import addNewTaskRoutes from "./routes/AddNewTask.routes.js";

import maintenanceRoutes from "./routes/maintenanceRoutes.js";
import maintenanceTaskRoutes from "./routes/maintenance-routes/maintenanceTaskRoutes.js";
import formResponsesRoutes from "./routes/maintenance-routes/formResponsesRoutes.js";
import dropdownRoutes from "./routes/maintenance-routes/dropdownRoutes.js";
import machineDetailsRoutes from "./routes/maintenance-routes/machineDetailsRoutes.js";
import workingDayRoutes from "./routes/maintenance-routes/workingDayRoutes.js";
import machineRoutes from "./routes/maintenance-routes/machineRoutes.js";
import masterRoutes from "./routes/maintenance-routes/masterRoutes.js";
import departmentRoutes from "./routes/maintenance-routes/departmentRoutes.js";
import uploadRoutes from "./routes/maintenance-routes/uploadRoutes.js";
import repairTaskRoutes from "./routes/maintenance-routes/repairTaskRoutes.js";
import maintenanceDashboardRoutes from "./routes/maintenance-routes/maintenanceDashboardRoutes.js";

import housekeepingRoutes from "./routes/housekepping-routes/index.js";
import { refreshDeviceSync } from "./services/deviceSync.js";

/* =======================
   ROUTES
======================= */
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/assign-task", assignTaskRoutes);
app.use("/api/checklist", checklistRoutes);
app.use("/api", delegationRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/settings", userRoutes);
app.use("/api/staff-tasks", staffTasksRoutes);
app.use("/api/tasks", quickTaskRoutes);
app.use("/api/login", loginRoutes);
app.use("/api/logs", deviceRoutes);
app.use("/api/user-score", userScore);
app.use("/api/add-new-task", addNewTaskRoutes);

app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/maintenance-tasks", maintenanceTaskRoutes);
app.use("/api/form-responses", formResponsesRoutes);
app.use("/api/dropdown", dropdownRoutes);
app.use("/api/machine-details", machineDetailsRoutes);
app.use("/api/working-days", workingDayRoutes);
app.use("/api/machines", machineRoutes);
app.use("/api/master", masterRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/repair-tasks", repairTaskRoutes);
app.use("/api/maintenance-dashboard", maintenanceDashboardRoutes);

app.use("/api/housekeeping-dashboard", housekeepingRoutes);

/* =======================
   HEALTH CHECK (FAST)
   ❌ NO DB
   ❌ NO ASYNC
======================= */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    pid: process.pid,
    deployMode: DEPLOY_MODE,
  });
});

/* =======================
   DEVICE SYNC (SAFE)
======================= */
const DEVICE_SYNC_INTERVAL_MS = Number(
  process.env.DEVICE_SYNC_INTERVAL_MS || 5 * 60 * 1000
);

const DEVICE_SYNC_ENABLED =
  process.env.DEVICE_SYNC_ENABLED !== "false" && !DEPLOY_MODE;

let isSyncRunning = false;

if (DEVICE_SYNC_ENABLED) {
  const runDeviceSync = async () => {
    // ✅ Force IST time
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );

    const hour = now.getHours();
    const minute = now.getMinutes();

    // 🔒 Run at 11:00 AM OR 11:00 PM (IST)
    // Allow 8-minute window (minute < 8)
    const isMorningRun = hour === 11;
    const isNightRun = hour === 23;

    if (!((isMorningRun || isNightRun) && minute < 8)) return;

    if (isSyncRunning) return;
    isSyncRunning = true;

    try {
      const mode = isMorningRun ? "Morning (11 AM)" : "Night (11 PM)";
      console.log(`⏱ ${mode} Device Sync triggered`);
      
      // Pass the hour so logic knows which trigger to run
      await refreshDeviceSync(undefined, hour);
      
      console.log(`✅ ${mode} Device Sync completed`);
    } catch (err) {
      console.error("❌ DEVICE SYNC ERROR:", err);
    } finally {
      isSyncRunning = false;
    }
  };


  // ❗ Deploy mode me ye block execute hi nahi hota
  runDeviceSync();
  setInterval(runDeviceSync, DEVICE_SYNC_INTERVAL_MS);
} else {
  console.log("⏸️ Device sync disabled (DEPLOY MODE)");
}

console.log("DEPLOY_MODE:", DEPLOY_MODE);
console.log("DEVICE_SYNC_ENABLED:", DEVICE_SYNC_ENABLED);
console.log("DEVICE_SYNC_INTERVAL_MS:", DEVICE_SYNC_INTERVAL_MS);

/* =======================
   SERVER START
======================= */
const PORT = process.env.PORT || 5050;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
