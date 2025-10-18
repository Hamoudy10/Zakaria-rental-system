const express = require('express');
const router = express.Router();

// Simple inline middleware for testing
const protect = (req, res, next) => {
  req.user = { userId: 'test', role: 'admin' };
  next();
};

console.log('Properties routes loaded');

// Get all properties
router.get('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Properties route working',
    data: []
  });
});

module.exports = router;