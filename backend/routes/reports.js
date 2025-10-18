const express = require('express');
const router = express.Router();

// Simple inline middleware for testing
const protect = (req, res, next) => {
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

console.log('Reports routes loaded');

// Get reports
router.get('/', protect, authorize('admin', 'agent'), (req, res) => {
  res.json({
    success: true,
    message: 'Reports route working',
    data: []
  });
});

module.exports = router;