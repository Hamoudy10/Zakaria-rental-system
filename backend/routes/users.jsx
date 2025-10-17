const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes
router.use(protect);

// Placeholder routes - we'll implement these later
router.get('/', (req, res) => {
  res.status(200).json({ message: 'Get all users' });
});

router.post('/', (req, res) => {
  res.status(200).json({ message: 'Create a user' });
});

module.exports = router;