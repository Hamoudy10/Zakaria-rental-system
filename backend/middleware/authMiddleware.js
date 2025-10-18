const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token provided'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user still exists and is active
      const userQuery = `
        SELECT id, role, is_active 
        FROM users 
        WHERE id = $1 AND is_active = true
      `;
      const { rows } = await pool.query(userQuery, [decoded.userId]);
      
      if (rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      req.user = {
        userId: decoded.userId,
        role: decoded.role
      };

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, invalid token'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error in authentication'
    });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

module.exports = {
  protect,
  authorize
};