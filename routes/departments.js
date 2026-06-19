import express from "express";
import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// GET /api/departments
// Trả về flat list có kèm parent_name để FE hiển thị "BACK OFFICE DIVISION › HR Department"
router.get("/", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.id,
        d.name,
        d.parent_id,
        p.name AS parent_name
      FROM departments d
      LEFT JOIN departments p ON p.id = d.parent_id
      ORDER BY p.name NULLS FIRST, d.name
    `);

    res.json({ success: true, data: { departments: rows } });
  } catch (error) {
    console.error("Departments fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch departments" });
  }
});

export default router;
