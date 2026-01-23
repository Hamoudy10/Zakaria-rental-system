// backend/routes/waterBills.js
const express = require('express');
const router = express.Router();
const waterBillController = require('../controllers/waterBillController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

console.log('🔄 Loading WATER BILLS routes...');

// Apply auth middleware to all routes
router.use(authMiddleware);

// ========================================
// WATER BILL ROUTES
// ========================================
// IMPORTANT: Specific routes BEFORE generic /:id route

// Check missing water bills for a specific month
router.get('/missing-tenants', requireRole(['agent', 'admin']), waterBillController.checkMissingWaterBills);

// Get water balance for a specific tenant
router.get('/balance/:tenantId', requireRole(['agent', 'admin']), waterBillController.getTenantWaterBalance);

// Standard CRUD operations
router.post('/', requireRole(['agent', 'admin']), waterBillController.createWaterBill);
router.get('/', requireRole(['agent', 'admin']), waterBillController.listWaterBills);
router.get('/:id', requireRole(['agent', 'admin']), waterBillController.getWaterBill);
router.delete('/:id', requireRole(['agent', 'admin']), waterBillController.deleteWaterBill);

console.log('✅ WATER BILLS ROUTES LOADED');

module.exports = router;