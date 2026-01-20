import { pool } from "./config/db.js";

const checkColumns = async () => {
    try {
        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 1000));

        const client = await pool.connect();
        const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'checklist'
    `);

        console.log("Columns in 'checklist' table:");
        const columns = res.rows.map(r => r.column_name);
        console.log(columns.join(", "));

        if (columns.includes("user_status_checklist")) {
            console.log("✅ Found 'user_status_checklist'");
        } else {
            console.log("❌ 'user_status_checklist' NOT found");
        }

        if (columns.includes("user_status-checklist")) {
            console.log("✅ Found 'user_status-checklist'");
        } else {
            console.log("❌ 'user_status-checklist' NOT found");
        }

        client.release();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkColumns();
