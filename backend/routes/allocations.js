const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getAllocations,
  getAllocation,
  createAllocation,
  updateAllocation,
  deleteAllocation
} = require('../controllers/allocationController'); // Make sure this path is correct

// Make sure these controller functions exist and are exported
router.get('/', protect, authorize('admin', 'agent'), getAllocations);
router.get('/:id', protect, authorize('admin', 'agent'), getAllocation);
router.post('/', protect, authorize('admin', 'agent'), createAllocation);
router.put('/:id', protect, authorize('admin', 'agent'), updateAllocation);
router.delete('/:id', protect, authorize('admin', 'agent'), deleteAllocation);

module.exports = router;