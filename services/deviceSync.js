import axios from "axios";
import { pool, maintenancePool } from "../config/db.js";

const LOG_DEVICE_SYNC = process.env.LOG_DEVICE_SYNC === "true";
const logSync = (...args) => {
  if (LOG_DEVICE_SYNC) console.log(...args);
};


const formatDateString = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getAdjacentDate = (dateStr, offsetDays) => {
  const base = new Date(dateStr);
  base.setDate(base.getDate() + offsetDays);
  return formatDateString(base);
};

// Return a Date object set to today at specific hour (in local/server time)
const getSubmissionTime = (hour) => {
  // Check if we need to force IST offset logic if server is UTC.
  // For now, mirroring server.js logic:
  // We want to store a TIMESTAMP that represents HH:00 IST.
  // If the DB expects timestamp without timezone, passing a JS Date usually converts to UTC.
  // To be safe, we construct a date that *looks* like the target time.
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
};

/**
 * Fetch all active employee IDs from the database to determine absentees.
 */
const getAllActiveEmployeeIds = async () => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT employee_id 
      FROM users 
      WHERE employee_id IS NOT NULL 
        AND TRIM(employee_id) <> ''
    `);
    return rows.map(r => String(r.employee_id).trim());
  } catch (error) {
    console.error("❌ Error fetching active employees:", error);
    return [];
  }
};


/** ✅ Throttle / single-flight */
let lastSyncAt = 0;
let inFlight = null;
const MIN_GAP_MS = Number(process.env.DEVICE_SYNC_MIN_GAP_MS || 55 * 1000);

const shouldSkipSync = () => {
  const now = Date.now();
  if (inFlight) return true;
  if (now - lastSyncAt < MIN_GAP_MS) return true;
  return false;
};

const markChecklistTasksNotDone = async (employeeIds, targetDate, submissionTime) => {
  if (!employeeIds?.length) return { checklistUpdated: 0, maintenanceUpdated: 0 };

  const normalizedEmployeeIds = [
    ...new Set(
      employeeIds
        .map((id) => id ? String(id).trim().toLowerCase() : "")
        .filter((v) => v.length > 0)
    ),
  ];

  if (!normalizedEmployeeIds.length) return { checklistUpdated: 0, maintenanceUpdated: 0 };

  const { rows } = await pool.query(
    `
      SELECT DISTINCT user_name
      FROM users
      WHERE LOWER(COALESCE(employee_id::text, '')) = ANY($1::text[])
        AND user_name IS NOT NULL
        AND TRIM(user_name) <> ''
    `,
    [normalizedEmployeeIds]
  );

  const normalizedNames = [
    ...new Set(rows.map((r) => r.user_name?.trim().toLowerCase()).filter(Boolean)),
  ];

  if (!normalizedNames.length) return { checklistUpdated: 0, maintenanceUpdated: 0 };

  // 1. Update Checklist
  const checklistUpdateResult = await pool.query(
    `
      UPDATE checklist
      SET
        status = 'no',
        user_status_checklist = 'No',
        submission_date = $3
      WHERE LOWER(name) = ANY($1::text[])
        AND task_start_date::date = $2::date
        AND submission_date IS NULL
        AND status IS NULL
    `,
    [normalizedNames, targetDate, submissionTime] // targetDate handles < Today logic explicitly
  );

  // 2. Update Maintenance Tasks
  const maintenanceUpdateResult = await maintenancePool.query(
    `
      UPDATE maintenance_task_assign
      SET
        task_status = 'No',
        actual_date = $3
      WHERE LOWER(doer_name) = ANY($1::text[])
        AND task_start_date::date = $2::date
        AND actual_date IS NULL
        AND task_status IS NULL
    `,
    [normalizedNames, targetDate, submissionTime]
  );

  logSync(`DEVICE SYNC: Updated for date ${targetDate} | Checklist: ${checklistUpdateResult.rowCount} | Maintenance: ${maintenanceUpdateResult.rowCount}`);

  return {
    checklistUpdated: checklistUpdateResult.rowCount,
    maintenanceUpdated: maintenanceUpdateResult.rowCount
  };
};


/**
 * 🧹 Blanket Overdue Update
 * Marks ALL tasks (Checklist & Maintenance) as "No" if they were missed.
 * This ensures triggers work in production even if biometric logs are missing.
 */
export const markAllOverdueTasksAsNotDone = async () => {
  // ✅ Force IST date for comparison
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  now.setHours(0, 0, 0, 0); // Start of Today

  const targetDateStr = formatDateString(now);
  const submissionTime = new Date(); // Current system time for completion timestamp

  try {
    // 1. Update Checklist (Overdue = task_start_date < today AND submission_date IS NULL)
    const checklistResult = await pool.query(
      `
        UPDATE checklist
        SET
          status = 'no',
          user_status_checklist = 'No',
          submission_date = $2
        WHERE task_start_date::date < $1::date
          AND submission_date IS NULL
          AND status IS NULL
      `,
      [targetDateStr, submissionTime]
    );

    // 2. Update Maintenance Tasks (Overdue = task_start_date < today AND actual_date IS NULL)
    const maintenanceResult = await maintenancePool.query(
      `
        UPDATE maintenance_task_assign
        SET
          task_status = 'No',
          actual_date = $2
        WHERE task_start_date::date < $1::date
          AND actual_date IS NULL
          AND task_status IS NULL
      `,
      [targetDateStr, submissionTime]
    );

    logSync(`🧹 BLANKET OVERDUE: Updated | Checklist: ${checklistResult.rowCount} | Maintenance: ${maintenanceResult.rowCount}`);

    return {
      checklistUpdated: checklistResult.rowCount,
      maintenanceUpdated: maintenanceResult.rowCount
    };
  } catch (error) {
    console.error("❌ Error in markAllOverdueTasksAsNotDone:", error);
    throw error;
  }
};


const processLogs = async (allLogs, today, startHour) => {
  // startHour determined the mode.
  // 11  -> Mode A (Yesterday Processing)
  // 23  -> Mode B (Today Processing)

  const yesterday = getAdjacentDate(today, -1);
  const submissionTime = getSubmissionTime(startHour);

  // empCode -> flags (Store only necessary info)
  const empActivity = new Map();
  // We need to track IN punches
  // Key: empCode, Value: { punches: [ { dateStr, hour, minute } ] }

  for (const log of allLogs) {
    const punch = String(log?.PunchDirection || "").trim().toLowerCase();
    if (punch !== "in") continue;

    const emp = String(log?.EmployeeCode || "").trim();
    const dt = new Date(log?.LogDate);
    if (!emp || Number.isNaN(dt.getTime())) continue;

    if (!empActivity.has(emp)) empActivity.set(emp, []);

    empActivity.get(emp).push({
      dateStr: formatDateString(dt),
      hour: dt.getHours(),
      minute: dt.getMinutes()
    });
  }

  // --- LOGIC ---
  const usersToUpdate = new Set();
  let targetDate = today;
  let triggerName = "";

  if (startHour === 11) {
    // === 11:00 AM MODE (Yesterday) ===
    targetDate = yesterday;
    triggerName = "11 AM (Yesterday Logic)";

    // 1. Get List of Employees Present Yesterday
    const employeesPresentYesterday = new Set();
    const employeesWithEveningPunch = new Set(); // 6 PM - 9 PM Yesterday

    for (const [emp, punches] of empActivity.entries()) {
      for (const p of punches) {
        if (p.dateStr === yesterday) {
          employeesPresentYesterday.add(emp);
          // Condition: 18:00 <= punch <= 21:00 (Evening)
          // "between 6:00 PM to 9:00 PM" => >= 18 && < 21 ?? Or <= 21? 
          // Previous Requirement: "greater than 06 PM and smaller than 09 PM" -> 18 to 21 exclusive?
          // New Requirement: "between 6:00 PM to 9:00 PM"
          // Let's assume inclusive 18:00 to 21:00 (Exclusive of 21:01)
          if (p.hour >= 18 && p.hour < 21) {
            employeesWithEveningPunch.add(emp);
          }
        }
      }
    }

    // Trigger A: Evening Punchers
    employeesWithEveningPunch.forEach(e => usersToUpdate.add(e));

    // Trigger B: Absent (No IN punch Yesterday)
    const allActiveIds = await getAllActiveEmployeeIds();
    const absentEmployees = allActiveIds.filter(id => !employeesPresentYesterday.has(id));

    absentEmployees.forEach(e => usersToUpdate.add(e));

    logSync(`${triggerName} | Evening Punchers: ${employeesWithEveningPunch.size} | Absent: ${absentEmployees.length}`);

  } else if (startHour === 23) {
    // === 11:00 PM MODE (Today) ===
    targetDate = today;
    triggerName = "11 PM (Today Logic)";

    // Condition: Punch IN Today between 07:00 AM and 11:50 AM
    for (const [emp, punches] of empActivity.entries()) {
      for (const p of punches) {
        if (p.dateStr === today) {
          // Check 07:00 <= time <= 11:50
          const totalMinutes = p.hour * 60 + p.minute;
          const startLimit = 7 * 60;       // 07:00 -> 420
          const endLimit = 11 * 60 + 50;   // 11:50 -> 710

          if (totalMinutes >= startLimit && totalMinutes <= endLimit) {
            usersToUpdate.add(emp);
            // Once found, valid for this user
            break;
          }
        }
      }
    }

    logSync(`${triggerName} | Morning Punchers (7:00-11:50): ${usersToUpdate.size}`);
  }

  // EXECUTE UPDATE
  const uniqueUsers = Array.from(usersToUpdate);
  const result = await markChecklistTasksNotDone(uniqueUsers, targetDate, submissionTime);

  return {
    mode: triggerName,
    activeUsers: uniqueUsers.length,
    updated: result
  };
};


// Run Logic
export const refreshDeviceSync = async (today = formatDateString(new Date()), forceHour = undefined) => {
  // ✅ if recent sync already happened, skip heavy calls
  if (shouldSkipSync()) {
    logSync("DEVICE SYNC: skipped (recent/in-flight)");
    return { skipped: true };
  }

  // If forceHour is provided, use it. Otherwise default to current hour (safety)
  const currentHour = forceHour !== undefined ? forceHour : new Date().getHours();

  // Decide date range based on hour
  // If 11 (Morning Run) -> We need logs from Yesterday.
  // If 23 (Night Run)   -> We need logs from Today.
  // To be safe, let's just fetch Yesterday and Today always.

  inFlight = (async () => {
    try {
      const yesterday = getAdjacentDate(today, -1);

      const IN_API_URL = `http://139.167.179.192:90/api/v2/WebAPI/GetDeviceLogs?APIKey=361011012609&SerialNumber=E03C1CB36042AA02&FromDate=${yesterday}&ToDate=${today}`;
      const OUT_API_URL = `http://139.167.179.192:90/api/v2/WebAPI/GetDeviceLogs?APIKey=361011012609&SerialNumber=E03C1CB34D83AA02&FromDate=${yesterday}&ToDate=${today}`;

      const [inRes, outRes] = await Promise.all([
        axios.get(IN_API_URL, { timeout: 3000 }).catch(() => ({ data: [] })),
        axios.get(OUT_API_URL, { timeout: 3000 }).catch(() => ({ data: [] })),
      ]);

      const inLogs = Array.isArray(inRes.data) ? inRes.data : [];
      const outLogs = Array.isArray(outRes.data) ? outRes.data : [];

      logSync(`DEVICE SYNC: Fetched logs | IN: ${inLogs.length} | OUT: ${outLogs.length}`);

      const allLogs = [...inLogs, ...outLogs];

      // Pass hour to direct logic
      const result = await processLogs(allLogs, today, currentHour);

      lastSyncAt = Date.now();
      return result;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};
