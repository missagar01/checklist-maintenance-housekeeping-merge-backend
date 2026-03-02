import dotenv from 'dotenv';
dotenv.config();
import { pool } from "./config/db.js";
import fs from "fs";

async function checkUser() {
    try {
        const res = await pool.query(`
      SELECT user_name, role, designation, division 
      FROM users 
      WHERE user_name ILIKE '%Shailesh%'
    `);
        const output = res.rows.map(r => `[${r.user_name}] | ROLE: ${r.role} | DESIG: ${r.designation} | DIV: ${r.division}`).join('\n');
        fs.writeFileSync('shailesh_dump.txt', output);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkUser();
