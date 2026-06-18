import { createRemoteJWKSet, jwtVerify } from "jose";
import pool from "../config/db.js";

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export const authenticate = async (req, res, next) => {
  try {
    // 1. Lấy token từ header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.split(" ")[1];

    // 2. Verify JWT cục bộ (không gọi API Supabase)
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    });

    const email = payload.email;
    if (!email) {
      return res.status(401).json({ error: "Invalid token: missing email" });
    }

    // 3. Lookup user từ VPS Postgres
    const { rows } = await pool.query(
      `SELECT id, employee_code, full_name, role, status, auth_user_id
       FROM users
       WHERE email = $1`,
      [email],
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: "NOT_REGISTERED" });
    }

    const user = rows[0];

    if (user.status !== "active") {
      return res.status(403).json({ error: "ACCOUNT_INACTIVE" });
    }

    // 4. Ghi auth_user_id nếu đang NULL
    if (!user.auth_user_id && payload.sub) {
      await pool.query(`UPDATE users SET auth_user_id = $1 WHERE id = $2`, [
        payload.sub,
        user.id,
      ]);
    }

    // 5. Gắn vào req.user cho các middleware/routes sau
    req.user = {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      role: user.role,
      email,
    };

    next();
  } catch (err) {
    if (err.code === "ERR_JWT_EXPIRED") {
      return res.status(401).json({ error: "TOKEN_EXPIRED" });
    }
    if (err.code?.startsWith("ERR_JWT")) {
      return res.status(401).json({ error: "INVALID_TOKEN" });
    }
    console.error("Auth middleware error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};
