import axios from "axios";
import { pool } from "../config/db.js";

const LATE_OUT_HOUR = 0;    // 12 AM
const EARLY_OUT_HOUR = 12;  // 12 PM

const LOG_DEVICE_SYNC = process.env.LOG_DEVICE_SYNC === "true";
const logSync = (...args) => {
  if (LOG_DEVICE_SYNC) console.log(...args);
};


const formatDateString = (date) => new Date(date).toISOString().split("T")[0];

const getAdjacentDate = (dateStr, offsetDays) => {
  const base = new Date(dateStr);
  base.setDate(base.getDate() + offsetDays);
  return formatDateString(base);
};


/** ✅ Throttle / single-flight (important for auto + API both) */
let lastSyncAt = 0;
let inFlight = null;
const MIN_GAP_MS = Number(process.env.DEVICE_SYNC_MIN_GAP_MS || 55 * 1000);

const shouldSkipSync = () => {
  const now = Date.now();
  if (inFlight) return true;
  if (now - lastSyncAt < MIN_GAP_MS) return true;
  return false;
};

const markChecklistTasksNotDone = async (employeeIds, targetDate) => {
  if (!employeeIds?.length) return { names: [], updated: 0 };

  const normalizedEmployeeIds = [
    ...new Set(
      employeeIds
        .map((id) => {
          if (id === null || id === undefined) return "";
          return String(id).trim().toLowerCase();
        })
        .filter((v) => v.length > 0)
    ),
  ];

  if (!normalizedEmployeeIds.length) return { names: [], updated: 0 };

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
    ...new Set(
      rows
        .map((r) => r.user_name?.trim())
        .filter(Boolean)
        .map((n) => n.toLowerCase())
    ),
  ];

  if (!normalizedNames.length) return { names: [], updated: 0 };

  const updateResult = await pool.query(
    `
      UPDATE checklist
      SET status = 'no'
      WHERE LOWER(name) = ANY($1::text[])
        AND task_start_date::date < $2::date
        AND submission_date IS NULL
        AND (status IS NULL OR LOWER(status::text) NOT IN ('yes', 'no'))
    `,
    [normalizedNames, targetDate]
  );

  logSync("DEVICE SYNC: NotDone updated =>", updateResult.rowCount, "date <", targetDate);

  return { names: normalizedNames, updated: updateResult.rowCount };
};

const processLogs = async (allLogs, today) => {
  const yesterday = getAdjacentDate(today, -1);

  // empCode -> flags
  const empToday = new Map();

  for (const log of allLogs) {
    const emp = log?.EmployeeCode;
    const punch = String(log?.PunchDirection || "").trim().toLowerCase();
    const dt = new Date(log?.LogDate);

    if (!emp || !punch || Number.isNaN(dt.getTime())) continue;

    const logDay = formatDateString(dt);
    if (logDay !== today) continue;

    const empCode = String(emp).trim();
    if (!empToday.has(empCode)) {
      empToday.set(empCode, {
        hasInToday: false,
        hasLateOutToday: false,
        hasOutIn11Today: false,
      });
    }

    const state = empToday.get(empCode);

    if (punch === "in") state.hasInToday = true;

    if (punch === "out") {
      const hour = dt.getHours();
      const minute = dt.getMinutes();

      // Rule-A: OUT >= 21:00 AND IN today
      if (hour >= LATE_OUT_HOUR) state.hasLateOutToday = true;

      // Rule-B: OUT <= 11:00 (Includes 8 AM, 9 AM, 10 AM, etc.)
      if (hour <= EARLY_OUT_HOUR) {
        state.hasOutIn11Today = true;
      }
    }
  }

  const lateOutEmployees = [];
  const earlyOutEmployees = [];

  for (const [empCode, state] of empToday.entries()) {
    // Rule-A: OUT >= 21:00 (Removed hasInToday requirement)
    if (state.hasLateOutToday) lateOutEmployees.push(empCode);

    // Rule-B: OUT <= 11:00
    if (state.hasOutIn11Today) earlyOutEmployees.push(empCode);
  }

  logSync("DEVICE SYNC: Rule-A employees =>", lateOutEmployees);
  logSync("DEVICE SYNC: Rule-B employees =>", earlyOutEmployees);

  // Both rules should mark tasks older than yesterday (current_date - 1)
  // ✅ OPTIMIZED: Run both updates in parallel
  const [lateOutResult, earlyOutResult] = await Promise.all([
    markChecklistTasksNotDone(lateOutEmployees, yesterday),
    markChecklistTasksNotDone(earlyOutEmployees, yesterday),
  ]);

  logSync("DEVICE SYNC: Rule-A NotDone count =>", lateOutResult.updated, "date <", yesterday);
  logSync("DEVICE SYNC: Rule-B NotDone count =>", earlyOutResult.updated, "date <", yesterday);

  return {
    today,
    yesterday,
    lateOutEmployeeCodes: lateOutEmployees,
    earlyOutEmployeeCodes: earlyOutEmployees,
    lateOutUpdated: lateOutResult.updated,
    earlyOutUpdated: earlyOutResult.updated,
    lateOutNames: lateOutResult.names,
    earlyOutNames: earlyOutResult.names,
  };
};

export const refreshDeviceSync = async (today = formatDateString(new Date())) => {
  // ✅ if recent sync already happened, skip heavy calls
  if (shouldSkipSync()) {
    logSync("DEVICE SYNC: skipped (recent/in-flight)");
    return { skipped: true };
  }

  inFlight = (async () => {
    try {
      const IN_API_URL = `http://139.167.179.192:90/api/v2/WebAPI/GetDeviceLogs?APIKey=361011012609&SerialNumber=E03C1CB36042AA02&FromDate=${today}&ToDate=${today}`;
      const OUT_API_URL = `http://139.167.179.192:90/api/v2/WebAPI/GetDeviceLogs?APIKey=361011012609&SerialNumber=E03C1CB34D83AA02&FromDate=${today}&ToDate=${today}`;

      const [inRes, outRes] = await Promise.all([
        axios.get(IN_API_URL, { timeout: 3000 }).catch(() => ({ data: [] })),
        axios.get(OUT_API_URL, { timeout: 3000 }).catch(() => ({ data: [] })),
      ]);

      const inLogs = Array.isArray(inRes.data) ? inRes.data : [];
      const outLogs = Array.isArray(outRes.data) ? outRes.data : [];

      logSync("DEVICE SYNC: in logs =>", inLogs.length, "out logs =>", outLogs.length);

      const allLogs = [...inLogs, ...outLogs];
      const result = await processLogs(allLogs, today);

      lastSyncAt = Date.now();
      return result;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};
