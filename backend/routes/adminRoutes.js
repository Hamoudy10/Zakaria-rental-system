const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const adminSettingsController = require('../controllers/adminSettingsController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ============================
// Admin Dashboard Routes
// ============================

// GET /api/admin/dashboard/stats
router.get('/dashboard/stats', protect, adminOnly, dashboardController.getAdminStats);

// GET /api/admin/dashboard/activities
router.get('/dashboard/recent-activities', protect, adminOnly, dashboardController.getRecentActivities);

// GET /api/admin/dashboard/top-properties
router.get('/dashboard/top-properties', protect, adminOnly, dashboardController.getTopProperties);

// ============================
// Admin Settings Routes
// ============================

// GET all settings (grouped by category)
router.get('/settings', protect, adminOnly, adminSettingsController.getAllSettings);

// GET settings by category (e.g., /api/admin/settings/category?category=billing)
router.get('/settings/category', protect, adminOnly, adminSettingsController.getSettingsByCategory);

// GET single setting by key
router.get('/settings/:key', protect, adminOnly, adminSettingsController.getSettingByKey);

// UPDATE single setting
router.put('/settings/:key', protect, adminOnly, adminSettingsController.updateSettingByKey);

// UPDATE multiple settings
router.put('/settings', protect, adminOnly, adminSettingsController.updateMultipleSettings);

// RESET settings to defaults
router.post('/settings/reset-defaults', protect, adminOnly, adminSettingsController.resetToDefaults);

// GET billing configuration
router.get('/settings/billing/config', protect, adminOnly, adminSettingsController.getBillingConfig);

// ============================
// Admin Billing Management Routes
// ============================

// These will be added when we create billing management controller
// GET billing history
// router.get('/billing/history', protect, adminOnly, billingController.getBillingHistory);

// GET failed SMS for retry
// router.get('/billing/failed-sms', protect, adminOnly, billingController.getFailedSMS);

// TRIGGER manual billing
// router.post('/billing/trigger', protect, adminOnly, billingController.triggerManualBilling);

module.exports = router;