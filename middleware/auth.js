import { createRemoteJWKSet, jwtVerify } from "jose";
import pool from "../config/db.js";

// Lazy init — tránh undefined URL khi module load
let JWKS = null;
const getJWKS = () => {
  if (!JWKS) {
    if (!process.env.SUPABASE_URL) {
      throw new Error("SUPABASE_URL is not defined in environment");
    }
    JWKS = createRemoteJWKSet(
      new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
  }
  return JWKS;
};

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.split(" ")[1];

    // Verify JWT cục bộ
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    });

    const email = payload.email;
    if (!email) {
      return res.status(401).json({ error: "Invalid token: missing email" });
    }

    // Lookup VPS Postgres
    const { rows } = await pool.query(
      `SELECT id, employee_code, full_name, role, status, auth_user_id
       FROM users WHERE email = $1`,
      [email],
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: "NOT_REGISTERED" });
    }

    const user = rows[0];

    if (user.status !== "active") {
      return res.status(403).json({ error: "ACCOUNT_INACTIVE" });
    }

    // Ghi auth_user_id nếu NULL
    if (!user.auth_user_id && payload.sub) {
      await pool.query(`UPDATE users SET auth_user_id = $1 WHERE id = $2`, [
        payload.sub,
        user.id,
      ]);
    }

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
