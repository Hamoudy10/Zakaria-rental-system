const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { uploadCompanyLogo } = require('../middleware/uploadMiddleware');

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
  dashboardController = {
    getAdminStats: async (req, res) => res.json({ 
      success: true, 
      data: { totalProperties: 0, occupancyRate: '0%', activeTenants: 0, totalRevenue: 0 } 
    }),
    getRecentActivities: async (req, res) => res.json({ success: true, data: [] }),
    getTopProperties: async (req, res) => res.json({ success: true, data: [] })
  };
}

try {
  adminSettingsController = require('../controllers/adminSettingsController');
  console.log('✅ Admin settings controller loaded successfully');
  console.log('Controller methods:', Object.keys(adminSettingsController));
} catch (err) {
  console.error('❌ Failed to load adminSettingsController:', err.message);
  throw new Error('adminSettingsController is required for billing system');
}

// ============================
// Admin Dashboard Routes
// ============================

router.get('/dashboard/stats', protect, adminOnly, (req, res, next) => {
  if (dashboardController.getAdminStats) {
    return dashboardController.getAdminStats(req, res, next);
  }
  res.status(501).json({ success: false, message: 'Dashboard stats not available' });
});

router.get('/dashboard/recent-activities', protect, adminOnly, (req, res, next) => {
  if (dashboardController.getRecentActivities) {
    return dashboardController.getRecentActivities(req, res, next);
  }
  res.status(501).json({ success: false, message: 'Recent activities not available' });
});

router.get('/dashboard/top-properties', protect, adminOnly, (req, res, next) => {
  if (dashboardController.getTopProperties) {
    return dashboardController.getTopProperties(req, res, next);
  }
  res.status(501).json({ success: false, message: 'Top properties not available' });
});

// ============================
// Company Info Routes (NEW)
// ============================

console.log('Setting up company info routes');

// GET company info
router.get('/company-info', protect, adminOnly, adminSettingsController.getCompanyInfo);

// UPDATE company info (with optional logo upload)
router.put('/company-info', protect, adminOnly, uploadCompanyLogo, adminSettingsController.updateCompanyInfo);

// DELETE company logo
router.delete('/company-logo', protect, adminOnly, adminSettingsController.deleteCompanyLogo);

// ============================
// Admin Settings Routes
// ============================

console.log('Setting up admin settings routes');

// GET all settings (grouped by category)
router.get('/settings', protect, adminOnly, adminSettingsController.getAllSettings);

// GET settings by category
router.get('/settings/category', protect, adminOnly, adminSettingsController.getSettingsByCategory);

// UPDATE multiple settings
router.put('/settings', protect, adminOnly, adminSettingsController.updateMultipleSettings);

// RESET settings to defaults
router.post('/settings/reset-defaults', protect, adminOnly, adminSettingsController.resetToDefaults);

// GET billing configuration
router.get('/settings/billing/config', protect, adminOnly, adminSettingsController.getBillingConfig);

// GET single setting by key
router.get('/settings/:key', protect, adminOnly, adminSettingsController.getSettingByKey);

// UPDATE single setting
router.put('/settings/:key', protect, adminOnly, adminSettingsController.updateSettingByKey);

module.exports = router;