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

async function listSequences() {
    try {
        const client = await pool.connect();

        console.log("--- ALL SEQUENCES ---");
        const res = await client.query(`
      SELECT n.nspname as schema_name, c.relname as sequence_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'S'
      ORDER BY n.nspname, c.relname;
    `);
        console.table(res.rows);

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

listSequences();
