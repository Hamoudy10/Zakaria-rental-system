const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware, requireAdmin, requireAgent } = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');

console.log('Users routes loaded');

// Apply auth middleware to all routes
router.use(authMiddleware);

// GET ALL USERS (Admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const query = `
      SELECT id, national_id, first_name, last_name, email, phone_number, 
             role, is_active, created_at, updated_at
      FROM users 
      ORDER BY created_at DESC
    `;
    const result = await db.query(query);
    
    res.json({
      success: true,
      count: result.rows.length,
      users: result.rows
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users' 
    });
  }
});

// GET USER BY ID (Admin only)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT id, national_id, first_name, last_name, email, phone_number, 
             role, is_active, created_at, updated_at
      FROM users 
      WHERE id = $1
    `;
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user' 
    });
  }
});

// CREATE NEW USER (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { 
      national_id, 
      first_name, 
      last_name, 
      email, 
      phone_number, 
      password,
      role 
    } = req.body;

    console.log('📝 Creating user with data:', {
      national_id, first_name, last_name, email, phone_number, role
    });

    // Validate required fields
    if (!national_id || !first_name || !last_name || !email || !phone_number || !role) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: national_id, first_name, last_name, email, phone_number, role'
      });
    }

    // Validate password (only for new users, not for updates)
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required for new users'
      });
    }

    // Hash the password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const query = `
      INSERT INTO users (
        national_id, first_name, last_name, email, phone_number, 
        password_hash, role, created_by
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, national_id, first_name, last_name, email, phone_number, role, created_at
    `;
    
    const values = [
      national_id, 
      first_name, 
      last_name, 
      email, 
      phone_number, 
      password_hash, 
      role, 
      req.user.id
    ];

    console.log('📊 Executing user creation query with values:', values);

    const result = await db.query(query, values);
    
    console.log('✅ User created successfully:', result.rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Create user error:', error);
    
    // Handle duplicate key errors
    if (error.code === '23505') {
      if (error.constraint.includes('email')) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists'
        });
      }
      if (error.constraint.includes('national_id')) {
        return res.status(400).json({
          success: false,
          error: 'National ID already exists'
        });
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to create user: ' + error.message
    });
  }
});

// UPDATE USER (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      first_name, 
      last_name, 
      email, 
      phone_number, 
      role, 
      is_active 
    } = req.body;

    // Check if user exists
    const checkQuery = 'SELECT id FROM users WHERE id = $1';
    const checkResult = await db.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const query = `
      UPDATE users 
      SET 
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        phone_number = COALESCE($4, phone_number),
        role = COALESCE($5, role),
        is_active = COALESCE($6, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING id, national_id, first_name, last_name, email, phone_number, role, is_active, updated_at
    `;
    
    const values = [
      first_name, 
      last_name, 
      email, 
      phone_number, 
      role, 
      is_active, 
      id
    ];

    const result = await db.query(query, values);
    
    res.json({
      success: true,
      message: 'User updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update user error:', error);
    
    // Handle duplicate email
    if (error.code === '23505' && error.constraint.includes('email')) {
      return res.status(400).json({
        success: false,
        error: 'Email already exists'
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user' 
    });
  }
});

// DELETE USER (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const checkQuery = 'SELECT id, first_name, last_name FROM users WHERE id = $1';
    const checkResult = await db.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const query = 'DELETE FROM users WHERE id = $1';
    await db.query(query, [id]);
    
    res.json({
      success: true,
      message: `User ${checkResult.rows[0].first_name} ${checkResult.rows[0].last_name} deleted successfully`
    });
  } catch (error) {
    console.error('Delete user error:', error);
    
    // Handle foreign key constraints
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete user. User has related records in the system.'
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete user' 
    });
  }
});

// GET USER PROFILE (Authenticated user)
router.get('/profile/me', async (req, res) => {
  try {
    const query = `
      SELECT id, national_id, first_name, last_name, email, phone_number, 
             role, is_active, created_at, updated_at
      FROM users 
      WHERE id = $1
    `;
    const result = await db.query(query, [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profile' 
    });
  }
});

// GET TENANTS FOR AGENT (Agent and Admin only)
router.get('/role/tenants', requireAgent, async (req, res) => {
  try {
    const agentId = req.user.id;

    const query = `
      SELECT DISTINCT 
        u.id,
        u.national_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_number,
        u.role,
        u.is_active,
        u.created_at,
        p.name as property_name,
        pu.unit_number,
        ta.lease_start_date,
        ta.monthly_rent
      FROM users u
      INNER JOIN tenant_allocations ta ON u.id = ta.tenant_id
      INNER JOIN property_units pu ON ta.unit_id = pu.id
      INNER JOIN properties p ON pu.property_id = p.id
      INNER JOIN complaints c ON pu.id = c.unit_id
      WHERE c.assigned_agent = $1 
        AND u.role = 'tenant'
        AND ta.is_active = true
      ORDER BY u.first_name, u.last_name
    `;

    const result = await db.query(query, [agentId]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching tenants for agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenants'
    });
  }
});

module.exports = router;