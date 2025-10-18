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

console.log('Complaints routes loaded');

// Get complaints
router.get('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Complaints route working',
    data: []
  });
});

// Create complaint
router.post('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Complaint created',
    data: req.body
  });
});

module.exports = router;