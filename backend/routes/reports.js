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
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

router.use(authMiddleware);

console.log('Reports routes loaded');

/*
|--------------------------------------------------------------------------
| STATIC & SPECIAL ROUTES (MUST COME FIRST)
|--------------------------------------------------------------------------
*/

// report types (for dropdowns)
router.get('/types', requireRole(['admin', 'agent']), getReportTypes);

// stats / overview
router.get('/stats/overview', requireRole(['admin', 'agent']), getReportStats);

// quick report generation
router.post('/quick', requireRole(['admin', 'agent']), generateQuickReport);

// export report
router.get('/:id/export', requireRole(['admin', 'agent']), exportReport);

/*
|--------------------------------------------------------------------------
| STANDARD CRUD ROUTES
|--------------------------------------------------------------------------
*/

// list all reports
router.get('/', requireRole(['admin', 'agent']), getAllReports);

// generate new report
router.post('/generate', requireRole(['admin', 'agent']), generateReport);


// get single report
router.get('/:id', requireRole(['admin', 'agent']), getReportById);

// update report
router.put('/:id', requireRole(['admin', 'agent']), updateReport);

// delete report
router.delete('/:id', requireRole(['admin']), deleteReport);

module.exports = router;
