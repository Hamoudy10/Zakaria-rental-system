const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');
const { protect, adminOnly, requireAgent } = require('../middleware/authMiddleware');

console.log('🔍 DEBUG CRON ROUTES: Starting to load...');
console.log('🔍 DEBUG: cronController keys:', Object.keys(cronController));
console.log('🔍 DEBUG: requireAgent middleware available?', !!requireAgent);
// Public routes (for system startup)
router.get('/status', cronController.getCronStatus);

// Admin protected routes
router.post('/start', protect, requireAgent, cronController.startCronService);
router.post('/stop', protect, requireAgent, cronController.stopCronService);
router.post('/trigger-billing', protect, requireAgent, cronController.triggerManualBilling);
router.get('/history', protect, requireAgent, cronController.getBillingHistory);
router.get('/failed-sms', protect, requireAgent, cronController.getFailedSMS);
router.post('/retry-sms', protect, requireAgent, cronController.retryFailedSMS);

// ==================== AGENT-SPECIFIC ROUTES ====================
console.log('🔍 DEBUG: Setting up agent routes...');

// Agent billing SMS trigger
router.post('/agent/trigger-billing', protect, requireAgent, cronController.triggerAgentBillingSMS);

// Agent failed SMS management (filtered by their properties)
router.get('/agent/failed-sms', protect, requireAgent, cronController.getFailedSMS);
router.post('/agent/retry-sms', protect, requireAgent, cronController.retryFailedSMS);
console.log('🔍 DEBUG CRON ROUTES: All routes registered');

module.exports = router;