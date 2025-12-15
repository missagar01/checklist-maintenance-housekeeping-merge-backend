// maintenanceQueries.js
import { maintenancePool } from "../config/db.js";

/***************************************************************************
 * 🟦 COMMON SELECT MAPPING (UI EXPECTS THESE FIELD NAMES)
 ***************************************************************************/
const MAINTENANCE_SELECT = `
  "id" AS task_id,
  "Task_No" AS task_no,
  "Machine_Name" AS machine_name,
  "Serial_No" AS serial_no,
  "Description" AS task_description,
  "doer_department" AS doer_department,
  "Task_Type" AS task_type,
  "Priority" AS priority,
  "Doer_Name" AS doer_name,
  "Given_By" AS given_by,
  "Task_Start_Date" AS scheduled_date,
  "Actual_Date" AS completed_date,
  "Task_Status" AS status,
  "Remarks" AS remarks,
  "Sound_Status" AS sound_status,         
  "Temperature_Status" AS temperature_status,
  "Image_Link" AS image,
  "File_Name" AS file_name,
  "File_Type" AS file_type,
  "created_at" AS created_at,
  "Maintenance_Cost" AS maintenance_cost
`;

/***************************************************************************
 * 🟩 1. GET ALL TASKS
 ***************************************************************************/
export const getMaintenanceTasks = async (page = 1, limit = 50, filters = {}) => {
  const offset = (page - 1) * limit;

  const {
    search = "",
    machineName = "",
    serialNo = "",
    task_status = "",
    startDate = "",
    endDate = "",
    assignedTo = "",
    taskType = "",
    priority = ""
  } = filters;

  let query = `
    SELECT ${MAINTENANCE_SELECT}
    FROM maintenance_task_assign
    WHERE 1 = 1
  `;

  const params = [];

  if (search) {
    query += ` AND (
      "Description" ILIKE $${params.length + 1} OR
      "Machine_Name" ILIKE $${params.length + 1} OR
      "Serial_No" ILIKE $${params.length + 1} OR
      "Doer_Name" ILIKE $${params.length + 1}
    )`;
    params.push(`%${search}%`);
  }

  if (machineName) {
    query += ` AND "Machine_Name" = $${params.length + 1}`;
    params.push(machineName);
  }

  if (serialNo) {
    query += ` AND "Serial_No" = $${params.length + 1}`;
    params.push(serialNo);
  }

  if (task_status) {
    query += ` AND "Task_Status" = $${params.length + 1}`;
    params.push(task_status);
  }

  if (assignedTo) {
    query += ` AND "Doer_Name" = $${params.length + 1}`;
    params.push(assignedTo);
  }

  if (taskType) {
    query += ` AND "Task_Type" = $${params.length + 1}`;
    params.push(taskType);
  }

  if (priority) {
    query += ` AND "Priority" = $${params.length + 1}`;
    params.push(priority);
  }

  if (startDate) {
    query += ` AND "Task_Start_Date" >= $${params.length + 1}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND "Task_Start_Date" <= $${params.length + 1}`;
    params.push(endDate);
  }

  query += `
    ORDER BY "Priority" ASC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  params.push(limit, offset);

  const result = await maintenancePool.query(query, params);
  return result.rows;
};

/***************************************************************************
 * 🟧 2. GET PENDING TASKS (Actual_Date IS NULL)
 ***************************************************************************/
// export const getPendingMaintenanceTasks = async (page = 1, limit = 50, userId = null) => {
//   const offset = (page - 1) * limit;

//   let query = `
//     SELECT ${MAINTENANCE_SELECT}
//     FROM maintenance_task_assign
//     WHERE "Actual_Date" IS NULL
//   `;

//   const params = [];

//   if (userId) {
//   query += ` AND "Doer_Name" = $${params.length + 1}`;
//   params.push(userId);
// }


//   query += `
//     ORDER BY 
//       CASE 
//         WHEN "Priority" = 'High' THEN 1
//         WHEN "Priority" = 'Medium' THEN 2
//         WHEN "Priority" = 'Low' THEN 3
//         ELSE 4
//       END,
//       "Task_Start_Date" ASC
//     LIMIT $${params.length + 1}
//     OFFSET $${params.length + 2}
//   `;

//   params.push(limit, offset);

//   const result = await maintenancePool.query(query, params);
//   return result.rows;
// };


export const getPendingMaintenanceTasks = async (page = 1, limit = 50, userId = null) => {
  const offset = (page - 1) * limit;

  let query = `
    SELECT ${MAINTENANCE_SELECT}
    FROM maintenance_task_assign
    WHERE "Actual_Date" IS NULL
      AND "Task_Start_Date" <= CURRENT_DATE     -- 🔥 Only show overdue + today
  `;

  const params = [];

  // Filter by logged-in user
  if (userId) {
    query += ` AND "Doer_Name" = $${params.length + 1}`;
    params.push(userId);
  }

  query += `
    ORDER BY 
      CASE 
        WHEN "Priority" = 'High' THEN 1
        WHEN "Priority" = 'Medium' THEN 2
        WHEN "Priority" = 'Low' THEN 3
        ELSE 4
      END,
      "Task_Start_Date" ASC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  params.push(limit, offset);

  const result = await maintenancePool.query(query, params);
  return result.rows;
};

/***************************************************************************
 * 🟦 3. HISTORY (Completed tasks = Actual_Date IS NOT NULL)
 ***************************************************************************/
export const getCompletedMaintenanceTasks = async (page = 1, limit = 50, filters = {}) => {
  const offset = (page - 1) * limit;

  const { search = "", machineName = "", serialNo = "", assignedTo = "", startDate = "", endDate = "" } = filters;

  let query = `
    SELECT ${MAINTENANCE_SELECT}
    FROM maintenance_task_assign
    WHERE "Actual_Date" IS NOT NULL
  `;

  const params = [];

  if (search) {
    query += ` AND (
      "Description" ILIKE $${params.length + 1} OR
      "Machine_Name" ILIKE $${params.length + 1} OR
      "Remarks" ILIKE $${params.length + 1}
    )`;
    params.push(`%${search}%`);
  }

  if (machineName) {
    query += ` AND "Machine_Name" = $${params.length + 1}`;
    params.push(machineName);
  }

  if (serialNo) {
    query += ` AND "Serial_No" = $${params.length + 1}`;
    params.push(serialNo);
  }

  if (assignedTo) {
    query += ` AND "Doer_Name" = $${params.length + 1}`;
    params.push(assignedTo);
  }

  if (startDate) {
    query += ` AND "Actual_Date" >= $${params.length + 1}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND "Actual_Date" <= $${params.length + 1}`;
    params.push(endDate);
  }

  if (assignedTo) {
    query += ` AND "Doer_Name" = $${params.length + 1}`;
    params.push(assignedTo);
}

  query += `
    ORDER BY "Actual_Date" DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  params.push(limit, offset);

  const result = await maintenancePool.query(query, params);
  return result.rows;
};

/***************************************************************************
 * 🟨 4. UPDATE TASK
 ***************************************************************************/
export const updateMaintenanceTask = async (taskId, data) => {
const fieldMap = {
  task_status: `"Task_Status"`,
  remarks: `"Remarks"`,
  sound_status: `"Sound_Status"`,              // FIXED
  temperature_status: `"Temperature_Status"`, // FIXED
  image_link: `"Image_Link"`,
  file_name: `"File_Name"`,
  file_type: `"File_Type"`,
  actual_date: `"Actual_Date"`
};


  const updates = [];
  const params = [];
  let i = 1;

  for (const key in fieldMap) {
    if (data[key] !== undefined) {
      updates.push(`${fieldMap[key]} = $${i}`);
      params.push(data[key]);
      i++;
    }
  }

  // If task status is "Completed" and actual_date is not provided, set it to current date
  // if (data.task_status === "Yes" && !data.actual_date) {
  //   updates.push(`"Actual_Date" = NOW()`);
  // }

  // Always update Actual_Date to today's date
updates.push(`"Actual_Date" = NOW()`);


  params.push(taskId);

  const query = `
    UPDATE maintenance_task_assign
    SET ${updates.join(", ")}
    WHERE "id" = $${i}
    RETURNING *
  `;

  const result = await maintenancePool.query(query, params);
  return result.rows[0];
};

/***************************************************************************
 * 🟪 5. MACHINE NAMES
 ***************************************************************************/
export const getUniqueMachineNames = async () => {
  const query = `
    SELECT DISTINCT "Machine_Name"
    FROM maintenance_task_assign
    WHERE "Machine_Name" IS NOT NULL AND "Machine_Name" <> ''
    ORDER BY "Machine_Name"
  `;

  const result = await maintenancePool.query(query);
  return result.rows.map((r) => r.Machine_Name);
};

/***************************************************************************
 * 🟦 6. PERSONNEL LIST
 ***************************************************************************/
export const getUniqueAssignedPersonnel = async () => {
  const query = `
    SELECT DISTINCT "Doer_Name"
    FROM maintenance_task_assign
    WHERE "Doer_Name" IS NOT NULL AND "Doer_Name" <> ''
    ORDER BY "Doer_Name"
  `;

  const result = await maintenancePool.query(query);
  return result.rows.map((r) => r.Doer_Name);
};

/***************************************************************************
 * 🟫 7. STATISTICS
 ***************************************************************************/
export const getMaintenanceStatistics = async () => {
  const query = `
    SELECT 
      COUNT(*) AS total_tasks,
      COUNT(CASE WHEN "Actual_Date" IS NOT NULL THEN 1 END) AS completed_tasks,
      COUNT(CASE WHEN "Actual_Date" IS NULL THEN 1 END) AS pending_tasks,
      COUNT(CASE WHEN "Priority" = 'High' THEN 1 END) AS high_priority,
      COUNT(CASE WHEN "Priority" = 'Medium' THEN 1 END) AS medium_priority,
      COUNT(CASE WHEN "Priority" = 'Low' THEN 1 END) AS low_priority
    FROM maintenance_task_assign
  `;

  const result = await maintenancePool.query(query);
  return result.rows[0];
};
