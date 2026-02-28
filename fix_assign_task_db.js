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

async function fix() {
    try {
        const client = await pool.connect();

        console.log("1. Creating sequence if not exists...");
        await client.query(`CREATE SEQUENCE IF NOT EXISTS assign_task_id_seq`);

        console.log("2. Setting sequence value to MAX(id) + 1...");
        const maxRes = await client.query(`SELECT MAX(id) as max_id FROM assign_task`);
        const maxId = maxRes.rows[0].max_id || 0;
        const nextVal = parseInt(maxId) + 1;
        await client.query(`SELECT setval('assign_task_id_seq', $1, false)`, [nextVal]);
        console.log(`Next ID set to: ${nextVal}`);

        console.log("3. Linking sequence to column (OWNED BY)...");
        // Note: This makes pg_get_serial_sequence work
        await client.query(`ALTER SEQUENCE assign_task_id_seq OWNED BY assign_task.id`);

        console.log("4. Setting column default...");
        await client.query(`ALTER TABLE assign_task ALTER COLUMN id SET DEFAULT nextval('assign_task_id_seq')`);

        console.log("5. Verifying pg_get_serial_sequence...");
        const verifyRes = await client.query(`SELECT pg_get_serial_sequence('assign_task', 'id') as seq`);
        console.log("pg_get_serial_sequence result:", verifyRes.rows[0].seq);

        client.release();
        console.log("✅ Database fix completed.");
    } catch (err) {
        console.error("❌ Fix failed:", err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

fix();
