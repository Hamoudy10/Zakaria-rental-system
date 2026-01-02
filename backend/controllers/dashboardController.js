// controllers/dashboardController.js
const pool = require('../config/database');

/**
 * Get admin dashboard statistics
 */
const getAdminStats = async (req, res) => {
  try {
    const revenueResult = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total_revenue,
             COALESCE(SUM(CASE WHEN DATE_PART('month', payment_month) = DATE_PART('month', CURRENT_DATE) THEN amount END),0) AS monthly_revenue
      FROM rent_payments
      WHERE status = 'completed'
    `);
    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue || 0);
    const monthlyGrowth = parseFloat(revenueResult.rows[0].monthly_revenue || 0);

    const propResult = await pool.query(`SELECT COUNT(*) AS total_properties FROM properties`);
    const totalProperties = parseInt(propResult.rows[0].total_properties);

    const agentResult = await pool.query(`
      SELECT COUNT(DISTINCT agent_id) AS assigned_agents
      FROM agent_properties
    `);
    const assignedAgents = parseInt(agentResult.rows[0].assigned_agents);

    const tenantResult = await pool.query(`
      SELECT COUNT(*) AS active_tenants
      FROM tenant_allocations
      WHERE is_active = true
    `);
    const activeTenants = parseInt(tenantResult.rows[0].active_tenants);

    const unitResult = await pool.query(`
      SELECT COUNT(*) AS total_units,
             COUNT(CASE WHEN is_occupied = true THEN 1 END) AS occupied_units
      FROM property_units
    `);
    const totalUnits = parseInt(unitResult.rows[0].total_units);
    const occupiedUnits = parseInt(unitResult.rows[0].occupied_units);
    const occupancyRate = totalUnits > 0 ? `${Math.round((occupiedUnits / totalUnits) * 100)}%` : '0%';

    const complaintResult = await pool.query(`
      SELECT COUNT(*) AS pending_complaints
      FROM complaints
      WHERE status = 'pending'
    `);
    const pendingComplaints = parseInt(complaintResult.rows[0].pending_complaints);

    const pendingPaymentResult = await pool.query(`
      SELECT COUNT(*) AS pending_payments
      FROM tenant_allocations ta
      LEFT JOIN rent_payments rp
      ON ta.tenant_id = rp.tenant_id
         AND ta.unit_id = rp.unit_id
         AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
         AND rp.status = 'completed'
      WHERE ta.is_active = true
      GROUP BY ta.id
      HAVING COUNT(rp.id) = 0
    `);
    const pendingPayments = pendingPaymentResult.rowCount;

    const unassignedResult = await pool.query(`
      SELECT COUNT(*) AS unassigned_properties
      FROM properties p
      LEFT JOIN agent_properties ap ON p.id = ap.property_id
      WHERE ap.id IS NULL
    `);
    const unassignedProperties = parseInt(unassignedResult.rows[0].unassigned_properties);

    res.json({
      success: true,
      data: {
        totalRevenue,
        monthlyGrowth,
        totalProperties,
        assignedAgents,
        occupancyRate,
        activeTenants,
        pendingComplaints,
        pendingPayments,
        unassignedProperties
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin stats',
      error: error.message
    });
  }
};

/**
 * Get recent activities (last 10 actions)
 */
const getRecentActivities = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.first_name || ' ' || u.last_name AS user,
             description,
             type,
             to_char(created_at, 'YYYY-MM-DD HH24:MI') AS time
      FROM activities
      ORDER BY created_at DESC
      LIMIT 10
    `);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities',
      error: error.message
    });
  }
};

/**
 * Get top performing properties (by monthly revenue)
 */
const getTopProperties = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id,
             p.name,
             COALESCE(SUM(rp.amount),0) AS revenue,
             COUNT(DISTINCT pu.id) AS units,
             COUNT(DISTINCT CASE WHEN pu.is_occupied = true THEN pu.id END) AS occupied_units,
             COALESCE(a.first_name || ' ' || a.last_name, 'Unassigned') AS agent,
             COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'pending') AS complaints
      FROM properties p
      LEFT JOIN property_units pu ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON ta.unit_id = pu.id AND ta.is_active = true
      LEFT JOIN rent_payments rp ON rp.tenant_id = ta.tenant_id AND rp.unit_id = pu.id AND rp.status = 'completed'
      LEFT JOIN agent_properties ap ON ap.property_id = p.id
      LEFT JOIN users a ON a.id = ap.agent_id
      LEFT JOIN complaints c ON c.property_id = p.id AND c.status = 'pending'
      GROUP BY p.id, a.first_name, a.last_name
      ORDER BY revenue DESC
      LIMIT 6
    `);

    const formatted = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      revenue: parseFloat(r.revenue),
      units: parseInt(r.units),
      occupancy: r.occupied_units > 0 && r.units > 0 ? `${Math.round((r.occupied_units / r.units) * 100)}%` : '0%',
      agent: r.agent,
      complaints: parseInt(r.complaints)
    }));

    res.json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('Error fetching top properties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top properties',
      error: error.message
    });
  }
};

module.exports = {
  getAdminStats,
  getRecentActivities,
  getTopProperties
};
