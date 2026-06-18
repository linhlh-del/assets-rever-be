import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // max connections trong pool
  idleTimeoutMillis: 30000, // đóng connection idle sau 30s
  connectionTimeoutMillis: 2000,
});

// Test connection khi khởi động
pool.on("connect", () => {
  console.log("✅ Connected to VPS PostgreSQL");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err.message);
});

export default pool;
