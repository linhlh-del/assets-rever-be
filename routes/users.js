import express from "express";
import supabase from "../config/supabase.js";
import { userSchema } from "../validation/schemas.js";
import validate from "../middleware/validate.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Get all users with filters and pagination
router.get(
  "/",
  authenticate,
  authorize("admin_it", "accountant"),
  async (req, res) => {
    try {
      const {
        search,
        department,
        role,
        status,
        page = 1,
        limit = 20,
      } = req.query;

      let query = supabase.from("users").select("*", { count: "exact" });

      // Apply filters
      if (search) {
        query = query.or(
          `employee_code.ilike.%${search}%,email.ilike.%${search}%,full_name.ilike.%${search}%`,
        );
      }

      if (department) {
        query = query.eq("department", department);
      }

      if (role) {
        query = query.eq("role", role);
      }

      if (status) {
        query = query.eq("status", status);
      }

      // Pagination
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data: users, error, count } = await query;

      if (error) {
        console.error("Users fetch error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch users",
        });
      }

      res.json({
        success: true,
        data: {
          users: users || [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit),
          },
        },
      });
    } catch (error) {
      console.error("Users route error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
);

// Get single user
router.get("/:employeeCode", authenticate, async (req, res) => {
  try {
    const { employeeCode } = req.params;

    // Users can only view their own profile unless they're admin
    if (
      req.user.role !== "admin_it" &&
      req.user.role !== "accountant" &&
      req.user.employee_code !== employeeCode
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("employee_code", employeeCode)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("User fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Create new user
router.post(
  "/",
  authenticate,
  authorize("admin_it"),
  validate(userSchema),
  async (req, res) => {
    try {
      const userData = req.body;

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .or(
          `email.eq.${userData.email},employee_code.eq.${userData.employee_code}`,
        )
        .single();

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User with this email or employee code already exists",
        });
      }

      const { data: user, error } = await supabase
        .from("users")
        .insert(userData)
        .select()
        .single();

      if (error) {
        console.error("User creation error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to create user",
        });
      }

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: { user },
      });
    } catch (error) {
      console.error("User creation error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
);

// Update user
router.put(
  "/:employeeCode",
  authenticate,
  validate(userSchema),
  async (req, res) => {
    try {
      const { employeeCode } = req.params;

      // Users can only update their own profile unless they're admin
      if (
        req.user.role !== "admin_it" &&
        req.user.employee_code !== employeeCode
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const updateData = {
        ...req.body,
        updated_at: new Date().toISOString(),
      };

      const { data: user, error } = await supabase
        .from("users")
        .update(updateData)
        .eq("employee_code", employeeCode)
        .select()
        .single();

      if (error) {
        console.error("User update error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update user",
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "User updated successfully",
        data: { user },
      });
    } catch (error) {
      console.error("User update error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
);

// Delete user (soft delete)
router.delete(
  "/:employeeCode",
  authenticate,
  authorize("admin_it"),
  async (req, res) => {
    try {
      const { employeeCode } = req.params;

      const { data: user, error } = await supabase
        .from("users")
        .update({
          status: "resigned",
          updated_at: new Date().toISOString(),
        })
        .eq("employee_code", employeeCode)
        .select()
        .single();

      if (error) {
        console.error("User deletion error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to delete user",
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      console.error("User deletion error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
);

// Get user's assigned assets
router.get("/:employeeCode/assets", authenticate, async (req, res) => {
  try {
    const { employeeCode } = req.params;

    // Users can only view their own assets unless they're admin
    if (
      req.user.role !== "admin_it" &&
      req.user.role !== "accountant" &&
      req.user.employee_code !== employeeCode
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { data: assets, error } = await supabase
      .from("assets")
      .select("*")
      .eq("current_user_employee_code", employeeCode)
      .eq("status", "in_use");

    if (error) {
      console.error("User assets fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch user assets",
      });
    }

    res.json({
      success: true,
      data: { assets: assets || [] },
    });
  } catch (error) {
    console.error("User assets route error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export default router;
