const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

/**
 * Complete Authentication Middleware with all required functions
 */

const protect = async (req, res, next) => {
  try {
    let token;

    console.log('🔐 Auth Middleware - Checking for token...');

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('✅ Token found in header');
    }

    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token provided'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024');
      
      console.log('🔍 Decoded token:', decoded);

      // Extract user ID - check multiple possible field names
      const userId = decoded.id || decoded.userId || decoded.user_id;
      
      if (!userId) {
        console.log('❌ Token missing user ID. Available fields:', Object.keys(decoded));
        return res.status(401).json({
          success: false,
          message: 'Invalid token - missing user ID'
        });
      }

      console.log(`🔐 Extracted user ID: ${userId}`);

      // Get user from database
      const userResult = await pool.query(
        `SELECT 
          id, national_id, first_name, last_name, email, phone_number, 
          role, is_active, created_at, updated_at
         FROM users 
         WHERE id = $1 AND is_active = true`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        console.log(`❌ User not found or inactive: ${userId}`);
        return res.status(401).json({
          success: false,
          message: 'User not found or account is inactive'
        });
      }

      // Attach user to request
      req.user = userResult.rows[0];
      console.log(`✅ User authenticated: ${req.user.first_name} ${req.user.last_name}`);
      
      next();

    } catch (jwtError) {
      console.error('❌ JWT verification failed:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed'
      });
    }

  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in authentication',
      error: error.message
    });
  }
};

/**
 * Role-based authorization middleware
 * This is the function that allocations.js is trying to use
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no user found'
      });
    }

    if (!roles.includes(req.user.role)) {
      console.log(`🚫 Access denied for ${req.user.role} to ${req.originalUrl}`);
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }

    console.log(`✅ Role authorized: ${req.user.role} accessing ${req.originalUrl}`);
    next();
  };
};

/**
 * Admin-only middleware
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no user found'
    });
  }

  if (req.user.role !== 'admin') {
    console.log(`🚫 Admin access denied for ${req.user.role}`);
    return res.status(403).json({
      success: false,
      message: 'Admin privileges required'
    });
  }

  console.log(`✅ Admin access granted: ${req.user.first_name}`);
  next();
};

/**
 * Agent or admin middleware
 */
const requireAgentOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no user found'
    });
  }

  if (!['admin', 'agent'].includes(req.user.role)) {
    console.log(`🚫 Agent/Admin access denied for ${req.user.role}`);
    return res.status(403).json({
      success: false,
      message: 'Agent or admin privileges required'
    });
  }

  console.log(`✅ Agent/Admin access granted: ${req.user.role}`);
  next();
};

/**
 * Optional authentication middleware
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024');
      const userId = decoded.id || decoded.userId || decoded.user_id;
      
      const userResult = await pool.query(
        `SELECT id, national_id, first_name, last_name, email, phone_number, role, is_active
         FROM users WHERE id = $1 AND is_active = true`,
        [userId]
      );

      if (userResult.rows.length > 0) {
        req.user = userResult.rows[0];
        console.log(`✅ Optional auth - User attached: ${req.user.first_name}`);
      }
    } catch (jwtError) {
      console.log('⚠️ Optional auth - Invalid token, continuing without user');
    }

    next();
  } catch (error) {
    console.error('❌ Optional auth middleware error:', error);
    next();
  }
};

/**
 * Generate JWT token utility
 */
const generateToken = (user) => {
  console.log('🔄 Generating token for user:', user.id, user.email);
  
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

  console.log('✅ Token generated with payload:', tokenPayload);
  return token;
};

/**
 * Verify token utility
 */
const verifyToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024');
    const userId = decoded.id || decoded.userId || decoded.user_id;
    
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email, role, is_active FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    return userResult.rows[0];
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
};

/**
 * Hash password utility
 */
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password utility
 */
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

module.exports = {
  protect,
  authorize,        // ✅ Added back - this is what allocations.js needs
  requireAdmin,
  requireAgentOrAdmin,
  optionalAuth,
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword
};