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

    const propResult = await pool.query(`SELECT COUNT(*) AS total_properties FROM properties`);
    const totalProperties = parseInt(propResult.rows[0].total_properties || 0);

    const agentResult = await pool.query(`
      SELECT COUNT(DISTINCT agent_id) AS assigned_agents
      FROM agent_property_assignments
      WHERE is_active = true
    `);
    const assignedAgents = parseInt(agentResult.rows[0].assigned_agents || 0);

    const tenantResult = await pool.query(`
      SELECT COUNT(*) AS active_tenants
      FROM tenant_allocations
      WHERE is_active = true
    `);
    const activeTenants = parseInt(tenantResult.rows[0].active_tenants || 0);

    const unitResult = await pool.query(`
      SELECT COUNT(*) AS total_units,
             COUNT(CASE WHEN is_occupied = true THEN 1 END) AS occupied_units
      FROM property_units
      WHERE is_active = true
    `);
    const totalUnits = parseInt(unitResult.rows[0].total_units || 0);
    const occupiedUnits = parseInt(unitResult.rows[0].occupied_units || 0);
    const occupancyRate = totalUnits > 0 ? `${Math.round((occupiedUnits / totalUnits) * 100)}%` : '0%';

    const complaintResult = await pool.query(`
      SELECT COUNT(*) AS pending_complaints
      FROM complaints
      WHERE status = 'open'
    `);
    const pendingComplaints = parseInt(complaintResult.rows[0].pending_complaints || 0);

    const pendingPaymentResult = await pool.query(`
      SELECT COUNT(*)::int AS pending_payments
      FROM (
        SELECT
          ta.id,
          (
            GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
            GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) +
            GREATEST(0, COALESCE(ta.arrears_balance, 0) - COALESCE(ap.arrears_paid, 0))
          ) AS total_due
        FROM tenant_allocations ta
        JOIN property_units pu ON pu.id = ta.unit_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(
            CASE
              WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
              ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
              ELSE COALESCE(rp.amount, 0)
            END
          ), 0) AS rent_paid
          FROM rent_payments rp
          WHERE rp.tenant_id = ta.tenant_id
            AND rp.unit_id = ta.unit_id
            AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
            AND rp.status = 'completed'
        ) pm ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COALESCE((
              SELECT wb.amount
              FROM water_bills wb
              WHERE wb.tenant_id = ta.tenant_id
                AND (wb.unit_id = ta.unit_id OR wb.unit_id IS NULL)
                AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', CURRENT_DATE)
              ORDER BY CASE WHEN wb.unit_id = ta.unit_id THEN 0 ELSE 1 END
              LIMIT 1
            ), 0) AS water_bill,
            COALESCE((
              SELECT SUM(COALESCE(rp.allocated_to_water, 0))
              FROM rent_payments rp
              WHERE rp.tenant_id = ta.tenant_id
                AND rp.unit_id = ta.unit_id
                AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
                AND rp.status = 'completed'
            ), 0) AS water_paid
        ) wp ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(COALESCE(rp.allocated_to_arrears, 0)), 0) AS arrears_paid
          FROM rent_payments rp
          WHERE rp.tenant_id = ta.tenant_id
            AND rp.unit_id = ta.unit_id
            AND rp.status = 'completed'
        ) ap ON TRUE
        WHERE ta.is_active = true
      ) balances
      WHERE balances.total_due > 0
    `);
    const pendingPayments = parseInt(pendingPaymentResult.rows[0].pending_payments || 0);

    const unassignedResult = await pool.query(`
      SELECT COUNT(*) AS unassigned_properties
      FROM properties p
      LEFT JOIN agent_property_assignments ap
        ON ap.property_id = p.id
        AND ap.is_active = true
      WHERE ap.id IS NULL
    `);
    const unassignedProperties = parseInt(unassignedResult.rows[0].unassigned_properties || 0);

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
    console.log('📊 Fetching comprehensive stats...');
    
    // ═══════════════════════════════════════════════════════════════
    // PROPERTY STATISTICS (properties table has NO is_active column)
    // ═══════════════════════════════════════════════════════════════
    let propertyStats = { total_properties: 0, total_units: 0, occupied_units: 0, vacant_units: 0 };
    try {
      const propertyStatsResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT p.id) as total_properties,
          COUNT(DISTINCT pu.id) as total_units,
          COUNT(DISTINCT CASE WHEN pu.is_occupied = true AND pu.is_active = true THEN pu.id END) as occupied_units,
          COUNT(DISTINCT CASE WHEN pu.is_occupied = false AND pu.is_active = true THEN pu.id END) as vacant_units
        FROM properties p
        LEFT JOIN property_units pu ON p.id = pu.property_id
      `);
      propertyStats = propertyStatsResult.rows[0] || propertyStats;
      console.log('✅ Property stats fetched');
    } catch (e) {
      console.error('Error fetching property stats:', e.message);
    }

    const totalUnits = parseInt(propertyStats.total_units) || 0;
    const occupiedUnits = parseInt(propertyStats.occupied_units) || 0;
    const vacantUnits = parseInt(propertyStats.vacant_units) || 0;
    const occupancyRate = totalUnits > 0 ? ((occupiedUnits / totalUnits) * 100).toFixed(1) : '0.0';

    // ═══════════════════════════════════════════════════════════════
    // TENANT STATISTICS
    // ═══════════════════════════════════════════════════════════════
    let tenantStats = { total_tenants: 0, active_tenants: 0, tenants_with_arrears: 0, total_arrears: 0 };
    try {
      const tenantStatsResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT t.id) as total_tenants,
          COUNT(DISTINCT CASE WHEN ta.is_active = true THEN t.id END) as active_tenants,
          COUNT(DISTINCT CASE WHEN COALESCE(ta.arrears_balance, 0) > 0 AND ta.is_active = true THEN t.id END) as tenants_with_arrears,
          COALESCE(SUM(CASE WHEN ta.is_active = true THEN COALESCE(ta.arrears_balance, 0) ELSE 0 END), 0) as total_arrears
        FROM tenants t
        LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id
      `);
      tenantStats = tenantStatsResult.rows[0] || tenantStats;
      console.log('✅ Tenant stats fetched');
    } catch (e) {
      console.error('Error fetching tenant stats:', e.message);
    }

    // New allocations this month (using allocation_date)
    let newAllocationsCount = 0;
    try {
      const newAllocationsResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM tenant_allocations
        WHERE is_active = true
        AND allocation_date >= DATE_TRUNC('month', CURRENT_DATE)
      `);
      newAllocationsCount = parseInt(newAllocationsResult.rows[0]?.count) || 0;
      console.log('✅ New allocations count fetched:', newAllocationsCount);
    } catch (e) {
      console.error('Error fetching new allocations:', e.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // FINANCIAL STATISTICS
    // ═══════════════════════════════════════════════════════════════
    let financialStats = {
      revenue_this_month: 0,
      revenue_this_year: 0,
      revenue_all_time: 0,
      pending_amount: 0,
      pending_count: 0,
      total_rent_collected: 0,
      total_water_collected: 0,
      total_arrears_collected: 0
    };
    
    try {
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
            WHEN status = 'completed'
            THEN amount ELSE 0 END), 0) as revenue_all_time,
          COALESCE(SUM(CASE 
            WHEN status = 'pending' 
            THEN amount ELSE 0 END), 0) as pending_amount,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
          COALESCE(SUM(CASE 
            WHEN status = 'completed' 
            THEN COALESCE(allocated_to_rent, 0) ELSE 0 END), 0) as total_rent_collected,
          COALESCE(SUM(CASE 
            WHEN status = 'completed' 
            THEN COALESCE(allocated_to_water, 0) ELSE 0 END), 0) as total_water_collected,
          COALESCE(SUM(CASE 
            WHEN status = 'completed' 
            THEN COALESCE(allocated_to_arrears, 0) ELSE 0 END), 0) as total_arrears_collected
        FROM rent_payments
      `);
      financialStats = financialStatsResult.rows[0] || financialStats;
      console.log('✅ Financial stats fetched');
    } catch (e) {
      console.error('Error fetching financial stats:', e.message);
    }

    // Expected monthly rent from active allocations
    let expectedRent = 0;
    try {
      const expectedRentResult = await pool.query(`
        SELECT COALESCE(SUM(monthly_rent), 0) as expected_rent
        FROM tenant_allocations
        WHERE is_active = true
      `);
      expectedRent = parseFloat(expectedRentResult.rows[0]?.expected_rent) || 0;
      console.log('✅ Expected rent fetched:', expectedRent);
    } catch (e) {
      console.error('Error fetching expected rent:', e.message);
    }

    const collectedThisMonth = parseFloat(financialStats.revenue_this_month) || 0;
    const collectionRate = expectedRent > 0 
      ? ((collectedThisMonth / expectedRent) * 100).toFixed(1) 
      : '0.0';

    // Current-month unpaid balance from active allocations (rent + water + arrears).
    let dueSummary = {
      pending_count: 0,
      rent_due_total: 0,
      water_due_total: 0,
      arrears_due_total: 0,
      total_due: 0
    };
    try {
      const dueSummaryResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE total_due > 0)::int AS pending_count,
          COALESCE(SUM(rent_due), 0) AS rent_due_total,
          COALESCE(SUM(water_due), 0) AS water_due_total,
          COALESCE(SUM(arrears_due), 0) AS arrears_due_total,
          COALESCE(SUM(total_due), 0) AS total_due
        FROM (
          SELECT
            ta.id,
            GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) AS rent_due,
            GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) AS water_due,
            GREATEST(0, COALESCE(ta.arrears_balance, 0) - COALESCE(ap.arrears_paid, 0)) AS arrears_due,
            (
              GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
              GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) +
              GREATEST(0, COALESCE(ta.arrears_balance, 0) - COALESCE(ap.arrears_paid, 0))
            ) AS total_due
          FROM tenant_allocations ta
          JOIN property_units pu ON pu.id = ta.unit_id
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(
              CASE
                WHEN (
                  COALESCE(rp.allocated_to_rent, 0) +
                  COALESCE(rp.allocated_to_water, 0) +
                  COALESCE(rp.allocated_to_arrears, 0)
                ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
                ELSE COALESCE(rp.amount, 0)
              END
            ), 0) AS rent_paid
            FROM rent_payments rp
            WHERE rp.tenant_id = ta.tenant_id
              AND rp.unit_id = ta.unit_id
              AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
              AND rp.status = 'completed'
          ) pm ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              COALESCE((
                SELECT wb.amount
                FROM water_bills wb
                WHERE wb.tenant_id = ta.tenant_id
                  AND (wb.unit_id = ta.unit_id OR wb.unit_id IS NULL)
                  AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', CURRENT_DATE)
                ORDER BY CASE WHEN wb.unit_id = ta.unit_id THEN 0 ELSE 1 END
                LIMIT 1
              ), 0) AS water_bill,
              COALESCE((
                SELECT SUM(COALESCE(rp.allocated_to_water, 0))
                FROM rent_payments rp
                WHERE rp.tenant_id = ta.tenant_id
                  AND rp.unit_id = ta.unit_id
                  AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
                AND rp.status = 'completed'
            ), 0) AS water_paid
          ) wp ON TRUE
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(COALESCE(rp.allocated_to_arrears, 0)), 0) AS arrears_paid
            FROM rent_payments rp
            WHERE rp.tenant_id = ta.tenant_id
              AND rp.unit_id = ta.unit_id
              AND rp.status = 'completed'
          ) ap ON TRUE
          WHERE ta.is_active = true
        ) dues
      `);
      dueSummary = dueSummaryResult.rows[0] || dueSummary;
      console.log('✅ Due summary fetched');
    } catch (e) {
      console.error('Error fetching due summary:', e.message);
    }

    // Keep water outstanding aligned with current due summary to avoid drift/duplication.
    const outstandingWater = parseFloat(dueSummary.water_due_total) || 0;

    // ═══════════════════════════════════════════════════════════════
    // AGENT STATISTICS (properties has NO is_active column)
    // ═══════════════════════════════════════════════════════════════
    let agentStats = { total_agents: 0, active_agents: 0 };
    let assignedPropertiesCount = 0;
    let unassignedPropertiesCount = 0;

    try {
      const agentStatsResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT u.id) as total_agents,
          COUNT(DISTINCT CASE WHEN u.is_active = true THEN u.id END) as active_agents
        FROM users u
        WHERE u.role = 'agent'
      `);
      agentStats = agentStatsResult.rows[0] || agentStats;

      const assignedPropertiesResult = await pool.query(`
        SELECT COUNT(DISTINCT property_id) as count
        FROM agent_property_assignments
        WHERE is_active = true
      `);
      assignedPropertiesCount = parseInt(assignedPropertiesResult.rows[0]?.count) || 0;

      const unassignedPropertiesResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM properties p
        WHERE p.id NOT IN (
          SELECT DISTINCT property_id 
          FROM agent_property_assignments 
          WHERE is_active = true
        )
      `);
      unassignedPropertiesCount = parseInt(unassignedPropertiesResult.rows[0]?.count) || 0;
      console.log('✅ Agent stats fetched');
    } catch (e) {
      console.error('Error fetching agent stats:', e.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // COMPLAINT STATISTICS
    // ═══════════════════════════════════════════════════════════════
    let complaintStats = {
      open_complaints: 0,
      in_progress_complaints: 0,
      resolved_complaints: 0,
      resolved_this_month: 0,
      total_complaints: 0
    };

    try {
      const complaintStatsResult = await pool.query(`
        SELECT 
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open_complaints,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_complaints,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_complaints,
          COUNT(CASE WHEN status = 'resolved' AND resolved_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as resolved_this_month,
          COUNT(*) as total_complaints
        FROM complaints
      `);
      complaintStats = complaintStatsResult.rows[0] || complaintStats;
      console.log('✅ Complaint stats fetched');
    } catch (e) {
      console.error('Error fetching complaint stats:', e.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // SMS STATISTICS
    // ═══════════════════════════════════════════════════════════════
    let smsStats = { total_sent: 0, sent_today: 0, failed_count: 0, pending_count: 0 };

    try {
      const smsStatsResult = await pool.query(`
        SELECT 
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as total_sent,
          COUNT(CASE WHEN status = 'sent' AND DATE(sent_at) = CURRENT_DATE THEN 1 END) as sent_today,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
        FROM sms_queue
      `);
      smsStats = smsStatsResult.rows[0] || smsStats;
      console.log('✅ SMS stats fetched');
    } catch (e) {
      console.error('Error fetching SMS stats:', e.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // PAYMENT STATISTICS (only use valid enum values: pending, completed, failed, overdue)
    // ═══════════════════════════════════════════════════════════════
    let paymentStats = {
      payments_today: 0,
      amount_today: 0,
      payments_this_week: 0,
      amount_this_week: 0,
      payments_this_month: 0,
      failed_payments: 0,
      pending_payments: 0
    };

    try {
      const paymentStatsResult = await pool.query(`
        SELECT 
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE AND status = 'completed' THEN 1 END) as payments_today,
          COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE AND status = 'completed' THEN amount ELSE 0 END), 0) as amount_today,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' AND status = 'completed' THEN 1 END) as payments_this_week,
          COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' AND status = 'completed' THEN amount ELSE 0 END), 0) as amount_this_week,
          COUNT(CASE WHEN payment_month >= DATE_TRUNC('month', CURRENT_DATE) AND status = 'completed' THEN 1 END) as payments_this_month,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments
        FROM rent_payments
      `);
      paymentStats = paymentStatsResult.rows[0] || paymentStats;
      console.log('✅ Payment stats fetched');
    } catch (e) {
      console.error('Error fetching payment stats:', e.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // UNIT TYPE BREAKDOWN (only use valid enum values)
    // ═══════════════════════════════════════════════════════════════
    let unitTypeBreakdown = [];
    try {
      const unitTypeBreakdownResult = await pool.query(`
        SELECT 
          unit_type::text as unit_type,
          COUNT(*) as total,
          COUNT(CASE WHEN is_occupied = true THEN 1 END) as occupied,
          COUNT(CASE WHEN is_occupied = false THEN 1 END) as vacant
        FROM property_units
        WHERE is_active = true AND unit_type IS NOT NULL
        GROUP BY unit_type
        ORDER BY COUNT(*) DESC
      `);
      unitTypeBreakdown = unitTypeBreakdownResult.rows.map(row => ({
        unitType: row.unit_type || 'other',
        total: parseInt(row.total) || 0,
        occupied: parseInt(row.occupied) || 0,
        vacant: parseInt(row.vacant) || 0
      }));
      console.log('✅ Unit type breakdown fetched');
    } catch (e) {
      console.error('Error fetching unit type breakdown:', e.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // MONTHLY TREND (Last 6 months)
    // ═══════════════════════════════════════════════════════════════
    let monthlyTrend = [];
    try {
      const monthlyTrendResult = await pool.query(`
        SELECT 
          TO_CHAR(payment_month, 'Mon YYYY') as month,
          TO_CHAR(payment_month, 'YYYY-MM') as month_key,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as revenue,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as payment_count
        FROM rent_payments
        WHERE payment_month >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
        GROUP BY payment_month
        ORDER BY payment_month ASC
      `);
      monthlyTrend = monthlyTrendResult.rows.map(row => ({
        month: row.month,
        monthKey: row.month_key,
        revenue: parseFloat(row.revenue) || 0,
        paymentCount: parseInt(row.payment_count) || 0
      }));
      console.log('✅ Monthly trend fetched');
    } catch (e) {
      console.error('Error fetching monthly trend:', e.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════════════════════════
    console.log('📊 Comprehensive stats completed successfully');
    
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
          newThisMonth: newAllocationsCount,
          tenantsWithArrears: parseInt(tenantStats.tenants_with_arrears) || 0,
          totalArrears: parseFloat(tenantStats.total_arrears) || 0
        },
        financial: {
          revenueThisMonth: collectedThisMonth,
          revenueThisYear: parseFloat(financialStats.revenue_this_year) || 0,
          revenueAllTime: parseFloat(financialStats.revenue_all_time) || 0,
          expectedMonthlyRent: expectedRent,
          collectionRate: collectionRate,
          pendingPaymentsAmount: parseFloat(dueSummary.total_due) || 0,
          pendingPaymentsCount: parseInt(dueSummary.pending_count) || 0,
          pendingRentAmount: parseFloat(dueSummary.rent_due_total) || 0,
          pendingWaterAmount: parseFloat(dueSummary.water_due_total) || 0,
          pendingArrearsAmount: parseFloat(dueSummary.arrears_due_total) || 0,
          outstandingWater: outstandingWater,
          totalRentCollected: parseFloat(financialStats.total_rent_collected) || 0,
          totalWaterCollected: parseFloat(financialStats.total_water_collected) || 0,
          totalArrearsCollected: parseFloat(financialStats.total_arrears_collected) || 0
        },
        agent: {
          totalAgents: parseInt(agentStats.total_agents) || 0,
          activeAgents: parseInt(agentStats.active_agents) || 0,
          assignedProperties: assignedPropertiesCount,
          unassignedProperties: unassignedPropertiesCount
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
          pendingPayments: parseInt(dueSummary.pending_count) || 0
        },
        unitTypeBreakdown: unitTypeBreakdown,
        monthlyTrend: monthlyTrend,
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
    const activities = [];

    // 1. User registrations
    try {
      const usersResult = await pool.query(`
        SELECT
          created_at AS sort_time,
          COALESCE(first_name || ' ' || last_name, email, 'Unknown User') AS user_name,
          'User registered: ' || COALESCE(first_name || ' ' || last_name, email, 'Unknown') AS description,
          'registration' AS type,
          to_char(created_at, 'YYYY-MM-DD HH24:MI') AS time
        FROM users
        WHERE created_at IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 5
      `);
      activities.push(...usersResult.rows);
    } catch (e) {
      console.error('Error fetching user activities:', e.message);
    }

    // 2. Rent payments
    try {
      const paymentsResult = await pool.query(`
        SELECT
          rp.created_at AS sort_time,
          CASE
            WHEN COALESCE(cf.cf_total, 0) > 0 THEN
              'Payment of KES ' || (rp.amount + cf.cf_total)::text ||
              ' received (carry forward: ' || COALESCE(cf.cf_months, 'future month(s)') || ')'
            ELSE
              'Payment of KES ' || COALESCE(rp.amount::text, '0') || ' received'
          END AS description,
          'payment' AS type,
          to_char(rp.created_at, 'YYYY-MM-DD HH24:MI') AS time
        FROM rent_payments rp
        LEFT JOIN (
          SELECT
            original_payment_id,
            COALESCE(SUM(amount), 0) AS cf_total,
            (
              SELECT STRING_AGG(month_label, ', ' ORDER BY month_key)
              FROM (
                SELECT DISTINCT
                  to_char(date_trunc('month', rp2.payment_month), 'Mon YYYY') AS month_label,
                  to_char(date_trunc('month', rp2.payment_month), 'YYYY-MM') AS month_key
                FROM rent_payments rp2
                WHERE rp2.original_payment_id = rp.original_payment_id
                  AND rp2.status = 'completed'
                  AND rp2.payment_method IN ('carry_forward', 'carry_forward_fix')
              ) ordered_months
            ) AS cf_months
          FROM rent_payments rp
          WHERE rp.status = 'completed'
            AND rp.payment_method IN ('carry_forward', 'carry_forward_fix')
            AND rp.original_payment_id IS NOT NULL
          GROUP BY rp.original_payment_id
        ) cf ON cf.original_payment_id = rp.id
        WHERE rp.status = 'completed'
          AND rp.created_at IS NOT NULL
          AND rp.payment_method NOT IN ('carry_forward', 'carry_forward_fix')
        ORDER BY rp.created_at DESC
        LIMIT 5
      `);
      activities.push(...paymentsResult.rows);
    } catch (e) {
      console.error('Error fetching payment activities:', e.message);
    }

    // 3. Complaints (using raised_at)
    try {
      const complaintsResult = await pool.query(`
        SELECT
          raised_at AS sort_time,
          'Complaint submitted: ' || COALESCE(LEFT(description, 40), 'No description') AS description,
          'complaint' AS type,
          to_char(raised_at, 'YYYY-MM-DD HH24:MI') AS time
        FROM complaints
        WHERE raised_at IS NOT NULL
        ORDER BY raised_at DESC
        LIMIT 5
      `);
      activities.push(...complaintsResult.rows);
    } catch (e) {
      console.error('Error fetching complaint activities:', e.message);
    }

    // 4. Tenant allocations (using allocation_date)
    try {
      const allocationsResult = await pool.query(`
        SELECT
          ta.allocation_date AS sort_time,
          'New tenant allocated to unit ' || COALESCE(pu.unit_code, 'Unknown') AS description,
          'allocation' AS type,
          to_char(ta.allocation_date, 'YYYY-MM-DD HH24:MI') AS time
        FROM tenant_allocations ta
        LEFT JOIN property_units pu ON pu.id = ta.unit_id
        WHERE ta.is_active = true AND ta.allocation_date IS NOT NULL
        ORDER BY ta.allocation_date DESC
        LIMIT 5
      `);
      activities.push(...allocationsResult.rows);
    } catch (e) {
      console.error('Error fetching allocation activities:', e.message);
    }

    // Sort all activities by time and take top 10
    const sortedActivities = activities
      .filter(a => a.sort_time)
      .sort((a, b) => new Date(b.sort_time) - new Date(a.sort_time))
      .slice(0, 10)
      .map(({ sort_time, user_name, ...rest }) => rest);

    res.json({
      success: true,
      data: sortedActivities
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
 * Note: properties table has NO is_active column
 */
const getTopProperties = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.name,
        COALESCE(rev.total_revenue, 0) AS revenue,
        COALESCE(unit_counts.total_units, 0) AS units,
        COALESCE(unit_counts.occupied_units, 0) AS occupied_units,
        COALESCE(agent_info.agent_name, 'Unassigned') AS agent
      FROM properties p
      LEFT JOIN (
        SELECT 
          pu.property_id,
          COUNT(*) AS total_units,
          COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) AS occupied_units
        FROM property_units pu
        WHERE pu.is_active = true
        GROUP BY pu.property_id
      ) unit_counts ON unit_counts.property_id = p.id
      LEFT JOIN (
        SELECT 
          pu.property_id,
          SUM(rp.amount) AS total_revenue
        FROM rent_payments rp
        JOIN property_units pu ON pu.id = rp.unit_id
        WHERE rp.status = 'completed'
        AND rp.payment_month >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY pu.property_id
      ) rev ON rev.property_id = p.id
      LEFT JOIN (
        SELECT DISTINCT ON (apa.property_id)
          apa.property_id,
          u.first_name || ' ' || u.last_name AS agent_name
        FROM agent_property_assignments apa
        JOIN users u ON u.id = apa.agent_id
        WHERE apa.is_active = true
      ) agent_info ON agent_info.property_id = p.id
      ORDER BY revenue DESC
      LIMIT 6
    `);

    const formatted = result.rows.map(r => ({
      id: r.id,
      name: r.name || 'Unknown Property',
      revenue: `KES ${Number(r.revenue || 0).toLocaleString()}`,
      units: Number(r.units) || 0,
      occupancy: r.units > 0
        ? `${Math.round((r.occupied_units / r.units) * 100)}%`
        : '0%',
      agent: r.agent || 'Unassigned'
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
