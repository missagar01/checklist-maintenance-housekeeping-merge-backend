import pool from "../config/db.js";

/**
 * ✅ Fetch all tasks for a specific machine and serial number
 */
export const getTasksByMachineAndSerial = async (taskNo, serialNo, taskType) => {
  try {
    const tableName = "maintenance_task_assign";

    // Step 1️⃣: Get the machine name from the given task number
    const machineQuery = `
      SELECT "Machine_Name" AS machine_name
      FROM ${tableName}
      WHERE "Task_No" = $1
      LIMIT 1;
    `;

    const machineResult = await pool.query(machineQuery, [taskNo]);
    if (machineResult.rows.length === 0) throw new Error("Task not found");

    const machineName = machineResult.rows[0].machine_name;

    // Step 2️⃣: Fetch all related tasks for same machine + serial
    const query = `
      SELECT 
        "id",
        "created_at",
        "Time_Stamp" AS time_stamp,
        "Task_No" AS task_no,
        "Serial_No" AS serial_no,
        "Machine_Name" AS machine_name,
        "Given_By" AS given_by,
        "Doer_Name" AS doer_name,
        "Task_Type" AS task_type,
        "Machine_Area" AS machine_area,
        "Part_Name" AS part_name,
        "Need_Sound_Test" AS need_sound_test,
        "Temperature",
        "Enable_Reminders" AS enable_reminders,
        "Require_Attachment" AS require_attachment,
        "Task_Start_Date" AS task_start_date,
        "Frequency",
        "Description",
        "Priority",
        "Department",
        "Actual_Date" AS actual_date,
        "Delay",
        "Task_Status" AS task_status,
        "Remarks",
        "Sound_Status" AS sound_status,
        "Temperature_Status" AS temperature_status,
        "Image_Link" AS image_link,
        "File_Name" AS file_name,
        "File_Type" AS file_type,
        "Maintenance_Cost" AS maintenance_cost
      FROM ${tableName}
      WHERE "Serial_No" = $1 AND "Machine_Name" = $2
      ORDER BY 
        CASE WHEN "Actual_Date" IS NULL THEN 0 ELSE 1 END,
        "Task_Start_Date" DESC,
        "created_at" DESC;
    `;

    const result = await pool.query(query, [serialNo, machineName]);

    return { machineName, tasks: result.rows };
  } catch (error) {
    console.error("Error fetching task details:", error.message);
    throw error;
  }
};

/**
 * ✅ Update task status and details dynamically
 */
export const updateTask = async (taskNo, updateData) => {
  try {
    const tableName = "maintenance_task_assign";
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    const fieldMappings = {
      task_status: "Task_Status",
      remarks: "Remarks",
      sound_status: "Sound_Status",
      temperature_status: "Temperature_Status",
      maintenance_cost: "Maintenance_Cost",
      image_link: "Image_Link",
      file_name: "File_Name",
      file_type: "File_Type",
    };

    for (const key in fieldMappings) {
      if (updateData[key] !== undefined) {
        updateFields.push(`"${fieldMappings[key]}" = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    }

    // If status is "Yes" → add today's date
    if (updateData.task_status === "Yes") {
      updateFields.push(`"Actual_Date" = $${paramCount}`);
      values.push(new Date().toISOString().split("T")[0]);
      paramCount++;
    }

    if (updateFields.length === 0) throw new Error("No fields to update");

    values.push(taskNo);

    const query = `
      UPDATE ${tableName}
      SET ${updateFields.join(", ")}, "Time_Stamp" = NOW()
      WHERE "Task_No" = $${paramCount}
      RETURNING *;
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error("Error updating task:", error.message);
    throw error;
  }
};

/**
 * ✅ Get pending tasks for a specific machine
 */
// export const getPendingTasksByMachine = async (machineName, serialNo) => {
//   try {
//     const query = `
//       SELECT 
//         "Task_No" AS task_no,
//         "Serial_No" AS serial_no,
//         "Machine_Name" AS machine_name,
//         "Task_Type" AS task_type,
//         "Task_Start_Date" AS task_start_date,
//         "Description",
//         "Need_Sound_Test" AS need_sound_test,
//         "Temperature",
//         "Require_Attachment" AS require_attachment,
//         "Department",
//         "Doer_Name" AS doer_name
//       FROM maintenance_task_assign
//       WHERE "Machine_Name" = $1 
//         AND "Serial_No" = $2
//         AND "Actual_Date" IS NULL
//         AND "Task_Start_Date" IS NOT NULL
//       ORDER BY "Task_Start_Date" ASC;
//     `;

//     const result = await pool.query(query, [machineName, serialNo]);
//     return result.rows;
//   } catch (error) {
//     console.error("Error fetching pending tasks:", error.message);
//     throw error;
//   }
// };



export const getPendingTasksByMachine = async (machineName, serialNo) => {
  try {
    const query = `
      SELECT 
        "Task_No" AS task_no,
        "Serial_No" AS serial_no,
        "Machine_Name" AS machine_name,
        "Task_Type" AS task_type,
        "Task_Start_Date" AS task_start_date,
        "Description",
        "Need_Sound_Test" AS need_sound_test,
        "Temperature",
        "Require_Attachment" AS require_attachment,
        "Doer_Name" AS department,        -- ✅ ALIAS HERE
        "Given_By" AS given_by,
        "Machine_Area" AS machine_area
      FROM maintenance_task_assign
      WHERE "Machine_Name" = $1 
        AND "Serial_No" = $2
        AND "Actual_Date" IS NULL
        AND "Task_Start_Date" IS NOT NULL
      ORDER BY "Task_Start_Date" ASC;
    `;

    const result = await pool.query(query, [machineName, serialNo]);
    return result.rows;
  } catch (error) {
    console.error("Error fetching pending tasks:", error.message);
    throw error;
  }
};



/**
 * ✅ Get completed tasks for History and Documents tab
 */
export const getCompletedTasksByMachine = async (machineName, serialNo) => {
  try {
    const query = `
      SELECT 
        "Task_No" AS task_no,
        "Serial_No" AS serial_no,
        "Machine_Name" AS machine_name,
        "Task_Type" AS task_type,
        "Task_Start_Date" AS task_start_date,
        "Actual_Date" AS actual_date,
        "Description" AS description,
        "Remarks" AS remarks,
        "Doer_Name" AS doer_name,
        "Department" AS department,
        "Image_Link" AS image_link,
        "File_Name" AS file_name,
        "File_Type" AS file_type
      FROM maintenance_task_assign
      WHERE "Machine_Name" = $1 
        AND "Serial_No" = $2
        AND "Actual_Date" IS NOT NULL
      ORDER BY "Actual_Date" DESC;
    `;
    const result = await pool.query(query, [machineName, serialNo]);
    return result.rows;
  } catch (error) {
    console.error("Error fetching completed tasks:", error.message);
    throw error;
  }
};

