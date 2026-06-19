import express from "express";
import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, async (req, res, next) => {
  try {
    const [
      summaryRes,
      categoryRes,
      statusRes,
      recentAssetsRes,
      recentTicketsRes,
    ] = await Promise.all([
      // Tổng quan assets
      pool.query(`
          SELECT
            COUNT(*)                                        AS total,
            COUNT(*) FILTER (WHERE status = 'available')   AS available,
            COUNT(*) FILTER (WHERE status = 'in_use')      AS in_use,
            COUNT(*) FILTER (WHERE status = 'maintenance') AS maintenance,
            COUNT(*) FILTER (WHERE status = 'broken')      AS broken,
            COUNT(*) FILTER (WHERE status = 'disposed')    AS disposed
          FROM assets
        `),

      // Theo category
      pool.query(`
          SELECT category, COUNT(*) AS count
          FROM assets
          GROUP BY category
          ORDER BY count DESC
        `),

      // Theo status (cho chart)
      pool.query(`
          SELECT status, COUNT(*) AS count
          FROM assets
          GROUP BY status
          ORDER BY count DESC
        `),

      // 5 tài sản mới nhất
      pool.query(`
          SELECT a.id, a.asset_code, a.product_name, a.category,
                 a.brand, a.status, a.location, a.created_at,
                 u.full_name AS current_user_name
          FROM assets a
          LEFT JOIN users u ON u.employee_code = a.current_user_employee_code
          ORDER BY a.created_at DESC
          LIMIT 5
        `),

      // 5 maintenance ticket mới nhất
      pool.query(`
          SELECT mt.id, mt.ticket_number, mt.priority, mt.status,
                 mt.issue_description, mt.created_at,
                 a.asset_code, a.product_name,
                 u.full_name AS reported_by_name
          FROM maintenance_tickets mt
          JOIN assets a ON a.id = mt.asset_id
          LEFT JOIN users u ON u.employee_code = mt.reported_by
          ORDER BY mt.created_at DESC
          LIMIT 5
        `),
    ]);

    const s = summaryRes.rows[0];

    res.json({
      summary: {
        totalAssets: parseInt(s.total),
        availableAssets: parseInt(s.available),
        inUseAssets: parseInt(s.in_use),
        maintenanceAssets: parseInt(s.maintenance),
        brokenAssets: parseInt(s.broken),
        disposedAssets: parseInt(s.disposed),
      },
      categoryStats: categoryRes.rows.map((r) => ({
        category: r.category,
        count: parseInt(r.count),
      })),
      statusStats: statusRes.rows.map((r) => ({
        status: r.status,
        count: parseInt(r.count),
      })),
      recentAssets: recentAssetsRes.rows,
      recentTickets: recentTicketsRes.rows,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    next(error);
  }
});

export default router;
