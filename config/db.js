// import pg from "pg";
// import dotenv from "dotenv";

// dotenv.config();
// const { Pool } = pg;

// const pool = new Pool({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   port: process.env.DB_PORT,
//   ssl: { rejectUnauthorized: false }, // required for AWS RDS
// });

// pool
//   .connect()
//   .then(() => console.log("✅ Connected to AWS RDS PostgreSQL"))
//   .catch((err) => console.error("❌ Database connection error:", err.message));

// export default pool;




import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pg;

// Main database pool
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },
});

// Maintenance database pool
const maintenancePool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.MAINTENANCE_DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },
});

const connectToPool = async (poolInstance, poolName) => {
  try {
    await poolInstance.connect();
    console.log(`✅ Connected to ${poolName} PostgreSQL`);
  } catch (err) {
    console.error(`❌ ${poolName} Database connection error:`, err.message);
  }
};

connectToPool(pool, "Main");
connectToPool(maintenancePool, "Maintenance");

export { pool, maintenancePool };