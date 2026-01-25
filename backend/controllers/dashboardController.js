// controllers/dashboardController.js
const pool = require('../config/database');

/**
 * Get admin dashboard statistics (LEGACY - kept for backward compatibility)
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

    const propResult = await pool.query(`SELECT COUNT(*) AS total_properties FROM properties WHERE is_active = true`);
    const totalProperties = parseInt(propResult.rows[0].total_properties);

    const agentResult = await pool.query(`
      SELECT COUNT(DISTINCT agent_id) AS assigned_agents
      FROM agent_property_assignments
      WHERE is_active = true
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
      WHERE is_active = true
    `);
    const totalUnits = parseInt(unitResult.rows[0].total_units);
    const occupiedUnits = parseInt(unitResult.rows[0].occupied_units);
    const occupancyRate = totalUnits > 0 ? `${Math.round((occupiedUnits / totalUnits) * 100)}%` : '0%';

    const complaintResult = await pool.query(`
      SELECT COUNT(*) AS pending_complaints
      FROM complaints
      WHERE status = 'open'
    `);
    const pendingComplaints = parseInt(complaintResult.rows[0].pending_complaints);

    const pendingPaymentResult = await pool.query(`
      SELECT COUNT(*) AS pending_payments
      FROM (
        SELECT ta.id
        FROM tenant_allocations ta
        LEFT JOIN rent_payments rp
          ON ta.tenant_id = rp.tenant_id
          AND ta.unit_id = rp.unit_id
          AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
          AND rp.status = 'completed'
        WHERE ta.is_active = true
        GROUP BY ta.id
        HAVING COUNT(rp.id) = 0
      ) sub
    `);
    const pendingPayments = parseInt(pendingPaymentResult.rows[0].pending_payments);

    const unassignedResult = await pool.query(`
      SELECT COUNT(*) AS unassigned_properties
      FROM properties p
      LEFT JOIN agent_property_assignments ap
        ON ap.property_id = p.id
        AND ap.is_active = true
      WHERE ap.id IS NULL AND p.is_active = true
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
 * Get comprehensive dashboard statistics (NEW - detailed overview)
 */
const getComprehensiveStats = async (req, res) => {
  try {
    // ═══════════════════════════════════════════════════════════════
    // PROPERTY STATISTICS
    // ═══════════════════════════════════════════════════════════════
    const propertyStatsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT p.id) as total_properties,
        COUNT(DISTINCT pu.id) as total_units,
        COUNT(DISTINCT CASE WHEN pu.is_occupied = true AND pu.is_active = true THEN pu.id END) as occupied_units,
        COUNT(DISTINCT CASE WHEN pu.is_occupied = false AND pu.is_active = true THEN pu.id END) as vacant_units
      FROM properties p
      LEFT JOIN property_units pu ON p.id = pu.property_id
      WHERE p.is_active = true
    `);

    const propertyStats = propertyStatsResult.rows[0];
    const totalUnits = parseInt(propertyStats.total_units) || 0;
    const occupiedUnits = parseInt(propertyStats.occupied_units) || 0;
    const vacantUnits = parseInt(propertyStats.vacant_units) || 0;
    const occupancyRate = totalUnits > 0 ? ((occupiedUnits / totalUnits) * 100).toFixed(1) : '0.0';

    // ═══════════════════════════════════════════════════════════════
    // TENANT STATISTICS
    // ═══════════════════════════════════════════════════════════════
    const tenantStatsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT t.id) as total_tenants,
        COUNT(DISTINCT CASE WHEN ta.is_active = true THEN t.id END) as active_tenants,
        COUNT(DISTINCT CASE WHEN ta.arrears_balance > 0 AND ta.is_active = true THEN t.id END) as tenants_with_arrears,
        COALESCE(SUM(CASE WHEN ta.is_active = true THEN ta.arrears_balance ELSE 0 END), 0) as total_arrears
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id
    `);

    const tenantStats = tenantStatsResult.rows[0];

    // New allocations this month
    const newAllocationsResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM tenant_allocations
      WHERE is_active = true
      AND lease_start_date >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    // ═══════════════════════════════════════════════════════════════
    // FINANCIAL STATISTICS
    // ═══════════════════════════════════════════════════════════════
    const financialStatsResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE 
          WHEN payment_month >= DATE_TRUNC('month', CURRENT_DATE) 
          AND status = 'completed' 
          THEN amount ELSE 0 END), 0) as revenue_this_month,
        COALESCE(SUM(CASE 
          WHEN payment_month >= DATE_TRUNC('year', CURRENT_DATE) 
          AND status = 'completed' 
          THEN amount ELSE 0 END), 0) as revenue_this_year,
        COALESCE(SUM(CASE 
          WHEN status = 'pending' 
          THEN amount ELSE 0 END), 0) as pending_amount,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COALESCE(SUM(CASE 
          WHEN status = 'completed' 
          THEN allocated_to_rent ELSE 0 END), 0) as total_rent_collected,
        COALESCE(SUM(CASE 
          WHEN status = 'completed' 
          THEN allocated_to_water ELSE 0 END), 0) as total_water_collected,
        COALESCE(SUM(CASE 
          WHEN status = 'completed' 
          THEN allocated_to_arrears ELSE 0 END), 0) as total_arrears_collected
      FROM rent_payments
    `);

    const financialStats = financialStatsResult.rows[0];

    // Expected monthly rent from active allocations
    const expectedRentResult = await pool.query(`
      SELECT COALESCE(SUM(monthly_rent), 0) as expected_rent
      FROM tenant_allocations
      WHERE is_active = true
    `);

    const expectedRent = parseFloat(expectedRentResult.rows[0].expected_rent) || 0;
    const collectedThisMonth = parseFloat(financialStats.revenue_this_month) || 0;
    const collectionRate = expectedRent > 0 
      ? ((collectedThisMonth / expectedRent) * 100).toFixed(1) 
      : '0.0';

    // Outstanding water bills calculation
    const waterBalanceResult = await pool.query(`
      SELECT 
        COALESCE(SUM(wb.amount), 0) as total_billed
      FROM water_bills wb
      JOIN tenant_allocations ta ON wb.tenant_id = ta.tenant_id AND ta.is_active = true
    `);

    const waterPaidResult = await pool.query(`
      SELECT COALESCE(SUM(allocated_to_water), 0) as total_paid
      FROM rent_payments
      WHERE status = 'completed'
    `);

    const totalWaterBilled = parseFloat(waterBalanceResult.rows[0].total_billed) || 0;
    const totalWaterPaid = parseFloat(waterPaidResult.rows[0].total_paid) || 0;
    const outstandingWater = Math.max(0, totalWaterBilled - totalWaterPaid);

    // ═══════════════════════════════════════════════════════════════
    // AGENT STATISTICS
    // ═══════════════════════════════════════════════════════════════
    const agentStatsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT u.id) as total_agents,
        COUNT(DISTINCT CASE WHEN u.is_active = true THEN u.id END) as active_agents
      FROM users u
      WHERE u.role = 'agent'
    `);

    const assignedPropertiesResult = await pool.query(`
      SELECT COUNT(DISTINCT property_id) as count
      FROM agent_property_assignments
      WHERE is_active = true
    `);

    const unassignedPropertiesResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM properties p
      WHERE p.is_active = true
      AND p.id NOT IN (
        SELECT DISTINCT property_id 
        FROM agent_property_assignments 
        WHERE is_active = true
      )
    `);

    // ═══════════════════════════════════════════════════════════════
    // COMPLAINT STATISTICS
    // ═══════════════════════════════════════════════════════════════
    const complaintStatsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'open') as open_complaints,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_complaints,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_complaints,
        COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= DATE_TRUNC('month', CURRENT_DATE)) as resolved_this_month,
        COUNT(*) as total_complaints
      FROM complaints
    `);

    const complaintStats = complaintStatsResult.rows[0];

    // ═══════════════════════════════════════════════════════════════
    // SMS STATISTICS
    // ═══════════════════════════════════════════════════════════════
    const smsStatsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
        COUNT(*) FILTER (WHERE status = 'sent' AND created_at >= CURRENT_DATE) as sent_today,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count
      FROM sms_queue
    `);

    const smsStats = smsStatsResult.rows[0];

    // ═══════════════════════════════════════════════════════════════
    // PAYMENT STATISTICS
    // ═══════════════════════════════════════════════════════════════
    const paymentStatsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND status = 'completed') as payments_today,
        COALESCE(SUM(amount) FILTER (WHERE created_at >= CURRENT_DATE AND status = 'completed'), 0) as amount_today,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND status = 'completed') as payments_this_week,
        COALESCE(SUM(amount) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND status = 'completed'), 0) as amount_this_week,
        COUNT(*) FILTER (WHERE payment_month >= DATE_TRUNC('month', CURRENT_DATE) AND status = 'completed') as payments_this_month,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_payments,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_payments
      FROM rent_payments
    `);

    const paymentStats = paymentStatsResult.rows[0];

    // ═══════════════════════════════════════════════════════════════
    // UNIT TYPE BREAKDOWN
    // ═══════════════════════════════════════════════════════════════
    const unitTypeBreakdownResult = await pool.query(`
      SELECT 
        unit_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_occupied = true) as occupied,
        COUNT(*) FILTER (WHERE is_occupied = false) as vacant
      FROM property_units
      WHERE is_active = true
      GROUP BY unit_type
      ORDER BY total DESC
    `);

    // ═══════════════════════════════════════════════════════════════
    // MONTHLY TREND (Last 6 months)
    // ═══════════════════════════════════════════════════════════════
    const monthlyTrendResult = await pool.query(`
      SELECT 
        TO_CHAR(payment_month, 'Mon YYYY') as month,
        TO_CHAR(payment_month, 'YYYY-MM') as month_key,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) as revenue,
        COUNT(*) FILTER (WHERE status = 'completed') as payment_count
      FROM rent_payments
      WHERE payment_month >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY payment_month
      ORDER BY payment_month ASC
    `);

    // ═══════════════════════════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════════════════════════
    res.json({
      success: true,
      data: {
        property: {
          totalProperties: parseInt(propertyStats.total_properties) || 0,
          totalUnits: totalUnits,
          occupiedUnits: occupiedUnits,
          vacantUnits: vacantUnits,
          occupancyRate: occupancyRate
        },
        tenant: {
          totalTenants: parseInt(tenantStats.total_tenants) || 0,
          activeTenants: parseInt(tenantStats.active_tenants) || 0,
          newThisMonth: parseInt(newAllocationsResult.rows[0].count) || 0,
          tenantsWithArrears: parseInt(tenantStats.tenants_with_arrears) || 0,
          totalArrears: parseFloat(tenantStats.total_arrears) || 0
        },
        financial: {
          revenueThisMonth: collectedThisMonth,
          revenueThisYear: parseFloat(financialStats.revenue_this_year) || 0,
          expectedMonthlyRent: expectedRent,
          collectionRate: collectionRate,
          pendingPaymentsAmount: parseFloat(financialStats.pending_amount) || 0,
          pendingPaymentsCount: parseInt(financialStats.pending_count) || 0,
          outstandingWater: outstandingWater,
          totalRentCollected: parseFloat(financialStats.total_rent_collected) || 0,
          totalWaterCollected: parseFloat(financialStats.total_water_collected) || 0,
          totalArrearsCollected: parseFloat(financialStats.total_arrears_collected) || 0
        },
        agent: {
          totalAgents: parseInt(agentStatsResult.rows[0].total_agents) || 0,
          activeAgents: parseInt(agentStatsResult.rows[0].active_agents) || 0,
          assignedProperties: parseInt(assignedPropertiesResult.rows[0].count) || 0,
          unassignedProperties: parseInt(unassignedPropertiesResult.rows[0].count) || 0
        },
        complaint: {
          openComplaints: parseInt(complaintStats.open_complaints) || 0,
          inProgressComplaints: parseInt(complaintStats.in_progress_complaints) || 0,
          resolvedComplaints: parseInt(complaintStats.resolved_complaints) || 0,
          resolvedThisMonth: parseInt(complaintStats.resolved_this_month) || 0,
          totalComplaints: parseInt(complaintStats.total_complaints) || 0
        },
        sms: {
          totalSent: parseInt(smsStats.total_sent) || 0,
          sentToday: parseInt(smsStats.sent_today) || 0,
          failedCount: parseInt(smsStats.failed_count) || 0,
          pendingCount: parseInt(smsStats.pending_count) || 0
        },
        payment: {
          paymentsToday: parseInt(paymentStats.payments_today) || 0,
          amountToday: parseFloat(paymentStats.amount_today) || 0,
          paymentsThisWeek: parseInt(paymentStats.payments_this_week) || 0,
          amountThisWeek: parseFloat(paymentStats.amount_this_week) || 0,
          paymentsThisMonth: parseInt(paymentStats.payments_this_month) || 0,
          failedPayments: parseInt(paymentStats.failed_payments) || 0,
          processingPayments: parseInt(paymentStats.processing_payments) || 0
        },
        unitTypeBreakdown: unitTypeBreakdownResult.rows.map(row => ({
          unitType: row.unit_type,
          total: parseInt(row.total) || 0,
          occupied: parseInt(row.occupied) || 0,
          vacant: parseInt(row.vacant) || 0
        })),
        monthlyTrend: monthlyTrendResult.rows.map(row => ({
          month: row.month,
          monthKey: row.month_key,
          revenue: parseFloat(row.revenue) || 0,
          paymentCount: parseInt(row.payment_count) || 0
        })),
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching comprehensive stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard statistics',
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
      SELECT *
      FROM (
        -- User registrations
        SELECT
          u.created_at AS sort_time,
          u.first_name || ' ' || u.last_name AS user,
          'User registered: ' || u.first_name || ' ' || u.last_name AS description,
          'registration' AS type,
          to_char(u.created_at, 'YYYY-MM-DD HH24:MI') AS time
        FROM users u

        UNION ALL

        -- Rent payments
        SELECT
          rp.created_at AS sort_time,
          'Tenant' AS user,
          'Payment of KES ' || rp.amount || ' received' AS description,
          'payment' AS type,
          to_char(rp.created_at, 'YYYY-MM-DD HH24:MI') AS time
        FROM rent_payments rp
        WHERE rp.status = 'completed'

        UNION ALL

        -- Complaints
        SELECT
          c.raised_at AS sort_time,
          'Tenant' AS user,
          'Complaint submitted: ' || COALESCE(LEFT(c.description, 50), 'No description') AS description,
          'complaint' AS type,
          to_char(c.raised_at, 'YYYY-MM-DD HH24:MI') AS time
        FROM complaints c

        UNION ALL

        -- Tenant allocations (new move-ins)
        SELECT
          ta.created_at AS sort_time,
          t.first_name || ' ' || t.last_name AS user,
          'New tenant allocated to unit ' || COALESCE(pu.unit_code, 'Unknown') AS description,
          'allocation' AS type,
          to_char(ta.created_at, 'YYYY-MM-DD HH24:MI') AS time
        FROM tenant_allocations ta
        JOIN tenants t ON t.id = ta.tenant_id
        LEFT JOIN property_units pu ON pu.id = ta.unit_id
        WHERE ta.is_active = true
      ) activities
      ORDER BY sort_time DESC
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
 * Handles multiple agents per property
 */
const getTopProperties = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.name,
        COALESCE(SUM(rp.amount), 0) AS revenue,
        COUNT(DISTINCT pu.id) AS units,
        COUNT(DISTINCT CASE WHEN pu.is_occupied = true THEN pu.id END) AS occupied_units,
        COALESCE(
          (
            SELECT a.first_name || ' ' || a.last_name
            FROM agent_property_assignments ap2
            JOIN users a ON a.id = ap2.agent_id
            WHERE ap2.property_id = p.id AND ap2.is_active = true
            LIMIT 1
          ),
          'Unassigned'
        ) AS agent,
        COUNT(DISTINCT c.id) AS complaints
      FROM properties p
      LEFT JOIN property_units pu ON pu.property_id = p.id AND pu.is_active = true
      LEFT JOIN tenant_allocations ta ON ta.unit_id = pu.id AND ta.is_active = true
      LEFT JOIN rent_payments rp
        ON rp.tenant_id = ta.tenant_id
        AND rp.unit_id = pu.id
        AND rp.status = 'completed'
        AND rp.payment_month >= DATE_TRUNC('month', CURRENT_DATE)
      LEFT JOIN complaints c ON c.unit_id = pu.id
      WHERE p.is_active = true
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT 6
    `);

    const formatted = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      revenue: `KES ${Number(r.revenue).toLocaleString()}`,
      units: Number(r.units),
      occupancy:
        r.units > 0
          ? `${Math.round((r.occupied_units / r.units) * 100)}%`
          : '0%',
      agent: r.agent,
      complaints: Number(r.complaints)
    }));

    res.json({ success: true, data: formatted });
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
  getComprehensiveStats,
  getRecentActivities,
  getTopProperties
};