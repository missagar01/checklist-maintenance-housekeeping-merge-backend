import pool from "../config/db.js";

/**
 * ✅ Get monthly maintenance cost report
 */
export const getMaintenanceCostReport = async (req, res) => {
  try {
    const { year } = req.query; // optional filter like ?year=2025
    const queryParams = [];
    let yearFilter = "";

    if (year) {
      yearFilter = `WHERE EXTRACT(YEAR FROM "Actual_Date") = $1`;
      queryParams.push(year);
    }

    const query = `
      SELECT 
        TO_CHAR("Actual_Date", 'Mon-YYYY') AS month_year,
        SUM("Maintenance_Cost") AS total_cost
      FROM maintenance_task_assign
      ${yearFilter}
      GROUP BY month_year
      ORDER BY MIN("Actual_Date");
    `;

    const result = await pool.query(query, queryParams);

    const formatted = result.rows.map((r) => ({
      month: r.month_year,
      cost: Number(r.total_cost),
    }));

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("❌ Error fetching maintenance cost report:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
