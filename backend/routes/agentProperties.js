// backend/routes/agentProperties.js
const express = require('express');
const router = express.Router();
const agentPropertyController = require('../controllers/agentPropertyController');
const waterBillController = require('../controllers/waterBillController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

console.log('🔄 Loading AGENT PROPERTIES routes...');

// Apply auth middleware to all routes
router.use(authMiddleware);

// ========================================
// ADMIN ROUTES - Agent Property Assignments
// ========================================
router.post('/assign', requireRole(['admin']), agentPropertyController.assignPropertiesToAgent);
router.get('/allocations', requireRole(['admin']), agentPropertyController.getAgentAllocations);
router.delete('/:id', requireRole(['admin']), agentPropertyController.removeAgentAllocation);

// ========================================
// AGENT ROUTES - Get Assigned Data
// ========================================
router.get('/my-properties', requireRole(['agent', 'admin']), agentPropertyController.getMyProperties);
router.get('/my-tenants', requireRole(['agent', 'admin']), agentPropertyController.getMyTenants);
router.get('/my-complaints', requireRole(['agent', 'admin']), agentPropertyController.getMyComplaints);
router.get('/dashboard-stats', requireRole(['agent', 'admin']), agentPropertyController.getAgentDashboardStats);

// ========================================
// WATER BILL ROUTES (Agent-scoped)
// ========================================
// IMPORTANT: Specific routes BEFORE generic /:id route
router.get('/water-bills/balance/:tenantId', requireRole(['agent', 'admin']), waterBillController.getTenantWaterBalance);

router.post('/water-bills', requireRole(['agent', 'admin']), waterBillController.createWaterBill);
router.get('/water-bills', requireRole(['agent', 'admin']), waterBillController.listWaterBills);
router.get('/water-bills/:id', requireRole(['agent', 'admin']), waterBillController.getWaterBill);
router.delete('/water-bills/:id', requireRole(['agent', 'admin']), waterBillController.deleteWaterBill);

console.log('✅ AGENT PROPERTIES ROUTES LOADED');

module.exports = router;