const express = require('express');
const router = express.Router();
const waterBillController = require('../controllers/waterBillController');
const { protect, agentOrAdmin } = require('../middleware/authMiddleware');

// Apply auth middleware to all routes
router.use(protect);

// Water bill CRUD operations
router.post('/', agentOrAdmin, waterBillController.createWaterBill);
router.get('/', agentOrAdmin, waterBillController.listWaterBills);
router.get('/:id', agentOrAdmin, waterBillController.getWaterBill);
router.delete('/:id', agentOrAdmin, waterBillController.deleteWaterBill);

// NEW ENDPOINT: Check missing water bills
router.get('/missing-tenants', agentOrAdmin, waterBillController.checkMissingWaterBills);

module.exports = router;
