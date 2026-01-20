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

// ✅ ADDED: Global error listeners to prevent crash on idle client error
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client (Main Pool):', err.message);
  // process.exit(-1); // Do not exit, just log it. Pool will try to reconnect on next query.
});

maintenancePool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client (Maintenance Pool):', err.message);
});

const connectToPool = async (poolInstance, poolName) => {
  try {
    const client = await poolInstance.connect();
    client.release(); // ✅ FIXED: Release the client back to the pool!
    console.log(`✅ Connected to ${poolName} PostgreSQL`);
  } catch (err) {
    console.error(`❌ ${poolName} Database connection error:`, err.message);
  }
};

connectToPool(pool, "Main");
connectToPool(maintenancePool, "Maintenance");

export { pool, maintenancePool };