const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication and agent role
router.use(authMiddleware.protect);
router.use(authMiddleware.authorize(['agent']));

// Agent dashboard routes
router.get('/dashboard/stats', agentController.getDashboardStats);
router.get('/properties', agentController.getAssignedProperties);
router.get('/tenants/payment-status', agentController.getTenantsWithPaymentStatus);
router.get('/activities/recent', agentController.getRecentActivities);
router.get('/performance/metrics', agentController.getPerformanceMetrics);

module.exports = router;