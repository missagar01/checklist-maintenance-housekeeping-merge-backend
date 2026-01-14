
import { pool, maintenancePool } from "./config/db.js";
import { query as housekeepingQuery } from "./config/housekeppingdb.js";

const CHECKLIST_SOURCES = [
    {
        name: "checklist",
        db: "main",
        table: "checklist",
        dateColumn: `"task_start_date"`,
        submissionColumn: `"submission_date"`,
    },
    {
        name: "housekeeping",
        db: "housekeeping",
        table: "assign_task",
        dateColumn: `"task_start_date"`,
        submissionColumn: `"submission_date"`,
    },
    {
        name: "maintenance",
        db: "maintenance",
        table: "maintenance_task_assign",
        dateColumn: `"Task_Start_Date"`,
        submissionColumn: `"Actual_Date"`,
    }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runDebug = async () => {
    await sleep(1000); // Allow logs to flush
    console.log("\n\n--- Debugging Data Source Counts ---");

    // 1. Check Unbounded counts for all
    console.log("\n[Unbounded Future] (> CURRENT_DATE)");
    for (const source of CHECKLIST_SOURCES) {
        try {
            const query = `
        SELECT COUNT(*) AS count 
        FROM ${source.table} 
        WHERE ${source.dateColumn}::date > CURRENT_DATE 
        AND ${source.submissionColumn} IS NULL
      `;
            let res;
            if (source.db === "main") res = await pool.query(query);
            else if (source.db === "housekeeping") res = await housekeepingQuery(query);
            else if (source.db === "maintenance") res = await maintenancePool.query(query);

            console.log(`Source: ${source.name.padEnd(15)} Count: ${res.rows[0].count}`);
        } catch (err) {
            console.error(`Error ${source.name}:`, err.message);
        }
    }

    // 2. Check Maintenance Specific Ranges
    console.log("\n[Maintenance Date Ranges]");
    const maintenance = CHECKLIST_SOURCES.find(s => s.name === 'maintenance');
    const rules = [
        { label: "Tomorrow Only", where: `"${maintenance.dateColumn}"::date = (CURRENT_DATE + INTERVAL '1 day')::date` },
        { label: "Next 7 Days", where: `"${maintenance.dateColumn}"::date > CURRENT_DATE AND "${maintenance.dateColumn}"::date <= (CURRENT_DATE + INTERVAL '7 days')::date` },
        { label: "Next 30 Days", where: `"${maintenance.dateColumn}"::date > CURRENT_DATE AND "${maintenance.dateColumn}"::date <= (CURRENT_DATE + INTERVAL '30 days')::date` },
        { label: "End of This Month", where: `"${maintenance.dateColumn}"::date > CURRENT_DATE AND "${maintenance.dateColumn}"::date <= (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::date` }
    ];

    for (const rule of rules) {
        try {
            // Fix double quotes in rule.where just in case
            let condition = rule.where.replace(/"undefined"/g, maintenance.dateColumn);
            condition = condition.replace(/"/g, ''); // Strip quotes to be safe if they break, then re-add if needed. Actually simpler: use known columns.
            // Re-writing condition manually to avoid string replacement mess
            if (rule.label === "Tomorrow Only") {
                condition = `"Task_Start_Date"::date = (CURRENT_DATE + INTERVAL '1 day')::date`;
            } else if (rule.label === "Next 7 Days") {
                condition = `"Task_Start_Date"::date > CURRENT_DATE AND "Task_Start_Date"::date <= (CURRENT_DATE + INTERVAL '7 days')::date`;
            } else if (rule.label === "Next 30 Days") {
                condition = `"Task_Start_Date"::date > CURRENT_DATE AND "Task_Start_Date"::date <= (CURRENT_DATE + INTERVAL '30 days')::date`;
            } else if (rule.label === "End of This Month") {
                condition = `"Task_Start_Date"::date > CURRENT_DATE AND "Task_Start_Date"::date <= (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::date`;
            }

            const query = `
        SELECT COUNT(*) AS count 
        FROM maintenance_task_assign
        WHERE ${condition} 
        AND "Actual_Date" IS NULL
      `;

            const res = await maintenancePool.query(query);
            console.log(`Rule: ${rule.label.padEnd(20)} Count: ${res.rows[0].count}`);
        } catch (err) {
            console.error(`Error ${rule.label}:`, err.message);
        }
    }

    process.exit();
};

runDebug();
