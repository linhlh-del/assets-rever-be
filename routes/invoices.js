import express from "express";
import pool from "../config/db.js";
import { invoiceSchema } from "../validation/schemas.js";
import validate from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const conditions = [];
    const params = [];

    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(i.invoice_number ILIKE $${idx} OR i.supplier ILIKE $${idx})`,
      );
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // Count
    const {
      rows: [{ count }],
    } = await pool.query(
      `SELECT COUNT(*) FROM invoices i ${where}`,
      params,
    );

    // Data with pagination
    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    params.push(pageSize, (pageNum - 1) * pageSize);

    const { rows: invoices } = await pool.query(
      `SELECT i.*, u.full_name AS created_by_name
       FROM invoices i
       LEFT JOIN users u ON u.employee_code = i.created_by
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          total: parseInt(count),
          page: pageNum,
          limit: pageSize,
        },
      },
    });
  } catch (error) {
    console.error("Invoices fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch invoices" });
  }
});

router.get("/:invoiceNumber", authenticate, async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { rows } = await pool.query(
      `SELECT i.*, u.full_name AS created_by_name
       FROM invoices i
       LEFT JOIN users u ON u.employee_code = i.created_by
       WHERE i.invoice_number = $1`,
      [invoiceNumber],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Invoice not found" });
    }
    res.json({ success: true, data: { invoice: rows[0] } });
  } catch (error) {
    console.error("Invoice fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch invoice" });
  }
});

router.post(
  "/",
  authenticate,
  authorize("it_admin", "manager"),
  validate(invoiceSchema),
  async (req, res) => {
    try {
      const {
        invoice_number,
        invoice_date,
        supplier,
        total_amount,
        description,
      } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO invoices (invoice_number, invoice_date, supplier, total_amount, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          invoice_number,
          invoice_date,
          supplier,
          total_amount,
          description,
          req.user.employee_code,
        ],
      );
      res.status(201).json({
        success: true,
        message: "Invoice created successfully",
        data: { invoice: rows[0] },
      });
    } catch (error) {
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ success: false, message: "Invoice number already exists" });
      }
      console.error("Invoice creation error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to create invoice" });
    }
  },
);

router.put(
  "/:invoiceNumber",
  authenticate,
  authorize("it_admin", "manager"),
  validate(invoiceSchema),
  async (req, res) => {
    try {
      const { invoiceNumber } = req.params;
      const { invoice_date, supplier, total_amount, description } = req.body;
      const { rows } = await pool.query(
        `UPDATE invoices SET invoice_date = $1, supplier = $2, total_amount = $3, description = $4
         WHERE invoice_number = $5 RETURNING *`,
        [invoice_date, supplier, total_amount, description, invoiceNumber],
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Invoice not found" });
      }
      res.json({
        success: true,
        message: "Invoice updated successfully",
        data: { invoice: rows[0] },
      });
    } catch (error) {
      console.error("Invoice update error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to update invoice" });
    }
  },
);

router.delete(
  "/:invoiceNumber",
  authenticate,
  authorize("it_admin"),
  async (req, res) => {
    try {
      const { invoiceNumber } = req.params;
      const { rowCount } = await pool.query(
        `DELETE FROM invoices WHERE invoice_number = $1`,
        [invoiceNumber],
      );
      if (rowCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Invoice not found" });
      }
      res.json({ success: true, message: "Invoice deleted successfully" });
    } catch (error) {
      console.error("Invoice deletion error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to delete invoice" });
    }
  },
);

export default router;
