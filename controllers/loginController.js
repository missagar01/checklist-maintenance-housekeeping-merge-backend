// controllers/loginController.js
import { pool } from "../config/db.js";

// controllers/loginController.js
// controllers/loginController.js
export const loginUserController = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password)
      return res.status(400).json({ error: "Username and Password are required" });

    // Query PostgreSQL - Include system_access and user_access1
    const query = `
      SELECT id, user_name, password, role, status, email_id, user_access, user_access1, page_access, system_access 
      FROM users 
      WHERE user_name = $1 AND password = $2
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [username, password]);

    // No user found
    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = rows[0];

    // Check active status
    if (user.status !== "active") {
      return res.status(403).json({ error: "Your account is inactive. Contact admin." });
    }

    return res.json({
      id: user.id,
      user_name: user.user_name,
      role: user.role,
      email_id: user.email_id,
      user_access: user.user_access,
      user_access1: user.user_access1 || "",
      page_access: user.page_access || "",
      system_access: user.system_access || "" // Return system_access
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
};
