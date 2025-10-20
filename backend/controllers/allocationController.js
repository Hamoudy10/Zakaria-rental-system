const pool = require('../config/database');

// @desc    Get all allocations
// @route   GET /api/allocations
// @access  Private (Admin, Agent)
const getAllocations = async (req, res) => {
  try {
    console.log('Getting all allocations...');
    const query = `
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
      ORDER BY ta.created_at DESC
    `;
    
    const { rows } = await pool.query(query);
    
    console.log(`Found ${rows.length} allocations`);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get allocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching allocations'
    });
  }
};

// @desc    Get single allocation
// @route   GET /api/allocations/:id
// @access  Private (Admin, Agent)
const getAllocation = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Getting allocation with ID:', id);
    
    const query = `
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
      WHERE ta.id = $1
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Get allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching allocation'
    });
  }
};

// @desc    Create allocation
// @route   POST /api/allocations
// @access  Private (Admin, Agent)
const createAllocation = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { 
      tenant_id, 
      unit_id, 
      lease_start_date, 
      lease_end_date, 
      monthly_rent, 
      security_deposit = 0 
    } = req.body;
    
    console.log('Creating allocation:', req.body);
    console.log('👤 Created by user ID:', req.user.id);
    
    // Check if unit is already allocated
    const checkQuery = `
      SELECT * FROM tenant_allocations 
      WHERE unit_id = $1 AND is_active = true
    `;
    const checkResult = await client.query(checkQuery, [unit_id]);
    
    if (checkResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Unit is already allocated to another tenant'
      });
    }
    
    // Check if tenant already has active allocation
    const tenantCheck = await client.query(
      `SELECT id FROM tenant_allocations 
       WHERE tenant_id = $1 AND is_active = true`,
      [tenant_id]
    );
    
    if (tenantCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tenant already has an active allocation'
      });
    }
    
    // Create the allocation
    const insertQuery = `
      INSERT INTO tenant_allocations (
        tenant_id, unit_id, lease_start_date, lease_end_date, 
        monthly_rent, security_deposit, allocated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const { rows } = await client.query(insertQuery, [
      tenant_id, 
      unit_id, 
      lease_start_date, 
      lease_end_date, 
      monthly_rent, 
      security_deposit,
      req.user.id
    ]);

    // Update unit occupancy status
    await client.query(
      `UPDATE property_units 
       SET is_occupied = true 
       WHERE id = $1`,
      [unit_id]
    );

    // Update property available_units count
    await client.query(
      `UPDATE properties 
       SET available_units = available_units - 1 
       WHERE id = (SELECT property_id FROM property_units WHERE id = $1)`,
      [unit_id]
    );
    
    await client.query('COMMIT');
    
    console.log('✅ Allocation created successfully:', rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Allocation created successfully',
      data: rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create allocation error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Server error creating allocation',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// @desc    Update allocation
// @route   PUT /api/allocations/:id
// @access  Private (Admin, Agent)
const updateAllocation = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { 
      lease_end_date, 
      monthly_rent, 
      security_deposit,
      is_active
    } = req.body;
    
    console.log('Updating allocation:', id, req.body);
    
    // Check if allocation exists
    const allocationCheck = await client.query(
      'SELECT id, unit_id, is_active FROM tenant_allocations WHERE id = $1',
      [id]
    );
    
    if (allocationCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }

    const currentAllocation = allocationCheck.rows[0];
    
    // Handle allocation deactivation
    if (is_active === false && currentAllocation.is_active) {
      // Update unit to vacant
      await client.query(
        `UPDATE property_units 
         SET is_occupied = false 
         WHERE id = $1`,
        [currentAllocation.unit_id]
      );

      // Update property available_units count
      await client.query(
        `UPDATE properties 
         SET available_units = available_units + 1 
         WHERE id = (SELECT property_id FROM property_units WHERE id = $1)`,
        [currentAllocation.unit_id]
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
          message: 'Cannot reactivate allocation - unit is currently occupied'
        });
      }
      
      // Update unit to occupied
      await client.query(
        `UPDATE property_units 
         SET is_occupied = true 
         WHERE id = $1`,
        [currentAllocation.unit_id]
      );

      // Update property available_units count
      await client.query(
        `UPDATE properties 
         SET available_units = available_units - 1 
         WHERE id = (SELECT property_id FROM property_units WHERE id = $1)`,
        [currentAllocation.unit_id]
      );
    }
    
    const query = `
      UPDATE tenant_allocations 
      SET lease_end_date = COALESCE($1, lease_end_date),
          monthly_rent = COALESCE($2, monthly_rent),
          security_deposit = COALESCE($3, security_deposit),
          is_active = COALESCE($4, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 
      RETURNING *
    `;
    
    const { rows } = await client.query(query, [
      lease_end_date, 
      monthly_rent, 
      security_deposit,
      is_active,
      id
    ]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Allocation updated successfully',
      data: rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update allocation error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Server error updating allocation',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// @desc    Delete allocation
// @route   DELETE /api/allocations/:id
// @access  Private (Admin, Agent)
const deleteAllocation = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    console.log('Deleting allocation:', id);
    
    // Check if allocation exists
    const allocationCheck = await client.query(
      'SELECT id, unit_id, is_active FROM tenant_allocations WHERE id = $1',
      [id]
    );
    
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

      // Update property available_units count
      await client.query(
        `UPDATE properties 
         SET available_units = available_units + 1 
         WHERE id = (SELECT property_id FROM property_units WHERE id = $1)`,
        [allocation.unit_id]
      );
    }
    
    const query = 'DELETE FROM tenant_allocations WHERE id = $1 RETURNING *';
    const { rows } = await client.query(query, [id]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Allocation deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete allocation error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Server error deleting allocation',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllocations,
  getAllocation,
  createAllocation,
  updateAllocation,
  deleteAllocation
};