const express = require("express");
const supabase = require("../config/database");
const { maintenanceSchema } = require("../validation/schemas");
const validate = require("../middleware/validate");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// Get all maintenance tickets
router.get("/", authenticate, async (req, res) => {
  try {
    let query = supabase
      .from("maintenance_history")
      .select(
        `
        *,
        assets(asset_code, product_name),
        users!maintenance_history_reported_by_employee_code_fkey(full_name)
      `
      )
      .order("created_at", { ascending: false });

    // Regular users can only see their own reports
    if (req.user.role === "user") {
      query = query.eq("reported_by_employee_code", req.user.employee_code);
    }

    const { data: tickets, error } = await query;

    if (error) {
      console.error("Maintenance tickets fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch maintenance tickets",
      });
    }

    res.json({
      success: true,
      data: { tickets: tickets || [] },
    });
  } catch (error) {
    console.error("Maintenance route error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Create maintenance ticket
router.post(
  "/",
  authenticate,
  validate(maintenanceSchema),
  async (req, res) => {
    try {
      const ticketData = {
        ...req.body,
        status: "pending",
      };

      const { data: ticket, error } = await supabase
        .from("maintenance_history")
        .insert(ticketData)
        .select()
        .single();

      if (error) {
        console.error("Maintenance ticket creation error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to create maintenance ticket",
        });
      }

      res.status(201).json({
        success: true,
        message: "Maintenance ticket created successfully",
        data: { ticket },
      });
    } catch (error) {
      console.error("Maintenance ticket creation error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Update maintenance ticket
router.put(
  "/:ticketId",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const updateData = {
        ...req.body,
        updated_at: new Date().toISOString(),
      };

      const { data: ticket, error } = await supabase
        .from("maintenance_history")
        .update(updateData)
        .eq("id", ticketId)
        .select()
        .single();

      if (error) {
        console.error("Maintenance ticket update error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update maintenance ticket",
        });
      }

      res.json({
        success: true,
        message: "Maintenance ticket updated successfully",
        data: { ticket },
      });
    } catch (error) {
      console.error("Maintenance ticket update error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
); // ← THIẾU DÒNG NÀY

// Get single maintenance ticket
router.get("/:ticketId", authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const { data: ticket, error } = await supabase
      .from("maintenance_history")
      .select(
        `
        *,
        assets(asset_code, product_name, category),
        reported_by_user:users!maintenance_history_reported_by_employee_code_fkey(full_name, department),
        technician_user:users!maintenance_history_technician_employee_code_fkey(full_name)
      `
      )
      .eq("id", ticketId)
      .single();

    if (error) {
      console.error("Maintenance ticket fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch maintenance ticket",
      });
    }

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Maintenance ticket not found",
      });
    }

    // Regular users can only see their own reports
    if (
      req.user.role === "user" &&
      ticket.reported_by_employee_code !== req.user.employee_code
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: { ticket },
    });
  } catch (error) {
    console.error("Maintenance ticket route error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Update maintenance ticket status only
router.patch(
  "/:ticketId/status",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { status, technician_employee_code, solution, cost } = req.body;

      const updateData = {
        status,
        technician_employee_code,
        solution,
        cost,
        updated_at: new Date().toISOString(),
      };

      const { data: ticket, error } = await supabase
        .from("maintenance_history")
        .update(updateData)
        .eq("id", ticketId)
        .select()
        .single();

      if (error) {
        console.error("Maintenance ticket status update error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update maintenance ticket status",
        });
      }

      res.json({
        success: true,
        message: "Maintenance ticket status updated successfully",
        data: { ticket },
      });
    } catch (error) {
      console.error("Maintenance ticket status update error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Delete maintenance ticket
router.delete(
  "/:ticketId",
  authenticate,
  authorize("admin_it"),
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { error } = await supabase
        .from("maintenance_history")
        .delete()
        .eq("id", ticketId);

      if (error) {
        console.error("Maintenance ticket deletion error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to delete maintenance ticket",
        });
      }

      res.json({
        success: true,
        message: "Maintenance ticket deleted successfully",
      });
    } catch (error) {
      console.error("Maintenance ticket deletion error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

module.exports = router;
