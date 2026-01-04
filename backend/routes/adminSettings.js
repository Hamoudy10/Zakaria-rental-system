const express = require('express');
const router = express.Router();

const settingsController = require('../controllers/adminSettingsController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Roles
const adminOnly = requireRole(['admin']);

console.log('🔄 Loading ADMIN SETTINGS routes...');

// All settings routes require authentication
router.use(authMiddleware);

/* ============================
   GET ALL SETTINGS
   GET /api/admin-settings
============================ */
router.get(
  '/',
  adminOnly,
  settingsController.getAllSettings
);

/* ============================
   GET SETTINGS BY CATEGORY
   GET /api/admin-settings/category?category=appearance
============================ */
router.get(
  '/category',
  adminOnly,
  settingsController.getSettingsByCategory
);

/* ============================
   GET SINGLE SETTING
   GET /api/admin-settings/:key
============================ */
router.get(
  '/:key',
  adminOnly,
  settingsController.getSettingByKey
);

/* ============================
   UPDATE SINGLE SETTING
   PUT /api/admin-settings/:key
============================ */
router.put(
  '/:key',
  adminOnly,
  settingsController.updateSettingByKey
);

/* ============================
   UPDATE MULTIPLE SETTINGS
   PUT /api/admin-settings
============================ */
router.put(
  '/',
  adminOnly,
  settingsController.updateMultipleSettings
);

console.log('✅ ADMIN SETTINGS ROUTES LOADED');

module.exports = router;
