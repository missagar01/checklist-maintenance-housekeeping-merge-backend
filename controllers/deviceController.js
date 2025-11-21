import axios from "axios";
import pool from "../config/db.js";

export const syncDeviceLogs = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const IN_API_URL = `http://139.167.179.193:90/api/v2/WebAPI/GetDeviceLogs?APIKey=205511032522&SerialNumber=E03C1CB34D83AA02&FromDate=${today}&ToDate=${today}`;
    const OUT_API_URL = `http://139.167.179.193:90/api/v2/WebAPI/GetDeviceLogs?APIKey=205511032522&SerialNumber=E03C1CB36042AA02&FromDate=${today}&ToDate=${today}`;

    // ✔ SAFE axios requests (never throws error)
    const [inRes, outRes] = await Promise.all([
      axios.get(IN_API_URL, { timeout: 3000 }).catch(() => ({ data: [] })),
      axios.get(OUT_API_URL, { timeout: 3000 }).catch(() => ({ data: [] })),
    ]);

    const inLogs = Array.isArray(inRes.data) ? inRes.data : [];
    const outLogs = Array.isArray(outRes.data) ? outRes.data : [];

    const allLogs = [...inLogs, ...outLogs];

    // Sort latest first
    allLogs.sort((a, b) => new Date(b.LogDate) - new Date(a.LogDate));

    const employeeMap = {};

    allLogs.forEach((log) => {
      const emp = log.EmployeeCode;
      const punch = log.PunchDirection?.toLowerCase();
      const logDate = new Date(log.LogDate);

      if (!employeeMap[emp]) {
        employeeMap[emp] = {
          lastPunch: punch,
          lastDate: logDate,
          serial: log.SerialNumber,
        };
      }
    });

    // Update DB
    const promises = Object.entries(employeeMap).map(
      async ([employee_id, info]) => {
        let finalStatus = "inactive";

        const logDay = info.lastDate.toISOString().split("T")[0];

        if (logDay === today) {
          finalStatus = info.lastPunch === "in" ? "active" : "inactive";
        }

        await pool.query(
          `
          UPDATE users
          SET status = $1,
              last_punch_time = $2,
              last_punch_device = $3
          WHERE employee_id = $4
        `,
          [finalStatus, info.lastDate, info.serial, employee_id]
        );
      }
    );

    await Promise.all(promises);

    // ✔ ALWAYS returns safe JSON
    return res.json({
      success: true,
      message: "Device logs synced & status updated",
    });
  } catch (error) {
    console.log("SYNC ERROR:", error);
    return res.status(500).json({ error: "Device sync failed" });
  }
};
