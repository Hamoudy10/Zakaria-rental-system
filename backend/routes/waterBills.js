const express = require('express');
const router = express.Router();
const waterBillController = require('../controllers/waterBillController');
const { protect, requireAgent } = require('../middleware/authMiddleware');



// Water bill CRUD operations
router.post('/', requireAgent, waterBillController.createWaterBill);
router.get('/', requireAgent, waterBillController.listWaterBills);
router.get('/:id', requireAgent, waterBillController.getWaterBill);
router.delete('/:id', requireAgent, waterBillController.deleteWaterBill);

// NEW ENDPOINT: Check missing water bills
router.get('/missing-tenants', requireAgent, waterBillController.checkMissingWaterBills);

// NEW: water balance for tenant (agent-scoped)
router.get(
  '/water-bills/balance/:tenantId',
  requireRole(['agent','admin']),
  waterBillController.getTenantWaterBalance
);

module.exports = router;
