export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: `Yêu cầu role: ${roles.join(" hoặc ")}`,
      });
    }
    next();
  };
};

// Các role hợp lệ để tham khảo:
// "super_admin" | "it_admin" | "manager" | "user"
