// controllers/authController.js
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

console.log('=== AUTH CONTROLLER LOADING ===');

// Register user
const register = async (req, res) => {
  try {
    console.log('Register function called');
    const { national_id, first_name, last_name, email, phone_number, password, role } = req.body;

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
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    console.log('Login function called');
    const { email, password } = req.body;
    
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
    console.log('GetProfile function called');
    res.json({
      success: true,
      message: 'Profile route working'
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile'
    });
  }
};

// Debug: Check if functions are defined before export
console.log('Before export - register:', typeof register);
console.log('Before export - login:', typeof login);
console.log('Before export - getProfile:', typeof getProfile);

// Export the functions
module.exports = {
  register,
  login,
  getProfile
};

console.log('=== AUTH CONTROLLER EXPORTED ===');
console.log('Module exports:', module.exports);