import pool from "../config/db.js";

export const insertMachine = async (data) => {
  const query = `
    INSERT INTO form_responses (
      serial_no, machine_name, purchase_date, purchase_price, vendor, model_no,
      warranty_expiration, manufacturer, maintenance_schedule, department, location,
      initial_maintenance_date, user_manual, purchase_bill, notes, tag_no, user_allot
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    ) RETURNING *;
  `;
  const values = [
    data.serial_no, data.machine_name, data.purchase_date, data.purchase_price,
    data.vendor, data.model_no, data.warranty_expiration, data.manufacturer,
    data.maintenance_schedule, data.department, data.location,
    data.initial_maintenance_date, data.user_manual, data.purchase_bill,
    data.notes, data.tag_no, data.user_allot
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};



export const getAllMachines = async () => {
  const query = `
    SELECT
      id,
      serial_no,
      machine_name,
      model_no,
      manufacturer,
      department,
      location,
      purchase_date,
      purchase_price,
      vendor,
      warranty_expiration,
      maintenance_schedule,
      initial_maintenance_date,
      user_manual,
      purchase_bill,
      notes,
      tag_no,
      user_allot
    FROM form_responses
    ORDER BY id DESC;
  `;
  const result = await pool.query(query);
  return result.rows;
};

