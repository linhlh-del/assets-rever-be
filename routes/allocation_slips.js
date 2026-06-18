import express from "express";
import supabase from "../config/supabase.js";
import { allocationSlipSchema } from "../validation/schemas.js";
import validate from "../middleware/validate.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Get all allocation slips with filters and pagination
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
      .from("allocation_slips")
      .select(
        `
        *,
        assets(asset_code, product_name),
        users!allocation_slips_employee_code_fkey(full_name, department),
        issued_by_user:users!allocation_slips_issued_by_fkey(full_name)
      `,
      )
      .order("created_at", { ascending: false });

    // Apply filters
    if (search) {
      query = query.or(`slip_number.ilike.%${search}%,notes.ilike.%${search}%`);
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
      console.error("Allocation slips fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch allocation slips",
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
    console.error("Allocation slips route error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get single allocation slip
router.get("/:slipNumber", authenticate, async (req, res) => {
  try {
    const { slipNumber } = req.params;

    const { data: slip, error } = await supabase
      .from("allocation_slips")
      .select(
        `
        *,
        assets(asset_code, product_name, category, model, serial_number),
        users!allocation_slips_employee_code_fkey(full_name, department, email),
        issued_by_user:users!allocation_slips_issued_by_fkey(full_name)
      `,
      )
      .eq("slip_number", slipNumber)
      .single();

    if (error) {
      console.error("Allocation slip fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch allocation slip",
      });
    }

    if (!slip) {
      return res.status(404).json({
        success: false,
        message: "Allocation slip not found",
      });
    }

    res.json({
      success: true,
      data: { slip },
    });
  } catch (error) {
    console.error("Allocation slip route error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Create allocation slip
router.post(
  "/",
  authenticate,
  authorize("admin_it", "accountant"),
  validate(allocationSlipSchema),
  async (req, res) => {
    try {
      const slipData = {
        ...req.body,
        issued_by: req.user.employee_code,
      };

      const { data: slip, error } = await supabase
        .from("allocation_slips")
        .insert(slipData)
        .select()
        .single();

      if (error) {
        console.error("Allocation slip creation error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to create allocation slip",
        });
      }

      res.status(201).json({
        success: true,
        message: "Allocation slip created successfully",
        data: { slip },
      });
    } catch (error) {
      console.error("Allocation slip creation error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
);

// Update allocation slip
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
        .from("allocation_slips")
        .update(updateData)
        .eq("slip_number", slipNumber)
        .select()
        .single();

      if (error) {
        console.error("Allocation slip update error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update allocation slip",
        });
      }

      res.json({
        success: true,
        message: "Allocation slip updated successfully",
        data: { slip },
      });
    } catch (error) {
      console.error("Allocation slip update error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
);

// Delete allocation slip
router.delete(
  "/:slipNumber",
  authenticate,
  authorize("admin_it"),
  async (req, res) => {
    try {
      const { slipNumber } = req.params;

      const { error } = await supabase
        .from("allocation_slips")
        .delete()
        .eq("slip_number", slipNumber);

      if (error) {
        console.error("Allocation slip deletion error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to delete allocation slip",
        });
      }

      res.json({
        success: true,
        message: "Allocation slip deleted successfully",
      });
    } catch (error) {
      console.error("Allocation slip deletion error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
);

export default router;
