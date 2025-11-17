import pool from "../config/db.js";

const today = new Date().toISOString().split("T")[0];

export const getDashboardData = async (req, res) => {
  try {
    const {
      dashboardType,
      staffFilter,
      page = 1,
      limit = 50,
      departmentFilter,
      role,
      username,
      taskView = "recent"   // 👈 important
    } = req.query;

    const table = dashboardType;
    const offset = (page - 1) * limit;

    let query = `SELECT * FROM ${table} WHERE 1=1`;

    // ---------------------------
    // ROLE FILTER (USER)
    // ---------------------------
    if (role === "user" && username) {
      query += ` AND LOWER(name) = LOWER('${username}')`;
    }

    // ---------------------------
    // ADMIN STAFF FILTER
    // ---------------------------
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND LOWER(name) = LOWER('${staffFilter}')`;
    }

    // ---------------------------
    // DEPARTMENT FILTER
    // ---------------------------
    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND LOWER(department) = LOWER('${departmentFilter}')`;
    }

    // ---------------------------
    // TASK VIEW FILTERS
    // ---------------------------
    if (taskView === "recent") {
      // TODAY TASKS
      query += `
        AND task_start_date >= CURRENT_DATE
        AND task_start_date < CURRENT_DATE + INTERVAL '1 day'
      `;

      if (dashboardType === "checklist") {
        query += ` AND (status IS NULL OR status <> 'yes')`;
      }
    }

    else if (taskView === "upcoming") {
      // TOMORROW TASKS
      query += `
        AND task_start_date >= CURRENT_DATE + INTERVAL '1 day'
        AND task_start_date < CURRENT_DATE + INTERVAL '2 day'
      `;
    }

    else if (taskView === "overdue") {
      // PAST DUE + NOT COMPLETED
      query += `
        AND task_start_date < CURRENT_DATE
      `;

      if (dashboardType === "checklist") {
        query += ` AND (status IS NULL OR status <> 'yes')`;
      } else {
        query += ` AND submission_date IS NULL`;
      }
    }

    // ---------------------------
    // DEFAULT OLD LOGIC (ALL TASKS TILL TODAY)
    // when taskView == "all"
    // ---------------------------
    else {
      query += ` AND task_start_date <= NOW()`;
    }

    // ORDER + PAGINATION
    query += ` ORDER BY task_start_date DESC LIMIT ${limit} OFFSET ${offset}`;

    console.log("FINAL QUERY =>", query);

    const result = await pool.query(query);
    res.json(result.rows);

  } catch (err) {
    console.error("ERROR in getDashboardData:", err);
    res.status(500).send("Error fetching dashboard data");
  }
};





export const getTotalTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date <= NOW()
    `;

    // ROLE FILTER
    if (role === "user" && username) {
      query += ` AND LOWER(name)=LOWER('${username}')`;
    }

    // STAFF FILTER (admin only)
    if (role === "admin" && staffFilter !== "all") {
      query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    }

    // DEPARTMENT FILTER (checklist only)
    if (dashboardType === "checklist" && departmentFilter !== "all") {
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;
    }

    const result = await pool.query(query);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("TOTAL ERROR:", err.message);
    res.status(500).json({ error: "Error fetching total tasks" });
  }
};




export const getCompletedTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date <= NOW()
    `;

    if (dashboardType === "checklist") {
      query += ` AND status = 'yes' `;
    } else {
      query += ` AND submission_date IS NOT NULL `;
    }

    if (role === "user" && username) query += ` AND LOWER(name)=LOWER('${username}')`;
    if (role === "admin" && staffFilter !== "all") query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    if (dashboardType === "checklist" && departmentFilter !== "all")
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;

    const result = await pool.query(query);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("COMPLETED ERROR:", err.message);
    res.status(500).json({ error: "Error fetching completed tasks" });
  }
};






export const getPendingTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date <= NOW()
      AND submission_date IS NULL
    `;

    if (dashboardType === "checklist") {
      query += ` AND (status IS NULL OR status <> 'yes') `;
    }

    if (role === "user" && username) query += ` AND LOWER(name)=LOWER('${username}')`;
    if (role === "admin" && staffFilter !== "all") query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    if (dashboardType === "checklist" && departmentFilter !== "all")
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;

    const result = await pool.query(query);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("PENDING ERROR:", err.message);
    res.status(500).json({ error: "Error fetching pending tasks" });
  }
};






export const getOverdueTask = async (req, res) => {
  try {
    const { dashboardType, staffFilter, departmentFilter, role, username } = req.query;

    const table = dashboardType;

    let query = `
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE task_start_date <= NOW()
      AND task_start_date < NOW()
      AND submission_date IS NULL
    `;

    if (dashboardType === "checklist") {
      query += ` AND (status IS NULL OR status <> 'yes') `;
    }

    if (role === "user" && username) query += ` AND LOWER(name)=LOWER('${username}')`;
    if (role === "admin" && staffFilter !== "all") query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
    if (dashboardType === "checklist" && departmentFilter !== "all")
      query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;

    const result = await pool.query(query);
    res.json(Number(result.rows[0].count));
  } catch (err) {
    console.error("OVERDUE ERROR:", err.message);
    res.status(500).json({ error: "Error fetching overdue tasks" });
  }
};




export const getUniqueDepartments = async (req, res) => {
  const result = await pool.query(`
    SELECT DISTINCT department FROM users 
    WHERE department IS NOT NULL AND department!=''
  `);

  res.json(result.rows.map(d => d.department));
};



export const getStaffByDepartment = async (req, res) => {
  const { department } = req.query;

  let query = `SELECT user_name, user_access FROM users`;

  const result = await pool.query(query);

  let staff = result.rows;

  if (department && department !== "all") {
    staff = staff.filter(u =>
      u.user_access &&
      u.user_access.toLowerCase().includes(department.toLowerCase())
    );
  }

  res.json(staff.map(s => s.user_name));
};



export const getChecklistByDateRange = async (req, res) => {
  const { startDate, endDate, staffFilter, departmentFilter } = req.query;

  let query = `
    SELECT * FROM checklist
    WHERE task_start_date BETWEEN '${startDate} 00:00:00'
    AND '${endDate} 23:59:59'
  `;

  if (staffFilter !== "all") {
    query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
  }

  if (departmentFilter !== "all") {
    query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;
  }

  const result = await pool.query(query);
  res.json(result.rows);
};




export const getChecklistStatsByDate = async (req, res) => {
  const { startDate, endDate, staffFilter, departmentFilter } = req.query;

  let query = `
    SELECT * FROM checklist
    WHERE task_start_date BETWEEN '${startDate} 00:00:00'
    AND '${endDate} 23:59:59'
  `;

  if (staffFilter !== "all") query += ` AND LOWER(name)=LOWER('${staffFilter}')`;
  if (departmentFilter !== "all") query += ` AND LOWER(department)=LOWER('${departmentFilter}')`;

  const result = await pool.query(query);
  const data = result.rows;

  const totalTasks = data.length;
  const completedTasks = data.filter(t => t.status === "Yes").length;
  const overdueTasks = data.filter(t =>
    (!t.status || t.status !== "Yes") &&
    new Date(t.task_start_date) < new Date(today)
  ).length;
  const pendingTasks = totalTasks - completedTasks;

  res.json({
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    completionRate: totalTasks ? (completedTasks / totalTasks * 100).toFixed(1) : 0
  });
};



export const getStaffTaskSummary = async (req, res) => {
  const { dashboardType } = req.query;
  const table = dashboardType;

  const query = `
    SELECT name,
      COUNT(*) AS total,
      SUM(CASE WHEN submission_date IS NOT NULL OR status='Yes' THEN 1 ELSE 0 END) AS completed
    FROM ${table}
    WHERE task_start_date <= NOW()
    GROUP BY name
    ORDER BY name ASC
  `;

  const result = await pool.query(query);

  const formatted = result.rows.map(r => ({
    id: r.name?.toLowerCase().replace(/\s+/g, "-"),
    name: r.name,
    email: `${r.name?.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    totalTasks: Number(r.total),
    completedTasks: Number(r.completed),
    pendingTasks: Number(r.total) - Number(r.completed),
    progress: Math.round((Number(r.completed) / Number(r.total)) * 100)
  }));

  res.json(formatted);
};
