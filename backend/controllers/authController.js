const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * Authentication Controller - FIXED VERSION
 */

// User login - FIXED TOKEN GENERATION
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt for email:', email);

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const userResult = await pool.query(
      `SELECT 
        id, national_id, first_name, last_name, email, phone_number, 
        password_hash, role, is_active, created_at, updated_at
       FROM users 
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Login failed: User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];
    console.log('✅ User found:', { id: user.id, email: user.email });

    // Check if user is active
    if (!user.is_active) {
      console.log('❌ Login failed: User account inactive');
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      console.log('❌ Login failed: Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // ✅ FIXED: Generate token with PROPER payload structure
    const tokenPayload = {
      id: user.id, // THIS IS CRITICAL - MUST BE INCLUDED
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name
    };

    console.log('🔄 Generating token with payload:', tokenPayload);

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024',
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    // Verify the token was created correctly
    const decodedToken = jwt.decode(token);
    console.log('✅ Token generated successfully. Decoded:', decodedToken);

    console.log('✅ Login successful for user:', user.email);

    // Return user data (excluding password)
    res.json({
      success: true,
      message: 'Login successful',
      token: token,
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
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};

// User registration - FIXED TOKEN GENERATION
const register = async (req, res) => {
  try {
    const {
      national_id,
      first_name,
      last_name,
      email,
      phone_number,
      password,
      role = 'tenant'
    } = req.body;

    console.log('👤 User registration attempt:', { email, role });

    // Validate required fields
    if (!national_id || !first_name || !last_name || !email || !phone_number || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR national_id = $2 OR phone_number = $3',
      [email, national_id, phone_number]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email, national ID, or phone number'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (
        national_id, first_name, last_name, email, phone_number, password_hash, role
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING id, national_id, first_name, last_name, email, phone_number, role, created_at`,
      [national_id, first_name, last_name, email, phone_number, hashedPassword, role]
    );

    const user = newUser.rows[0];
    console.log('✅ User registered:', { id: user.id, email: user.email });

    // ✅ FIXED: Generate token with PROPER payload
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024',
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    console.log('✅ Registration token generated with payload:', tokenPayload);

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
        role: user.role,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    // req.user should be set by the middleware
    console.log('📋 Get profile - User from middleware:', req.user);
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    res.json({
      success: true,
      data: req.user
    });

  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile',
      error: error.message
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, phone_number } = req.body;

    console.log('📝 Updating profile for user:', userId);

    const result = await pool.query(
      `UPDATE users 
       SET first_name = $1, last_name = $2, phone_number = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, national_id, first_name, last_name, email, phone_number, role, is_active, created_at, updated_at`,
      [first_name, last_name, phone_number, userId]
    );

    const updatedUser = result.rows[0];

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile',
      error: error.message
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    console.log('🔑 Changing password for user:', userId);

    // Get current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    const currentHashedPassword = userResult.rows[0].password_hash;

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(current_password, currentHashedPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const newHashedPassword = await bcrypt.hash(new_password, 12);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHashedPassword, userId]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error changing password',
      error: error.message
    });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    console.log('🚪 User logout:', req.user?.email);
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout',
      error: error.message
    });
  }
};

// Debug token endpoint
const debugToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.decode(token);
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024');
    
    res.json({
      success: true,
      decoded: decoded,
      verified: verified,
      message: 'Token analysis complete'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error analyzing token',
      error: error.message
    });
  }
};

// Health check
const healthCheck = async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW() as timestamp');
    res.json({
      success: true,
      message: 'Auth service is healthy',
      data: {
        timestamp: dbResult.rows[0].timestamp,
        service: 'authentication'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Auth service is unhealthy',
      error: error.message
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  debugToken,
  healthCheck
};