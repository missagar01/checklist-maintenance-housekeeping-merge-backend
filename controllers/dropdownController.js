import pool from "../config/db.js";

export const fetchDropdownData = async (req, res) => {
  try {
    // ✅ Use lowercase unquoted column names
    const query = `
      SELECT DISTINCT
        department,
        given_by,
        doer_name,
        task_status,
        priority
      FROM master;
    `;

    const result = await pool.query(query);
    const rows = result.rows;

    // ✅ Deduplicate & clean values
    const departments = [...new Set(rows.map(r => r.department).filter(Boolean))];
    const givenBy = [...new Set(rows.map(r => r.given_by).filter(Boolean))];
    const doerName = [...new Set(rows.map(r => r.doer_name).filter(Boolean))];
    const taskStatus = [...new Set(rows.map(r => r.task_status).filter(Boolean))];
    const priority = [...new Set(rows.map(r => r.priority).filter(Boolean))];

    res.status(200).json({
      success: true,
      data: { departments, givenBy, doerName, taskStatus, priority },
    });
  } catch (error) {
    console.error("Dropdown fetch error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};