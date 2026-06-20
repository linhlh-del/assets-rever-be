import express from "express";
import pool from "../config/db.js";
import { handoverSchema, returnSchema } from "../validation/schemas.js";
import validate from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

const SLIP_SELECT = `
  SELECT hs.*,
         fu.full_name AS from_user_name,
         tu.full_name AS to_user_name,
         iu.full_name AS issued_by_name,
         json_agg(
           json_build_object(
             'asset_id',    hsi.asset_id,
             'asset_code',  a.asset_code,
             'product_name', a.product_name,
             'category',    a.category,
             'serial_number', a.serial_number
           )
         ) AS items
  FROM handover_slips hs
  LEFT JOIN users fu  ON fu.employee_code  = hs.from_employee_code
  LEFT JOIN users tu  ON tu.employee_code  = hs.to_employee_code
  LEFT JOIN users iu  ON iu.employee_code  = hs.issued_by
  LEFT JOIN handover_slip_items hsi ON hsi.slip_id = hs.id
  LEFT JOIN assets a  ON a.id = hsi.asset_id
`;

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

// GET /api/handover
router.get(
  "/",
  authenticate,
  authorize("it_admin", "manager"),
  async (req, res) => {
    try {
      const { slip_type, status, page = 1, limit = 20 } = req.query;

      const conditions = [];
      const params = [];

      if (slip_type) {
        params.push(slip_type);
        conditions.push(`hs.slip_type = $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`hs.status = $${params.length}`);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) FROM handover_slips hs ${where}`,
        params,
      );
      const total = parseInt(countRows[0].count);

      const pageNum = Math.max(1, parseInt(page));
      const pageSize = Math.min(100, parseInt(limit));
      const offset = (pageNum - 1) * pageSize;

      params.push(pageSize, offset);
      const { rows: slips } = await pool.query(
        `${SLIP_SELECT}
       ${where}
       GROUP BY hs.id, fu.full_name, tu.full_name, iu.full_name
       ORDER BY hs.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      res.json({
        success: true,
        data: {
          slips,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total,
            pages: Math.ceil(total / pageSize),
          },
        },
      });
    } catch (error) {
      console.error("Handover fetch error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch handover slips" });
    }
  },
);

// GET /api/handover/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${SLIP_SELECT}
       WHERE hs.id = $1
       GROUP BY hs.id, fu.full_name, tu.full_name, iu.full_name`,
      [req.params.id],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Handover slip not found" });
    }

    res.json({ success: true, data: { slip: rows[0] } });
  } catch (error) {
    console.error("Handover fetch error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/handover — cấp phát tài sản cho nhân viên
router.post(
  "/",
  authenticate,
  authorize("it_admin", "manager"),
  validate(handoverSchema),
  async (req, res) => {
    const client = await pool.connect(); // transaction
    try {
      await client.query("BEGIN");

      const { to_employee_code, asset_ids, notes } = req.body;

      // 1. Kiểm tra tất cả asset phải available
      const { rows: assets } = await client.query(
        `SELECT id, asset_code, status
         FROM assets
         WHERE id = ANY($1::uuid[])`,
        [asset_ids],
      );

      const notAvailable = assets.filter((a) => a.status !== "available");
      if (notAvailable.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Một số tài sản không ở trạng thái available",
          data: { assets: notAvailable.map((a) => a.asset_code) },
        });
      }

      // 2. Sinh slip_number và tạo handover_slip
      const slipNumber = await generateSlipNumber();
      const { rows: slipRows } = await client.query(
        `INSERT INTO handover_slips
           (slip_number, slip_date, slip_type, to_employee_code, issued_by, notes, status)
         VALUES ($1, CURRENT_DATE, 'handover', $2, $3, $4, 'generated')
         RETURNING *`,
        [slipNumber, to_employee_code, req.user.employee_code, notes || null],
      );
      const slip = slipRows[0];

      // 3. Insert handover_slip_items + update assets + ghi asset_history
      for (const assetId of asset_ids) {
        // Lấy asset_code
        const { rows: assetInfo } = await client.query(
          `SELECT asset_code, product_name, model, serial_number FROM assets WHERE id = $1`,
          [assetId],
        );

        // slip items
        await client.query(
          `INSERT INTO handover_slip_items (slip_id, asset_id, asset_code, product_name, model, serial_number)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            slip.id,
            assetId,
            assetInfo[0]?.asset_code,
            assetInfo[0]?.product_name,
            assetInfo[0]?.model,
            assetInfo[0]?.serial_number,
          ],
        );

        // update asset status
        await client.query(
          `UPDATE assets
           SET status = 'in_use',
               current_user_employee_code = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [to_employee_code, assetId],
        );

        // ghi asset_history
        await client.query(
          `INSERT INTO asset_history
             (asset_id, user_employee_code, action_type, from_date, handover_slip_id, performed_by)
           VALUES ($1, $2, 'assigned', CURRENT_DATE, $3, $4)`,
          [assetId, to_employee_code, slip.id, req.user.employee_code],
        );
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Handover slip created successfully",
        data: { slip },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Handover creation error:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    } finally {
      client.release();
    }
  },
);

// POST /api/handover/return — thu hồi tài sản
router.post(
  "/return",
  authenticate,
  authorize("it_admin", "manager"),
  validate(returnSchema),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { asset_ids, notes } = req.body;

      // 1. Lấy thông tin assets hiện tại
      const { rows: assets } = await client.query(
        `SELECT id, asset_code, status, current_user_employee_code
         FROM assets
         WHERE id = ANY($1::uuid[])`,
        [asset_ids],
      );

      const notInUse = assets.filter((a) => a.status !== "in_use");
      if (notInUse.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Một số tài sản không ở trạng thái in_use",
          data: { assets: notInUse.map((a) => a.asset_code) },
        });
      }

      // Lấy employee hiện tại (giả sử tất cả cùng 1 người — lấy từ asset đầu tiên)
      const fromEmployee = assets[0].current_user_employee_code;

      // 2. Sinh slip_number và tạo return slip
      const slipNumber = await generateSlipNumber();
      const { rows: slipRows } = await client.query(
        `INSERT INTO handover_slips
           (slip_number, slip_date, slip_type, from_employee_code, issued_by, notes, status)
         VALUES ($1, CURRENT_DATE, 'return', $2, $3, $4, 'generated')
         RETURNING *`,
        [slipNumber, fromEmployee, req.user.employee_code, notes || null],
      );
      const slip = slipRows[0];

      // 3. Insert items + update assets + ghi history
      for (const asset of assets) {
        await client.query(
          `INSERT INTO handover_slip_items (slip_id, asset_id, asset_code, product_name, model, serial_number)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            slip.id,
            asset.id,
            asset.asset_code,
            asset.product_name,
            asset.model,
            asset.serial_number,
          ],
        );

        await client.query(
          `UPDATE assets
           SET status = 'available',
               current_user_employee_code = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [asset.id],
        );

        // Đóng asset_history record cũ (set to_date)
        await client.query(
          `UPDATE asset_history
           SET to_date = CURRENT_DATE
           WHERE asset_id = $1
             AND user_employee_code = $2
             AND action_type = 'assigned'
             AND to_date IS NULL`,
          [asset.id, asset.current_user_employee_code],
        );

        // Ghi record returned mới
        await client.query(
          `INSERT INTO asset_history
             (asset_id, user_employee_code, action_type, from_date, handover_slip_id, performed_by)
           VALUES ($1, $2, 'returned', CURRENT_DATE, $3, $4)`,
          [
            asset.id,
            asset.current_user_employee_code,
            slip.id,
            req.user.employee_code,
          ],
        );
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Return slip created successfully",
        data: { slip },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Return creation error:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    } finally {
      client.release();
    }
  },
);

// PATCH /api/handover/:id/status — cập nhật trạng thái phiếu
router.patch(
  "/:id/status",
  authenticate,
  authorize("it_admin"),
  async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ["draft", "generated", "signed"];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Status phải là: ${validStatuses.join(", ")}`,
        });
      }

      const { rows } = await pool.query(
        `UPDATE handover_slips SET status = $1 WHERE id = $2 RETURNING *`,
        [status, req.params.id],
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Slip not found" });
      }

      res.json({ success: true, data: { slip: rows[0] } });
    } catch (error) {
      console.error("Handover status update error:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  },
);

export default router;
