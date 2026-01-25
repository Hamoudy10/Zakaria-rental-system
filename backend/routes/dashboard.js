// routes/dashboard.js
const express = require('express');
const router = express.Router();
const {
  getAdminStats,
  getComprehensiveStats,
  getRecentActivities,
  getTopProperties
} = require('../controllers/dashboardController');

// Admin dashboard routes
router.get('/stats', getAdminStats);
router.get('/comprehensive-stats', getComprehensiveStats);
router.get('/recent-activities', getRecentActivities);
router.get('/top-properties', getTopProperties);

module.exports = router;