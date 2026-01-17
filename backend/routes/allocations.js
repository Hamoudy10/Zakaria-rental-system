const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware'); // FIXED: Changed to use requireRole

console.log('Allocations routes loaded');

// GET ALL ALLOCATIONS (with advanced filtering)
router.get('/', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => { // FIXED: Changed authorize to requireRole
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
        tenant.first_name as tenant_first_name,
        tenant.last_name as tenant_last_name,
        tenant.phone_number as tenant_phone,
        tenant.email as tenant_email,
        p.name as property_name,
        p.property_code,
        pu.unit_number,
        pu.unit_code,
        pu.unit_type,
        agent.first_name as allocated_by_name,
        agent.last_name as allocated_by_last_name
      FROM tenant_allocations ta
      LEFT JOIN users tenant ON ta.tenant_id = tenant.id
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
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM tenant_allocations ta WHERE 1=1`;
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

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    
    console.log(`Found ${result.rows.length} allocations`);
    
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

// GET ALLOCATION BY ID
router.get('/:id', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => { // FIXED: Changed authorize to requireRole
  try {
    const { id } = req.params;
    
    console.log(`Fetching allocation with ID: ${id}`);
    
    const result = await pool.query(`
      SELECT 
        ta.*,
        tenant.first_name as tenant_first_name,
        tenant.last_name as tenant_last_name,
        tenant.phone_number as tenant_phone,
        tenant.email as tenant_email,
        tenant.national_id as tenant_national_id,
        p.name as property_name,
        p.address as property_address,
        p.property_code,
        pu.unit_number,
        pu.unit_code,
        pu.unit_type,
        pu.rent_amount as unit_rent_amount,
        agent.first_name as allocated_by_name,
        agent.last_name as allocated_by_last_name
      FROM tenant_allocations ta
      LEFT JOIN users tenant ON ta.tenant_id = tenant.id
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

// GET ALLOCATIONS BY TENANT
router.get('/tenant/:tenantId', authMiddleware, requireRole(['admin', 'agent', 'tenant']), async (req, res) => { // FIXED: Changed authorize to requireRole
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
        agent.first_name as allocated_by_name
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

// CREATE NEW ALLOCATION (POST)
router.post('/', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => { // FIXED: Changed authorize to requireRole
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
    
    // Verify tenant exists and is a tenant
    const tenantCheck = await client.query(
      `SELECT id, first_name, last_name, role 
       FROM users 
       WHERE id = $1 AND role = 'tenant' AND is_active = true`,
      [tenant_id]
    );
    
    if (tenantCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tenant not found or invalid tenant role'
      });
    }
    
    // Verify unit exists and is available
    const unitCheck = await client.query(`
      SELECT pu.*, p.name as property_name, p.available_units
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
    
    // Check if tenant already has active allocation
    const existingAllocation = await client.query(
      `SELECT id FROM tenant_allocations 
       WHERE tenant_id = $1 AND is_active = true`,
      [tenant_id]
    );
    
    if (existingAllocation.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tenant already has an active allocation'
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

    // Update property available units count
    await client.query(
      `UPDATE properties 
       SET available_units = available_units - 1 
       WHERE id = $1`,
      [unit.property_id]
    );

    // Create notification for tenant (tenant must be a user)
    await client.query(
      `INSERT INTO notifications (
        user_id, title, message, type, related_entity_type, related_entity_id
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenant_id,
        'Unit Allocation Confirmed',
        `You have been allocated to ${unit.property_name}, Unit ${unit.unit_number}. Monthly rent: KSh ${monthly_rent}.`,
        'allocation',
        'allocation',
        allocationResult.rows[0].id
      ]
    );

    // Create notifications for agents/admins
    const agentsResult = await client.query(
      `SELECT id FROM users WHERE role IN ('admin', 'agent') AND is_active = true`
    );

    for (const agent of agentsResult.rows) {
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, related_entity_type, related_entity_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          agent.id,
          'New Tenant Allocation',
          `${tenantCheck.rows[0].first_name} ${tenantCheck.rows[0].last_name} allocated to ${unit.property_name}, Unit ${unit.unit_number}`,
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
      data: allocationResult.rows[0]
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

// UPDATE ALLOCATION (PUT) - SINGLE PUT ROUTE WITH FIXED NOTIFICATIONS
router.put('/:id', authMiddleware, requireRole(['admin', 'agent']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const {
      lease_end_date,
      monthly_rent,
      security_deposit,
      rent_due_day,
      grace_period_days,
      is_active
    } = req.body;
    
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

      // Update property available units count
      await client.query(
        `UPDATE properties 
         SET available_units = available_units + 1 
         WHERE id = $1`,
        [currentAllocation.property_id]
      );

      // ✅ FIXED: Notify the admin/agent performing the action instead of tenant
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, related_entity_type, related_entity_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id, // Admin/agent performing the action
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

      // Update property available units count
      await client.query(
        `UPDATE properties 
         SET available_units = available_units - 1 
         WHERE id = $1`,
        [currentAllocation.property_id]
      );

      // ✅ FIXED: Notify the admin/agent performing the action instead of tenant
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, related_entity_type, related_entity_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id, // Admin/agent performing the action
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
       security_deposit = COALESCE($3, security_deposit),
       rent_due_day = COALESCE($4, rent_due_day),
       grace_period_days = COALESCE($5, grace_period_days),
       is_active = COALESCE($6, is_active)
   WHERE id = $7
   RETURNING *`,
  [
    lease_end_date,
    monthly_rent,
    security_deposit,
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

      // Update property available units count
      await client.query(
        `UPDATE properties 
         SET available_units = available_units + 1 
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
      // We'll proceed with deletion but log the related records
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
    const result = await pool.query(`
      SELECT 
        ta.*,
        p.name as property_name,
        p.address as property_address,
        pu.unit_number,
        pu.unit_code,
        pu.unit_type,
        agent.first_name as allocated_by_name
      FROM tenant_allocations ta
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON ta.allocated_by = agent.id
      WHERE ta.tenant_id = $1 AND ta.is_active = true
      ORDER BY ta.allocation_date DESC
      LIMIT 1
    `, [req.user.id]);
    
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