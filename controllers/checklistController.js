import { pool } from "../config/db.js";

// -----------------------------------------
// 1️⃣ GET PENDING CHECKLIST
// -----------------------------------------
export const getPendingChecklist = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const username = req.query.username;
    const role = req.query.role;

    const limit = 50;
    const offset = (page - 1) * limit;

    let where = `submission_date IS NULL`;

    // ⭐ ADMIN ROLE CHECK (CASE-INSENSITIVE)
    if ((role && role.toLowerCase().includes("admin")) || (username && username.toLowerCase() === "admin")) {
      // Admin sees strictly today's unsubmitted tasks in the Pending tab for all users
      where = `submission_date IS NULL AND DATE(task_start_date) = CURRENT_DATE`;
    } else {
      // Normal users see only their own tasks that they haven't submitted yet, and only those scheduled till today
      where = `submission_date IS NULL AND DATE(task_start_date) <= CURRENT_DATE `;
      if (username) {
        where += ` AND TRIM(LOWER(name)) = TRIM(LOWER('${username}')) `;
      }
    }

    const query = `
      SELECT *,
        COUNT(*) OVER() AS total_count
      FROM checklist
      WHERE ${where}
      ORDER BY task_start_date ASC
      LIMIT $1 OFFSET $2
    `;

    const { rows } = await pool.query(query, [limit, offset]);
    const totalCount = rows.length > 0 ? rows[0].total_count : 0;

    res.json({ data: rows, page, totalCount });
  } catch (error) {
    console.error("❌ Error fetching pending checklist:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


// -----------------------------------------
// 2️⃣ GET HISTORY CHECKLIST
// -----------------------------------------
export const getChecklistHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const username = req.query.username;
    const role = req.query.role;
    const departments = req.query.departments
      ? req.query.departments.split(',').map(d => d.trim()).filter(Boolean)
      : [];

    const limit = 50;
    const offset = (page - 1) * limit;

    const params = [];
    let where = `submission_date IS NOT NULL`;

    // ⭐ Date filters (optional)
    if (!req.query.startDate && !req.query.endDate) {
      // Allow all paginated history to load instead of hardcoding 1 month
    } else {
      if (req.query.startDate) {
        params.push(req.query.startDate);
        where += ` AND submission_date::date >= $${params.length}::date `;
      }
      if (req.query.endDate) {
        params.push(req.query.endDate);
        where += ` AND submission_date::date <= $${params.length}::date `;
      }
    }

    // ⭐ Standardized Admin Check
    const isAdmin = (role && role.toLowerCase().includes("admin")) || (username && username.toLowerCase() === "admin");

    if (!isAdmin && username) {
      if (departments.length > 0 && role?.toLowerCase() !== "user") {
        const deptArray = departments.map(d => `'${d.toLowerCase()}'`).join(',');
        where += ` AND (LOWER(TRIM(name)) = LOWER(TRIM('${username}')) OR LOWER(department) = ANY(ARRAY[${deptArray}])) `;
      } else {
        where += ` AND LOWER(TRIM(name)) = LOWER(TRIM('${username}')) `;
      }
    }

    const query = `
      SELECT *,
        COUNT(*) OVER() AS total_count
      FROM checklist
      WHERE ${where}
      ORDER BY submission_date DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const { rows } = await pool.query(query, [...params, limit, offset]);

    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count, 10) || 0 : 0;

    res.json({
      data: rows,
      page,
      totalCount
    });
  } catch (error) {
    console.error("❌ Error fetching history:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


// -----------------------------------------
// 3️⃣ UPDATE CHECKLIST (User Submit)
// -----------------------------------------
export const updateChecklist = async (req, res) => {
  try {
    const items = req.body;

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "Invalid data" });

    // ✅ S3 uploads removed
    const processedItems = items.map((item) => ({ ...item }));

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const item of processedItems) {
        // 🔥 Fix status
        const safeStatus =
          (item.status || "").toLowerCase() === "yes" ? "yes" : "no";

        // ---------------------------------
        // 🔥 SAVE TO DATABASE
        // ---------------------------------
        const sql = `
          UPDATE checklist
          SET 
            status = $1,
            remark = $2,
            submission_date = NULL
          WHERE task_id = $3
        `;

        await client.query(sql, [
          safeStatus,
          item.remarks || "",
          item.taskId,
        ]);
      }

      await client.query("COMMIT");
      res.json({ message: "Checklist updated successfully" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ updateChecklist Error:", err);
    res.status(500).json({ error: err.message });
  }
};


// -----------------------------------------
// 🔁 POST REMARK + USER STATUS (minimal payload)
// -----------------------------------------
export const submitChecklistRemarkAndUserStatus = async (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];

    const normalizedItems = payload
      .map((item) => {
        if (!item) return null;

        const taskId = item.taskId ?? item.task_id ?? item.task_id_fk;
        if (!taskId) return null;

        const remark =
          Object.prototype.hasOwnProperty.call(item, "remark")
            ? item.remark
            : Object.prototype.hasOwnProperty.call(item, "remarks")
              ? item.remarks
              : undefined;

        const status =
          Object.prototype.hasOwnProperty.call(item, "status")
            ? item.status
            : undefined;

        return { taskId, remark, status };
      })
      .filter(Boolean);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: "taskId is required" });
    }

    const actionableItems = normalizedItems.filter(
      (item) =>
        typeof item.remark !== "undefined" ||
        typeof item.status !== "undefined"
    );

    if (actionableItems.length === 0) {
      return res.status(400).json({
        error: "Provide remark or status to update",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const item of actionableItems) {
        const setClauses = [];
        const values = [];
        let idx = 1;

        if (typeof item.remark !== "undefined") {
          setClauses.push(`remark = $${idx++}`);
          values.push(item.remark ?? null);
        }

        if (typeof item.status !== "undefined") {
          setClauses.push(`status = $${idx++}`);
          values.push(item.status ?? null);
        }

        // ✅ AUTO TIMESTAMP
        setClauses.push(`submission_date = NOW()`);

        values.push(item.taskId);

        const sql = `
          UPDATE checklist
          SET ${setClauses.join(", ")}
          WHERE task_id = $${idx}
        `;

        await client.query(sql, values);
      }

      await client.query("COMMIT");

      res.json({ message: "Checklist submitted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ submitChecklist Error:", err);
    res.status(500).json({ error: err.message });
  }
};



// -----------------------------------------
// 🪄 PATCH STATUS ONLY
// -----------------------------------------
export const patchChecklistStatus = async (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const normalizedItems = payload
      .map((item) => {
        if (!item) return null;
        const taskId = item.taskId ?? item.task_id;
        const status =
          Object.prototype.hasOwnProperty.call(item, "status") &&
            item.status !== undefined
            ? item.status
            : undefined;

        if (!taskId || typeof status === "undefined") return null;

        return { taskId, status };
      })
      .filter(Boolean);

    if (normalizedItems.length === 0) {
      return res
        .status(400)
        .json({ error: "Provide taskId and status for each entry" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const sql = `
        UPDATE checklist
        SET status = $1,
            submission_date = NOW()
        WHERE task_id = $2
      `;

      for (const item of normalizedItems) {
        const safeStatus =
          typeof item.status === "string"
            ? item.status
            : String(item.status);
        await client.query(sql, [safeStatus, item.taskId]);
      }

      await client.query("COMMIT");
      res.json({ message: "Checklist status updated" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ patchChecklistStatus Error:", err);
    res.status(500).json({ error: err.message });
  }
};


// -----------------------------------------
// 4️⃣ HR MANAGER UPDATE
// -----------------------------------------
export const updateHrManagerChecklist = async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];

    if (items.length === 0) {
      return res.status(400).json({ error: "Invalid data" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const sql = `
        UPDATE checklist
        SET admin_done = 'confirmed'
        WHERE task_id = $1
      `;

      for (const item of items) {
        if (!item.taskId) continue;
        await client.query(sql, [item.taskId]);
      }

      await client.query("COMMIT");

      res.json({ message: "Admin role confirmed" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ updateHrManagerChecklist Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------------------
// 4.1️⃣ HR MANAGER REJECT
// -----------------------------------------
export const rejectHrManagerChecklist = async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];

    if (items.length === 0) {
      return res.status(400).json({ error: "Invalid data" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const sql = `
        UPDATE checklist
        SET admin_done = 'no',
            status = 'no'
        WHERE task_id = $1
      `;

      for (const item of items) {
        if (!item.taskId) continue;
        await client.query(sql, [item.taskId]);
      }

      await client.query("COMMIT");

      res.json({ message: "Tasks rejected successfully" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ rejectHrManagerChecklist Error:", err);
    res.status(500).json({ error: err.message });
  }
};


// -----------------------------------------
// 5️⃣ ADMIN DONE UPDATE
// -----------------------------------------
export const adminDoneChecklist = async (req, res) => {
  try {
    const items = req.body;

    if (!items || items.length === 0)
      return res.status(400).json({ error: "No items provided" });

    const sql = `
      UPDATE checklist
      SET admin_done = 'Done'
      WHERE task_id = ANY($1::bigint[])
    `;

    const ids = items.map(i => i.task_id);

    await pool.query(sql, [ids]);

    res.json({ message: "Admin updated successfully" });

  } catch (err) {
    console.error("❌ adminDoneChecklist Error:", err);
    res.status(500).json({ error: err.message });
  }
};


// -----------------------------------------
// 3️⃣ GET CHECKLIST FOR HR APPROVAL
// -----------------------------------------

export const getChecklistForHrApproval = async (req, res) => {
  try {
    const departments = req.query.departments
      ? req.query.departments.split(",").map(d => d.trim()).filter(Boolean)
      : [];

    let where = `
      c.submission_date IS NOT NULL
      AND c.admin_done IS NULL
      AND c.task_start_date::date <= CURRENT_DATE
    `;

    // ✅ Department filter (OWN + verify_access_dept already merged in frontend)
    if (departments.length > 0) {
      const deptArray = departments
        .map(d => `'${d.toLowerCase()}'`)
        .join(",");

      where += ` AND LOWER(c.department) = ANY(ARRAY[${deptArray}]) `;
    }

    const query = `
      SELECT 
        c.*,
        u.verify_access,
        COUNT(*) OVER() AS total_count
      FROM checklist c
      LEFT JOIN users u
        ON u.user_name = c.name
      WHERE ${where}
      ORDER BY c.task_start_date::date ASC
    `;

    const { rows } = await pool.query(query);
    const totalCount = rows.length > 0 ? rows[0].total_count : 0;

    res.json({
      success: true,
      message: "Checklist data for HR approval",
      data: rows,
      totalCount,
    });
  } catch (error) {
    console.error("❌ Error fetching HR approval checklist:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


// -----------------------------------------
// 6️⃣ GET UNIQUE DEPARTMENTS
// -----------------------------------------
export const getChecklistDepartments = async (req, res) => {
  try {
    // 1. Fetch from users table (department AND user_access)
    const usersQuery = `
      SELECT department, user_access
      FROM users
      WHERE role <> 'admin'
    `;
    const { rows: userRows } = await pool.query(usersQuery);

    const departments = new Set();

    userRows.forEach((row) => {
      // Add primary department
      if (row.department && row.department.trim()) {
        departments.add(row.department.trim());
      }
      // Add departments from user_access (comma-separated)
      if (row.user_access && row.user_access.trim()) {
        const accessDepts = row.user_access.split(",");
        accessDepts.forEach((d) => {
          if (d && d.trim()) {
            departments.add(d.trim());
          }
        });
      }
    });

    // 2. Fetch distinct departments from checklist table (assignments)
    const checklistQuery = `
      SELECT DISTINCT department 
      FROM checklist 
      WHERE department IS NOT NULL 
        AND TRIM(department) <> ''
    `;
    const { rows: checklistRows } = await pool.query(checklistQuery);

    checklistRows.forEach((row) => {
      if (row.department && row.department.trim()) {
        departments.add(row.department.trim());
      }
    });

    const sortedDepartments = Array.from(departments).sort();

    // Fallback if empty
    if (sortedDepartments.length === 0) {
      return res.json(["Admin", "Housekeeping", "Maintenance"]);
    }

    res.json(sortedDepartments);
  } catch (err) {
    console.error("❌ Error fetching departments:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// -----------------------------------------
// 7️⃣ GET UNIQUE DOERS
// -----------------------------------------
export const getChecklistDoers = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT name 
      FROM checklist 
      WHERE name IS NOT NULL 
        AND TRIM(name) <> ''
      ORDER BY name ASC
    `;

    const { rows } = await pool.query(query);
    const doers = rows.map(r => r.name);

    res.json(doers);
  } catch (err) {
    console.error("❌ Error fetching doers:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
