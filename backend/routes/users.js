const express = require('express');
const router = express.Router();

// Simple inline middleware for testing
const protect = (req, res, next) => {
  // For now, just add a mock user for testing
  req.user = { userId: 'test', role: 'admin' };
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

// Get all users
router.get('/', protect, authorize('admin'), (req, res) => {
  res.json({
    success: true,
    message: 'Users route working',
    data: []
  });
});

module.exports = router;