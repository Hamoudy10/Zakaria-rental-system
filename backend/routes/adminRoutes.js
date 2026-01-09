const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ============================
// Try to load controllers with better error handling
// ============================

let dashboardController;
let adminSettingsController;

try {
  dashboardController = require('../controllers/dashboardController');
  console.log('✅ Dashboard controller loaded successfully');
} catch (err) {
  console.error('❌ Failed to load dashboardController:', err.message);
  // Create placeholder controller
  dashboardController = {
    getAdminStats: async (req, res) => res.json({ 
      success: true, 
      data: { 
        totalProperties: 0, 
        occupancyRate: '0%', 
        activeTenants: 0, 
        totalRevenue: 0 
      } 
    }),
    getRecentActivities: async (req, res) => res.json({ success: true, data: [] }),
    getTopProperties: async (req, res) => res.json({ success: true, data: [] })
  };
}

try {
  adminSettingsController = require('../controllers/adminSettingsController');
  console.log('✅ Admin settings controller loaded successfully');

   // ADD THESE LINES:
  console.log('Controller object:', adminSettingsController);
  console.log('Type of getAllSettings:', typeof adminSettingsController.getAllSettings);
  console.log('All keys in controller:', Object.keys(adminSettingsController));

} catch (err) {
  console.error('❌ Failed to load adminSettingsController:', err.message);
  // This is critical - we need this controller for billing settings
  throw new Error('adminSettingsController is required for billing system');
}

// ============================
// Admin Dashboard Routes
// ============================

// GET /api/admin/dashboard/stats
console.log('Setting up route for /dashboard/stats');
router.get('/dashboard/stats', protect, adminOnly, (req, res, next) => {
  if (dashboardController.getAdminStats) {
    return dashboardController.getAdminStats(req, res, next);
  }
  res.status(501).json({ success: false, message: 'Dashboard stats not available' });
});

console.log('Setting up route for /dashboard/recent-activities');
// GET /api/admin/dashboard/recent-activities
router.get('/dashboard/recent-activities', protect, adminOnly, (req, res, next) => {
  if (dashboardController.getRecentActivities) {
    return dashboardController.getRecentActivities(req, res, next);
  }
  res.status(501).json({ success: false, message: 'Recent activities not available' });
});

console.log('Setting up route for /dashboard/top-properties');
// GET /api/admin/dashboard/top-properties
router.get('/dashboard/top-properties', protect, adminOnly, (req, res, next) => {
  if (dashboardController.getTopProperties) {
    return dashboardController.getTopProperties(req, res, next);
  }
  res.status(501).json({ success: false, message: 'Top properties not available' });
});

// ============================
// Admin Settings Routes
// ============================

console.log('Setting up admin settings routes');
// GET all settings (grouped by category)
router.get('/settings', protect, adminOnly, adminSettingsController.getAllSettings);

console.log('Setting up route for /settings/category');
// GET settings by category (e.g., /api/admin/settings/category?category=billing)
router.get('/settings/category', protect, adminOnly, adminSettingsController.getSettingsByCategory);

console.log('Setting up route for PUT /settings');
// UPDATE multiple settings
router.put('/settings', protect, adminOnly, adminSettingsController.updateMultipleSettings);

console.log('Setting up route for POST /settings/reset-defaults');
// RESET settings to defaults
router.post('/settings/reset-defaults', protect, adminOnly, adminSettingsController.resetToDefaults);

console.log('Setting up route for /settings/billing/config');
// GET billing configuration
router.get('/settings/billing/config', protect, adminOnly, adminSettingsController.getBillingConfig);

console.log('Setting up route for GET /settings/:key');
// GET single setting by key
router.get('/settings/:key', protect, adminOnly, adminSettingsController.getSettingByKey);

console.log('Setting up route for PUT /settings/:key');
// UPDATE single setting
router.put('/settings/:key', protect, adminOnly, adminSettingsController.updateSettingByKey);


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