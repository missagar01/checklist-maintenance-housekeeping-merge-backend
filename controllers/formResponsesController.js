// import pool from "../config/db.js";

// export const fetchMachinesByDepartment = async (req, res) => {
//   try {
//     const { department } = req.query;

//     // If no department provided, return all machines
//     let query = `
//       SELECT DISTINCT machine_name, serial_no, department
//       FROM form_responses
//     `;
//     const values = [];

//     if (department && department.toLowerCase() !== "all") {
//       query += ` WHERE department = $1`;
//       values.push(department);
//     }

//     const result = await pool.query(query, values);
//     const machines = result.rows.map((row) => ({
//       machine_name: row.machine_name,
//       serial_no: row.serial_no,
//       department: row.department,
//     }));

//     res.status(200).json({ success: true, data: machines });
//   } catch (error) {
//     console.error("❌ fetchMachinesByDepartment error:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };



import pool from "../config/db.js";

/**
 * ✅ Fetch machines (and optionally serials) by department or machine name
 * - GET /api/form-responses?department=Maintenance
 * - GET /api/form-responses?department=Maintenance&machine_name=Compressor
 */
export const fetchMachinesByDepartment = async (req, res) => {
  try {
    const { department, machine_name } = req.query;

    // 🧠 Base query
    let query = `
      SELECT DISTINCT machine_name, serial_no, department
      FROM form_responses
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    // ✅ Filter by department if provided
    if (department && department.toLowerCase() !== "all") {
      query += ` AND department = $${paramIndex}`;
      values.push(department);
      paramIndex++;
    }

    // ✅ Filter by machine name if provided
    if (machine_name) {
      query += ` AND machine_name = $${paramIndex}`;
      values.push(machine_name);
      paramIndex++;
    }

    // ✅ Order by machine name for cleaner frontend display
    query += ` ORDER BY machine_name ASC;`;

    const result = await pool.query(query, values);

    // ✅ Transform into cleaner array
    const machines = result.rows.map((row) => ({
      machine_name: row.machine_name,
      serial_no: row.serial_no,
      department: row.department,
    }));

    // ✅ Handle no data
    if (machines.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No machines found" });
    }

    res.status(200).json({ success: true, data: machines });
  } catch (error) {
    console.error("❌ fetchMachinesByDepartment error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
