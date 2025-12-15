// import pool from "../config/db.js";
import { maintenancePool } from "../../config/db.js";

export const fetchDropdownData = async (req, res) => {
  try {
    const { department } = req.query;

    // 1️⃣ Fetch ALL dropdown data for global lists
    const allQuery = `
      SELECT DISTINCT
        department,
        given_by,
        doer_name,
        task_status,
        priority,
        department1
      FROM master
    `;
    const allResult = await maintenancePool.query(allQuery);
    const allRows = allResult.rows;

    // Global dropdowns (always visible)
    const departments = [...new Set(allRows.map(r => r.department).filter(Boolean))];
    const givenBy = [...new Set(allRows.map(r => r.given_by).filter(Boolean))];
    const taskStatus = [...new Set(allRows.map(r => r.task_status).filter(Boolean))];
    const priority = [...new Set(allRows.map(r => r.priority).filter(Boolean))];

    // 2️⃣ If no department selected → return ALL except Doer Name
    if (!department) {
      return res.status(200).json({
        success: true,
        data: {
          departments,
          givenBy,
          doerName: [],     // Doer is empty until department selected
          taskStatus,
          priority,
        },
      });
    }

    // 3️⃣ Filter ONLY doer_name by department1
    const doerQuery = `
      SELECT DISTINCT doer_name
      FROM master
      WHERE LOWER(department1) = LOWER($1)
    `;
    const doerResult = await maintenancePool.query(doerQuery, [department]);
    const doerName = doerResult.rows.map(r => r.doer_name).filter(Boolean);

    res.status(200).json({
      success: true,
      data: {
        departments,
        givenBy,     // All values (not filtered)
        doerName,    // Filtered by department1
        taskStatus,  // All values
        priority,    // All values
      },
    });
  } catch (error) {
    console.error("Dropdown fetch error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
