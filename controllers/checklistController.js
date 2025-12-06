import pool from "../config/db.js";

import upload, { uploadToS3 } from "../middleware/s3Upload.js";
// -----------------------------------------
// 1️⃣ GET PENDING CHECKLIST
export const getPendingChecklist = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const username = req.query.username;
    const role = req.query.role;

    const limit = 50;
    const offset = (page - 1) * limit;

    // let where = `
    //   submission_date IS NULL
    //   AND task_start_date <= NOW()
    // `;

    let where = `
  submission_date IS NULL
  AND DATE(task_start_date) <= CURRENT_DATE
`;


    // ⭐ If user is NOT admin → filter by name
    if (role !== "admin" && username) {
      where += ` AND LOWER(name) = LOWER('${username}') `;
    }

    const query = `
      SELECT *,
        COUNT(*) OVER() AS total_count
      FROM checklist
      WHERE ${where}
      ORDER BY task_start_date ASC
      LIMIT $1 OFFSET $2
    `;

    const { rows } = await pool.query(query, [limit, offset]);

    const totalCount = rows.length > 0 ? rows[0].total_count : 0;

    res.json({
      data: rows,
      page,
      totalCount
    });
  } catch (error) {
    console.error("❌ Error fetching pending checklist:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};




// -----------------------------------------
// 2️⃣ GET HISTORY CHECKLIST
// -----------------------------------------
export const getChecklistHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const username = req.query.username;
    const role = req.query.role;

    const limit = 50;
    const offset = (page - 1) * limit;

    let where = `submission_date IS NOT NULL`;

    // ⭐ Normal users see only their own tasks
    if (role !== "admin" && username) {
      where += ` AND LOWER(name) = LOWER('${username}') `;
    }

    const query = `
      SELECT *,
        COUNT(*) OVER() AS total_count
      FROM checklist
      WHERE ${where}
      ORDER BY submission_date DESC
      LIMIT $1 OFFSET $2
    `;

    const { rows } = await pool.query(query, [limit, offset]);

    const totalCount = rows.length > 0 ? rows[0].total_count : 0;

    res.json({
      data: rows,
      page,
      totalCount
    });
  } catch (error) {
    console.error("❌ Error fetching history:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};



// -----------------------------------------
// 3️⃣ UPDATE CHECKLIST (User Submit)
// -----------------------------------------
export const updateChecklist = async (req, res) => {
  try {
    const items = req.body;

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "Invalid data" });

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const item of items) {
        // 🔥 Fix status
        const safeStatus =
          (item.status || "").toLowerCase() === "yes" ? "yes" : "no";

        // ---------------------------------
        // 🔥🔥 FIX: IMAGE HANDLING
        // ---------------------------------
        let finalImageUrl = null;

        if (item.image && typeof item.image === "string") {
          if (item.image.startsWith("data:image")) {
            // Base64 → Buffer
            const base64Data = item.image.split(";base64,").pop();
            const buffer = Buffer.from(base64Data, "base64");

            const fakeFile = {
              originalname: `task_${item.taskId}_${Date.now()}.jpg`,
              buffer,
              mimetype: "image/jpeg",
            };

            // Upload to S3
            finalImageUrl = await uploadToS3(fakeFile);
          } else {
            // Already S3 URL or old string
            finalImageUrl = item.image;
          }
        }

        // ---------------------------------
        // 🔥 SAVE TO DATABASE
        // ---------------------------------
        const sql = `
          UPDATE checklist
          SET 
           status = $1,
            remark = $2,
            submission_date = NOW(),
            image = $3
          WHERE task_id = $4
        `;

        await client.query(sql, [
          safeStatus,
          item.remarks || "",
          finalImageUrl,
          item.taskId,
        ]);
      }

      await client.query("COMMIT");
      res.json({ message: "Checklist updated successfully" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ updateChecklist Error:", err);
    res.status(500).json({ error: err.message });
  }
};



// -----------------------------------------
// 4️⃣ ADMIN DONE UPDATE
// -----------------------------------------
export const adminDoneChecklist = async (req, res) => {
  try {
    const items = req.body;

    if (!items || items.length === 0)
      return res.status(400).json({ error: "No items provided" });

    const sql = `
      UPDATE checklist
      SET admin_done = 'Done'
      WHERE task_id = ANY($1::bigint[])
    `;

    const ids = items.map(i => i.task_id);

    await pool.query(sql, [ids]);

    res.json({ message: "Admin updated successfully" });

  } catch (err) {
    console.error("❌ adminDoneChecklist Error:", err);
    res.status(500).json({ error: err.message });
  }
};
