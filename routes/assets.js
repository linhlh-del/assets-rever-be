import express from "express";
import pool from "../config/db.js";
import supabase from "../config/supabase.js";
import { randomUUID } from "crypto";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// Helper: Sinh slip_number
async function generateSlipNumber() {
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM handover_slips 
     WHERE DATE(created_at) = CURRENT_DATE`,
  );
  const count = parseInt(rows[0].count) + 1;
  const seq = String(count).padStart(4, "0");
  return `HND-${today}-${seq}`;
}

async function fetchAssetImages(assetId) {
  const { rows } = await pool.query(
    `SELECT id, file_name, file_url, file_type, file_size, is_primary, uploaded_at
     FROM asset_images
     WHERE asset_id = $1
     ORDER BY is_primary DESC, uploaded_at DESC`,
    [assetId],
  );
  return rows.map((row) => ({
    ...row,
    image_url: row.file_url,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assets
// ─────────────────────────────────────────────────────────────────────────────
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
      conditions.push(`a.category = $${params.length}`);
    }
    // department filter dùng department_id (UUID) — không còn cột department text
    if (department && department !== "null") {
      params.push(department);
      conditions.push(`u.department_id = $${params.length}`);
    }
    if (status && status !== "null") {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(a.asset_code ILIKE $${idx} OR a.product_name ILIKE $${idx} OR a.serial_number ILIKE $${idx})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM assets a
       LEFT JOIN users u ON u.employee_code = a.current_user_employee_code
       ${where}`,
      params,
    );
    const total = parseInt(countRows[0].count);

    // Data
    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    const offset = (pageNum - 1) * pageSize;

    params.push(pageSize, offset);
    const { rows: assets } = await pool.query(
      `SELECT
         a.*,
         u.full_name  AS current_user_name,
         d.name       AS current_department_name
       FROM assets a
       LEFT JOIN users u ON u.employee_code = a.current_user_employee_code
       LEFT JOIN departments d ON d.id = u.department_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      success: true,
      data: {
        assets,
        pagination: {
          total,
          page: pageNum,
          limit: pageSize,
          pages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assets/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         a.*,
         u.full_name  AS current_user_name,
         d.name       AS current_department_name
       FROM assets a
       LEFT JOIN users u ON u.employee_code = a.current_user_employee_code
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE a.id = $1`,
      [req.params.id],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy tài sản" });
    }

    const asset = rows[0];
    asset.asset_images = await fetchAssetImages(asset.id);

    res.json({ success: true, data: { asset } });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assets/:id/audit-trail
// Dùng bảng asset_history (đúng tên) thay vì handover_slips
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/audit-trail", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         ah.*,
         u.full_name AS user_full_name
       FROM asset_history ah
       LEFT JOIN users u ON u.employee_code = ah.user_employee_code
       WHERE ah.asset_id = $1
       ORDER BY ah.from_date DESC`,
      [req.params.id],
    );

    res.json({ success: true, data: { history: rows } });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assets
// Chỉ dùng các cột tồn tại thực tế trên VPS
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  authorize("it_admin", "manager"), // FIX: đúng role VPS
  async (req, res, next) => {
    try {
      const b = req.body;

      if (!b.asset_code || !b.product_name) {
        return res.status(400).json({
          success: false,
          message: "asset_code và product_name là bắt buộc",
        });
      }

      // Kiểm tra asset_code đã tồn tại chưa
      const { rows: existing } = await pool.query(
        `SELECT id FROM assets WHERE asset_code = $1`,
        [b.asset_code],
      );
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Mã tài sản ${b.asset_code} đã tồn tại`,
        });
      }

      const { rows } = await pool.query(
        `INSERT INTO assets
           (id,   asset_code,   product_name,   category,
            brand,              serial_number,
            purchase_price,     purchase_date,
            warranty_expiry_date, warranty_months,
            invoice_id,
            specifications,
            status,             notes)
         VALUES
           ($1,  $2,           $3,             $4,
            $5,                $6,
            $7,                $8,
            $9,                $10,
            $11,
            $12,
            $13,               $14)
         RETURNING *`,
        [
          randomUUID(), // $1  id
          b.asset_code, // $2
          b.product_name, // $3
          b.category || "other", // $4
          b.brand || null, // $5  thay color
          b.serial_number || null, // $6
          b.purchase_price || null, // $7
          b.purchase_date || null, // $8
          b.warranty_expiry_date || null, // $9
          b.warranty_months || null, // $10 thay warranty_period (text)
          b.invoice_id || null, // $11 FK invoices
          b.specifications // $12 jsonb
            ? JSON.stringify(b.specifications)
            : null,
          b.status || "available", // $13
          b.notes || null, // $14
        ],
      );

      res.status(201).json({ success: true, data: { asset: rows[0] } });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/assets/:id
// ─────────────────────────────────────────────────────────────────────────────
router.put(
  "/:id",
  authenticate,
  authorize("it_admin", "manager"), // FIX: đúng role VPS
  async (req, res, next) => {
    try {
      const b = req.body;

      const { rows } = await pool.query(
        `UPDATE assets SET
           product_name         = COALESCE($1,  product_name),
           category             = COALESCE($2,  category),
           brand                = COALESCE($3,  brand),
           serial_number        = COALESCE($4,  serial_number),
           purchase_price       = COALESCE($5,  purchase_price),
           purchase_date        = COALESCE($6,  purchase_date),
           warranty_expiry_date = COALESCE($7,  warranty_expiry_date),
           warranty_months      = COALESCE($8,  warranty_months),
           status               = COALESCE($9,  status),
           notes                = COALESCE($10, notes),
           invoice_id           = COALESCE($11, invoice_id),
           disposal_date        = COALESCE($12, disposal_date),
           disposal_reason      = COALESCE($13, disposal_reason),
           disposal_reason_type = COALESCE($14, disposal_reason_type),
           disposal_price       = COALESCE($15, disposal_price),
           current_user_employee_code = CASE
             WHEN COALESCE($9, status) = 'disposed' THEN NULL
             ELSE current_user_employee_code
           END,
           updated_at           = NOW()
         WHERE id = $16
         RETURNING *`,
        [
          b.product_name || null,
          b.category || null,
          b.brand || null,
          b.serial_number || null,
          b.purchase_price || null,
          b.purchase_date || null,
          b.warranty_expiry_date || null,
          b.warranty_months || null,
          b.status || null,
          b.notes || null,
          b.invoice_id || null,
          b.disposal_date || null,
          b.disposal_reason || null,
          b.disposal_reason_type || null,
          b.disposal_price ?? null,
          req.params.id,
        ],
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy tài sản" });
      }

      res.json({ success: true, data: { asset: rows[0] } });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/assets/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  authorize("it_admin"),
  async (req, res, next) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM assets WHERE id = $1`,
        [req.params.id],
      );

      if (rowCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy tài sản" });
      }

      res.json({ success: true, message: "Xóa tài sản thành công" });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assets/:id/assign
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:id/assign",
  authenticate,
  authorize("it_admin", "manager"),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { employee_code } = req.body; // FIX: snake_case từ FE
      const assetId = req.params.id;

      if (!employee_code) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ success: false, message: "employee_code là bắt buộc" });
      }

      // 1. Kiểm tra asset còn available không
      const { rows: assetRows } = await client.query(
        `SELECT id, asset_code, product_name, model, serial_number, status FROM assets WHERE id = $1`,
        [assetId],
      );
      if (assetRows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy tài sản" });
      }
      if (assetRows[0].status !== "available") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: `Tài sản đang ở trạng thái "${assetRows[0].status}", không thể phân công`,
        });
      }

      // 2. Update asset
      const { rows } = await client.query(
        `UPDATE assets
         SET current_user_employee_code = $1, status = 'in_use', updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [employee_code, assetId],
      );

      // 3. Ghi asset_history
      await client.query(
        `INSERT INTO asset_history
           (asset_id, user_employee_code, action_type, from_date, performed_by)
         VALUES ($1, $2, 'assigned', NOW(), $3)`,
        [assetId, employee_code, req.user.employee_code],
      );

      // 4. Sinh slip_number và tạo handover_slip
      const slipNumber = await generateSlipNumber();
      const { rows: slipRows } = await client.query(
        `INSERT INTO handover_slips
           (slip_number, slip_date, to_employee_code, slip_type, issued_by, status)
         VALUES ($1, CURRENT_DATE, $2, 'handover', $3, 'generated')
         RETURNING *`,
        [slipNumber, employee_code, req.user.employee_code],
      );
      const slip = slipRows[0];

      // 5. Tạo handover_slip_items (ánh xạ asset vào slip)
      await client.query(
        `INSERT INTO handover_slip_items
           (slip_id, asset_id, asset_code, product_name, model, serial_number)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          slip.id,
          assetId,
          assetRows[0].asset_code,
          assetRows[0].product_name,
          assetRows[0].model,
          assetRows[0].serial_number,
        ],
      );

      await client.query("COMMIT");

      res.json({ success: true, data: { asset: rows[0] } });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assets/:id/return
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:id/return",
  authenticate,
  authorize("it_admin", "manager"),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { notes } = req.body;
      const assetId = req.params.id;

      // 1. Lấy người đang dùng
      const { rows: current } = await client.query(
        `SELECT id, asset_code, product_name, model, serial_number, current_user_employee_code, status FROM assets WHERE id = $1`,
        [assetId],
      );
      if (current.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy tài sản" });
      }
      if (current[0].status !== "in_use") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: `Tài sản đang ở trạng thái "${current[0].status}", không thể thu hồi`,
        });
      }

      const prevEmployee = current[0].current_user_employee_code;

      // 2. Update asset
      const { rows } = await client.query(
        `UPDATE assets
         SET current_user_employee_code = NULL,
             status = 'available',
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [assetId],
      );

      // 3. Đóng asset_history record
      await client.query(
        `UPDATE asset_history
         SET to_date = NOW()
         WHERE asset_id = $1
           AND user_employee_code = $2
           AND to_date IS NULL
           AND action_type = 'assigned'`,
        [assetId, prevEmployee],
      );

      // 4. Ghi asset_history record mới
      await client.query(
        `INSERT INTO asset_history
           (asset_id, user_employee_code, action_type, from_date, to_date, performed_by)
         VALUES ($1, $2, 'returned', NOW(), NOW(), $3)`,
        [assetId, prevEmployee, req.user.employee_code],
      );

      // 5. Sinh slip_number và tạo handover_slip return
      const returnSlipNumber = await generateSlipNumber();
      const { rows: returnSlipRows } = await client.query(
        `INSERT INTO handover_slips
           (slip_number, slip_date, from_employee_code, slip_type, issued_by, status, notes)
         VALUES ($1, CURRENT_DATE, $2, 'return', $3, 'generated', $4)
         RETURNING *`,
        [returnSlipNumber, prevEmployee, req.user.employee_code, notes || null],
      );
      const returnSlip = returnSlipRows[0];

      // 6. Tạo handover_slip_items
      await client.query(
        `INSERT INTO handover_slip_items
           (slip_id, asset_id, asset_code, product_name, model, serial_number)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          returnSlip.id,
          assetId,
          current[0].asset_code,
          current[0].product_name,
          current[0].model,
          current[0].serial_number,
        ],
      );

      await client.query("COMMIT");

      res.json({ success: true, data: { asset: rows[0] } });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assets/:id/images
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:id/images",
  authenticate,
  authorize("it_admin", "manager"),
  upload.array("images", 5),
  async (req, res, next) => {
    try {
      const assetId = req.params.id;

      const { rows: assetRows } = await pool.query(
        `SELECT id FROM assets WHERE id = $1`,
        [assetId],
      );
      if (assetRows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy tài sản" });
      }

      if (!req.files?.length) {
        return res.status(400).json({
          success: false,
          message: "Không có file nào được gửi lên",
        });
      }

      const uploadedImages = [];

      for (const file of req.files) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${assetId}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("asset-images")
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          return res.status(500).json({
            success: false,
            message: `Upload thất bại: ${uploadError.message}`,
          });
        }

        const { data: urlData } = supabase.storage
          .from("asset-images")
          .getPublicUrl(storagePath);

        const isPrimary = uploadedImages.length === 0;
        const { rows: imageRows } = await pool.query(
          `INSERT INTO asset_images
             (asset_id, file_name, file_url, file_type, file_size, is_primary, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            assetId,
            file.originalname,
            urlData.publicUrl,
            file.mimetype,
            file.size,
            isPrimary,
            req.user.employee_code,
          ],
        );

        uploadedImages.push({
          ...imageRows[0],
          image_url: imageRows[0].file_url,
        });
      }

      res.status(201).json({
        success: true,
        data: { images: uploadedImages },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/assets/:id/images/:imageId
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/:id/images/:imageId",
  authenticate,
  authorize("it_admin", "manager"),
  async (req, res, next) => {
    try {
      const { id: assetId, imageId } = req.params;

      const { rowCount } = await pool.query(
        `DELETE FROM asset_images WHERE id = $1 AND asset_id = $2`,
        [imageId, assetId],
      );

      if (rowCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy ảnh" });
      }

      res.json({ success: true, message: "Xóa ảnh thành công" });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
