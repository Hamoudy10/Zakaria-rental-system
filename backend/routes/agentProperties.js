// backend/routes/agentProperties.js
const express = require('express');
const router = express.Router();
const agentPropertyController = require('../controllers/agentPropertyController');
const authMiddleware = require('../middleware/authMiddleware').authMiddleware;
const requireRole = require('../middleware/authMiddleware').requireRole;

console.log('🔄 Loading AGENT PROPERTIES routes...');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Admin routes - agent property assignments
router.post('/assign', requireRole(['admin']), agentPropertyController.assignPropertiesToAgent);

router.get('/allocations', requireRole(['admin']), agentPropertyController.getAgentAllocations);

router.delete('/:id', requireRole(['admin']), agentPropertyController.removeAgentAllocation);

// Agent routes - get assigned data
router.get('/my-properties', requireRole(['agent', 'admin']), agentPropertyController.getMyProperties);

router.get('/my-tenants', requireRole(['agent', 'admin']), agentPropertyController.getMyTenants);

router.get('/my-complaints', requireRole(['agent', 'admin']), agentPropertyController.getMyComplaints);

router.get('/dashboard-stats', requireRole(['agent', 'admin']), agentPropertyController.getAgentDashboardStats);

console.log('✅ AGENT PROPERTIES ROUTES LOADED');

module.exports = router;