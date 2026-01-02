// routes/adminDashboard.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ===============================
// GET /api/admin/dashboard/stats
// ===============================
router.get('/stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        -- Total properties
        (SELECT COUNT(*) FROM properties) AS total_properties,

        -- Total units
        (SELECT COUNT(*) FROM property_units) AS total_units,

        -- Occupied units
        (SELECT COUNT(*) FROM property_units WHERE is_occupied = true) AS occupied_units,

        -- Active tenants
        (SELECT COUNT(*) FROM tenants WHERE is_active = true) AS active_tenants,

        -- Total revenue (confirmed rent payments)
        COALESCE(
          (SELECT SUM(amount) FROM rent_payments WHERE status = 'confirmed'),
          0
        ) AS total_revenue,

        -- Pending rent payments
        (SELECT COUNT(*) FROM rent_payments WHERE status = 'pending') AS pending_payments,

        -- Pending complaints
        (SELECT COUNT(*) FROM complaints WHERE status = 'pending') AS pending_complaints,

        -- Unassigned properties (no active agent assignment)
        (
          SELECT COUNT(*)
          FROM properties p
          LEFT JOIN agent_property_assignments apa
            ON p.id = apa.property_id AND apa.is_active = true
          WHERE apa.id IS NULL
        ) AS unassigned_properties
    `;

    const { rows } = await pool.query(statsQuery);
    const stats = rows[0];

    const occupancyRate =
      stats.total_units > 0
        ? Math.round((stats.occupied_units / stats.total_units) * 100)
        : 0;

    res.json({
      success: true,
      data: {
        totalProperties: Number(stats.total_properties),
        totalUnits: Number(stats.total_units),
        occupiedUnits: Number(stats.occupied_units),
        activeTenants: Number(stats.active_tenants),
        totalRevenue: Number(stats.total_revenue),
        pendingPayments: Number(stats.pending_payments),
        pendingComplaints: Number(stats.pending_complaints),
        unassignedProperties: Number(stats.unassigned_properties),
        occupancyRate: `${occupancyRate}%`
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin dashboard stats'
    });
  }
});


// ==================================
// GET /api/admin/dashboard/activities
// ==================================
router.get('/activities', async (req, res) => {
  try {
    const activitiesQuery = `
      (
        SELECT
          'rent_payment' AS type,
          rp.created_at AS time,
          CONCAT('Rent payment of KES ', rp.amount) AS description
        FROM rent_payments rp
        ORDER BY rp.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT
          'complaint' AS type,
          c.raised_at AS time,
          CONCAT('Complaint raised: ', c.title) AS description
        FROM complaints c
        ORDER BY c.raised_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT
          'tenant' AS type,
          t.created_at AS time,
          CONCAT('New tenant added: ', t.first_name, ' ', t.last_name) AS description
        FROM tenants t
        ORDER BY t.created_at DESC
        LIMIT 5
      )
      ORDER BY time DESC
      LIMIT 10
    `;

    const { rows } = await pool.query(activitiesQuery);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Recent activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities'
    });
  }
});


// =================================
// GET /api/admin/dashboard/top-properties
// =================================
router.get('/top-properties', async (req, res) => {
  try {
    const topPropertiesQuery = `
      SELECT
        p.id,
        p.name,
        p.property_code,

        COUNT(DISTINCT pu.id) AS total_units,
        COUNT(DISTINCT ta.id) FILTER (WHERE ta.is_active = true) AS occupied_units,

        COALESCE(SUM(rp.amount), 0) AS total_revenue,
        COUNT(DISTINCT c.id) AS complaints_count

      FROM properties p
      LEFT JOIN property_units pu ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON ta.unit_id = pu.id AND ta.is_active = true
      LEFT JOIN rent_payments rp ON rp.unit_id = pu.id AND rp.status = 'confirmed'
      LEFT JOIN complaints c ON c.unit_id = pu.id

      GROUP BY p.id
      ORDER BY total_revenue DESC
      LIMIT 6
    `;

    const { rows } = await pool.query(topPropertiesQuery);

    const formatted = rows.map(p => ({
      id: p.id,
      name: p.name,
      propertyCode: p.property_code,
      totalUnits: Number(p.total_units),
      occupiedUnits: Number(p.occupied_units),
      occupancyRate:
        p.total_units > 0
          ? `${Math.round((p.occupied_units / p.total_units) * 100)}%`
          : '0%',
      totalRevenue: Number(p.total_revenue),
      complaints: Number(p.complaints_count)
    }));

    res.json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('Top properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top properties'
    });
  }
});

module.exports = router;
