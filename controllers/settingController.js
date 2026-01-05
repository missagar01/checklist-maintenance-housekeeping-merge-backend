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

    const parsePayload = (body) => {
      if (!body) return {};
      if (typeof body === "object") return body;
      if (typeof body === "string") {
        try {
          return JSON.parse(body);
        } catch (err) {
          console.warn("Unable to parse request body as JSON", err.message);
          return {};
        }
      }
      return {};
    };

    const payload = parsePayload(req.body);
    const normalizedPayload = Array.isArray(payload)
      ? payload.reduce((acc, value) => ({ ...acc, ...value }), {})
      : payload;

    const existingResult = await pool.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
    `,
      [id]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const normalizeString = (value, { maxLength = 500, trim = true } = {}) => {
      if (value === null) return null;
      if (value === undefined) return undefined;
      if (Array.isArray(value)) {
        value = value.map(v => (typeof v === "string" ? v : String(v))).join(", ");
      }
      let str = typeof value === "string" ? value : String(value);
      if (trim) {
        str = str.trim();
      }
      if (maxLength && str.length > maxLength) {
        return str.substring(0, maxLength);
      }
      return str;
    };

    const sanitizePassword = (value) => {
      if (value === null || value === undefined) return undefined;
      const trimmed = typeof value === "string" ? value.trim() : String(value).trim();
      return trimmed === "" ? undefined : trimmed;
    };

    const fieldMap = {
      username: "user_name",
      user_name: "user_name",
      password: "password",
      email: "email_id",
      email_id: "email_id",
      phone: "number",
      number: "number",
      department: "department",
      givenBy: "given_by",
      given_by: "given_by",
      employee_id: "employee_id",
      role: "role",
      status: "status",
      user_access: "user_access",
      user_access1: "user_access1",
      system_access: "system_access",
      page_access: "page_access",
      remark: "remark",
      leave_date: "leave_date",
      leave_end_date: "leave_end_date"
    };

    const sanitizeRules = {
      user_name: { maxLength: 500 },
      email_id: { maxLength: 500 },
      number: { maxLength: 500 },
      department: { maxLength: 500 },
      given_by: { maxLength: 500 },
      role: { maxLength: 100 },
      status: { maxLength: 100 },
      user_access: { maxLength: 500 },
      user_access1: { maxLength: 100000 },
      system_access: { maxLength: 500 },
      page_access: { maxLength: 500 },
      remark: { maxLength: 1000 },
      employee_id: { maxLength: 500 },
      leave_date: {},
      leave_end_date: {}
    };

    const updates = {};

    for (const [bodyKey, columnName] of Object.entries(fieldMap)) {
      if (!Object.prototype.hasOwnProperty.call(normalizedPayload, bodyKey)) {
        continue;
      }
      const rawValue = normalizedPayload[bodyKey];
      if (columnName === "password") {
        const sanitized = sanitizePassword(rawValue);
        if (sanitized === undefined) {
          continue;
        }
        updates[columnName] = sanitized;
        continue;
      }

      const rules = sanitizeRules[columnName] || { maxLength: 500 };
      const sanitized = normalizeString(rawValue, rules);

      if (sanitized === undefined) {
        continue;
      }

      updates[columnName] = sanitized;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }

    const columns = [];
    const values = [];
    let placeholderIndex = 1;

    for (const [column, value] of Object.entries(updates)) {
      columns.push(`${column} = $${placeholderIndex++}`);
      values.push(value);
    }

    const query = `
      UPDATE users
      SET ${columns.join(", ")}
      WHERE id = $${placeholderIndex}
      RETURNING *
    `;
    values.push(id);

    const result = await pool.query(query, values);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error in updateUser controller:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: "Server error",
      message: error.message || "Failed to update user"
    });
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
