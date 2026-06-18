import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables before importing modules that depend on them
dotenv.config();

// Dynamically import routers so env vars are available when their modules load
const { default: assetsRouter } = await import("./routes/assets.js");
const { default: dashboardRouter } = await import("./routes/dashboard.js");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "API is running" });
});

// Routes
app.use("/api/assets", assetsRouter);
app.use("/api/dashboard", dashboardRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 Assets API: http://localhost:${PORT}/api/assets`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
