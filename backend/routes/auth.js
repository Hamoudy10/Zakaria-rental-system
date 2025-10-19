// routes/auth.js - TEMPORARY WORKING VERSION
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

console.log('=== TEMPORARY AUTH ROUTE LOADED ===');
/*
router.get('/verify-token', protect, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});
*/

// Register user
const register = async (req, res) => {
  try {
    console.log('Register endpoint called');
    const { national_id, first_name, last_name, email, phone_number, password, role } = req.body;

    // Basic validation
    if (!national_id || !first_name || !last_name || !email || !phone_number || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    const query = `
      INSERT INTO users (national_id, first_name, last_name, email, phone_number, password_hash, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, national_id, first_name, last_name, email, phone_number, role, created_at
    `;
    
    const { rows } = await pool.query(query, [
      national_id, first_name, last_name, email, phone_number, password_hash, role
    ]);

    const token = jwt.sign(
      { 
        userId: rows[0].id,
        email: rows[0].email,
        role: rows[0].role 
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'User with this email or national ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    console.log('Login endpoint called');
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    const query = `
      SELECT id, national_id, first_name, last_name, email, phone_number, password_hash, role, is_active
      FROM users 
      WHERE email = $1
    `;
    
    const { rows } = await pool.query(query, [email]);
    
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    const user = rows[0];
    
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        national_id: user.national_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    console.log('GetProfile endpoint called');
    res.json({
      success: true,
      message: 'Profile route working - authentication not implemented yet'
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile'
    });
  }
};

// Set up routes
router.post('/register', register);
router.post('/login', login);
router.get('/profile', getProfile);

console.log('=== TEMPORARY AUTH ROUTES SET UP ===');

module.exports = router;