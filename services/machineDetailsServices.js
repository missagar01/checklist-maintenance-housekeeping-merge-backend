import pool from "../config/db.js";

// 🟢 Get all machines
export const getAllMachines = async () => {
  const result = await pool.query("SELECT * FROM form_responses ORDER BY id DESC");
  return result.rows;
};

// 🟢 Get a machine by Serial No
export const getMachineBySerial = async (serialNo) => {
  const result = await pool.query(
    `SELECT * FROM form_responses WHERE LOWER(TRIM(serial_no)) = LOWER(TRIM($1)) LIMIT 1`,
    [serialNo]
  );
  return result.rows[0];
};

// 🟢 Update machine info
export const updateMachine = async (serialNo, data) => {
  const fields = [
    "machine_name",
    "purchase_date",
    "purchase_price",
    "vendor",
    "model_no",
    "warranty_expiration",
    "manufacturer",
    "department",
    "location",
    "initial_maintenance_date",
    "notes",
    "tag_no",
    "user_allot",
  ];

  const updates = [];
  const values = [];
  let idx = 1;

  for (const field of fields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      values.push(data[field]);
    }
  }

  if (updates.length === 0) return false;

  values.push(serialNo);
  const query = `
    UPDATE form_responses
    SET ${updates.join(", ")}
    WHERE LOWER(TRIM(serial_no)) = LOWER(TRIM($${idx}))
    RETURNING *;
  `;
  const result = await pool.query(query, values);
  return result.rowCount > 0;
};

// 🟢 Get maintenance history + analytics
export const getMachineHistory = async (serialNo) => {
  try {
    const query = `
      SELECT
        "Task_No" AS task_no,
        "Serial_No" AS serial_no,
        "Machine_Name" AS machine_name,
        "Task_Type" AS task_type,
        "Task_Start_Date" AS task_start_date,
        "Actual_Date" AS actual_date,
        "Doer_Name" AS doer_name,
        "Maintenance_Cost" AS maintenance_cost,
        "Temperature_Status" AS temperature_status,
        "Remarks" AS remarks
      FROM maintenance_task_assign
      WHERE LOWER(TRIM("Serial_No")) = LOWER(TRIM($1))
        AND COALESCE("Actual_Date"::text, '') <> ''  -- ✅ only completed
      ORDER BY "Task_Start_Date" DESC;
    `;

    let result;
    try {
      result = await pool.query(query, [serialNo]);
    } catch (err) {
      // if table name is capitalized
      if (err.code === "42P01") {
        result = await pool.query(
          query.replace(
            /FROM maintenance_task_assign/,
            'FROM "Maintenance_Task_Assign"'
          ),
          [serialNo]
        );
      } else {
        throw err;
      }
    }

    return result.rows;
  } catch (err) {
    console.error("❌ Error fetching history:", err);
    throw err;
  }
};



