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
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
};

console.log('Reports routes loaded');

/*
|--------------------------------------------------------------------------
| STATIC & SPECIAL ROUTES (MUST COME FIRST)
|--------------------------------------------------------------------------
*/

// report types (for dropdowns)
router.get('/types', protect, authorize('admin', 'agent'), getReportTypes);

// stats / overview
router.get('/stats/overview', protect, authorize('admin', 'agent'), getReportStats);

// quick report generation
router.post('/quick', protect, authorize('admin', 'agent'), generateQuickReport);

// export report
router.get('/:id/export', protect, authorize('admin', 'agent'), exportReport);

/*
|--------------------------------------------------------------------------
| STANDARD CRUD ROUTES
|--------------------------------------------------------------------------
*/

// list all reports
router.get('/', protect, authorize('admin', 'agent'), getAllReports);

// generate new report
router.post('/generate', protect, authorize('admin', 'agent'), generateReport);

// get single report
router.get('/:id', protect, authorize('admin', 'agent'), getReportById);

// update report
router.put('/:id', protect, authorize('admin', 'agent'), updateReport);

// delete report
router.delete('/:id', protect, authorize('admin'), deleteReport);

module.exports = router;
