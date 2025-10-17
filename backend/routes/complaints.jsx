const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes
router.use(protect);

// Placeholder routes
router.get('/', (req, res) => {
  res.status(200).json({ message: 'Get all complaints' });
});

router.post('/', (req, res) => {
  res.status(200).json({ message: 'Create a complaint' });
});

module.exports = router;