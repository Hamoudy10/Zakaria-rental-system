// backend/routes/agentProperties.js
const express = require('express');
const router = express.Router();
const agentPropertyController = require('../controllers/agentPropertyController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Admin routes for agent property management
router.post('/assign', protect, authorize('admin'), agentPropertyController.assignPropertiesToAgent);
router.delete('/:allocationId', protect, authorize('admin'), agentPropertyController.removeAgentPropertyAssignment);
router.get('/allocations', protect, authorize('admin'), agentPropertyController.getAllAgentPropertyAssignments);

// Agent routes for accessing assigned data
router.get('/my-properties', protect, authorize('agent'), agentPropertyController.getMyAssignedProperties);
router.get('/my-tenants', protect, authorize('agent'), agentPropertyController.getMyTenants);
router.get('/my-complaints', protect, authorize('agent'), agentPropertyController.getMyComplaints);
router.get('/dashboard-stats', protect, authorize('agent'), agentPropertyController.getAgentDashboardStats);

module.exports = router;