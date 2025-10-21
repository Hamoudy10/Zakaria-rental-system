// controllers/userController.js - Updated for UUID
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const getUsers = async (req, res) => {
  try {
    const query = `
      SELECT id, national_id, first_name, last_name, email, phone_number, 
             role, is_active, created_at, updated_at
      FROM users 
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching users'
    });
  }
};

const createUser = async (req, res) => {
  try {
    const { national_id, first_name, last_name, email, phone_number, password, role } = req.body;
    
    // Validate required fields
    if (!national_id || !first_name || !last_name || !email || !phone_number || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: national_id, first_name, last_name, email, phone_number, password, role'
      });
    }
    
    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    const query = `
      INSERT INTO users (national_id, first_name, last_name, email, phone_number, password_hash, role, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, national_id, first_name, last_name, email, phone_number, role, created_at
    `;
    
    const { rows } = await pool.query(query, [
      national_id, first_name, last_name, email, phone_number, password_hash, role, req.user.id
    ]);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Create user error:', error);
    
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        success: false,
        message: 'User with this email or national ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error creating user'
    });
  }
};

module.exports = {
  getUsers,
  createUser
};