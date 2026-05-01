const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const AllocationIntegrityService = require('../services/allocationIntegrityService');
const { logActivity } = require('../services/activityLogService');

console.log('Allocations routes loaded');

const toMonthKey = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatDateOnly = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

const dayBefore = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - 1);
  return formatDateOnly(d);
};

// GET ALL ALLOCATIONS (with advanced filtering)
router.get('/', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => {
  try {
    console.log('Fetching all tenant allocations...');
    
    const { 
      is_active, 
      tenant_id,
      unit_id,
      property_id,
      page = 1, 
      limit = 20 
    } = req.query;
    
    let query = `
      SELECT 
        ta.*,
        COALESCE(tenant.first_name, 'Unknown') as tenant_first_name,
        COALESCE(tenant.last_name, 'Tenant') as tenant_last_name,
        CONCAT(
          COALESCE(tenant.first_name, 'Unknown'), 
          ' ', 
          COALESCE(tenant.last_name, 'Tenant')
        ) as tenant_full_name,
        tenant.phone_number as tenant_phone,
        tenant.national_id as tenant_national_id,
        p.name as property_name,
        p.property_code,
        pu.unit_number,
        pu.unit_code,
        pu.unit_type,
        pu.rent_amount,
        COALESCE(agent.first_name, 'System') as allocated_by_name,
        COALESCE(agent.last_name, '') as allocated_by_last_name,
        CONCAT(
          COALESCE(agent.first_name, 'System'), 
          ' ', 
          COALESCE(agent.last_name, '')
        ) as allocated_by_full_name
      FROM tenant_allocations ta
      LEFT JOIN tenants tenant ON ta.tenant_id = tenant.id
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON ta.allocated_by = agent.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;

    // Add filters based on query parameters
    if (is_active !== undefined) {
      paramCount++;
      query += ` AND ta.is_active = $${paramCount}`;
      queryParams.push(is_active === 'true');
    }

    if (tenant_id) {
      paramCount++;
      query += ` AND ta.tenant_id = $${paramCount}`;
      queryParams.push(tenant_id);
    }

    if (unit_id) {
      paramCount++;
      query += ` AND ta.unit_id = $${paramCount}`;
      queryParams.push(unit_id);
    }

    if (property_id) {
      paramCount++;
      query += ` AND p.id = $${paramCount}`;
      queryParams.push(property_id);
    }

    // Add ordering and pagination
    query += ` ORDER BY ta.allocation_date DESC`;
    
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await pool.query(query, queryParams);
    
    // Get total count for pagination (with same filters)
    let countQuery = `
      SELECT COUNT(*) 
      FROM tenant_allocations ta
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE 1=1
    `;
    
    const countParams = [];
    let countParamCount = 0;

    if (is_active !== undefined) {
      countParamCount++;
      countQuery += ` AND ta.is_active = $${countParamCount}`;
      countParams.push(is_active === 'true');
    }

    if (tenant_id) {
      countParamCount++;
      countQuery += ` AND ta.tenant_id = $${countParamCount}`;
      countParams.push(tenant_id);
    }

    if (unit_id) {
      countParamCount++;
      countQuery += ` AND ta.unit_id = $${countParamCount}`;
      countParams.push(unit_id);
    }

    if (property_id) {
      countParamCount++;
      countQuery += ` AND p.id = $${countParamCount}`;
      countParams.push(property_id);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    
    console.log(`Found ${result.rows.length} allocations. First allocation:`, 
      result.rows.length > 0 ? {
        id: result.rows[0].id,
        tenantId: result.rows[0].tenant_id,
        tenantFullName: result.rows[0].tenant_full_name,
        tenantFirstName: result.rows[0].tenant_first_name,
        tenantLastName: result.rows[0].tenant_last_name
      } : 'No allocations found'
    );
    
    res.json({
      success: true,
      count: result.rows.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching allocations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant allocations',
      error: error.message
    });
  }
});

// Allocation maintenance diagnostics (ADMIN ONLY) - must be above /:id route
router.get(
  '/maintenance/diagnostics',
  authMiddleware,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const diagnostics = await AllocationIntegrityService.getDiagnostics();
      res.json({
        success: true,
        data: diagnostics,
      });
    } catch (error) {
      console.error('Error running allocation diagnostics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to run allocation diagnostics',
      });
    }
  },
);

router.post(
  '/maintenance/reconcile',
  authMiddleware,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const { dryRun = false } = req.body || {};
      const result = await AllocationIntegrityService.reconcileAllocations({
        dryRun: Boolean(dryRun),
      });

      res.json({
        success: true,
        message: dryRun
          ? 'Dry-run completed. No changes were committed.'
          : 'Allocation data reconciled successfully.',
        data: result,
      });
    } catch (error) {
      console.error('Error reconciling allocations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reconcile allocation data',
      });
    }
  },
);

// GET ALLOCATION BY ID
// GET ALLOCATIONS BY TENANT (must be declared before /:id)
router.get('/tenant/:tenantId', authMiddleware, requireRole(['admin', 'agent', 'tenant']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    // Authorization check - tenants can only see their own allocations
    if (req.user.role === 'tenant' && req.user.id !== tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const result = await pool.query(`
      SELECT 
        ta.*,
        p.name as property_name,
        p.address as property_address,
        pu.unit_number,
        pu.unit_code,
        pu.unit_type,
        COALESCE(agent.first_name, 'System') as allocated_by_name
      FROM tenant_allocations ta
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON ta.allocated_by = agent.id
      WHERE ta.tenant_id = $1
      ORDER BY ta.allocation_date DESC
    `, [tenantId]);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching tenant allocations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant allocations',
      error: error.message
    });
  }
});

// TRANSFER ALLOCATION WIZARD ACTION
router.post('/:id/transfer', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      target_unit_id,
      effective_date,
      new_monthly_rent,
      security_deposit,
      transfer_mode = 'carry_balance', // carry_balance | start_fresh | shift_records
      carry_balance_amount,
      shift_records_from_month,
      reason = '',
    } = req.body || {};

    if (!effective_date) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'effective_date is required',
      });
    }

    const effectiveDate = formatDateOnly(effective_date);
    if (!effectiveDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'effective_date is invalid',
      });
    }

    const currentAllocationResult = await client.query(
      `SELECT
         ta.*,
         t.first_name,
         t.last_name,
         pu.unit_code AS current_unit_code,
         pu.property_id AS current_property_id
       FROM tenant_allocations ta
       JOIN tenants t ON t.id = ta.tenant_id
       JOIN property_units pu ON pu.id = ta.unit_id
       WHERE ta.id = $1`,
      [id],
    );

    if (currentAllocationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Allocation not found',
      });
    }

    const current = currentAllocationResult.rows[0];
    if (!current.is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Only active allocations can be transferred',
      });
    }

    const targetUnitId = target_unit_id || current.unit_id;
    const targetIsSameUnit = targetUnitId === current.unit_id;

    let targetUnit = null;
    if (!targetIsSameUnit) {
      const targetUnitResult = await client.query(
        `SELECT pu.id, pu.unit_code, pu.is_active, pu.is_occupied, pu.property_id
         FROM property_units pu
         WHERE pu.id = $1`,
        [targetUnitId],
      );
      if (targetUnitResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Target unit not found',
        });
      }

      targetUnit = targetUnitResult.rows[0];
      if (!targetUnit.is_active) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Target unit is inactive',
        });
      }

      const targetConflicts = await client.query(
        `SELECT id
         FROM tenant_allocations
         WHERE unit_id = $1
           AND is_active = true`,
        [targetUnitId],
      );

      if (targetConflicts.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Target unit is already allocated',
        });
      }
    } else {
      targetUnit = {
        id: current.unit_id,
        unit_code: current.current_unit_code,
        property_id: current.current_property_id,
      };
    }

    const normalizedMode = String(transfer_mode || 'carry_balance').toLowerCase();
    if (!['carry_balance', 'start_fresh', 'shift_records'].includes(normalizedMode)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'transfer_mode must be carry_balance, start_fresh, or shift_records',
      });
    }

    const autoSuggestedBalance = Number(current.arrears_balance || 0);
    const providedCarry = Number(carry_balance_amount);
    const carryBalance =
      normalizedMode === 'start_fresh'
        ? 0
        : Number.isFinite(providedCarry)
          ? Math.max(0, providedCarry)
          : Math.max(0, autoSuggestedBalance);

    const resolvedRent = Number(
      new_monthly_rent !== undefined && new_monthly_rent !== null
        ? new_monthly_rent
        : current.monthly_rent,
    );
    if (!Number.isFinite(resolvedRent) || resolvedRent <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'new_monthly_rent must be a positive number',
      });
    }

    const resolvedDeposit =
      security_deposit !== undefined && security_deposit !== null
        ? Number(security_deposit)
        : Number(current.security_deposit || 0);

    // Close current allocation
    const closedLeaseEndDate = dayBefore(effectiveDate) || current.lease_end_date;
    await client.query(
      `UPDATE tenant_allocations
       SET is_active = false,
           lease_end_date = COALESCE($1, lease_end_date),
           updated_at = NOW()
       WHERE id = $2`,
      [closedLeaseEndDate, current.id],
    );

    // Free old unit when tenant moved out
    if (!targetIsSameUnit) {
      await client.query(
        `UPDATE property_units
         SET is_occupied = false
         WHERE id = $1`,
        [current.unit_id],
      );
    }

    // Create new allocation
    const newAllocationResult = await client.query(
      `INSERT INTO tenant_allocations (
         tenant_id, unit_id, lease_start_date, lease_end_date,
         monthly_rent, security_deposit, rent_due_day, grace_period_days,
         allocated_by, is_active, allocation_date, arrears_balance
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), $10)
       RETURNING *`,
      [
        current.tenant_id,
        targetUnitId,
        effectiveDate,
        current.lease_end_date || null,
        resolvedRent,
        Number.isFinite(resolvedDeposit) ? resolvedDeposit : 0,
        current.rent_due_day || 1,
        current.grace_period_days || 5,
        req.user.id,
        carryBalance,
      ],
    );

    // Occupy new unit
    await client.query(
      `UPDATE property_units
       SET is_occupied = true
       WHERE id = $1`,
      [targetUnitId],
    );

    // Recalculate property availability for old and new properties
    const touchedPropertyIds = new Set([current.current_property_id, targetUnit.property_id]);
    for (const propertyId of touchedPropertyIds) {
      if (!propertyId) continue;
      await client.query(
        `UPDATE properties p
         SET available_units = (
           SELECT COUNT(*)
           FROM property_units pu
           WHERE pu.property_id = p.id
             AND pu.is_active = true
             AND pu.is_occupied = false
         )
         WHERE p.id = $1`,
        [propertyId],
      );
    }

    // Optional record shifting for reconciliation corrections
    let shiftedPayments = 0;
    let shiftedWaterBills = 0;
    if (normalizedMode === 'shift_records' && !targetIsSameUnit) {
      const shiftMonth = shift_records_from_month || toMonthKey(effectiveDate);
      if (!shiftMonth || !/^\d{4}-\d{2}$/.test(shiftMonth)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'shift_records_from_month must be in YYYY-MM format',
        });
      }

      const shiftedPaymentsResult = await client.query(
        `UPDATE rent_payments
         SET unit_id = $1
         WHERE tenant_id = $2
           AND unit_id = $3
           AND DATE_TRUNC('month', payment_month) >= DATE_TRUNC('month', $4::date)`,
        [targetUnitId, current.tenant_id, current.unit_id, `${shiftMonth}-01`],
      );
      shiftedPayments = shiftedPaymentsResult.rowCount || 0;

      const shiftedWaterResult = await client.query(
        `UPDATE water_bills
         SET unit_id = $1
         WHERE tenant_id = $2
           AND unit_id = $3
           AND DATE_TRUNC('month', bill_month) >= DATE_TRUNC('month', $4::date)`,
        [targetUnitId, current.tenant_id, current.unit_id, `${shiftMonth}-01`],
      );
      shiftedWaterBills = shiftedWaterResult.rowCount || 0;
    }

    await logActivity({
      actorUserId: req.user.id,
      module: 'allocations',
      action: 'TRANSFER_ALLOCATION',
      entityType: 'tenant_allocation',
      entityId: current.id,
      requestMethod: req.method,
      requestPath: req.originalUrl,
      responseStatus: 200,
      metadata: {
        tenant_id: current.tenant_id,
        tenant_name: `${current.first_name} ${current.last_name}`.trim(),
        from_allocation_id: current.id,
        to_allocation_id: newAllocationResult.rows[0].id,
        from_unit_id: current.unit_id,
        from_unit_code: current.current_unit_code,
        to_unit_id: targetUnitId,
        to_unit_code: targetUnit.unit_code,
        transfer_mode: normalizedMode,
        effective_date: effectiveDate,
        carry_balance_amount: carryBalance,
        monthly_rent_before: Number(current.monthly_rent || 0),
        monthly_rent_after: resolvedRent,
        shifted_payments: shiftedPayments,
        shifted_water_bills: shiftedWaterBills,
        reason: reason || null,
      },
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Allocation transfer completed successfully',
      data: {
        previous_allocation_id: current.id,
        new_allocation: newAllocationResult.rows[0],
        summary: {
          transfer_mode: normalizedMode,
          carry_balance_amount: carryBalance,
          shifted_payments: shiftedPayments,
          shifted_water_bills: shiftedWaterBills,
        },
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error transferring allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to transfer allocation',
      error: error.message,
    });
  } finally {
    client.release();
  }
});

router.get('/:id', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Fetching allocation with ID: ${id}`);
    
    const result = await pool.query(`
      SELECT 
        ta.*,
        COALESCE(tenant.first_name, 'Unknown') as tenant_first_name,
        COALESCE(tenant.last_name, 'Tenant') as tenant_last_name,
        CONCAT(
          COALESCE(tenant.first_name, 'Unknown'), 
          ' ', 
          COALESCE(tenant.last_name, 'Tenant')
        ) as tenant_full_name,
        tenant.phone_number as tenant_phone,
        tenant.national_id as tenant_national_id,
        p.name as property_name,
        p.address as property_address,
        p.property_code,
        pu.unit_number,
        pu.unit_code,
        pu.unit_type,
        pu.rent_amount as unit_rent_amount,
        COALESCE(agent.first_name, 'System') as allocated_by_name,
        COALESCE(agent.last_name, '') as allocated_by_last_name
      FROM tenant_allocations ta
      LEFT JOIN tenants tenant ON ta.tenant_id = tenant.id
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON ta.allocated_by = agent.id
      WHERE ta.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching allocation',
      error: error.message
    });
  }
});

// CREATE NEW ALLOCATION (POST)
router.post('/', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => {
  console.log('=== ALLOCATION POST REQUEST RECEIVED ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('User:', req.user);
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      tenant_id,
      unit_id,
      lease_start_date,
      lease_end_date,
      monthly_rent,
      security_deposit,
      rent_due_day = 1,
      grace_period_days = 5
    } = req.body;
    
    console.log('🏠 Creating new tenant allocation with data:', req.body);
    
    // Validate required fields
    if (!tenant_id || !unit_id || !lease_start_date || !monthly_rent) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tenant_id, unit_id, lease_start_date, monthly_rent'
      });
    }
    
    // Verify tenant exists in tenants table
    const tenantCheck = await client.query(
      `SELECT id, first_name, last_name 
       FROM tenants 
       WHERE id = $1`,
      [tenant_id]
    );
    
    if (tenantCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    // Verify unit exists and is available
    const unitCheck = await client.query(`
      SELECT pu.*, p.name as property_name, p.available_units, p.id as property_id
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE pu.id = $1 AND pu.is_active = true
    `, [unit_id]);
    
    if (unitCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Property unit not found or inactive'
      });
    }
    
    const unit = unitCheck.rows[0];
    
    if (unit.is_occupied) {
      return res.status(400).json({
        success: false,
        message: 'Property unit is already occupied'
      });
    }
    
    // Attempt to auto-resolve stale allocations for this tenant
    const cleanupResult = await AllocationIntegrityService.autoResolveTenantConflicts(
      client,
      tenant_id,
    );

    // Check if tenant already has active allocation
    const existingAllocation = await client.query(
      `SELECT 
         ta.id,
         ta.unit_id,
         pu.unit_code,
         p.name AS property_name,
         ta.lease_start_date,
         ta.lease_end_date
       FROM tenant_allocations ta
       LEFT JOIN property_units pu ON pu.id = ta.unit_id
       LEFT JOIN properties p ON p.id = pu.property_id
       WHERE ta.tenant_id = $1 
         AND ta.is_active = true`,
      [tenant_id],
    );
    
    if (existingAllocation.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Tenant already has an active allocation',
        conflictingAllocations: existingAllocation.rows,
        autoResolvedAllocations: cleanupResult,
      });
    }
    
    // Check if unit rent amount matches (optional validation)
    if (unit.rent_amount > 0 && monthly_rent !== unit.rent_amount) {
      console.log(`⚠️  Rent amount mismatch: Unit rent is ${unit.rent_amount}, allocation rent is ${monthly_rent}`);
      // We'll allow this but log it, as there might be negotiated rates
    }
    
    // Create the allocation
    const allocationResult = await client.query(
      `INSERT INTO tenant_allocations (
        tenant_id, unit_id, lease_start_date, lease_end_date, 
        monthly_rent, security_deposit, rent_due_day, 
        grace_period_days, allocated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        tenant_id,
        unit_id,
        lease_start_date,
        lease_end_date,
        monthly_rent,
        security_deposit || 0,
        rent_due_day,
        grace_period_days,
        req.user.id
      ]
    );

    // Update unit to occupied
    await client.query(
      `UPDATE property_units 
       SET is_occupied = true 
       WHERE id = $1`,
      [unit_id]
    );

    // Update property available units count using recalculation
    await client.query(
      `UPDATE properties p
       SET available_units = (
         SELECT COUNT(*) 
         FROM property_units pu 
         WHERE pu.property_id = p.id 
           AND pu.is_active = true 
           AND pu.is_occupied = false
       )
       WHERE id = $1`,
      [unit.property_id]
    );

    // Create notification for admin/agent (not tenant, since tenants aren't in users table)
    await client.query(
      `INSERT INTO notifications (
        user_id, title, message, type, related_entity_type, related_entity_id
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.id, // Notify the admin/agent who created the allocation
        'New Tenant Allocation Created',
        `You allocated ${tenantCheck.rows[0].first_name} ${tenantCheck.rows[0].last_name} to ${unit.property_name}, Unit ${unit.unit_number}. Monthly rent: KSh ${monthly_rent}.`,
        'allocation',
        'allocation',
        allocationResult.rows[0].id
      ]
    );

    // Create notifications for other agents/admins
    const agentsResult = await client.query(
      `SELECT id FROM users WHERE role IN ('admin', 'agent') AND is_active = true AND id != $1`,
      [req.user.id]
    );

    for (const agent of agentsResult.rows) {
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, related_entity_type, related_entity_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          agent.id,
          'New Tenant Allocation',
          `${tenantCheck.rows[0].first_name} ${tenantCheck.rows[0].last_name} was allocated to ${unit.property_name}, Unit ${unit.unit_number} by ${req.user.first_name || 'System'}.`,
          'allocation',
          'allocation',
          allocationResult.rows[0].id
        ]
      );
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Tenant allocation created successfully');
    
    res.status(201).json({
      success: true,
      message: 'Tenant allocated successfully',
      data: {
        ...allocationResult.rows[0],
        autoResolvedAllocations: cleanupResult,
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating allocation:', error);
    
    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Allocation already exists for this tenant and unit'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating tenant allocation',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// UPDATE ALLOCATION (PUT)
router.put('/:id', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const {
      lease_end_date,
      monthly_rent,
      arrears_balance,
      security_deposit,
      rent_due_day,
      grace_period_days,
      is_active
    } = req.body;

    const normalizedMonthlyRent =
      monthly_rent === undefined || monthly_rent === null || monthly_rent === ""
        ? null
        : Number(monthly_rent);
    const normalizedArrearsBalance =
      arrears_balance === undefined || arrears_balance === null || arrears_balance === ""
        ? null
        : Number(arrears_balance);
    const normalizedSecurityDeposit =
      security_deposit === undefined || security_deposit === null || security_deposit === ""
        ? null
        : Number(security_deposit);

    if (normalizedMonthlyRent !== null && (!Number.isFinite(normalizedMonthlyRent) || normalizedMonthlyRent < 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'monthly_rent must be a valid non-negative number'
      });
    }

    if (normalizedArrearsBalance !== null && (!Number.isFinite(normalizedArrearsBalance) || normalizedArrearsBalance < 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'arrears_balance must be a valid non-negative number'
      });
    }

    if (normalizedSecurityDeposit !== null && (!Number.isFinite(normalizedSecurityDeposit) || normalizedSecurityDeposit < 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'security_deposit must be a valid non-negative number'
      });
    }
    
    // Check if allocation exists
    const allocationCheck = await client.query(`
      SELECT ta.*, pu.property_id, pu.is_occupied, 
             t.first_name, t.last_name, pu.unit_code
      FROM tenant_allocations ta
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN tenants t ON ta.tenant_id = t.id
      WHERE ta.id = $1
    `, [id]);
    
    if (allocationCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }
    
    const currentAllocation = allocationCheck.rows[0];
    
    // Handle allocation deactivation (ending tenancy)
    if (is_active === false && currentAllocation.is_active) {
      // Update unit to vacant
      await client.query(
        `UPDATE property_units 
         SET is_occupied = false 
         WHERE id = $1`,
        [currentAllocation.unit_id]
      );

      // Update property available units count using recalculation
      await client.query(
        `UPDATE properties p
         SET available_units = (
           SELECT COUNT(*) 
           FROM property_units pu 
           WHERE pu.property_id = p.id 
             AND pu.is_active = true 
             AND pu.is_occupied = false
         )
         WHERE id = $1`,
        [currentAllocation.property_id]
      );

      // Notify the admin/agent performing the action
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, related_entity_type, related_entity_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id,
          'Tenancy Ended',
          `Tenancy for ${currentAllocation.first_name} ${currentAllocation.last_name} in unit ${currentAllocation.unit_code} has been ended.`,
          'allocation',
          'allocation',
          id
        ]
      );
    }
    
    // Handle allocation reactivation
    if (is_active === true && !currentAllocation.is_active) {
      // Check if unit is available
      const unitCheck = await client.query(
        'SELECT is_occupied FROM property_units WHERE id = $1',
        [currentAllocation.unit_id]
      );
      
      if (unitCheck.rows[0].is_occupied) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Cannot reactivate allocation - unit is currently occupied by another tenant'
        });
      }
      
      // Update unit to occupied
      await client.query(
        `UPDATE property_units 
         SET is_occupied = true 
         WHERE id = $1`,
        [currentAllocation.unit_id]
      );

      // Update property available units count using recalculation
      await client.query(
        `UPDATE properties p
         SET available_units = (
           SELECT COUNT(*) 
           FROM property_units pu 
           WHERE pu.property_id = p.id 
             AND pu.is_active = true 
             AND pu.is_occupied = false
         )
         WHERE id = $1`,
        [currentAllocation.property_id]
      );

      // Notify the admin/agent performing the action
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, related_entity_type, related_entity_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id,
          'Tenancy Reactivated',
          `Tenancy for ${currentAllocation.first_name} ${currentAllocation.last_name} in unit ${currentAllocation.unit_code} has been reactivated.`,
          'allocation',
          'allocation',
          id
        ]
      );
    }
    
    // Update the allocation
    const updateResult = await client.query(
      `UPDATE tenant_allocations 
       SET lease_end_date = COALESCE($1, lease_end_date),
           monthly_rent = COALESCE($2, monthly_rent),
           arrears_balance = COALESCE($3, arrears_balance),
           security_deposit = COALESCE($4, security_deposit),
           rent_due_day = COALESCE($5, rent_due_day),
           grace_period_days = COALESCE($6, grace_period_days),
           is_active = COALESCE($7, is_active)
       WHERE id = $8
       RETURNING *`,
      [
        lease_end_date,
        normalizedMonthlyRent,
        normalizedArrearsBalance,
        normalizedSecurityDeposit,
        rent_due_day,
        grace_period_days,
        is_active,
        id
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Allocation updated successfully',
      data: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating allocation',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// DELETE ALLOCATION (DELETE)
router.delete('/:id', authMiddleware, requireRole(['admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if allocation exists
    const allocationCheck = await client.query(`
      SELECT ta.*, pu.property_id, tenant.first_name, tenant.last_name
      FROM tenant_allocations ta
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN tenants tenant ON ta.tenant_id = tenant.id
      WHERE ta.id = $1
    `, [id]);
    
    if (allocationCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }
    
    const allocation = allocationCheck.rows[0];
    
    // If allocation is active, free up the unit
    if (allocation.is_active) {
      // Update unit to vacant
      await client.query(
        `UPDATE property_units 
         SET is_occupied = false 
         WHERE id = $1`,
        [allocation.unit_id]
      );

      // Update property available units count using recalculation
      await client.query(
        `UPDATE properties p
         SET available_units = (
           SELECT COUNT(*) 
           FROM property_units pu 
           WHERE pu.property_id = p.id 
             AND pu.is_active = true 
             AND pu.is_occupied = false
         )
         WHERE id = $1`,
        [allocation.property_id]
      );
    }
    
    // Check for related records (payments, complaints)
    const relatedPayments = await client.query(
      'SELECT COUNT(*) FROM rent_payments WHERE tenant_id = $1 AND unit_id = $2',
      [allocation.tenant_id, allocation.unit_id]
    );

    const relatedComplaints = await client.query(
      'SELECT COUNT(*) FROM complaints WHERE tenant_id = $1 AND unit_id = $2',
      [allocation.tenant_id, allocation.unit_id]
    );

    if (parseInt(relatedPayments.rows[0].count) > 0 || parseInt(relatedComplaints.rows[0].count) > 0) {
      console.log(`⚠️  Allocation has related records: ${relatedPayments.rows[0].count} payments, ${relatedComplaints.rows[0].count} complaints`);
    }
    
    // Delete the allocation
    await client.query('DELETE FROM tenant_allocations WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Allocation for ${allocation.first_name} ${allocation.last_name} deleted successfully`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting allocation',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// GET ALLOCATION STATISTICS
router.get('/stats/overview', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_allocations,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_allocations,
        COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_allocations,
        COUNT(DISTINCT tenant_id) as unique_tenants,
        COUNT(DISTINCT unit_id) as allocated_units,
        AVG(monthly_rent) as average_rent,
        SUM(monthly_rent) as total_monthly_rent
      FROM tenant_allocations
    `);
    
    const expiringResult = await pool.query(`
      SELECT COUNT(*) as expiring_soon
      FROM tenant_allocations
      WHERE is_active = true 
        AND lease_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    `);
    
    const monthlyResult = await pool.query(`
      SELECT 
        DATE(allocation_date) as allocation_date,
        COUNT(*) as daily_allocations
      FROM tenant_allocations
      WHERE allocation_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(allocation_date)
      ORDER BY allocation_date DESC
    `);
    
    res.json({
      success: true,
      data: {
        overview: statsResult.rows[0],
        expiring_soon: expiringResult.rows[0].expiring_soon,
        trends: monthlyResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching allocation statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching allocation statistics',
      error: error.message
    });
  }
});

// GET CURRENT TENANT ALLOCATION
router.get('/my/allocation', authMiddleware, requireRole(['tenant']), async (req, res) => {
  try {
    // For tenant role, we need to find their tenant record first
    const tenantResult = await pool.query(
      'SELECT id FROM tenants WHERE id = $1 OR national_id = $2',
      [req.user.id, req.user.national_id]
    );
    
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No tenant record found for this user'
      });
    }
    
    const tenantId = tenantResult.rows[0].id;
    
    const result = await pool.query(`
      SELECT 
        ta.*,
        p.name as property_name,
        p.address as property_address,
        pu.unit_number,
        pu.unit_code,
        pu.unit_type,
        COALESCE(agent.first_name, 'System') as allocated_by_name
      FROM tenant_allocations ta
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON ta.allocated_by = agent.id
      WHERE ta.tenant_id = $1 AND ta.is_active = true
      ORDER BY ta.allocation_date DESC
      LIMIT 1
    `, [tenantId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active allocation found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching current allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching current allocation',
      error: error.message
    });
  }
});

module.exports = router;
