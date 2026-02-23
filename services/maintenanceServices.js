// maintenanceQueries.js
import { maintenancePool } from "../config/db.js";

/***************************************************************************
 * 🟦 COMMON SELECT MAPPING (UI EXPECTS THESE FIELD NAMES)
 ***************************************************************************/
const MAINTENANCE_SELECT = `
  id AS task_id,
  task_no AS task_no,
  machine_name AS machine_name,
  serial_no AS serial_no,
  description AS task_description,
  doer_department AS doer_department,
  task_type AS task_type,
  priority AS priority,
  doer_name AS doer_name,
  given_by AS given_by,
  task_start_date AS scheduled_date,
  actual_date AS completed_date,
  task_status AS status,
  remarks AS remarks,
  sound_status AS sound_status,         
  temperature_status AS temperature_status,
  image_link AS image,
  file_name AS file_name,
  file_type AS file_type,
  created_at AS created_at,
  maintenance_cost AS maintenance_cost
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
      description ILIKE $${params.length + 1} OR
      machine_name ILIKE $${params.length + 1} OR
      serial_no ILIKE $${params.length + 1} OR
      doer_name ILIKE $${params.length + 1}
    )`;
    params.push(`%${search}%`);
  }

  if (machineName) {
    query += ` AND machine_name = $${params.length + 1}`;
    params.push(machineName);
  }

  if (serialNo) {
    query += ` AND serial_no = $${params.length + 1}`;
    params.push(serialNo);
  }

  if (task_status) {
    query += ` AND task_status = $${params.length + 1}`;
    params.push(task_status);
  }

  if (assignedTo) {
    query += ` AND doer_name = $${params.length + 1}`;
    params.push(assignedTo);
  }

  if (taskType) {
    query += ` AND task_type = $${params.length + 1}`;
    params.push(taskType);
  }

  if (priority) {
    query += ` AND priority = $${params.length + 1}`;
    params.push(priority);
  }

  if (startDate) {
    query += ` AND task_start_date >= $${params.length + 1}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND task_start_date <= $${params.length + 1}`;
    params.push(endDate);
  }

  query += `
    ORDER BY priority ASC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  params.push(limit, offset);

  const result = await maintenancePool.query(query, params);
  return result.rows;
};



export const getPendingMaintenanceTasks = async (
  page = 1,
  limit = 50,
  userId = null
) => {
  const offset = (page - 1) * limit;

  let query = `
    SELECT ${MAINTENANCE_SELECT}
    FROM maintenance_task_assign
    WHERE actual_date IS NULL
      AND task_start_date <= CURRENT_DATE
      AND task_status IS NULL
  `;

  const params = [];

  // Filter by logged-in user
  if (userId) {
    query += ` AND doer_name = $${params.length + 1}`;
    params.push(userId);
  }

  query += `
    ORDER BY 
      CASE 
        WHEN priority = 'High' THEN 1
        WHEN priority = 'Medium' THEN 2
        WHEN priority = 'Low' THEN 3
        ELSE 4
      END,
      task_start_date ASC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  params.push(limit, offset);

  const result = await maintenancePool.query(query, params);
  return result.rows;
};





export const getCompletedMaintenanceTasks = async (
  page = 1,
  limit = 50,
  filters = {},
  userId = null
) => {
  const offset = (page - 1) * limit;

  const { search = "", machineName = "", serialNo = "", assignedTo = "", startDate = "", endDate = "" } = filters;

  let query = `
    SELECT ${MAINTENANCE_SELECT}, COUNT(*) OVER() AS total_count
    FROM maintenance_task_assign
    WHERE actual_date IS NOT NULL
  `;

  const params = [];

  // ⭐ Default to current month based on completion (actual_date)
  if (!startDate && !endDate) {
    query += ` AND actual_date >= DATE_TRUNC('month', CURRENT_DATE) `;
  }

  if (search) {
    query += ` AND (
      description ILIKE $${params.length + 1} OR
      machine_name ILIKE $${params.length + 1} OR
      remarks ILIKE $${params.length + 1}
    )`;
    params.push(`%${search}%`);
  }

  if (machineName) {
    query += ` AND machine_name = $${params.length + 1}`;
    params.push(machineName);
  }

  if (serialNo) {
    query += ` AND serial_no = $${params.length + 1}`;
    params.push(serialNo);
  }

  if (assignedTo) {
    query += ` AND doer_name = $${params.length + 1}`;
    params.push(assignedTo);
  }

  if (startDate) {
    query += ` AND actual_date >= $${params.length + 1}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND actual_date <= $${params.length + 1}`;
    params.push(endDate);
  }

  // ✅ USER RESTRICTION FIX (Case-insensitive)
  if (userId) {
    query += ` AND LOWER(doer_name) = LOWER($${params.length + 1})`;
    params.push(userId);
  }

  query += `
    ORDER BY actual_date DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  params.push(limit, offset);

  const result = await maintenancePool.query(query, params);

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
  return {
    tasks: result.rows,
    totalCount
  };
};

/***************************************************************************
 * 🟨 4. UPDATE TASK
 ***************************************************************************/
export const updateMaintenanceTask = async (taskId, data) => {
  const fieldMap = {
    task_status: `task_status`,
    remarks: `remarks`,
    sound_status: `sound_status`,              // FIXED
    temperature_status: `temperature_status`, // FIXED
    image_link: `image_link`,
    file_name: `file_name`,
    file_type: `file_type`,
    actual_date: `actual_date`
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

  // Always update actual_date to today's date
  updates.push(`actual_date = NOW()`);


  params.push(taskId);

  const query = `
    UPDATE maintenance_task_assign
    SET ${updates.join(", ")}
    WHERE id = $${i}
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
    SELECT DISTINCT machine_name
    FROM maintenance_task_assign
    WHERE machine_name IS NOT NULL AND machine_name <> ''
    ORDER BY machine_name
  `;

  const result = await maintenancePool.query(query);
  return result.rows.map((r) => r.machine_name);
};

/***************************************************************************
 * 🟦 6. PERSONNEL LIST
 ***************************************************************************/
export const getUniqueAssignedPersonnel = async () => {
  const query = `
    SELECT DISTINCT doer_name
    FROM maintenance_task_assign
    WHERE doer_name IS NOT NULL AND doer_name <> ''
    ORDER BY doer_name
  `;

  const result = await maintenancePool.query(query);
  return result.rows.map((r) => r.doer_name);
};

/***************************************************************************
 * 🟫 7. STATISTICS
 ***************************************************************************/
export const getMaintenanceStatistics = async () => {
  const query = `
    SELECT 
      COUNT(*) AS total_tasks,
      COUNT(CASE WHEN actual_date IS NOT NULL THEN 1 END) AS completed_tasks,
      COUNT(CASE WHEN actual_date IS NULL THEN 1 END) AS pending_tasks,
      COUNT(CASE WHEN priority = 'High' THEN 1 END) AS high_priority,
      COUNT(CASE WHEN priority = 'Medium' THEN 1 END) AS medium_priority,
      COUNT(CASE WHEN priority = 'Low' THEN 1 END) AS low_priority
    FROM maintenance_task_assign
  `;

  return result.rows[0];
};

/***************************************************************************
 * 🟩 8. DEPARTMENT LIST
 ***************************************************************************/
export const getUniqueMaintenanceDepartments = async () => {
  const query = `
    SELECT DISTINCT "doer_department"
    FROM maintenance_task_assign
    WHERE "doer_department" IS NOT NULL AND "doer_department" <> ''
    ORDER BY "doer_department"
  `;

  const result = await maintenancePool.query(query);
  return result.rows.map((r) => r.doer_department);
};

// Doer Name
export const getUniqueMaintenanceDoerName = async () => {
  const query = `
    SELECT DISTINCT doer_name AS name
    FROM maintenance_task_assign
    WHERE doer_name IS NOT NULL AND doer_name <> ''
    ORDER BY doer_name
  `;

  const result = await maintenancePool.query(query);
  return result.rows.map((r) => r.name);
};











