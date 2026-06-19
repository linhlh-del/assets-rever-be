import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

dotenv.config();

// Import tất cả routes
import authRouter from "./routes/auth.js";
import assetsRouter from "./routes/assets.js";
import dashboardRouter from "./routes/dashboard.js";
import usersRouter from "./routes/users.js";
import invoicesRouter from "./routes/invoices.js";
import maintenanceRouter from "./routes/maintenance.js";
import handoverRouter from "./routes/handover.js";
import reportsRouter from "./routes/reports.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());

// ─── Health check ─────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/users", usersRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/maintenance", maintenanceRouter);
app.use("/api/handover", handoverRouter);
app.use("/api/reports", reportsRouter);

// ─── 404 ──────────────────────────────────────
app.use((req, res) => {
  res
    .status(404)
    .json({ message: `Route ${req.method} ${req.path} not found` });
});

// ─── Global error handler ─────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`   Auth:        /api/auth`);
  console.log(`   Assets:      /api/assets`);
  console.log(`   Dashboard:   /api/dashboard`);
  console.log(`   Users:       /api/users`);
  console.log(`   Invoices:    /api/invoices`);
  console.log(`   Maintenance: /api/maintenance`);
  console.log(`   Handover:    /api/handover`);
  console.log(`   Reports:     /api/reports`);
});
