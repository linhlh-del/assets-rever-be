import express from "express";
import pool from "../config/db.js";
import { handoverSchema, returnSchema } from "../validation/schemas.js";
import validate from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";
import { sendHandoverEmail } from "../lib/email.js";
import supabase from "../config/supabase.js";
import multer from "multer";
import { generateSlipNumber } from "../utils/generateSlipNumber.js";

const uploadSlip = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    allowed.has(file.mimetype)
      ? cb(null, true)
      : cb(
          new Error(
            "Dinh dang khong ho tro. Chi chap nhan PNG, JPG, WEBP, PDF, DOC, DOCX.",
          ),
        );
  },
});

const router = express.Router();

const SLIP_SELECT = `
  SELECT hs.*,
         fu.full_name AS from_user_name,
         tu.full_name AS to_user_name,
         iu.full_name AS issued_by_name,
         json_agg(
           json_build_object(
             'asset_id',     hsi.asset_id,
             'asset_code',   a.asset_code,
             'product_name', a.product_name,
             'category',     a.category,
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

// async function generateSlipNumber() {
//   const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
//   const { rows } = await pool.query(
//     `SELECT COUNT(*) as count FROM handover_slips
//      WHERE DATE(created_at) = CURRENT_DATE`,
//   );
//   const count = parseInt(rows[0].count) + 1;
//   const seq = String(count).padStart(4, "0");
//   return `HND-${today}-${seq}`;
// }

// ─── GET /api/handover ────────────────────────────────────────────────────────
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

// ─── GET /api/handover/template ──────────────────────────────────────────────
// PHẢI đứng TRƯỚC /:id — Express match từ trên xuống,
// nếu /:id đứng trước thì "template" bị hiểu là một UUID → Postgres crash
router.get("/template", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.storage
      .from("handover-templates")
      .createSignedUrl("BBBG_TB_CNTT_TEMPLATE.docx", 3600);

    if (error) {
      console.error("Template signed URL error:", error);
      return res.status(404).json({
        success: false,
        message: "File mẫu chưa được upload. Vui lòng liên hệ IT Admin.",
      });
    }

    res.json({ success: true, data: { url: data.signedUrl } });
  } catch (error) {
    console.error("Template fetch error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── POST /api/handover ───────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  authorize("it_admin", "manager"),
  validate(handoverSchema),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { to_employee_code, asset_ids, notes } = req.body;

      const { rows: assets } = await client.query(
        `SELECT id, asset_code, status FROM assets WHERE id = ANY($1::uuid[])`,
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

      const slipNumber = await generateSlipNumber(client);
      const { rows: slipRows } = await client.query(
        `INSERT INTO handover_slips
           (slip_number, slip_date, slip_type, to_employee_code, issued_by, notes, status)
         VALUES ($1, CURRENT_DATE, 'handover', $2, $3, $4, 'generated')
         RETURNING *`,
        [slipNumber, to_employee_code, req.user.employee_code, notes ?? null],
      );
      const slip = slipRows[0];

      for (const assetId of asset_ids) {
        const { rows: assetInfo } = await client.query(
          `SELECT asset_code, product_name, model, serial_number FROM assets WHERE id = $1`,
          [assetId],
        );

        await client.query(
          `INSERT INTO handover_slip_items
             (slip_id, asset_id, asset_code, product_name, model, serial_number)
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

        await client.query(
          `UPDATE assets
           SET status = 'in_use',
               current_user_employee_code = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [to_employee_code, assetId],
        );

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

// ─── POST /api/handover/return ────────────────────────────────────────────────
// Cũng PHẢI đứng trước /:id vì "return" là literal path
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

      // FIX: query đủ fields cần dùng trong loop bên dưới
      const { rows: assets } = await client.query(
        `SELECT id, asset_code, product_name, model, serial_number,
                status, current_user_employee_code
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

      const fromEmployee = assets[0].current_user_employee_code;

      const slipNumber = await generateSlipNumber(client);
      const { rows: slipRows } = await client.query(
        `INSERT INTO handover_slips
           (slip_number, slip_date, slip_type, from_employee_code, issued_by, notes, status)
         VALUES ($1, CURRENT_DATE, 'return', $2, $3, $4, 'generated')
         RETURNING *`,
        [slipNumber, fromEmployee, req.user.employee_code, notes ?? null],
      );
      const slip = slipRows[0];

      for (const asset of assets) {
        await client.query(
          `INSERT INTO handover_slip_items
             (slip_id, asset_id, asset_code, product_name, model, serial_number)
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

        await client.query(
          `UPDATE asset_history
           SET to_date = CURRENT_DATE
           WHERE asset_id = $1
             AND user_employee_code = $2
             AND action_type = 'assigned'
             AND to_date IS NULL`,
          [asset.id, asset.current_user_employee_code],
        );

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

// ─── GET /api/handover/:id ────────────────────────────────────────────────────
// Đứng SAU tất cả static routes (/template, /return)
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

// ─── PATCH /api/handover/:id/status ──────────────────────────────────────────
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

// ─── GET /api/handover/:id/files ─────────────────────────────────────────────
router.get("/:id/files", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slip_id, file_name, file_url, file_type,
              file_size, file_kind, created_at
       FROM handover_slip_files
       WHERE slip_id = $1
       ORDER BY created_at DESC`,
      [req.params.id],
    );

    res.json({ success: true, data: { files: rows } });
  } catch (error) {
    console.error("Slip files fetch error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── POST /api/handover/:id/files ─────────────────────────────────────────────
router.post(
  "/:id/files",
  authenticate,
  uploadSlip.single("file"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Verify slip exists
      const { rows: slipCheck } = await pool.query(
        `SELECT id FROM handover_slips WHERE id = $1`,
        [id],
      );
      if (slipCheck.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Slip not found" });
      }

      if (!req.file && !req.body.file_url) {
        return res
          .status(400)
          .json({ success: false, message: "Không có file được gửi lên" });
      }

      const file_kind = req.body.file_kind || "signed_slip";
      const validKinds = ["signed_slip", "attachment"];
      if (!validKinds.includes(file_kind)) {
        return res.status(400).json({
          success: false,
          message: `file_kind phải là: ${validKinds.join(", ")}`,
        });
      }

      let fileUrl, fileName, fileType, fileSize;

      if (req.file) {
        // multer upload → Supabase Storage
        const ext = req.file.originalname.split(".").pop();
        const storagePath = `handover-slips/${id}/${Date.now()}-${req.file.originalname}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("handover-files")
          .upload(storagePath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.error("Supabase upload error:", uploadError);
          return res
            .status(500)
            .json({ success: false, message: "Upload file thất bại" });
        }

        const { data: urlData } = supabase.storage
          .from("handover-files")
          .getPublicUrl(storagePath);

        fileUrl = urlData.publicUrl;
        fileName = req.file.originalname;
        fileType = req.file.mimetype;
        fileSize = req.file.size;
      } else {
        // Direct URL (fallback nếu FE gửi URL)
        fileUrl = req.body.file_url;
        fileName = req.body.file_name || "file";
        fileType = req.body.file_type || "application/octet-stream";
        fileSize = req.body.file_size || null;
      }

      const { rows } = await pool.query(
        `INSERT INTO handover_slip_files
         (slip_id, file_name, file_url, file_type, file_size, file_kind, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
        [
          id,
          fileName,
          fileUrl,
          fileType,
          fileSize,
          file_kind,
          req.user.employee_code,
        ],
      );

      res.status(201).json({ success: true, data: { file: rows[0] } });
    } catch (error) {
      console.error("Slip file upload error:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  },
);

// ─── DELETE /api/handover/:id/files/:fileId ───────────────────────────────────
router.delete(
  "/:id/files/:fileId",
  authenticate,
  authorize("it_admin", "manager"),
  async (req, res) => {
    try {
      const { id, fileId } = req.params;

      const { rows } = await pool.query(
        `DELETE FROM handover_slip_files
       WHERE id = $1 AND slip_id = $2
       RETURNING file_url`,
        [fileId, id],
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "File not found" });
      }

      // Xóa khỏi Supabase Storage nếu là URL của bucket
      const fileUrl = rows[0].file_url;
      if (fileUrl && fileUrl.includes("handover-files")) {
        const storagePath = fileUrl.split("/handover-files/")[1];
        if (storagePath) {
          await supabase.storage.from("handover-files").remove([storagePath]);
        }
      }

      res.json({ success: true, message: "File đã được xóa" });
    } catch (error) {
      console.error("Slip file delete error:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  },
);

// ─── POST /api/handover/:id/send-email ───────────────────────────────────────
router.post(
  "/:id/send-email",
  authenticate,
  authorize("it_admin", "manager"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { rows: slipRows } = await pool.query(
        `${SLIP_SELECT}
         WHERE hs.id = $1
         GROUP BY hs.id, fu.full_name, tu.full_name, iu.full_name`,
        [id],
      );

      if (slipRows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Slip not found" });
      }

      const slip = slipRows[0];

      if (slip.slip_type !== "handover") {
        return res.status(400).json({
          success: false,
          message: "Chỉ gửi email cho phiếu bàn giao (slip_type = handover)",
        });
      }

      const { rows: userRows } = await pool.query(
        `SELECT email, full_name FROM users WHERE employee_code = $1`,
        [slip.to_employee_code],
      );

      if (userRows.length === 0 || !userRows[0].email) {
        return res.status(400).json({
          success: false,
          message: `Không tìm thấy email của nhân viên ${slip.to_employee_code}.`,
        });
      }

      const toEmail = userRows[0].email;

      const { rows: fileRows } = await pool.query(
        `SELECT file_url, file_name
         FROM handover_slip_files
         WHERE slip_id = $1 AND file_kind = 'signed_slip'
         ORDER BY created_at DESC
         LIMIT 1`,
        [id],
      );

      const attachmentUrl = fileRows[0]?.file_url || null;

      await sendHandoverEmail({ slip, toEmail, attachmentUrl });

      await pool.query(
        `UPDATE handover_slips
         SET email_sent_at = NOW(),
             email_sent_to = $1
         WHERE id = $2`,
        [toEmail, id],
      );

      res.json({
        success: true,
        message: `Email đã gửi thành công đến ${toEmail}`,
        data: { sent_to: toEmail, has_attachment: attachmentUrl !== null },
      });
    } catch (error) {
      console.error("Send email error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  },
);

export default router;
