import pg from "pg";
const { Pool } = pg;
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    host: process.env.PG_HOST || process.env.DB_HOST,
    user: process.env.PG_USER || process.env.DB_USER,
    password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.PG_DATABASE || process.env.DB_NAME,
    port: Number(process.env.PG_PORT || process.env.DB_PORT || 5432),
    ssl: { rejectUnauthorized: false },
});

async function inspect() {
    try {
        const client = await pool.connect();

        const tables = ['assign_task', 'checklist', 'maintenance_task_assign'];
        for (const table of tables) {
            console.log(`--- TABLE COLUMNS for ${table} ---`);
            const res = await client.query(`
          SELECT column_name, data_type, column_default, is_nullable
          FROM information_schema.columns
          WHERE table_name = '${table}'
          ORDER BY ordinal_position;
        `);
            console.table(res.rows);

            console.log(`--- CONSTRAINTS for ${table} ---`);
            const res2 = await client.query(`
          SELECT conname, contype, pg_get_constraintdef(oid)
          FROM pg_constraint
          WHERE conrelid = '${table}'::regclass;
        `);
            console.table(res2.rows);
        }

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

inspect();
