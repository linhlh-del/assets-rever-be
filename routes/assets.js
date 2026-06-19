import express from "express";
import pool from "../config/db.js";
import { randomUUID } from "crypto";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

// GET /api/assets
router.get("/", authenticate, async (req, res, next) => {
  try {
    const {
      category,
      department,
      status,
      search,
      limit = 20,
      page = 1,
    } = req.query;

    const conditions = [];
    const params = [];

    if (category && category !== "null") {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (department && department !== "null") {
      params.push(department);
      conditions.push(`department = $${params.length}`);
    }
    if (status && status !== "null") {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(asset_code ILIKE $${idx} OR product_name ILIKE $${idx} OR serial_number ILIKE $${idx})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM assets ${where}`,
      params,
    );
    const total = parseInt(countRows[0].count);

    // Data query — LIMIT/OFFSET thêm sau params filter
    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    const offset = (pageNum - 1) * pageSize;

    params.push(pageSize, offset);
    const { rows: assets } = await pool.query(
      `SELECT * FROM assets ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      assets,
      pagination: {
        total,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/assets/:id
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM assets WHERE id = $1`, [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy tài sản" });
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /api/assets/:id/audit-trail — FIX tên bảng
router.get("/:id/audit-trail", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT hs.*, u.full_name AS user_name
       FROM handover_slips hs
       LEFT JOIN users u ON u.employee_code = hs.employee_code
       WHERE hs.asset_id = $1
       ORDER BY hs.handover_date DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/assets
router.post(
  "/",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res, next) => {
    try {
      const b = req.body;
      if (!b.asset_code || !b.product_name) {
        return res
          .status(400)
          .json({ message: "asset_code và product_name là bắt buộc" });
      }

      const { rows } = await pool.query(
        `INSERT INTO assets
           (id, asset_code, product_name, category, model, color, serial_number,
            purchase_price, purchase_date, warranty_period, warranty_expiry_date,
            status, current_user_employee_code, location, notes, department)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
          b.id || randomUUID(),
          b.asset_code,
          b.product_name,
          b.category || "laptop",
          b.model || null,
          b.color || null,
          b.serial_number || null,
          b.purchase_price || null,
          b.purchase_date || null,
          b.warranty_period || null,
          b.warranty_expiry_date || null,
          b.status || "available",
          b.current_user_employee_code || null,
          b.location || "Kho",
          b.notes || null,
          b.department || "General",
        ],
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/assets/:id
router.put(
  "/:id",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res, next) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE assets SET
         product_name = COALESCE($1, product_name),
         category = COALESCE($2, category),
         model = COALESCE($3, model),
         status = COALESCE($4, status),
         location = COALESCE($5, location),
         notes = COALESCE($6, notes),
         updated_at = NOW()
       WHERE id = $7 RETURNING *`,
        [
          b.product_name,
          b.category,
          b.model,
          b.status,
          b.location,
          b.notes,
          req.params.id,
        ],
      );
      if (rows.length === 0)
        return res.status(404).json({ message: "Asset not found" });
      res.json(rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/assets/:id
router.delete(
  "/:id",
  authenticate,
  authorize("admin_it"),
  async (req, res, next) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM assets WHERE id = $1`,
        [req.params.id],
      );
      if (rowCount === 0)
        return res.status(404).json({ message: "Asset not found" });
      res.json({ message: "Asset deleted successfully" });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/assets/:id/assign
router.post(
  "/:id/assign",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res, next) => {
    try {
      const { employeeCode, fullName, department, assignedBy } = req.body;
      const assetId = req.params.id;

      // 1. Update asset
      const { rows } = await pool.query(
        `UPDATE assets
       SET current_user_employee_code = $1, status = 'in_use', updated_at = NOW()
       WHERE id = $2 RETURNING *`,
        [employeeCode, assetId],
      );
      if (rows.length === 0)
        return res.status(404).json({ message: "Asset not found" });

      // 2. Ghi vào handover_slips (thay asset_assignments)
      await pool.query(
        `INSERT INTO handover_slips
         (asset_id, employee_code, handover_date, slip_type, issued_by, notes)
       VALUES ($1, $2, NOW(), 'allocation', $3, $4)`,
        [assetId, employeeCode, assignedBy || req.user.employee_code, null],
      );

      res.json(rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/assets/:id/return
router.post(
  "/:id/return",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res, next) => {
    try {
      const { returnNotes } = req.body;
      const assetId = req.params.id;

      // 1. Lấy người đang dùng
      const { rows: current } = await pool.query(
        `SELECT current_user_employee_code FROM assets WHERE id = $1`,
        [assetId],
      );
      if (current.length === 0)
        return res.status(404).json({ message: "Asset not found" });

      const prevEmployee = current[0].current_user_employee_code;

      // 2. Update asset
      const { rows } = await pool.query(
        `UPDATE assets
       SET current_user_employee_code = NULL, status = 'available',
           notes = COALESCE($1, notes), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
        [returnNotes, assetId],
      );

      // 3. Ghi return vào handover_slips
      if (prevEmployee) {
        await pool.query(
          `INSERT INTO handover_slips
           (asset_id, employee_code, handover_date, slip_type, received_by, notes)
         VALUES ($1, $2, NOW(), 'return', $3, $4)`,
          [assetId, prevEmployee, req.user.employee_code, returnNotes || null],
        );
      }

      res.json(rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
