// controllers/settingController.js
import { pool } from "../config/db.js";

/*******************************
 * 1) GET USERS
 *******************************/
export const getUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM users
      WHERE user_name IS NOT NULL
      ORDER BY id ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 1.1) GET USER BY ID
 *******************************/
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error fetching user by id:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 2) CREATE USER
 *******************************/
export const createUser = async (req, res) => {
  try {
    const {
      username,
      password,
      email,
      phone,
      department,
      givenBy,
      employee_id,
      role,
      status,
      user_access,
      user_access1,
      system_access,
      page_access
    } = req.body;

    // Prepare values array with proper null handling
    const values = [
      username || null,
      password || null,
      email || null,
      phone || null,
      department || null,
      givenBy || null,
      role || 'user',
      status || 'active',
      user_access || null,
      employee_id || null,
      user_access1 || null,
      system_access || null,
      page_access || null
    ];

    const query = `
      INSERT INTO users (
        user_name, password, email_id, number, department,
        given_by, role, status, user_access, employee_id, user_access1, system_access, page_access
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error creating user:", error);
    res.status(500).json({ error: error.message || "Database error" });
  }
};


/*******************************
 * 3) UPDATE USER
 *******************************/
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      user_name,
      password,
      email_id,
      number,
      employee_id,
      role,
      status,
      user_access,
      department,
      given_by,
      leave_date,
      leave_end_date,
      remark,
      user_access1,
      system_access,
      page_access
    } = req.body;

    // Truncate long values to prevent database errors
    const truncateString = (str, maxLength = 500) => {
      if (!str || typeof str !== 'string') return str || '';
      return str.length > maxLength ? str.substring(0, maxLength) : str;
    };

    // Truncate fields that might exceed database limits
    const safeUserAccess1 = truncateString(user_access1, 500);
    const safeSystemAccess = truncateString(system_access, 500);
    const safePageAccess = truncateString(page_access, 500);
    const safeUserAccess = truncateString(user_access, 500);
    const safeRemark = truncateString(remark, 500);

    // Build query dynamically based on whether password is provided
    let query;
    let values;

    if (password && password.trim() !== '') {
      // Include password in update
      query = `
        UPDATE users SET
          user_name = $1,
          password = $2,
          email_id = $3,
          number = $4,
          employee_id = $5,
          role = $6,
          status = $7,
          user_access = $8,
          department = $9,
          given_by = $10,
          leave_date = $11,
          leave_end_date = $12,
          remark = $13,
          user_access1 = $14,
          system_access = $15,
          page_access = $16
        WHERE id = $17
        RETURNING *
      `;
      values = [
        user_name, password, email_id, number, employee_id,
        role, status, safeUserAccess, department, given_by,
        leave_date, leave_end_date, safeRemark, safeUserAccess1, safeSystemAccess, safePageAccess, id
      ];
    } else {
      // Exclude password from update
      query = `
        UPDATE users SET
          user_name = $1,
          email_id = $2,
          number = $3,
          employee_id = $4,
          role = $5,
          status = $6,
          user_access = $7,
          department = $8,
          given_by = $9,
          leave_date = $10,
          leave_end_date = $11,
          remark = $12,
          user_access1 = $13,
          system_access = $14,
          page_access = $15
        WHERE id = $16
        RETURNING *
      `;
      values = [
        user_name, email_id, number, employee_id,
        role, status, safeUserAccess, department, given_by,
        leave_date, leave_end_date, safeRemark, safeUserAccess1, safeSystemAccess, safePageAccess, id
      ];
    }

    const result = await pool.query(query, values);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 4) DELETE USER
 *******************************/
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

    res.json({ message: "User deleted", id });

  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 5) GET ALL DEPARTMENTS
 *******************************/
export const getDepartments = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT department, given_by, id
      FROM users
      WHERE department IS NOT NULL AND department <> ''
      ORDER BY department ASC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error("❌ Error fetching departments:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 6) GET UNIQUE DEPARTMENTS ONLY
 *******************************/
export const getDepartmentsOnly = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT department
      FROM users
      WHERE department IS NOT NULL 
        AND department <> ''
      ORDER BY department ASC
    `);

    // Format the response
    const departments = result.rows.map(row => ({
      department: row.department
    }));

    res.json(departments);

  } catch (error) {
    console.error("❌ Error fetching unique departments:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 7) GET UNIQUE GIVEN_BY VALUES
 *******************************/
export const getGivenByData = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT given_by
      FROM users
      WHERE given_by IS NOT NULL 
        AND given_by <> ''
      ORDER BY given_by ASC
    `);

    // Format the response
    const givenByList = result.rows.map(row => ({
      given_by: row.given_by
    }));

    res.json(givenByList);

  } catch (error) {
    console.error("❌ Error fetching given_by data:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 8) CREATE DEPARTMENT
 *******************************/
export const createDepartment = async (req, res) => {
  try {
    const { name, givenBy } = req.body;

    const result = await pool.query(`
      INSERT INTO users (department, given_by)
      VALUES ($1, $2)
      RETURNING *
    `, [name, givenBy]);

    res.json(result.rows[0]);

  } catch (error) {
    console.log("❌ Error creating dept:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 9) UPDATE DEPARTMENT
 *******************************/
export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { department, given_by } = req.body;

    const result = await pool.query(`
      UPDATE users 
      SET department = $1, given_by = $2
      WHERE id = $3
      RETURNING *
    `, [department, given_by, id]);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error updating dept:", error);
    res.status(500).json({ error: "Database error" });
  }
};







export const patchSystemAccess = async (req, res) => {
  try {
    const { id } = req.params;
    let { system_access } = req.body;

    if (!system_access) {
      return res.status(400).json({ error: "system_access is required" });
    }

    system_access = system_access.trim().toUpperCase();

    const existing = await pool.query(
      "SELECT system_access FROM users WHERE id = $1",
      [id]
    );

    let current = [];

    if (existing.rows[0]?.system_access) {
      current = existing.rows[0].system_access
        .split(",")
        .map(v => v.trim().toUpperCase());
    }

    if (current.includes(system_access)) {
      current = current.filter(v => v !== system_access);
    } else {
      current.push(system_access);
    }

    const result = await pool.query(
      `
      UPDATE users
      SET system_access = $1
      WHERE id = $2
      RETURNING *
      `,
      [current.join(","), id]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error("Error patching system_access:", error);
    res.status(500).json({ error: "Database error" });
  }
};
