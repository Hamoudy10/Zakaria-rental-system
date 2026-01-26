const express = require('express');
const router = express.Router();
const { protect, adminOnly, requireAgent } = require('../middleware/authMiddleware');
const { uploadCompanyLogo } = require('../middleware/uploadMiddleware');

// ============================
// Try to load controllers with better error handling
// ============================

let dashboardController;
let adminSettingsController;

try {
  dashboardController = require('../controllers/dashboardController');
  console.log('✅ Dashboard controller loaded successfully');
  console.log('Dashboard controller methods:', Object.keys(dashboardController));
} catch (err) {
  console.error('❌ Failed to load dashboardController:', err.message);
  dashboardController = {
    getAdminStats: async (req, res) => res.json({ 
      success: true, 
      data: { totalProperties: 0, occupancyRate: '0%', activeTenants: 0, totalRevenue: 0 } 
    }),
    getComprehensiveStats: async (req, res) => res.json({ 
      success: true, 
      data: {
        property: { totalProperties: 0, totalUnits: 0, occupiedUnits: 0, vacantUnits: 0, occupancyRate: '0.0' },
        tenant: { totalTenants: 0, activeTenants: 0, newThisMonth: 0, tenantsWithArrears: 0, totalArrears: 0 },
        financial: { revenueThisMonth: 0, revenueThisYear: 0, expectedMonthlyRent: 0, collectionRate: '0.0', pendingPaymentsAmount: 0, pendingPaymentsCount: 0, outstandingWater: 0, totalRentCollected: 0, totalWaterCollected: 0, totalArrearsCollected: 0 },
        agent: { totalAgents: 0, activeAgents: 0, assignedProperties: 0, unassignedProperties: 0 },
        complaint: { openComplaints: 0, inProgressComplaints: 0, resolvedComplaints: 0, resolvedThisMonth: 0, totalComplaints: 0 },
        sms: { totalSent: 0, sentToday: 0, failedCount: 0, pendingCount: 0 },
        payment: { paymentsToday: 0, amountToday: 0, paymentsThisWeek: 0, amountThisWeek: 0, paymentsThisMonth: 0, failedPayments: 0, processingPayments: 0 },
        unitTypeBreakdown: [],
        monthlyTrend: [],
        generatedAt: new Date().toISOString()
      }
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

// Legacy stats endpoint (for backward compatibility)
router.get('/dashboard/stats', protect, adminOnly, (req, res, next) => {
  if (dashboardController.getAdminStats) {
    return dashboardController.getAdminStats(req, res, next);
  }
  res.status(501).json({ success: false, message: 'Dashboard stats not available' });
});

// NEW: Comprehensive stats endpoint for redesigned dashboard
router.get('/dashboard/comprehensive-stats', protect, adminOnly, (req, res, next) => {
  if (dashboardController.getComprehensiveStats) {
    return dashboardController.getComprehensiveStats(req, res, next);
  }
  res.status(501).json({ success: false, message: 'Comprehensive stats not available' });
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
router.get('/company-info', protect, requireAgent, adminSettingsController.getCompanyInfo);

// UPDATE company info (with optional logo upload)
router.put('/company-info', protect, requireAgent, uploadCompanyLogo, adminSettingsController.updateCompanyInfo);

// DELETE company logo
router.delete('/company-logo', protect, requireAgent, adminSettingsController.deleteCompanyLogo);

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