// import pool from "../config/db.js";
import { maintenancePool, pool } from "../../config/db.js";

export const fetchDropdownData = async (req, res) => {
  try {
    const { department } = req.query;
    const normalizedDepartment = department?.trim();

    // 1️⃣ Fetch ALL dropdown data for global lists
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

    // 2️⃣ Prepare doer query (if department exists)
    let doerPromise = Promise.resolve({ rows: [] });
    if (normalizedDepartment) {
      const doerQuery = `
        SELECT DISTINCT user_name AS doer_name
        FROM users
        WHERE (department IS NOT NULL AND department <> '')
          AND LOWER(department) = LOWER($1)
          AND user_name IS NOT NULL AND user_name <> ''
        ORDER BY user_name ASC
      `;
      doerPromise = pool.query(doerQuery, [normalizedDepartment]);
    }

    // ✅ OPTIMIZED: Run both queries in parallel
    const [allResult, doerResult] = await Promise.all([
      maintenancePool.query(allQuery),
      doerPromise
    ]);

    const allRows = allResult.rows;

    // Global dropdowns (always visible)
    const departments = [...new Set(allRows.map(r => r.department).filter(Boolean))];
    const givenBy = [...new Set(allRows.map(r => r.given_by).filter(Boolean))];
    const taskStatus = [...new Set(allRows.map(r => r.task_status).filter(Boolean))];
    const priority = [...new Set(allRows.map(r => r.priority).filter(Boolean))];

    // 3️⃣ If no department selected → return ALL except Doer Name
    if (!normalizedDepartment) {
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

    const doerName = doerResult.rows.map(r => r.doer_name).filter(Boolean);

    res.status(200).json({
      success: true,
      data: {
        departments,
        givenBy,     // All values (not filtered)
        doerName,    // Filtered by department from users table
        taskStatus,  // All values
        priority,    // All values
      },
    });
  } catch (error) {
    console.error("Dropdown fetch error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
