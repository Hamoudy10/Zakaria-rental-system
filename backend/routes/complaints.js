const express = require('express');
const {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  assignComplaint,
  resolveComplaint,
  addComplaintUpdate,
  getTenantComplaints
} = require('../controllers/complaintController');

const router = express.Router();

// Admin/Agent routes
router.get('/', getComplaints);
router.get('/:id', getComplaintById);
router.post('/', createComplaint);
router.put('/:id', updateComplaint);
router.post('/:id/assign', assignComplaint);
router.post('/:id/resolve', resolveComplaint);
router.post('/:id/updates', addComplaintUpdate);

// Tenant-specific routes
router.get('/tenant/:tenantId', getTenantComplaints);

module.exports = router;