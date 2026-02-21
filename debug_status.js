import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user: 'postgres',
    host: 'database-2-mumbai.c1wm8i46kcmm.ap-south-1.rds.amazonaws.com',
    database: 'checklist-delegation',
    password: 'Sagar00112233',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

async function debug() {
    try {
        const start = '2026-02-10';
        const end = '2026-02-14';
        const statusCol = 'LOWER("status"::text)';
        const query = `
        SELECT
          COUNT(*) AS total_tasks,
          SUM(CASE WHEN ${statusCol} = 'yes' OR ("submission_date" IS NOT NULL AND ${statusCol} <> 'no') THEN 1 ELSE 0 END) AS completed_tasks,
          SUM(CASE WHEN ${statusCol} = 'no' THEN 1 ELSE 0 END) AS not_done_tasks
        FROM checklist
        WHERE "department" = 'AUTOMATION' 
        AND "name" = 'Hem Kumar Jagat'
        AND "task_start_date"::date >= $1::date AND "task_start_date"::date <= $2::date
    `;
        const res = await pool.query(query, [start, end]);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

debug();
