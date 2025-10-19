const express = require('express');
const router = express.Router();
const db = require('../config/database'); // Make sure this path is correct

// Simple inline middleware for testing
const protect = (req, res, next) => {
  // For now, just add a mock user for testing
  req.user = { id: 'test-user-id', role: 'admin' };
  next();
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
  };
};

console.log('Users routes loaded');

// GET ALL USERS
router.get('/', protect, authorize('admin'), async (req, res) => {
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

// GET USER BY ID
router.get('/:id', protect, authorize('admin'), async (req, res) => {
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

// CREATE NEW USER (POST)
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { 
      national_id, 
      first_name, 
      last_name, 
      email, 
      phone_number, 
      password_hash, 
      role 
    } = req.body;

    // Validate required fields
    if (!national_id || !first_name || !last_name || !email || !phone_number || !role) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: national_id, first_name, last_name, email, phone_number, role'
      });
    }

    const query = `
      INSERT INTO users (
        national_id, first_name, last_name, email, phone_number, 
        password_hash, role, created_by
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, national_id, first_name, last_name, email, phone_number, role, created_at
    `;
    
    // In a real app, you should hash the password properly
    // For now, using the provided password_hash or a default
    const hashedPassword = password_hash || 'temp_password_need_to_hash';
    
    const values = [
      national_id, 
      first_name, 
      last_name, 
      email, 
      phone_number, 
      hashedPassword, 
      role, 
      req.user.id // created_by
    ];

    const result = await db.query(query, values);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Create user error:', error);
    
    // Handle duplicate key errors
    if (error.code === '23505') { // PostgreSQL unique violation
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
      error: 'Failed to create user' 
    });
  }
});

// UPDATE USER (PUT)
router.put('/:id', protect, authorize('admin'), async (req, res) => {
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

// DELETE USER (DELETE)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
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

    // In a real application, you might want to soft delete instead
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

// GET USER PROFILE (Additional endpoint)
router.get('/profile/me', protect, async (req, res) => {
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

module.exports = router;