import { pool } from "./config/db.js";

async function checkUsers() {
    try {
        const res = await pool.query('SELECT * FROM users LIMIT 10');
        console.log("User table columns:");
        if (res.rows.length > 0) {
            console.log(Object.keys(res.rows[0]));
            console.log();
            console.log("Sample users:");
            res.rows.forEach(r => {
                console.log(`Username: ${r.user_name} | Role: ${r.role} | Designation: ${r.designation} | Division: ${r.division}`);
            });
        }

        // Check if designation or division exists
        const res2 = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users';
    `);
        console.log("\nAll columns in users table:");
        res2.rows.forEach(r => console.log(r.column_name));

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkUsers();
