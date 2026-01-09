// backend/middleware/authMiddleware.js - UPDATED WITH authorize FUNCTION
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Main authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'zakaria-rental-system-secret-key-2024');
    
    // Get user from database to ensure they still exist and are active
    const userQuery = 'SELECT * FROM users WHERE id = $1 AND is_active = true';
    const userResult = await db.query(userQuery, [decoded.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      message: 'Token is not valid'
    });
  }
};

// Role-based middleware
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }

    next();
  };
};

// Alias for requireRole (for compatibility with existing code)
const authorize = (...roles) => {
  return requireRole(roles);
};

// Specific role middlewares
const requireAdmin = requireRole(['admin']);
const requireAgent = requireRole(['agent', 'admin']);
const requireTenant = requireRole(['tenant', 'agent', 'admin']);
const adminOnly = requireAdmin; 
// Alias for authMiddleware (for compatibility)
const protect = authMiddleware;

module.exports = {
  authMiddleware,
  protect, // Add this alias
  requireRole,
  authorize, // Add this alias for compatibility
  requireAdmin,
  adminOnly,
  requireAgent,
  requireTenant
};