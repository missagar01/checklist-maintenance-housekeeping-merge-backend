
import { pool } from "./config/db.js";

async function inspectSchema() {
    try {
        const client = await pool.connect();
        console.log("Connected to DB");

        const res = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'checklist';
    `);

        console.log("Columns in 'checklist' table:");
        console.table(res.rows);

        const enumRes = await client.query(`
      SELECT n.nspname AS enum_schema,
             t.typname AS enum_name,
             e.enumlabel AS enum_value
      FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'enable_reminder';
    `);

        console.log("\nEnum 'enable_reminder' values:");
        console.table(enumRes.rows);

        client.release();
    } catch (err) {
        console.error("Error:", err);
    } finally {
        pool.end();
    }
}

inspectSchema();
