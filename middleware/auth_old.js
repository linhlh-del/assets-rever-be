const jwt = require("jsonwebtoken");
const supabase = require("../config/database");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    console.log("🔐 Auth check:", {
      hasHeader: !!authHeader,
      path: req.path,
      method: req.method,
    });

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("❌ No bearer token");
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const token = authHeader.substring(7);
    console.log("🔍 Verifying token...");

    // Verify token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) {
      console.error("❌ Token verification failed:", error.message);
      return res.status(401).json({
        success: false,
        message: `Invalid token: ${error.message}`,
      });
    }

    if (!user) {
      console.error("❌ No user from token");
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token.",
      });
    }

    console.log("✅ Token valid for:", user.email);

    // Get user details from database
    const { data: userData, error: dbError } = await supabase
      .from("users")
      .select("employee_code, role, full_name, department")
      .eq("email", user.email)
      .maybeSingle();

    if (dbError) {
      console.error("❌ DB error:", dbError);
      return res.status(500).json({
        success: false,
        message: "Database error.",
      });
    }

    if (!userData) {
      console.error("❌ User not in DB:", user.email);
      return res.status(401).json({
        success: false,
        message: "User not found in database.",
      });
    }

    console.log("✅ User authenticated:", userData.role);

    req.user = {
      id: user.id,
      email: user.email,
      employee_code: userData.employee_code,
      role: userData.role,
      full_name: userData.full_name,
      department: userData.department,
    };

    next();
  } catch (error) {
    console.error("❌ Auth middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication failed.",
    });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      console.warn(`⚠️  Access denied for role: ${req.user.role}`);
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
      });
    }

    next();
  };
};
module.exports = { authenticate, authorize };
