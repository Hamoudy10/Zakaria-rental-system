const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public routes (for system startup)
router.get('/status', cronController.getCronStatus);

// Admin protected routes
router.post('/start', protect, adminOnly, cronController.startCronService);
router.post('/stop', protect, adminOnly, cronController.stopCronService);
router.post('/trigger-billing', protect, adminOnly, cronController.triggerManualBilling);
router.get('/history', protect, adminOnly, cronController.getBillingHistory);
router.get('/failed-sms', protect, adminOnly, cronController.getFailedSMS);
router.post('/retry-sms', protect, adminOnly, cronController.retryFailedSMS);

module.exports = router;