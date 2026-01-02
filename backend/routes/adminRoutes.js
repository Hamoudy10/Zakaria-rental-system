// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// ============================
// Admin Dashboard Routes
// ============================

// GET /api/admin/dashboard/stats
router.get('/stats', dashboardController.getAdminStats);

// GET /api/admin/dashboard/activities
router.get('/activities', dashboardController.getRecentActivities);

// GET /api/admin/dashboard/top-properties
router.get('/top-properties', dashboardController.getTopProperties);

module.exports = router;
