const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');
const { protect, adminOnly, agentOnly, requireAgent } = require('../middleware/authMiddleware');

console.log('🔍 DEBUG CRON ROUTES: Starting to load...');
console.log('🔍 DEBUG: cronController keys:', Object.keys(cronController));
console.log('🔍 DEBUG: agentOnly middleware available?', !!agentOnly);
// Public routes (for system startup)
router.get('/status', cronController.getCronStatus);

// Admin protected routes
router.post('/start', protect, agentOnly, cronController.startCronService);
router.post('/stop', protect, agentOnly, cronController.stopCronService);
router.post('/trigger-billing', protect, agentOnly, cronController.triggerManualBilling);
router.get('/history', protect, agentOnly, cronController.getBillingHistory);
// In backend/routes/cronRoutes.js, add:
router.get('/sms-history', protect, requireAgent, getSMSHistory);
router.get('/failed-sms', protect, agentOnly, cronController.getFailedSMS);
router.post('/retry-sms', protect, agentOnly, cronController.retryFailedSMS);

// ==================== AGENT-SPECIFIC ROUTES ====================
console.log('🔍 DEBUG: Setting up agent routes...');

// Agent billing SMS trigger
router.post('/agent/trigger-billing', protect, agentOnly, cronController.triggerAgentBillingSMS);

// Agent failed SMS management (filtered by their properties)
router.get('/agent/failed-sms', protect, agentOnly, cronController.getFailedSMS);
router.post('/agent/retry-sms', protect, agentOnly, cronController.retryFailedSMS);
console.log('🔍 DEBUG CRON ROUTES: All routes registered');

module.exports = router;