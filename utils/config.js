import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Provide __dirname for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath, quiet: true });

const truthy = (v) => v === true || v === 'true' || v === '1';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  logLevel: process.env.LOG_LEVEL || 'info',
  pg: {
    host: process.env.PG_HOST || process.env.DB_HOST,
    port: Number(process.env.PG_PORT || process.env.DB_PORT || 5432),
    user: process.env.PG_USER || process.env.DB_USER,
    password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.PG_DATABASE || process.env.DB_NAME,
    ssl: truthy(process.env.PG_SSL || process.env.DB_SSL)
  },
  jwtSecret: process.env.JWT_SECRET || 'change-me'
};

export default config;
