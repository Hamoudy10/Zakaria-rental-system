const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');
const { protect, adminOnly, requireAgent } = require('../middleware/authMiddleware');

// Public routes (for system startup)
router.get('/status', cronController.getCronStatus);

// Admin protected routes
router.post('/start', protect, adminOnly, cronController.startCronService);
router.post('/stop', protect, adminOnly, cronController.stopCronService);
router.post('/trigger-billing', protect, adminOnly, cronController.triggerManualBilling);
router.get('/history', protect, adminOnly, cronController.getBillingHistory);
router.get('/failed-sms', protect, adminOnly, cronController.getFailedSMS);
router.post('/retry-sms', protect, adminOnly, cronController.retryFailedSMS);

// ==================== AGENT-SPECIFIC ROUTES ====================
// Agent billing SMS trigger
router.post('/agent/trigger-billing', protect, requireAgent, cronController.triggerAgentBillingSMS);

// Agent failed SMS management (filtered by their properties)
router.get('/agent/failed-sms', protect, requireAgent, cronController.getFailedSMS);
router.post('/agent/retry-sms', protect, requireAgent, cronController.retryFailedSMS);
module.exports = router;