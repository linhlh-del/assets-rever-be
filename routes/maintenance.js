import express from "express";
import pool from "../config/db.js";
import { maintenanceSchema } from "../validation/schemas.js";
import validate from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

const TICKET_SELECT = `
  SELECT t.*, a.asset_code, a.product_name, a.category,
         ru.full_name AS reported_by_name,
         tu.full_name AS technician_name
  FROM maintenance_tickets t
  JOIN assets a ON a.id = t.asset_id
  LEFT JOIN users ru ON ru.employee_code = t.reported_by
  LEFT JOIN users tu ON tu.employee_code = t.assigned_technician
`;

router.get("/", authenticate, async (req, res) => {
  try {
    let query = TICKET_SELECT;
    const params = [];
    if (req.user.role === "user") {
      params.push(req.user.employee_code);
      query += ` WHERE t.reported_by = $${params.length}`;
    }
    query += " ORDER BY t.created_at DESC";
    const { rows: tickets } = await pool.query(query, params);
    res.json({ success: true, data: { tickets } });
  } catch (error) {
    console.error("Maintenance tickets fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch maintenance tickets" });
  }
});

router.get("/:ticketId", authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { rows } = await pool.query(`${TICKET_SELECT} WHERE t.id = $1`, [
      ticketId,
    ]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Maintenance ticket not found" });
    }
    const ticket = rows[0];
    if (
      req.user.role === "user" &&
      ticket.reported_by !== req.user.employee_code
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    res.json({ success: true, data: { ticket } });
  } catch (error) {
    console.error("Maintenance ticket fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch maintenance ticket" });
  }
});

router.post(
  "/",
  authenticate,
  validate(maintenanceSchema),
  async (req, res) => {
    try {
      const { asset_id, issue_description, priority } = req.body;
      const { rows: numRows } = await pool.query(
        `SELECT generate_ticket_number() AS ticket_number`,
      );
      const ticketNumber = numRows[0].ticket_number;

      const { rows } = await pool.query(
        `INSERT INTO maintenance_tickets (ticket_number, asset_id, reported_by, issue_description, priority, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
        [
          ticketNumber,
          asset_id,
          req.user.employee_code,
          issue_description,
          priority || "medium",
        ],
      );
      res.status(201).json({
        success: true,
        message: "Maintenance ticket created successfully",
        data: { ticket: rows[0] },
      });
    } catch (error) {
      console.error("Maintenance ticket creation error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create maintenance ticket",
      });
    }
  },
);

router.put(
  "/:ticketId",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const {
        issue_description,
        priority,
        assigned_technician,
        solution,
        repair_cost,
        status,
      } = req.body;
      const { rows } = await pool.query(
        `UPDATE maintenance_tickets
       SET issue_description = COALESCE($1, issue_description),
           priority = COALESCE($2, priority),
           assigned_technician = COALESCE($3, assigned_technician),
           solution = COALESCE($4, solution),
           repair_cost = COALESCE($5, repair_cost),
           status = COALESCE($6, status)
       WHERE id = $7 RETURNING *`,
        [
          issue_description,
          priority,
          assigned_technician,
          solution,
          repair_cost,
          status,
          ticketId,
        ],
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Maintenance ticket not found" });
      }
      res.json({
        success: true,
        message: "Maintenance ticket updated successfully",
        data: { ticket: rows[0] },
      });
    } catch (error) {
      console.error("Maintenance ticket update error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update maintenance ticket",
      });
    }
  },
);

router.patch(
  "/:ticketId/status",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { status, assigned_technician, solution, repair_cost } = req.body;
      const isDone = status === "completed" || status === "cannot_fix";
      const resolvedAt = isDone ? new Date().toISOString() : null;
      const resolvedBy = isDone ? req.user.employee_code : null;

      const { rows } = await pool.query(
        `UPDATE maintenance_tickets
       SET status = $1,
           assigned_technician = COALESCE($2, assigned_technician),
           solution = COALESCE($3, solution),
           repair_cost = COALESCE($4, repair_cost),
           resolved_at = COALESCE($5, resolved_at),
           resolved_by = COALESCE($6, resolved_by)
       WHERE id = $7 RETURNING *`,
        [
          status,
          assigned_technician,
          solution,
          repair_cost,
          resolvedAt,
          resolvedBy,
          ticketId,
        ],
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Maintenance ticket not found" });
      }
      res.json({
        success: true,
        message: "Maintenance ticket status updated successfully",
        data: { ticket: rows[0] },
      });
    } catch (error) {
      console.error("Maintenance ticket status update error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update maintenance ticket status",
      });
    }
  },
);

router.delete(
  "/:ticketId",
  authenticate,
  authorize("admin_it"),
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { rowCount } = await pool.query(
        `DELETE FROM maintenance_tickets WHERE id = $1`,
        [ticketId],
      );
      if (rowCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Maintenance ticket not found" });
      }
      res.json({
        success: true,
        message: "Maintenance ticket deleted successfully",
      });
    } catch (error) {
      console.error("Maintenance ticket deletion error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete maintenance ticket",
      });
    }
  },
);

export default router;
