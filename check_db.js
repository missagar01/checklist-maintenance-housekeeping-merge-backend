import { pool } from "./config/db.js";
import fs from "fs";

async function checkColumns() {
    try {
        const res = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('checklist', 'delegation', 'assign_task', 'users', 'maintenance_task_assign')
      ORDER BY table_name, ordinal_position;
    `);
        fs.writeFileSync("db_schema.json", JSON.stringify(res.rows, null, 2), "utf8");
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkColumns();
