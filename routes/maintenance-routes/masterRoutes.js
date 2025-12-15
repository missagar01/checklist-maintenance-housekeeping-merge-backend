import express from "express";
import { maintenancePool } from "../../config/db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // Fetch all data from your master table
    const result = await maintenancePool.query(`
      SELECT id, doer_name, department, given_by, task_status, task_type, priority
      FROM master
      ORDER BY id ASC;
    `);

    // Build the same structure like your Google Sheet response
    const cols = [
      { label: "Doer Name" },
      { label: "Department" },
      { label: "Given By" },
      { label: "Task Status" },
      { label: "Task Type" },
      { label: "Priority" },
    ];

    const rows = result.rows.map((row) => ({
      c: [
        { v: row.doer_name },
        { v: row.department },
        { v: row.given_by },
        { v: row.task_status },
        { v: row.task_type },
        { v: row.priority },
      ],
    }));

    res.status(200).json({
      success: true,
      table: {
        cols,
        rows,
      },
    });
  } catch (error) {
    console.error("Error fetching master data:", error);
    res.status(500).json({ success: false, error: "Failed to fetch master data" });
  }
});

export default router;
