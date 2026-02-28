// import pool from "../config/db.js";
import { maintenancePool } from "../../config/db.js";

export const getDepartments = async () => {
  const query = `
    SELECT DISTINCT department 
    FROM master 
    WHERE department IS NOT NULL AND TRIM(department) <> ''
    ORDER BY department ASC;
  `;
  const result = await maintenancePool.query(query);
  return result.rows.map((row) => row.department);
};
