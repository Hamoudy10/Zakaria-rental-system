// backend/routes/waterBills.js
const express = require('express');
const router = express.Router();
const waterBillController = require('../controllers/waterBillController');
const { protect, requireAgent } = require('../middleware/authMiddleware');

console.log('🔄 Loading WATER BILLS routes...');

// Apply auth middleware to all routes
router.use(protect);

// ========================================
// WATER BILL ROUTES
// ========================================
// IMPORTANT: Specific routes BEFORE generic /:id route

// Check missing water bills for a specific month
router.get('/missing-tenants', requireAgent, waterBillController.checkMissingWaterBills);

// Get water balance for a specific tenant
router.get('/balance/:tenantId', requireAgent, waterBillController.getTenantWaterBalance);

// Standard CRUD operations
router.post('/', requireAgent, waterBillController.createWaterBill);
router.get('/', requireAgent, waterBillController.listWaterBills);
router.get('/:id', requireAgent, waterBillController.getWaterBill);
router.delete('/:id', requireAgent, waterBillController.deleteWaterBill);

console.log('✅ WATER BILLS ROUTES LOADED');

module.exports = router;