// routes/auth.js - UPDATED WORKING VERSION
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database'); // Changed from pool to db for consistency
const { authMiddleware } = require('../middleware/authMiddleware'); // Updated import

console.log('✅ AUTH ROUTES LOADED');

// Token verification endpoint
router.get('/verify-token', authMiddleware, (req, res) => {
  console.log('✅ Token verification successful for user:', req.user.id);
  
  res.json({
    success: true,
    user: {
      id: req.user.id,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      email: req.user.email,
      role: req.user.role,
      phone_number: req.user.phone_number,
      created_at: req.user.created_at
    }
  });
});

// Register user
const register = async (req, res) => {
  try {
    console.log('📝 Register endpoint called');
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
    
    const result = await db.query(query, [
      national_id, first_name, last_name, email, phone_number, password_hash, role
    ]);

    const user = result.rows[0];

    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024',
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
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
    console.error('❌ Registration error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'User with this email or national ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error during registration: ' + error.message
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    console.log('🔐 Login endpoint called');
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
      WHERE email = $1 AND is_active = true
    `;
    
    const result = await db.query(query, [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    const user = result.rows[0];
    
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024',
      { expiresIn: '30d' }
    );
    
    console.log(`✅ Login successful for user: ${user.email} (${user.role})`);
    
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
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login: ' + error.message
    });
  }
};

// Get user profile (protected route)
const getProfile = async (req, res) => {
  try {
    console.log('👤 GetProfile endpoint called for user:', req.user.id);
    
    // User is already attached to req by authMiddleware
    const user = req.user;
    
    res.json({
      success: true,
      user: {
        id: user.id,
        national_id: user.national_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile: ' + error.message
    });
  }
};

// Debug login endpoint (for testing only)
router.post('/debug-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔍 DEBUG: Login attempt for:', email);
    
    // Find user
    const userResult = await db.query(
      'SELECT id, email, password_hash, first_name, last_name, role FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.json({ 
        success: false, 
        message: 'User not found or inactive' 
      });
    }
    
    const user = userResult.rows[0];
    console.log('🔍 DEBUG: User found:', user);
    
    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.json({ 
        success: false, 
        message: 'Invalid password' 
      });
    }
    
    // Generate token
    const testToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024',
      { expiresIn: '1h' }
    );
    
    console.log('🔍 DEBUG: Generated token payload:', jwt.decode(testToken));
    
    res.json({
      success: true,
      token: testToken,
      decoded: jwt.decode(testToken),
      user: { 
        id: user.id, 
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('❌ Debug login error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Set up routes
router.post('/register', register);
router.post('/login', login);
router.get('/profile', authMiddleware, getProfile); // Added authMiddleware protection

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes are working',
    timestamp: new Date().toISOString()
  });
});

console.log('✅ AUTH ROUTES SETUP COMPLETED');

module.exports = router;