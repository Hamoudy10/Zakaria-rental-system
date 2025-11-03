const express = require('express');
const router = express.Router();
const salaryPaymentController = require('../controllers/salaryPaymentController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication - FIXED: use protect function
router.use(authMiddleware.protect);

// Salary payment routes
router.get('/', authMiddleware.authorize(['admin', 'agent']), salaryPaymentController.getSalaryPayments);
router.post('/', authMiddleware.authorize(['admin']), salaryPaymentController.createSalaryPayment);
router.get('/:id', authMiddleware.authorize(['admin', 'agent']), salaryPaymentController.getSalaryPaymentById);
router.put('/:id/status', authMiddleware.authorize(['admin']), salaryPaymentController.updateSalaryPaymentStatus);

module.exports = router;