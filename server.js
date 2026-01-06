import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import assignTaskRoutes from "./routes/assignTaskRoutes.js";
import checklistRoutes from "./routes/checklistRoutes.js";
import delegationRoutes from "./routes/delegationRoutes.js";
import settingRoutes from "./routes/settingRoutes.js";
import staffTasksRoutes from "./routes/staffTasksRoutes.js";
import quickTaskRoutes from "./routes/quickTaskRoutes.js";
import loginRoutes from "./routes/loginRoutes.js";
import deviceRoutes from "./routes/deviceRoutes.js";
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
// import housekeepingDashboardRoutes from "./routes/housekepping-routes/dashboardRoutes.js";
import routes from "./routes/housekepping-routes/index.js"

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.json());

// ROUTES
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/assign-task", assignTaskRoutes);
app.use("/api/checklist", checklistRoutes);
app.use("/api", delegationRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/staff-tasks", staffTasksRoutes);
app.use("/api/tasks", quickTaskRoutes);
app.use("/api/login", loginRoutes);
app.use("/api/logs", deviceRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/maintenance-tasks", maintenanceTaskRoutes);
app.use("/api/form-responses", formResponsesRoutes);
app.use("/api/dropdown", dropdownRoutes);
app.use("/api/machine-details", machineDetailsRoutes);
app.use("/api/working-days", workingDayRoutes)
app.use("/api/machines", machineRoutes);
app.use("/api/master", masterRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/repair-tasks", repairTaskRoutes);
app.use("/api/maintenance-dashboard", maintenanceDashboardRoutes);
// app.use("/api/housekeeping-dashboard", housekeepingDashboardRoutes);
app.use("/api/housekeeping-dashboard", routes);






// SERVER RUN
const PORT = process.env.PORT || 5050;
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`);
// });


app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running on port ${PORT}`));
