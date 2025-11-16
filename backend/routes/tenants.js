const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// FIXED: Import authMiddleware correctly
const { authMiddleware } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Get all tenants
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.national_id, u.first_name, u.last_name, u.email, 
        u.phone_number, u.role, u.is_active, u.created_at,
        ta.unit_id, pu.unit_number, p.name as property_name
      FROM users u
      LEFT JOIN tenant_allocations ta ON u.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE u.role = 'tenant'
      ORDER BY u.created_at DESC
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      tenants: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR fetching tenants:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenants',
      error: error.message
    });
  }
});

// Get available units
router.get('/available-units', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pu.*, 
        p.name as property_name,
        p.address as property_address
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE pu.is_occupied = false
      AND pu.is_active = true
      ORDER BY p.name, pu.unit_number
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      units: result.rows
    });
  } catch (error) {
    console.error('❌ ERROR fetching available units:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available units',
      error: error.message
    });
  }
});

// Get tenant by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        u.*,
        ta.unit_id, 
        ta.lease_start_date, 
        ta.lease_end_date,
        ta.monthly_rent,
        ta.security_deposit,
        pu.unit_number,
        pu.unit_code,
        p.name as property_name
      FROM users u
      LEFT JOIN tenant_allocations ta ON u.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE u.id = $1 AND u.role = 'tenant'
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    res.json({
      success: true,
      tenant: result.rows[0]
    });
  } catch (error) {
    console.error('❌ ERROR fetching tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant',
      error: error.message
    });
  }
});

// Create new tenant
router.post('/', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      national_id,
      first_name,
      last_name,
      email,
      phone_number,
      password = 'default123' // Default password, should be changed
    } = req.body;
    
    // Create user
    const userResult = await client.query(`
      INSERT INTO users (national_id, first_name, last_name, email, phone_number, password_hash, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      national_id,
      first_name,
      last_name,
      email,
      phone_number,
      password, // In production, hash this password
      'tenant'
    ]);
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      tenant: userResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ERROR creating tenant:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'User with this email or national ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating tenant',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// Update tenant
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name,
      last_name,
      email,
      phone_number,
      is_active
    } = req.body;
    
    const result = await pool.query(`
      UPDATE users 
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          email = COALESCE($3, email),
          phone_number = COALESCE($4, phone_number),
          is_active = COALESCE($5, is_active),
          updated_at = NOW()
      WHERE id = $6 AND role = 'tenant'
      RETURNING *
    `, [first_name, last_name, email, phone_number, is_active, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Tenant updated successfully',
      tenant: result.rows[0]
    });
  } catch (error) {
    console.error('❌ ERROR updating tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating tenant',
      error: error.message
    });
  }
});

// Delete tenant
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if tenant exists
    const tenantCheck = await client.query(
      'SELECT id FROM users WHERE id = $1 AND role = $2',
      [id, 'tenant']
    );
    
    if (tenantCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    // Soft delete by setting is_active to false
    await client.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Tenant deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ERROR deleting tenant:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error deleting tenant',
      error: error.message
    });
  } finally {
    client.release();
  }
});

module.exports = router;