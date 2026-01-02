// routes/dashboard.js
const express = require('express')
const router = express.Router()
const {
  getAdminStats,
  getRecentActivities,
  getTopProperties
} = require('../controllers/dashboardController')

// Admin dashboard routes
router.get('/stats', getAdminStats)
router.get('/recent-activities', getRecentActivities)
router.get('/top-properties', getTopProperties)

module.exports = router
