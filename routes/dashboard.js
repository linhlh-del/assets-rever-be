import express from "express";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

// GET /api/dashboard - Lấy thống kê dashboard
router.get("/", async (req, res, next) => {
  try {
    console.log("📊 Fetching dashboard statistics...");

    // 1. Tổng số tài sản
    const { count: totalAssets } = await supabase
      .from("assets")
      .select("*", { count: "exact", head: true });

    // 2. Tài sản có sẵn
    const { count: availableAssets } = await supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("status", "available");

    // 3. Tài sản được gán
    const { count: assignedAssets } = await supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("status", "assigned");

    // 4. Thống kê theo category
    const { data: categoryData } = await supabase
      .from("assets")
      .select("category");

    const categoryStats = [];
    if (categoryData) {
      const categoryMap = {};
      categoryData.forEach((item) => {
        if (item.category) {
          categoryMap[item.category] = (categoryMap[item.category] || 0) + 1;
        }
      });
      Object.entries(categoryMap).forEach(([category, count]) => {
        categoryStats.push({ category, count });
      });
    }

    // 5. Thống kê theo department
    const { data: departmentData } = await supabase
      .from("assets")
      .select("department");

    const departmentStats = [];
    if (departmentData) {
      const departmentMap = {};
      departmentData.forEach((item) => {
        if (item.department) {
          departmentMap[item.department] =
            (departmentMap[item.department] || 0) + 1;
        }
      });
      Object.entries(departmentMap).forEach(([department, count]) => {
        departmentStats.push({ department, count });
      });
    }

    // 6. Thống kê theo status
    const { data: statusData } = await supabase.from("assets").select("status");

    const statusStats = [];
    if (statusData) {
      const statusMap = {};
      statusData.forEach((item) => {
        if (item.status) {
          statusMap[item.status] = (statusMap[item.status] || 0) + 1;
        }
      });
      Object.entries(statusMap).forEach(([status, count]) => {
        statusStats.push({ status, count });
      });
    }

    console.log("✅ Dashboard statistics retrieved");
    console.log({
      totalAssets,
      availableAssets,
      assignedAssets,
      categoryStats: categoryStats.length,
      departmentStats: departmentStats.length,
      statusStats: statusStats.length,
    });

    res.json({
      summary: {
        totalAssets: totalAssets || 0,
        availableAssets: availableAssets || 0,
        assignedAssets: assignedAssets || 0,
      },
      categoryStats: categoryStats || [],
      departmentStats: departmentStats || [],
      statusStats: statusStats || [],
    });
  } catch (error) {
    console.error("❌ Dashboard error:", error);
    next(error);
  }
});

export default router;
