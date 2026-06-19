import express from "express";
import pool from "../config/db.js";
// import { userSchema } from "../validation/schemas.js";
import { userSchema, userUpdateSchema } from "../validation/schemas.js";
import validate from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

// Helper — check quyền admin (dùng lại nhiều chỗ)
const isAdminRole = (role) =>
  role === "super_admin" || role === "it_admin" || role === "manager";

// Base SELECT — dùng lại nhiều chỗ
const USER_SELECT = `
  SELECT u.id, u.employee_code, u.email, u.full_name,
         u.first_name, u.last_name, u.phone,
         u.department_id, d.name  AS department,
         u.job_title_id,  jt.title AS job_title,
         u.report_to, u.role, u.status,
         u.auth_user_id, u.created_at, u.updated_at
  FROM users u
  LEFT JOIN departments d  ON d.id  = u.department_id
  LEFT JOIN job_titles   jt ON jt.id = u.job_title_id
`;

// GET /api/users
router.get(
  "/",
  authenticate,
  authorize("it_admin", "manager"), // super_admin bypass tự động trong authorize.js
  async (req, res) => {
    try {
      const {
        search,
        department_id,
        role,
        status,
        page = 1,
        limit = 20,
      } = req.query;

      const conditions = [];
      const params = [];

      if (search) {
        params.push(`%${search}%`);
        const idx = params.length;
        conditions.push(
          `(u.employee_code ILIKE $${idx} OR u.email ILIKE $${idx} OR u.full_name ILIKE $${idx})`,
        );
      }
      if (department_id) {
        params.push(department_id);
        conditions.push(`u.department_id = $${params.length}`);
      }
      if (role) {
        params.push(role);
        conditions.push(`u.role = $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`u.status = $${params.length}`);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      // Count — query riêng không có LIMIT/OFFSET
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) FROM users u ${where}`,
        params,
      );
      const total = parseInt(countRows[0].count);

      // Data
      const pageNum = Math.max(1, parseInt(page));
      const pageSize = Math.min(100, parseInt(limit));
      const offset = (pageNum - 1) * pageSize;

      params.push(pageSize, offset);

      const { rows: users } = await pool.query(
        `${USER_SELECT}
         ${where}
         ORDER BY u.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total,
            pages: Math.ceil(total / pageSize),
          },
        },
      });
    } catch (error) {
      console.error("Users fetch error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch users" });
    }
  },
);

// GET /api/users/:employeeCode
router.get("/:employeeCode", authenticate, async (req, res) => {
  try {
    const { employeeCode } = req.params;

    // super_admin, it_admin, manager hoặc chính user đó mới xem được
    if (
      !isAdminRole(req.user.role) &&
      req.user.employee_code !== employeeCode
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { rows } = await pool.query(
      `${USER_SELECT} WHERE u.employee_code = $1`,
      [employeeCode],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, data: { user: rows[0] } });
  } catch (error) {
    console.error("User fetch error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/users
router.post(
  "/",
  authenticate,
  authorize("it_admin"), // super_admin bypass tự động
  validate(userSchema),
  async (req, res) => {
    try {
      const {
        employee_code,
        email,
        full_name,
        first_name,
        last_name,
        phone,
        department_id,
        job_title_id,
        report_to,
        role,
        status,
      } = req.body;

      // Check duplicate
      const { rows: existing } = await pool.query(
        `SELECT id FROM users WHERE email = $1 OR employee_code = $2`,
        [email, employee_code],
      );
      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Email hoặc employee_code đã tồn tại",
        });
      }

      const { rows } = await pool.query(
        `INSERT INTO users
           (employee_code, email, full_name, first_name, last_name,
            phone, department_id, job_title_id, report_to, role, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, employee_code, email, full_name, role, status`,
        [
          employee_code,
          email,
          full_name,
          first_name || null,
          last_name || null,
          phone || null,
          department_id || null,
          job_title_id || null,
          report_to || null,
          role || "user",
          status || "active",
        ],
      );

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: { user: rows[0] },
      });
    } catch (error) {
      console.error("User creation error:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  },
);

// bulk user update
// PUT /api/users/bulk — đặt TRƯỚC route /:employeeCode
router.put("/bulk", authenticate, authorize("it_admin"), async (req, res) => {
  try {
    const { employee_codes, status, department_id } = req.body;

    if (
      !employee_codes ||
      !Array.isArray(employee_codes) ||
      employee_codes.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "employee_codes phải là mảng không rỗng",
      });
    }

    // Build dynamic SET clause
    const setClauses = ["updated_at = NOW()"];
    const params = [];

    if (status) {
      params.push(status);
      setClauses.push(`status = $${params.length}`);
    }
    if (department_id) {
      params.push(department_id);
      setClauses.push(`department_id = $${params.length}`);
    }

    if (setClauses.length === 1) {
      return res.status(400).json({
        success: false,
        message: "Cần ít nhất 1 field để update (status hoặc department_id)",
      });
    }

    // Tạo placeholder cho IN clause: $2, $3, $4...
    const placeholders = employee_codes
      .map((_, i) => `$${params.length + i + 1}`)
      .join(", ");

    params.push(...employee_codes);

    const { rows } = await pool.query(
      `UPDATE users
         SET ${setClauses.join(", ")}
         WHERE employee_code IN (${placeholders})
         RETURNING employee_code, status`,
      params,
    );

    res.json({
      success: true,
      message: `Cập nhật ${rows.length} nhân viên thành công`,
      data: { updated: rows },
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/users/:employeeCode
router.put(
  "/:employeeCode",
  authenticate,
  validate(userUpdateSchema),
  async (req, res) => {
    try {
      const { employeeCode } = req.params;
      const isAdmin =
        req.user.role === "super_admin" || req.user.role === "it_admin";
      const isSelf = req.user.employee_code === employeeCode;

      if (!isAdmin && !isSelf) {
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });
      }

      const {
        full_name,
        first_name,
        last_name,
        phone,
        department_id,
        job_title_id,
        report_to,
        role,
        status,
      } = req.body;

      // Chỉ super_admin và it_admin mới được đổi role và status
      const newRole = isAdmin ? (role ?? null) : null;
      const newStatus = isAdmin ? (status ?? null) : null;

      const { rows } = await pool.query(
        `UPDATE users SET
           full_name     = COALESCE($1,  full_name),
           first_name    = COALESCE($2,  first_name),
           last_name     = COALESCE($3,  last_name),
           phone         = COALESCE($4,  phone),
           department_id = COALESCE($5,  department_id),
           job_title_id  = COALESCE($6,  job_title_id),
           report_to     = COALESCE($7,  report_to),
           role          = COALESCE($8,  role),
           status        = COALESCE($9,  status),
           updated_at    = NOW()
         WHERE employee_code = $10
         RETURNING id, employee_code, email, full_name, role, status`,
        [
          full_name,
          first_name,
          last_name,
          phone,
          department_id,
          job_title_id,
          report_to,
          newRole,
          newStatus,
          employeeCode,
        ],
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      res.json({
        success: true,
        message: "User updated successfully",
        data: { user: rows[0] },
      });
    } catch (error) {
      console.error("User update error:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  },
);

// DELETE /api/users/:employeeCode — soft delete
router.delete(
  "/:employeeCode",
  authenticate,
  authorize("it_admin"), // super_admin bypass tự động
  async (req, res) => {
    try {
      // Không cho xóa chính mình
      if (req.user.employee_code === req.params.employeeCode) {
        return res.status(400).json({
          success: false,
          message: "Không thể tự xóa tài khoản của mình",
        });
      }

      const { rows } = await pool.query(
        `UPDATE users SET status = 'resigned', updated_at = NOW()
         WHERE employee_code = $1
         RETURNING id`,
        [req.params.employeeCode],
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      res.json({ success: true, message: "User deactivated successfully" });
    } catch (error) {
      console.error("User deletion error:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  },
);

// GET /api/users/:employeeCode/asset-history
router.get("/:employeeCode/asset-history", authenticate, async (req, res) => {
  try {
    const { employeeCode } = req.params;

    if (
      !isAdminRole(req.user.role) &&
      req.user.employee_code !== employeeCode
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { rows } = await pool.query(
      `SELECT
         ah.id,
         ah.action_type,
         ah.from_date,
         ah.to_date,
         ah.notes,
         ah.created_at,
         a.asset_code,
         a.product_name,
         a.category,
         a.brand,
         a.model,
         hs.id AS handover_slip_id,
         pb.full_name AS performed_by_name
       FROM asset_history ah
       JOIN assets a ON a.id = ah.asset_id
       LEFT JOIN handover_slips hs ON hs.id = ah.handover_slip_id
       LEFT JOIN users pb ON pb.employee_code = ah.performed_by
       WHERE ah.user_employee_code = $1
       ORDER BY ah.created_at DESC`,
      [employeeCode],
    );

    res.json({ success: true, data: { history: rows } });
  } catch (error) {
    console.error("User asset history error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/users/:employeeCode/assets
router.get("/:employeeCode/assets", authenticate, async (req, res) => {
  try {
    const { employeeCode } = req.params;

    if (
      !isAdminRole(req.user.role) &&
      req.user.employee_code !== employeeCode
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { rows: assets } = await pool.query(
      `SELECT id, asset_code, product_name, category, brand, model,
              serial_number, status, location, updated_at
       FROM assets
       WHERE current_user_employee_code = $1 AND status = 'in_use'
       ORDER BY updated_at DESC`,
      [employeeCode],
    );

    res.json({ success: true, data: { assets } });
  } catch (error) {
    console.error("User assets error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
