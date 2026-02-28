import { maintenancePool } from "./config/db.js";
import dotenv from "dotenv";

dotenv.config();

const fixSequence = async () => {
  const client = await maintenancePool.connect();
  try {
    console.log("🔄 Connecting to Maintenance DB...");

    // ---------------------------------------------------------
    // 1. FIX PRIMARY KEY SEQUENCE (id)
    // ---------------------------------------------------------
    const pkQuery = `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tco
      JOIN information_schema.key_column_usage kcu 
        ON kcu.constraint_name = tco.constraint_name
        AND kcu.constraint_schema = tco.constraint_schema
        AND kcu.constraint_name = tco.constraint_name
      WHERE tco.constraint_type = 'PRIMARY KEY'
      AND kcu.table_name = 'maintenance_task_assign';
    `;

    const pkResult = await client.query(pkQuery);
    if (pkResult.rows.length === 0) {
      console.warn("⚠️ Could not find primary key for table 'maintenance_task_assign'. Skipping PK fix.");
    } else {
      const pkColumn = pkResult.rows[0].column_name;
      console.log(`✅ Primary Key Column identified: ${pkColumn}`);

      const maxQuery = `SELECT MAX(${pkColumn}) as max_val FROM maintenance_task_assign;`;
      const maxResult = await client.query(maxQuery);
      const maxVal = maxResult.rows[0].max_val || 0;
      console.log(`📊 Current MAX(${pkColumn}) in table: ${maxVal}`);

      const seqQuery = `
        SELECT setval(
          pg_get_serial_sequence('maintenance_task_assign', '${pkColumn}'),
          COALESCE((SELECT MAX(${pkColumn}) FROM maintenance_task_assign) + 1, 1),
          false
        );
      `;
      await client.query(seqQuery);
      console.log(`✅ PK Sequence reset successfully! Next ID will be ${parseInt(maxVal) + 1}`);
    }

    // ---------------------------------------------------------
    // 2. FIX TASK_NO SEQUENCE (maintenance_task_seq)
    // ---------------------------------------------------------
    console.log("-----------------------------------");
    console.log("🔄 Checking for maintenance_task_seq...");

    // Check if task_no column exists
    const checkColQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='maintenance_task_assign' AND column_name='task_no';
    `;
    const colResult = await client.query(checkColQuery);

    if (colResult.rows.length > 0) {
      console.log("✅ 'task_no' column found.");

      // Try to get max numeric part from task_no (e.g., 'TM-123' -> 123)
      // Regex extracts the last number in the string
      const maxTaskNoQuery = `
        SELECT MAX(CAST(SUBSTRING(task_no FROM '[0-9]+$') AS INTEGER)) as max_num
        FROM maintenance_task_assign
        WHERE task_no ~ '[0-9]+$';
      `;

      const taskNoResult = await client.query(maxTaskNoQuery);
      let maxTaskNum = taskNoResult.rows[0].max_num;

      console.log(`📊 Max parsed task_no number: ${maxTaskNum}`);

      // Fallback logic
      if (!maxTaskNum) {
        console.warn("⚠️ Could not parse any valid numeric 'task_no'. Falling back to MAX(id).");
        const maxIdResult = await client.query(`SELECT MAX(id) as max_id FROM maintenance_task_assign;`);
        maxTaskNum = maxIdResult.rows[0].max_id || 0;
        console.log(`📊 Fallback using MAX(id): ${maxTaskNum}`);
      }

      // Reset sequence
      const nextVal = parseInt(maxTaskNum) + 1;
      const fixSeqQuery = `SELECT setval('maintenance_task_seq', $1, false);`;

      try {
        await client.query(fixSeqQuery, [nextVal]);
        console.log(`✅ 'maintenance_task_seq' reset successfully! Next value will be ${nextVal}`);
      } catch (seqErr) {
        if (seqErr.code === '42P01') { // undefined_table (sequence not found)
          console.warn("⚠️ Sequence 'maintenance_task_seq' does not exist. Skipping.");
        } else {
          console.error("❌ Error resetting maintenance_task_seq:", seqErr.message);
        }
      }

    } else {
      console.log("ℹ️ 'task_no' column not found in maintenance_task_assign. Skipping task_no sequence fix.");
    }

  } catch (err) {
    console.error("❌ Error fixing sequence:", err.message);
  } finally {
    client.release();
    maintenancePool.end();
  }
};

fixSequence();
