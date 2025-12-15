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



// import pool from "../config/db.js";
import { maintenancePool } from "../../config/db.js";

/**
 * ✅ Fetch machines (and optionally serials) by department or machine name
 * - GET /api/form-responses?department=Maintenance
 * - GET /api/form-responses?department=Maintenance&machine_name=Compressor
 */

export const fetchMachinesByDepartment = async (req, res) => {
  try {
    const { department, machine_name } = req.query;

    let query = `
      SELECT DISTINCT machine_name, serial_no, department
      FROM form_responses
      WHERE 1=1
    `;
    const values = [];
    let i = 1;

    // ✅ Case-insensitive department filter
    if (department && department.toLowerCase() !== "all") {
      query += ` AND LOWER(TRIM(department)) = LOWER(TRIM($${i}))`;
      values.push(department);
      i++;
    }

    // ✅ Case-insensitive machine_name filter
    if (machine_name) {
      query += ` AND LOWER(TRIM(machine_name)) = LOWER(TRIM($${i}))`;
      values.push(machine_name);
      i++;
    }

    // Sort machine names properly
    query += ` ORDER BY machine_name ASC;`;

    const result = await maintenancePool.query(query, values);

    const machines = result.rows.map((row) => ({
      machine_name: row.machine_name,
      serial_no: row.serial_no,
      department: row.department,
    }));

    return res.status(200).json({ success: true, data: machines });
  } catch (error) {
    console.error("❌ fetchMachinesByDepartment error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
