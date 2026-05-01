const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

router.get(
  "/logs",
  authMiddleware,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        from_date,
        to_date,
        module,
        action,
        actor_user_id,
        entity_type,
        search,
      } = req.query;

      const safePage = Math.max(1, Number(page) || 1);
      const safeLimit = Math.min(500, Math.max(1, Number(limit) || 50));
      const offset = (safePage - 1) * safeLimit;

      const where = [];
      const params = [];
      let idx = 1;

      if (from_date) {
        where.push(`l.created_at >= $${idx}::timestamp`);
        params.push(`${from_date} 00:00:00`);
        idx += 1;
      }
      if (to_date) {
        where.push(`l.created_at <= $${idx}::timestamp`);
        params.push(`${to_date} 23:59:59`);
        idx += 1;
      }
      if (module) {
        where.push(`l.module = $${idx}`);
        params.push(module);
        idx += 1;
      }
      if (action) {
        where.push(`l.action = $${idx}`);
        params.push(action);
        idx += 1;
      }
      if (actor_user_id) {
        where.push(`l.actor_user_id = $${idx}::uuid`);
        params.push(actor_user_id);
        idx += 1;
      }
      if (entity_type) {
        where.push(`l.entity_type = $${idx}`);
        params.push(entity_type);
        idx += 1;
      }
      if (search) {
        where.push(
          `(COALESCE(u.first_name, '') ILIKE $${idx}
            OR COALESCE(u.last_name, '') ILIKE $${idx}
            OR COALESCE(l.action, '') ILIKE $${idx}
            OR COALESCE(l.module, '') ILIKE $${idx}
            OR COALESCE(l.request_path, '') ILIKE $${idx}
            OR CAST(COALESCE(l.metadata, '{}'::jsonb) AS text) ILIKE $${idx})`,
        );
        params.push(`%${search}%`);
        idx += 1;
      }

      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM system_activity_logs l
         LEFT JOIN users u ON u.id = l.actor_user_id
         ${whereClause}`,
        params,
      );
      const total = countResult.rows[0]?.total || 0;

      const logsQuery = await pool.query(
        `SELECT
           l.id,
           l.created_at,
           l.module,
           l.action,
           l.entity_type,
           l.entity_id,
           l.request_method,
           l.request_path,
           l.response_status,
           l.ip_address,
           l.user_agent,
           l.metadata,
           l.actor_user_id,
           CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS actor_name,
           u.email AS actor_email
         FROM system_activity_logs l
         LEFT JOIN users u ON u.id = l.actor_user_id
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, safeLimit, offset],
      );

      const modulesResult = await pool.query(
        `SELECT DISTINCT module
         FROM system_activity_logs
         ORDER BY module ASC`,
      );
      const actionsResult = await pool.query(
        `SELECT DISTINCT action
         FROM system_activity_logs
         ORDER BY action ASC`,
      );
      const actorsResult = await pool.query(
        `SELECT DISTINCT
           l.actor_user_id AS id,
           CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS name,
           u.email
         FROM system_activity_logs l
         JOIN users u ON u.id = l.actor_user_id
         WHERE l.actor_user_id IS NOT NULL
         ORDER BY name ASC`,
      );

      return res.json({
        success: true,
        data: {
          logs: logsQuery.rows,
          filters: {
            modules: modulesResult.rows.map((r) => r.module).filter(Boolean),
            actions: actionsResult.rows.map((r) => r.action).filter(Boolean),
            actors: actorsResult.rows,
          },
          pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / safeLimit)),
          },
        },
      });
    } catch (error) {
      console.error("Audit logs fetch error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch audit logs",
        error: error.message,
      });
    }
  },
);

module.exports = router;

