import pool from "../config/db.js";

/**
 * ✅ Fetch unique pending tasks (unique per Serial_No + Machine_Name)
 * - Task_Start_Date is NOT NULL
 * - Actual_Date IS NULL
 */
export const getPendingTasks = async () => {
  const query = `
    SELECT DISTINCT ON ("Serial_No", "Machine_Name")
      "Task_No" AS task_no,
      "Serial_No" AS serial_no,
      "Machine_Name" AS machine_name,
      "Department" AS department,
      "Doer_Name" AS doer_name,
      "Priority" AS priority,
      "Task_Type" AS task_type,
      "Task_Status" AS task_status,
      "Task_Start_Date" AS task_start_date,
      "Actual_Date" AS actual_date,
      "Description" AS description,
      "Given_By" AS given_by
    FROM maintenance_task_assign
    WHERE COALESCE("Task_Start_Date"::text, '') <> ''
      AND COALESCE("Actual_Date"::text, '') = ''
    ORDER BY "Serial_No", "Machine_Name", id DESC;
  `;

  const result = await pool.query(query);
  return result.rows;
};
