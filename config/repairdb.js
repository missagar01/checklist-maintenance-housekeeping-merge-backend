import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pg;

const repairPool = new Pool({
  host: process.env.DB_HOST || process.env.DB_HOST,
  user: process.env.DB_USER || process.env.DB_USER,
  password: process.env.DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.REPAIR_DB_NAME || "repair-system",
  port: process.env.DB_PORT || process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },
});

repairPool
  .connect()
  .then(() => console.log("✅ Connected to Repair System PostgreSQL"))
  .catch((err) => console.error("❌ Repair DB connection error:", err.message));

export default repairPool;