const express = require('express');
const router = express.Router();

// Simple inline middleware for testing
const protect = (req, res, next) => {
  req.user = { userId: 'test', role: 'admin' };
  next();
};

console.log('Payments routes loaded');

// Get payments
router.get('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Payments route working',
    data: []
  });
});

module.exports = router;