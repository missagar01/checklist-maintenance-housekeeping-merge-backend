// import maintenancePool from "../config/db.js";
import { maintenancePool } from "../../config/db.js";


export const insertMaintenanceTask = async (data) => {
  const query = `
    INSERT INTO maintenance_task_assign (
      "Time_Stamp",
      "Task_No",
      "Serial_No",
      "Machine_Name",
      "Given_By",
      "Doer_Name",
      "Task_Type",
      "Machine_Area",
      "Part_Name",
      "Need_Sound_Test",
      "Temperature",
      "Enable_Reminders",
      "Require_Attachment",
      "Task_Start_Date",
      "Frequency",
      "Description",
      "Priority",
      "machine_department",  -- New column
      "doer_department"      -- New column
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
    )
    RETURNING *;
  `;

  // ✅ Convert DD/MM/YYYY → YYYY-MM-DD (PostgreSQL format)
  let cleanDate = null;
  if (data.task_start_date) {
    const parts = data.task_start_date.split(/[\/\s:]/); 
    if (parts.length >= 3) {
      const [day, month, year] = parts;
      cleanDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  const values = [
    data.time_stamp || new Date(),
    data.task_no,
    data.serial_no,
    data.machine_name,
    data.given_by,
    data.doer_name,
    data.task_type,
    data.machine_area,
    data.part_name,
    data.need_sound_test,
    data.temperature,
    data.enable_reminders,
    data.require_attachment,
    cleanDate, // ✅ properly formatted
    data.frequency,
    data.description,
    data.priority,
    data.machine_department, // Changed from data.department
    data.doer_department,    // New
  ];

  try {
    const result = await maintenancePool.query(query, values);
    return result.rows[0];
  } catch (err) {
    console.error("❌ Database insert error:", err.message);
    throw err;
  }
};

/**
 * ✅ Fetch all maintenance tasks
 */
export const getAllMaintenanceTasks = async () => {
  const query = `
    SELECT 
      "Task_No", "Serial_No", "Machine_Name", "Given_By", "Doer_Name", 
      "Task_Type", "Machine_Area", "Part_Name", "Need_Sound_Test", 
      "Temperature", "Enable_Reminders", "Require_Attachment", 
      "Task_Start_Date", "Frequency", "Description", "Priority", 
      "Machine_Department", "Doer_Department"  -- Added
    FROM maintenance_task_assign
    ORDER BY id DESC;
  `;
  const result = await maintenancePool.query(query);
  return result.rows;
};



// 🧮 Fetch last Task_No and return next number
export const getNextTaskNumber = async () => {
  const query = `SELECT "Task_No" FROM maintenance_task_assign ORDER BY id DESC LIMIT 1;`;
  const result = await maintenancePool.query(query);

  if (result.rows.length === 0) return "TM-001";

  const lastTask = result.rows[0].Task_No || "TM-000";
  const lastNum = parseInt(lastTask.replace("TM-", "")) || 0;
  const nextNum = lastNum + 1;
  return `TM-${String(nextNum).padStart(3, "0")}`;
};

