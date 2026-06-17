const express = require("express");
const supabase = require("../config/database");
const { invoiceSchema } = require("../validation/schemas");
const validate = require("../middleware/validate");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// Get all invoices
router.get("/", authenticate, async (req, res) => {
  try {
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Invoices fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch invoices",
      });
    }

    res.json({
      success: true,
      data: { invoices: invoices || [] },
    });
  } catch (error) {
    console.error("Invoices route error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get single invoice
router.get("/:invoiceNumber", authenticate, async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(
        `
        *,
        users!invoices_created_by_fkey(full_name)
      `
      )
      .eq("invoice_number", invoiceNumber)
      .single();

    if (error) {
      console.error("Invoice fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch invoice",
      });
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    res.json({
      success: true,
      data: { invoice },
    });
  } catch (error) {
    console.error("Invoice route error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Create invoice
router.post(
  "/",
  authenticate,
  authorize("admin_it", "accountant"),
  validate(invoiceSchema),
  async (req, res) => {
    try {
      const invoiceData = {
        ...req.body,
        created_by: req.user.employee_code,
      };

      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert(invoiceData)
        .select()
        .single();

      if (error) {
        console.error("Invoice creation error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to create invoice",
        });
      }

      res.status(201).json({
        success: true,
        message: "Invoice created successfully",
        data: { invoice },
      });
    } catch (error) {
      console.error("Invoice creation error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Update invoice
router.put(
  "/:invoiceNumber",
  authenticate,
  authorize("admin_it", "accountant"),
  validate(invoiceSchema),
  async (req, res) => {
    try {
      const { invoiceNumber } = req.params;
      const updateData = {
        ...req.body,
        updated_at: new Date().toISOString(),
      };

      const { data: invoice, error } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("invoice_number", invoiceNumber)
        .select()
        .single();

      if (error) {
        console.error("Invoice update error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update invoice",
        });
      }

      res.json({
        success: true,
        message: "Invoice updated successfully",
        data: { invoice },
      });
    } catch (error) {
      console.error("Invoice update error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Delete invoice
router.delete(
  "/:invoiceNumber",
  authenticate,
  authorize("admin_it"),
  async (req, res) => {
    try {
      const { invoiceNumber } = req.params;

      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("invoice_number", invoiceNumber);

      if (error) {
        console.error("Invoice deletion error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to delete invoice",
        });
      }

      res.json({
        success: true,
        message: "Invoice deleted successfully",
      });
    } catch (error) {
      console.error("Invoice deletion error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

module.exports = router;
