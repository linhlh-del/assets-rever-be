import express from "express";
import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

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
      const conditions = [];
      const params = [];

      if (category) {
        params.push(category);
        conditions.push(`category = $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }
      if (department) {
        params.push(department);
        conditions.push(`current_user_department = $${params.length}`);
      }
      if (startDate && endDate) {
        params.push(startDate, endDate);
        conditions.push(
          `created_at >= $${params.length - 1} AND created_at <= $${params.length}`,
        );
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      const { rows: assets } = await pool.query(
        `SELECT * FROM v_assets_full ${where}`,
        params,
      );

      let reportData = {};
      if (reportType === "summary") {
        reportData = {
          totalAssets: assets.length,
          byStatus: assets.reduce((acc, a) => {
            acc[a.status] = (acc[a.status] || 0) + 1;
            return acc;
          }, {}),
          byCategory: assets.reduce((acc, a) => {
            acc[a.category] = (acc[a.category] || 0) + 1;
            return acc;
          }, {}),
          totalValue: assets.reduce(
            (sum, a) => sum + Number(a.purchase_price || 0),
            0,
          ),
        };
      } else {
        reportData = {
          assets: assets.map((a) => ({
            asset_code: a.asset_code,
            product_name: a.product_name,
            category: a.category,
            status: a.status,
            purchase_price: a.purchase_price,
            current_user: a.current_user_employee_code,
            current_user_name: a.current_user_name,
            location: a.location,
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
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  },
);

router.post(
  "/maintenance",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res) => {
    try {
      const { startDate, endDate, status, technician } = req.body;
      const conditions = [];
      const params = [];

      if (status) {
        params.push(status);
        conditions.push(`t.status = $${params.length}`);
      }
      if (technician) {
        params.push(technician);
        conditions.push(`t.assigned_technician = $${params.length}`);
      }
      if (startDate && endDate) {
        params.push(startDate, endDate);
        conditions.push(
          `t.created_at >= $${params.length - 1} AND t.created_at <= $${params.length}`,
        );
      }
      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const { rows: tickets } = await pool.query(
        `SELECT t.*, a.asset_code, a.product_name,
              ru.full_name AS reported_by_name, tu.full_name AS technician_name
       FROM maintenance_tickets t
       JOIN assets a ON a.id = t.asset_id
       LEFT JOIN users ru ON ru.employee_code = t.reported_by
       LEFT JOIN users tu ON tu.employee_code = t.assigned_technician
       ${where}`,
        params,
      );

      const reportData = {
        totalTickets: tickets.length,
        byStatus: tickets.reduce((acc, t) => {
          acc[t.status] = (acc[t.status] || 0) + 1;
          return acc;
        }, {}),
        totalCost: tickets.reduce(
          (sum, t) => sum + Number(t.repair_cost || 0),
          0,
        ),
        tickets: tickets.map((t) => ({
          id: t.id,
          ticket_number: t.ticket_number,
          asset_code: t.asset_code,
          product_name: t.product_name,
          reported_by: t.reported_by_name,
          technician: t.technician_name,
          status: t.status,
          issue_description: t.issue_description,
          cost: t.repair_cost,
          created_at: t.created_at,
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
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  },
);

router.post("/users", authenticate, authorize("admin_it"), async (req, res) => {
  try {
    const { startDate, endDate, department } = req.body;

    const userParams = [];
    let userWhere = "";
    if (department) {
      userParams.push(department);
      userWhere = `WHERE d.name = $1`;
    }

    const { rows: users } = await pool.query(
      `SELECT u.*, d.name AS department_name FROM users u
       LEFT JOIN departments d ON d.id = u.department_id ${userWhere}`,
      userParams,
    );

    const historyConditions = [];
    const historyParams = [];
    if (department) {
      historyParams.push(department);
      historyConditions.push(`d.name = $${historyParams.length}`);
    }
    if (startDate && endDate) {
      historyParams.push(startDate, endDate);
      historyConditions.push(
        `h.created_at >= $${historyParams.length - 1} AND h.created_at <= $${historyParams.length}`,
      );
    }
    const historyWhere = historyConditions.length
      ? `WHERE ${historyConditions.join(" AND ")}`
      : "";

    const { rows: history } = await pool.query(
      `SELECT h.*, a.asset_code, u.full_name AS user_name
       FROM asset_history h
       JOIN assets a ON a.id = h.asset_id
       LEFT JOIN users u ON u.employee_code = h.user_employee_code
       LEFT JOIN departments d ON d.id = u.department_id
       ${historyWhere} ORDER BY h.created_at DESC`,
      historyParams,
    );

    const reportData = {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === "active").length,
      byDepartment: users.reduce((acc, u) => {
        const dep = u.department_name || "Unassigned";
        acc[dep] = (acc[dep] || 0) + 1;
        return acc;
      }, {}),
      assetAssignments: history.filter((h) => h.action_type === "assigned")
        .length,
      assetReturns: history.filter((h) => h.action_type === "returned").length,
      recentActivity: history.slice(0, 20).map((h) => ({
        user: h.user_name,
        action: h.action_type,
        asset: h.asset_code,
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
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
