const express = require('express');
const router = express.Router();
const waterBillController = require('../controllers/waterBillController');
const { protect, requireAgent } = require('../middleware/authMiddleware');

// Apply auth middleware to all routes
router.use(protect);

// Water bill CRUD operations
router.post('/', requireAgent, waterBillController.createWaterBill);
router.get('/', requireAgent, waterBillController.listWaterBills);
router.get('/:id', requireAgent, waterBillController.getWaterBill);
router.delete('/:id', requireAgent, waterBillController.deleteWaterBill);

// NEW ENDPOINT: Check missing water bills
router.get('/missing-tenants', requireAgent, waterBillController.checkMissingWaterBills);

// e.g. in backend/routes/agentProperties.js or similar
const { 
  createWaterBill,
  listWaterBills,
  getWaterBill,
  deleteWaterBill,
  checkMissingWaterBills,
  getTenantWaterBalance
} = require('../controllers/waterBillController');
const { protect } = require('../middleware/authMiddleware');

// Existing
router.post('/water-bills', protect, createWaterBill);
router.get('/water-bills', protect, listWaterBills);
// ...

// NEW: water balance for tenant
router.get('/water-bills/balance/:tenantId', protect, getTenantWaterBalance);

module.exports = router;
