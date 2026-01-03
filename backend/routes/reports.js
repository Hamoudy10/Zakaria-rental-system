const express = require('express');
const router = express.Router();
const {
  getAllReports,
  getReportById,
  generateReport,
  getReportTypes,
  updateReport,
  deleteReport,
  generateQuickReport,
  getReportStats,
  exportReport
} = require('../controllers/reportController');

// Inline middleware for testing
const protect = (req, res, next) => {
  req.user = { 
    id: 'test-user-id', 
    userId: 'test', 
    role: 'admin',
    first_name: 'Test',
    last_name: 'User'
  };
  next();
};

// Authorization middleware
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Unauthorized' });
  next();
};

console.log('Reports routes loaded');

// ROUTES
router.get('/', protect, authorize('admin', 'agent'), getAllReports);
router.get('/:id', protect, authorize('admin', 'agent'), getReportById);
router.post('/', protect, authorize('admin', 'agent'), generateReport);
router.put('/:id', protect, authorize('admin', 'agent'), updateReport);
router.delete('/:id', protect, authorize('admin'), deleteReport);
router.post('/quick', protect, authorize('admin', 'agent'), generateQuickReport);
router.get('/stats/overview', protect, authorize('admin', 'agent'), getReportStats);
router.get('/:id/export', protect, authorize('admin', 'agent'), exportReport);
router.get('/types', protect, authorize('admin', 'agent'), getReportTypes);


module.exports = router;
