const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("../config/database");
const { loginSchema, registerSchema } = require("../validation/schemas");
const validate = require("../middleware/validate");

const router = express.Router();

// Login
router.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Get user from database
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      // TEMPORARY: Auto-create user if not exists
      console.log("User not found, creating temporary user...");
      const tempUser = {
        employee_code: email === "admin@rever.vn" ? "RV001" : "TEMP001",
        email: email,
        full_name: "Temporary User",
        department: "IT",
        role: "admin_it",
        status: "active",
      };

      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert([tempUser])
        .select()
        .single();

      if (createError) {
        console.error("Failed to create temp user:", createError);
        return res.status(500).json({
          success: false,
          message: "Failed to create user",
        });
      }

      console.log("Created temp user:", newUser);
      // Use the newly created user
      user = newUser;
    }

    // For now, we'll use a simple password check
    // In production, you should hash passwords
    if (password !== "password123") {
      // Temporary password for demo
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE },
    );

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          employee_code: user.employee_code,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          department: user.department,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Register (Admin only)
router.post("/register", validate(registerSchema), async (req, res) => {
  try {
    const { employee_code, email, password, full_name, role } = req.body;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .or(`email.eq.${email},employee_code.eq.${employee_code}`)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email or employee code already exists",
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const { data: newUser, error } = await supabase
      .from("users")
      .insert({
        employee_code,
        email,
        full_name,
        role: role || "user",
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("Registration error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create user",
      });
    }

    // Generate token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE },
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: newUser.id,
          employee_code: newUser.employee_code,
          email: newUser.email,
          full_name: newUser.full_name,
          role: newUser.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get current user profile
router.get(
  "/profile",
  require("../middleware/auth").authenticate,
  async (req, res) => {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          employee_code: req.user.employee_code,
          email: req.user.email,
          full_name: req.user.full_name,
          role: req.user.role,
          department: req.user.department,
          team: req.user.team,
          location: req.user.location,
        },
      },
    });
  },
);

module.exports = router;
