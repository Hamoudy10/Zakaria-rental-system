// backend/routes/agentProperties.js
const express = require('express');
const router = express.Router();
const agentPropertyController = require('../controllers/agentPropertyController');
const authMiddleware = require('../middleware/authMiddleware').authMiddleware;
const requireRole = require('../middleware/authMiddleware').requireRole;
const waterBillController = require('../controllers/waterBillController');
const adminOnly = requireRole(['admin']);
const agentOrAdmin = requireRole(['agent','admin']);

console.log('DEBUG: requireRole typeof:', typeof requireRole);
console.log('DEBUG: adminOnly typeof:', typeof adminOnly);
console.log('DEBUG: agentOrAdmin typeof:', typeof agentOrAdmin);
console.log('DEBUG: agentPropertyController.assignPropertiesToAgent typeof:', typeof agentPropertyController.assignPropertiesToAgent);
console.log('DEBUG: waterBillController.createWaterBill typeof:', typeof waterBillController.createWaterBill);

// Short guard to prevent startup crash and give clearer message
if (typeof adminOnly !== 'function' || typeof agentOrAdmin !== 'function') {
  console.error('❌ Route registration aborted: requireRole returned non-function. Check auth middleware exports.');
}
if (typeof agentPropertyController.assignPropertiesToAgent !== 'function') {
  console.error('❌ Route registration aborted: assignPropertiesToAgent is not a function. Check controller export.');
}
if (typeof waterBillController.createWaterBill !== 'function') {
  console.error('❌ Route registration aborted: createWaterBill is not a function. Check controller export.');
}

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

router.post('/water-bills', requireRole(['agent','admin']), waterBillController.createWaterBill);
router.get('/water-bills', requireRole(['agent','admin']), waterBillController.listWaterBills);
router.get('/water-bills/:id', requireRole(['agent','admin']), waterBillController.getWaterBill);
router.delete('/water-bills/:id', requireRole(['agent','admin']), waterBillController.deleteWaterBill);

console.log('✅ AGENT PROPERTIES ROUTES LOADED');

module.exports = router;