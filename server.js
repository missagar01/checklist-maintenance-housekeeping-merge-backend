import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import machineRoutes from "./routes/machineRoutes.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import masterRoutes from "./routes/masterRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js"
import maintenanceTaskRoutes from "./routes/maintenanceTaskRoutes.js";
import dropdownRoutes from "./routes/dropdownRoutes.js"
import formResponsesRoutes from "./routes/formResponsesRoutes.js";
import taskRoutes from "./routes/taskRoutes.js"
import workingDayRoutes from "./routes/workingDayRoutes.js"
import taskDetailsRoutes from "./routes/taskDetailsRoutes.js";
import reportRoutes from "./routes/reportRoutes.js"
import dashboardRoutes from "./routes/dashboardRoutes.js"
import authRoutes from "./routes/authRoutes.js"
import machineDetailsRoutes from "./routes/machineDetailsRoutes.js";


dotenv.config();
const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.get("/", (req, res) => res.send("✅ Machine API is running"));
app.use("/api/machines", machineRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/master", masterRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/maintenance-tasks", maintenanceTaskRoutes);
app.use("/api/dropdown", dropdownRoutes);
app.use("/api/form-responses", formResponsesRoutes);
app.use("/api/tasks", taskRoutes)
app.use("/api/working-days", workingDayRoutes)
app.use("/api/task-details", taskDetailsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/machine-details", machineDetailsRoutes);


const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
