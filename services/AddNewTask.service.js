import { pool } from "../config/db.js";

export const addNewChecklistTaskService = async (data) => {
  const {
    department,
    given_by,
    name,
    task_description,
    remark,
    image,
    admin_done,
    delay,
    user_status_checklist,
  } = data;

  const query = `
    INSERT INTO public.checklist (
      department,
      given_by,
      name,
      task_description,
      enable_reminder,
      require_attachment,
      frequency,
      remark,
      status,
      image,
      admin_done,
      delay,
      planned_date,
      user_status_checklist,
      task_start_date,
      submission_date
    )
    VALUES (
      $1,$2,$3,$4,
      'yes',
      'no',
      'one time',
      $5,
      'yes',
      $6,$7,$8,
      date_trunc('day', now()) + time '09:00:00',
      $9,
      date_trunc('day', now()) + time '09:00:00',
      now()
    )
    RETURNING *;
  `;

  const values = [
    department || null,
    given_by || null,
    name || null,
    task_description || null,
    remark || null,
    image || null,
    admin_done || null,
    delay || null,
    user_status_checklist || null,
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
};
