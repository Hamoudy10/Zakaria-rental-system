const express = require('express');
const router = express.Router();

// Simple inline middleware for testing
const protect = (req, res, next) => {
  req.user = { userId: 'test', role: 'admin' };
  next();
};

console.log('Notifications routes loaded');

// Get notifications
router.get('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Notifications route working',
    data: []
  });
});

module.exports = router;