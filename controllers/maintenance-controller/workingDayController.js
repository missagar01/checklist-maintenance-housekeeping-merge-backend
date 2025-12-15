// import pool from "../config/db.js";
import { maintenancePool } from "../../config/db.js";


/**
 * ✅ Fetch all working days (optionally filter by month/year)
 */
export const getWorkingDays = async (req, res) => {
  try {
    const { month, year } = req.query;

    let query = `SELECT id, working_date, day_name, week_num, month_num FROM working_day_calendar`;
    const values = [];

    if (month && year) {
      query += ` WHERE EXTRACT(MONTH FROM working_date) = $1 AND EXTRACT(YEAR FROM working_date) = $2 ORDER BY working_date ASC`;
      values.push(month, year);
    } else if (year) {
      query += ` WHERE EXTRACT(YEAR FROM working_date) = $1 ORDER BY working_date ASC`;
      values.push(year);
    } else {
      query += ` ORDER BY working_date ASC`;
    }

    const result = await maintenancePool.query(query, values);
    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("❌ Error fetching working days:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ✅ Insert a new working day entry
 */
export const addWorkingDay = async (req, res) => {
  try {
    const { working_date, day_name, week_num, month_num } = req.body;

    if (!working_date || !day_name)
      return res
        .status(400)
        .json({ success: false, error: "working_date and day_name are required" });

    const query = `
      INSERT INTO working_day_calendar (working_date, day_name, week_num, month_num)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [working_date, day_name, week_num, month_num];
    const result = await maintenancePool.query(query, values);

    res.status(201).json({
      success: true,
      message: "Working day added successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error adding working day:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
