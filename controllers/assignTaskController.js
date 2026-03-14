import { pool } from "../config/db.js";

// 1️⃣ Departments
export const getUniqueDepartments = async (req, res) => {
  try {
    const user_name = req.params.user_name;

    const user = await pool.query(
      `SELECT role, user_access FROM users WHERE user_name=$1`,
      [user_name]
    );

    if (user.rows.length === 0)
      return res.status(404).json({ message: "User not found" });

    if (user.rows[0].role === "admin") {
      const result = await pool.query(`
        SELECT DISTINCT department, division
        FROM users
        WHERE department IS NOT NULL AND department <> ''
          AND division IS NOT NULL AND division <> ''
        ORDER BY department ASC
      `);
      return res.json(result.rows);
    }

    const result = await pool.query(
      `SELECT DISTINCT department, division 
       FROM users 
       WHERE LOWER(department)=LOWER($1)
         AND department IS NOT NULL AND department <> ''
         AND division IS NOT NULL AND division <> ''`,
      [user.rows[0].user_access]
    );

    return res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 1.5️⃣ Divisions
export const getUniqueDivisions = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT division
      FROM users
      WHERE division IS NOT NULL AND division <> ''
      ORDER BY division ASC
    `);
    res.json(result.rows.map(r => r.division));
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 2️⃣ Given By
export const getUniqueGivenBy = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT given_by 
      FROM users 
      WHERE given_by IS NOT NULL AND given_by <> ''
      ORDER BY given_by ASC
    `);
    res.json(result.rows.map(r => r.given_by));
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 3️⃣ Doer Names (FIXED ✔)
export const getUniqueDoerNames = async (req, res) => {
  try {
    const { department } = req.params;

    const result = await pool.query(
      `SELECT DISTINCT user_name
       FROM users 
       WHERE status='active'
         AND LOWER(user_access) = LOWER($1)
         AND user_name IS NOT NULL AND user_name <> ''
         AND user_name <> 'admin'
       ORDER BY user_name ASC`,
      [department]
    );

    res.json(result.rows.map(r => r.user_name));
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 4️⃣ Working days
export const getWorkingDays = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT working_date, day, week_num, month
      FROM working_day_calender
      ORDER BY working_date ASC
    `);

    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).send("Server Error");
  }
};

// 5️⃣ Insert Assign Tasks
export const postAssignTasks = async (req, res) => {
  try {
    const tasks = req.body;


    const isOneTime = tasks[0].frequency === "one-time";
    const table = isOneTime ? "delegation" : "checklist";

    if (isOneTime) {
      // ----- DELEGATION INSERT -----
      const values = [];
      const params = [];

      tasks.forEach((t, i) => {
        values.push(
          `($${i * 11 + 1}, $${i * 11 + 2}, $${i * 11 + 3}, $${i * 11 + 4}, $${i * 11 + 5},
            $${i * 11 + 6}, $${i * 11 + 7}, $${i * 11 + 8}, $${i * 11 + 9}, $${i * 11 + 10}, $${i * 11 + 11})`
        );
        params.push(
          t.department,
          t.givenBy,
          t.doer,
          t.description,
          t.frequency,
          t.enableReminders ? "yes" : "no",
          t.requireAttachment ? "yes" : "no",
          null,
          null,
          t.dueDate,
          t.division          // <-- NEW DIVISION
        );
      });

      await pool.query(
        `INSERT INTO delegation 
        (department, given_by, name, task_description, frequency,
         enable_reminder, require_attachment, planned_date, status, task_start_date, division)
        VALUES ${values.join(",")}`,
        params
      );

    } else {
      // ----- CHECKLIST INSERT -----
      const values = [];
      const params = [];

      tasks.forEach((t, i) => {

        const startDate = t.taskStartDate || t.startDate || t.dueDate;

        values.push(
          `($${i * 14 + 1}, $${i * 14 + 2}, $${i * 14 + 3}, $${i * 14 + 4}, $${i * 14 + 5},
          $${i * 14 + 6}, $${i * 14 + 7}, $${i * 14 + 8}, $${i * 14 + 9},
          $${i * 14 + 10}, $${i * 14 + 11}, $${i * 14 + 12}, $${i * 14 + 13}, $${i * 14 + 14})`
        );

        params.push(
          t.department,                 // 1
          t.givenBy,                    // 2
          t.doer,                       // 3
          t.description,                // 4
          t.enableReminders ? "yes" : "no",  // 5
          t.requireAttachment ? "yes" : "no", // 6
          t.frequency,                    // 7
          null,                          // 8 remark
          null,                          // 9 status
          null,                          // 10 admin_done
          startDate,                     // 11 planned_date
          startDate,                     // 12 task_start_date 🔥 FIXED
          null,                          // 13 submission_date
          t.division                     // 14 division 🔥 NEW
        );
      });


      await pool.query(
        `INSERT INTO checklist
      (department, given_by, name, task_description, enable_reminder,
        require_attachment, frequency, remark, status, admin_done,
        planned_date, task_start_date, submission_date, division)
        VALUES ${values.join(",")} `,
        params
      );
    }

    res.json({
      message: "Tasks inserted",
      count: tasks.length
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};





