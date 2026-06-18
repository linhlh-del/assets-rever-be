import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "rever_assets",
  user: process.env.DB_USER || "rever_app",
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: false,
});

pool.on("connect", () => {
  console.log("✅ Connected to VPS PostgreSQL");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err.message);
});

// Test connection khi khởi động
pool
  .query("SELECT 1")
  .then(() => {
    console.log("✅ PostgreSQL connection verified");
  })
  .catch((err) => {
    console.error("❌ PostgreSQL connection failed:", err.message);
    console.error("Full error:", err);
    console.error("   Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env");
  });

export default pool;
