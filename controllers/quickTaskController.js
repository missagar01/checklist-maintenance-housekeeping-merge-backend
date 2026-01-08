import { pool } from "../config/db.js";

// ------------------------ FETCH CHECKLIST ------------------------
export const fetchChecklist = async (
  page = 0,
  pageSize = 50,
  nameFilter = "",
  startDate,
  endDate
) => {
  try {
    const offset = page * pageSize;
    const filters = ["submission_date IS NULL"];
    const params = [];
    let paramIndex = 1;

    const hasDateRange = startDate && endDate;
    if (hasDateRange) {
      filters.push(`task_start_date >= $${paramIndex++}`);
      params.push(`${startDate} 00:00:00`);
      filters.push(`task_start_date <= $${paramIndex++}`);
      params.push(`${endDate} 23:59:59`);
    } else {
      filters.push("task_start_date::date = CURRENT_DATE");
    }

    if (nameFilter) {
      filters.push(`LOWER(name) = LOWER($${paramIndex++})`);
      params.push(nameFilter);
    }

    const whereClause = filters.join(" AND ");

    const dataQuery = `
      SELECT *
      FROM checklist
      WHERE ${whereClause}
      ORDER BY task_start_date ASC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex}
    `;

    const dataParams = [...params, pageSize, offset];

    const countQuery = `
      SELECT COUNT(*) AS count
      FROM checklist
      WHERE ${whereClause}
    `;

    const [dataRes, countRes] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countRes.rows[0]?.count ?? 0, 10);
    return { data: dataRes.rows, total };
  } catch (err) {
    console.log(err);
    return { data: [], total: 0 };
  }
};


export const fetchDelegation = async (
  page = 0,
  pageSize = 50,
  nameFilter = "",
  startDate,
  endDate
) => {
  try {
    const offset = page * pageSize;
    const filters = ["submission_date IS NULL"];
    const params = [];
    let paramIndex = 1;

    const hasDateRange = startDate && endDate;
    if (hasDateRange) {
      filters.push(`task_start_date >= $${paramIndex++}`);
      params.push(`${startDate} 00:00:00`);
      filters.push(`task_start_date <= $${paramIndex++}`);
      params.push(`${endDate} 23:59:59`);
    } else {
      // Default to today's tasks when no explicit range is provided
      filters.push("task_start_date::date = CURRENT_DATE");
    }

    if (nameFilter) {
      filters.push(`LOWER(name) = LOWER($${paramIndex++})`);
      params.push(nameFilter);
    }

    const whereClause = filters.join(" AND ");

    const dataQuery = `
      SELECT *
      FROM delegation
      WHERE ${whereClause}
      ORDER BY task_start_date ASC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex}
    `;

    const dataParams = [...params, pageSize, offset];

    const countQuery = `
      SELECT COUNT(*) AS count
      FROM delegation
      WHERE ${whereClause}
    `;

    const [dataRes, countRes] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countRes.rows[0]?.count ?? 0, 10);
    return { data: dataRes.rows, total };
  } catch (err) {
    console.log(err);
    return { data: [], total: 0 };
  }
};


export const deleteChecklistTasks = async (tasks) => {
  for (const t of tasks) {
    await pool.query(
      `
      DELETE FROM checklist
      WHERE name = $1
      AND task_description = $2
      AND submission_date IS NULL
      `,
      [t.name, t.task_description]
    );
  }

  return tasks;
};


export const deleteDelegationTasks = async (taskIds) => {
  await pool.query(
    `
    DELETE FROM delegation
    WHERE task_id = ANY($1)
    AND submission_date IS NULL
    `,
    [taskIds]
  );

  return taskIds;
};


export const updateChecklistTask = async (updatedTask, originalTask) => {
  try {
    // Validate that task_id is provided
    if (!updatedTask.task_id) {
      throw new Error("task_id is required for updating a task");
    }

    // Build dynamic update query based on provided fields
    // Only update fields that are explicitly provided AND not empty strings
    const updates = [];
    const values = [];
    let paramIndex = 1;

    // Helper function to check if value should be updated
    const shouldUpdate = (value) => {
      return value !== undefined && value !== null && value !== '';
    };

    // Add fields to update if they are provided and not empty
    if (shouldUpdate(updatedTask.department)) {
      updates.push(`department = $${paramIndex++}`);
      values.push(updatedTask.department);
    }

    if (shouldUpdate(updatedTask.given_by)) {
      updates.push(`given_by = $${paramIndex++}`);
      values.push(updatedTask.given_by);
    }

    if (shouldUpdate(updatedTask.name)) {
      updates.push(`name = $${paramIndex++}`);
      values.push(updatedTask.name);
    }

    if (shouldUpdate(updatedTask.task_description)) {
      updates.push(`task_description = $${paramIndex++}`);
      values.push(updatedTask.task_description);
    }

    if (shouldUpdate(updatedTask.task_start_date)) {
      updates.push(`task_start_date = $${paramIndex++}`);
      values.push(updatedTask.task_start_date);
    }

    if (shouldUpdate(updatedTask.frequency)) {
      updates.push(`frequency = $${paramIndex++}`);
      values.push(updatedTask.frequency);
    }

    if (shouldUpdate(updatedTask.enable_reminder)) {
      updates.push(`enable_reminder = $${paramIndex++}`);
      // Convert to lowercase to match database enum (yes/no)
      // Database enum expects lowercase "yes" or "no"
      const reminderValue = String(updatedTask.enable_reminder || '').trim().toLowerCase();
      values.push(reminderValue === 'yes' ? 'yes' : 'no');
    }

    if (shouldUpdate(updatedTask.require_attachment)) {
      updates.push(`require_attachment = $${paramIndex++}`);
      // Convert to lowercase to match database enum (yes/no)
      // Database enum expects lowercase "yes" or "no"
      const attachmentValue = String(updatedTask.require_attachment || '').trim().toLowerCase();
      values.push(attachmentValue === 'yes' ? 'yes' : 'no');
    }

    if (shouldUpdate(updatedTask.remark)) {
      updates.push(`remark = $${paramIndex++}`);
      values.push(updatedTask.remark);
    }

    if (updates.length === 0) {
      throw new Error("No fields to update - all fields are empty");
    }

    // Add task_id for WHERE clause
    values.push(updatedTask.task_id);

    const sql = `
      UPDATE checklist
      SET ${updates.join(', ')}
      WHERE task_id = $${paramIndex}
      RETURNING *;
    `;

    const res = await pool.query(sql, values);
    
    if (res.rows.length === 0) {
      throw new Error(`Task with task_id ${updatedTask.task_id} not found`);
    }

    return res.rows;
  } catch (err) {
    console.error("Error updating checklist task:", err);
    throw err;
  }
};

// ------------------------ FETCH USERS (UNIQUE NAMES) ------------------------
export const fetchUsers = async () => {
  try {
    const sql = `
      SELECT name
      FROM (
        SELECT DISTINCT name FROM checklist WHERE name IS NOT NULL AND name <> ''
        UNION
        SELECT DISTINCT name FROM delegation WHERE name IS NOT NULL AND name <> ''
      ) t
      ORDER BY LOWER(name)
    `;

    const { rows } = await pool.query(sql);
    // Normalize shape similar to existing frontend expectation (user_name)
    return rows.map((r) => ({ user_name: r.name }));
  } catch (err) {
    console.log(err);
    return [];
  }
};
