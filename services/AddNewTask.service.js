import { pool } from "../config/db.js";

export const addNewChecklistTaskService = async (data) => {
  const {
    department,
    division,
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
      division,
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
      $1,$2,$3,$4,$5,
      'yes',
      'no',
      'one time',
      $6,
      'yes',
      $7,$8,$9,
      date_trunc('day', now()) + time '09:00:00',
      $10,
      date_trunc('day', now()) + time '09:00:00',
      now()
    )
    RETURNING *;
  `;

  const values = [
    department || null,
    division || null,
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
