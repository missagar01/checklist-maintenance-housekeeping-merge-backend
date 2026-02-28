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
            const res = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = '${table}'
            `);
            console.log(`${table} columns:`, res.rows.map(r => r.column_name));
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
