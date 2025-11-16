// backend/routes/agents.js
const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Apply agent role middleware to all routes
router.use(roleMiddleware(['agent', 'admin']));

// Dashboard routes
router.get('/dashboard/stats', agentController.getDashboardStats);
router.get('/properties', agentController.getAssignedProperties);
router.get('/activities', agentController.getRecentActivities);
router.get('/performance', agentController.getPerformanceMetrics);

// Tenant management routes
router.get('/tenants', agentController.getTenantsWithPaymentStatus);

// Complaint management routes
router.get('/complaints', agentController.getAssignedComplaints);
router.put('/complaints/:id', agentController.updateComplaintStatus);

// Salary routes
router.get('/salary-history', agentController.getSalaryHistory);

module.exports = router;