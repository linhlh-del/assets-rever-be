const express = require("express");
const supabase = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// Generate asset report
router.post(
  "/assets",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        category,
        status,
        department,
        reportType = "summary",
      } = req.body;

      let query = supabase.from("assets").select("*");

      // Apply filters
      if (category) {
        query = query.eq("category", category);
      }

      if (status) {
        query = query.eq("status", status);
      }

      if (department) {
        query = query.eq("current_department", department);
      }

      if (startDate && endDate) {
        query = query.gte("created_at", startDate).lte("created_at", endDate);
      }

      const { data: assets, error } = await query;

      if (error) {
        console.error("Asset report generation error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to generate asset report",
        });
      }

      // Generate report data based on type
      let reportData = {};

      if (reportType === "summary") {
        reportData = {
          totalAssets: assets.length,
          byStatus: assets.reduce((acc, asset) => {
            acc[asset.status] = (acc[asset.status] || 0) + 1;
            return acc;
          }, {}),
          byCategory: assets.reduce((acc, asset) => {
            acc[asset.category] = (acc[asset.category] || 0) + 1;
            return acc;
          }, {}),
          totalValue: assets.reduce(
            (sum, asset) => sum + (asset.purchase_price || 0),
            0
          ),
        };
      } else if (reportType === "detailed") {
        reportData = {
          assets: assets.map((asset) => ({
            asset_code: asset.asset_code,
            product_name: asset.product_name,
            category: asset.category,
            status: asset.status,
            purchase_price: asset.purchase_price,
            current_user: asset.current_user_employee_code,
            location: asset.location,
          })),
        };
      }

      res.json({
        success: true,
        data: {
          reportType,
          generatedAt: new Date().toISOString(),
          filters: { startDate, endDate, category, status, department },
          reportData,
        },
      });
    } catch (error) {
      console.error("Asset report generation error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Generate maintenance report
router.post(
  "/maintenance",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res) => {
    try {
      const { startDate, endDate, status, technician } = req.body;

      let query = supabase.from("maintenance_history").select(`
        *,
        assets(asset_code, product_name),
        users!maintenance_history_reported_by_employee_code_fkey(full_name),
        technician_user:users!maintenance_history_technician_employee_code_fkey(full_name)
      `);

      // Apply filters
      if (status) {
        query = query.eq("status", status);
      }

      if (technician) {
        query = query.eq("technician_employee_code", technician);
      }

      if (startDate && endDate) {
        query = query.gte("created_at", startDate).lte("created_at", endDate);
      }

      const { data: maintenance, error } = await query;

      if (error) {
        console.error("Maintenance report generation error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to generate maintenance report",
        });
      }

      // Generate report data
      const reportData = {
        totalTickets: maintenance.length,
        byStatus: maintenance.reduce((acc, ticket) => {
          acc[ticket.status] = (acc[ticket.status] || 0) + 1;
          return acc;
        }, {}),
        totalCost: maintenance.reduce(
          (sum, ticket) => sum + (ticket.cost || 0),
          0
        ),
        averageResolutionTime: 0, // Would need more complex calculation
        tickets: maintenance.map((ticket) => ({
          id: ticket.id,
          asset_code: ticket.assets?.asset_code,
          product_name: ticket.assets?.product_name,
          reported_by: ticket.users?.full_name,
          technician: ticket.technician_user?.full_name,
          status: ticket.status,
          issue_description: ticket.issue_description,
          cost: ticket.cost,
          created_at: ticket.created_at,
        })),
      };

      res.json({
        success: true,
        data: {
          reportType: "maintenance",
          generatedAt: new Date().toISOString(),
          filters: { startDate, endDate, status, technician },
          reportData,
        },
      });
    } catch (error) {
      console.error("Maintenance report generation error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Generate user activity report
router.post("/users", authenticate, authorize("admin_it"), async (req, res) => {
  try {
    const { startDate, endDate, department } = req.body;

    let userQuery = supabase.from("users").select("*");
    let historyQuery = supabase.from("asset_history").select(`
        *,
        assets(asset_code, product_name),
        users(full_name, department)
      `);

    if (department) {
      userQuery = userQuery.eq("department", department);
      historyQuery = historyQuery.eq("users.department", department);
    }

    if (startDate && endDate) {
      historyQuery = historyQuery
        .gte("created_at", startDate)
        .lte("created_at", endDate);
    }

    const [usersResult, historyResult] = await Promise.all([
      userQuery,
      historyQuery,
    ]);

    if (usersResult.error || historyResult.error) {
      console.error(
        "User report generation error:",
        usersResult.error || historyResult.error
      );
      return res.status(500).json({
        success: false,
        message: "Failed to generate user report",
      });
    }

    const users = usersResult.data;
    const history = historyResult.data;

    // Generate report data
    const reportData = {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === "active").length,
      byDepartment: users.reduce((acc, user) => {
        acc[user.department || "Unassigned"] =
          (acc[user.department || "Unassigned"] || 0) + 1;
        return acc;
      }, {}),
      assetAssignments: history.filter((h) => h.action_type === "assigned")
        .length,
      assetReturns: history.filter((h) => h.action_type === "returned").length,
      recentActivity: history.slice(0, 20).map((h) => ({
        user: h.users?.full_name,
        action: h.action_type,
        asset: h.assets?.asset_code,
        date: h.created_at,
      })),
    };

    res.json({
      success: true,
      data: {
        reportType: "users",
        generatedAt: new Date().toISOString(),
        filters: { startDate, endDate, department },
        reportData,
      },
    });
  } catch (error) {
    console.error("User report generation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
