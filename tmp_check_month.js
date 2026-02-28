import { pool } from './config/db.js';

async function checkTasks() {
    try {
        const query = `
            SELECT task_id, name, status, submission_date 
            FROM checklist 
            WHERE LOWER(TRIM(name)) = 'bikash kumar ojha' 
            AND submission_date >= DATE_TRUNC('month', CURRENT_DATE)
            LIMIT 5
        `;
        const res = await pool.query(query);
        console.log("Found February History tasks:", res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkTasks();
