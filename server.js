import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const { default: assetsRouter } = await import("./routes/assets.js");
const { default: dashboardRouter } = await import("./routes/dashboard.js");
const { default: authRouter } = await import("./routes/auth.js"); // ← thêm

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "API is running" });
});

app.use("/api/auth", authRouter); // ← thêm (phải trước 404 handler)
app.use("/api/assets", assetsRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err : undefined,
  });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 Assets API: http://localhost:${PORT}/api/assets`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
