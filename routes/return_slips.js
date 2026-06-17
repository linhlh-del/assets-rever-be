const express = require("express");
const supabase = require("../config/database");
const { returnSlipSchema } = require("../validation/schemas");
const validate = require("../middleware/validate");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// Get all return slips with filters and pagination
router.get("/", authenticate, async (req, res) => {
  try {
    const {
      search,
      employee_code,
      asset_code,
      page = 1,
      limit = 20,
    } = req.query;

    let query = supabase
      .from("return_slips")
      .select(
        `
        *,
        assets(asset_code, product_name),
        users!return_slips_employee_code_fkey(full_name, department),
        received_by_user:users!return_slips_received_by_fkey(full_name)
      `
      )
      .order("created_at", { ascending: false });

    // Apply filters
    if (search) {
      query = query.or(
        `slip_number.ilike.%${search}%,notes.ilike.%${search}%,condition.ilike.%${search}%`
      );
    }

    if (employee_code) {
      query = query.eq("employee_code", employee_code);
    }

    if (asset_code) {
      query = query.eq("assets.asset_code", asset_code);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: slips, error, count } = await query;

    if (error) {
      console.error("Return slips fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch return slips",
      });
    }

    res.json({
      success: true,
      data: {
        slips: slips || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error("Return slips route error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get single return slip
router.get("/:slipNumber", authenticate, async (req, res) => {
  try {
    const { slipNumber } = req.params;

    const { data: slip, error } = await supabase
      .from("return_slips")
      .select(
        `
        *,
        assets(asset_code, product_name, category, model, serial_number),
        users!return_slips_employee_code_fkey(full_name, department, email),
        received_by_user:users!return_slips_received_by_fkey(full_name)
      `
      )
      .eq("slip_number", slipNumber)
      .single();

    if (error) {
      console.error("Return slip fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch return slip",
      });
    }

    if (!slip) {
      return res.status(404).json({
        success: false,
        message: "Return slip not found",
      });
    }

    res.json({
      success: true,
      data: { slip },
    });
  } catch (error) {
    console.error("Return slip route error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Create return slip
router.post(
  "/",
  authenticate,
  authorize("admin_it", "accountant"),
  validate(returnSlipSchema),
  async (req, res) => {
    try {
      const slipData = {
        ...req.body,
        received_by: req.user.employee_code,
      };

      const { data: slip, error } = await supabase
        .from("return_slips")
        .insert(slipData)
        .select()
        .single();

      if (error) {
        console.error("Return slip creation error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to create return slip",
        });
      }

      res.status(201).json({
        success: true,
        message: "Return slip created successfully",
        data: { slip },
      });
    } catch (error) {
      console.error("Return slip creation error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Update return slip
router.put(
  "/:slipNumber",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res) => {
    try {
      const { slipNumber } = req.params;
      const updateData = {
        ...req.body,
        updated_at: new Date().toISOString(),
      };

      const { data: slip, error } = await supabase
        .from("return_slips")
        .update(updateData)
        .eq("slip_number", slipNumber)
        .select()
        .single();

      if (error) {
        console.error("Return slip update error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update return slip",
        });
      }

      res.json({
        success: true,
        message: "Return slip updated successfully",
        data: { slip },
      });
    } catch (error) {
      console.error("Return slip update error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Delete return slip
router.delete(
  "/:slipNumber",
  authenticate,
  authorize("admin_it"),
  async (req, res) => {
    try {
      const { slipNumber } = req.params;

      const { error } = await supabase
        .from("return_slips")
        .delete()
        .eq("slip_number", slipNumber);

      if (error) {
        console.error("Return slip deletion error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to delete return slip",
        });
      }

      res.json({
        success: true,
        message: "Return slip deleted successfully",
      });
    } catch (error) {
      console.error("Return slip deletion error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

module.exports = router;
