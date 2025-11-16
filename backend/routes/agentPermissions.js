// backend/routes/agentPermissions.js
const express = require('express');
const router = express.Router();
const agentPermissionController = require('../controllers/agentPermissionController');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');

// All routes require admin access
router.use(authMiddleware);
router.use(requireAdmin);

// Agent management routes
router.get('/', agentPermissionController.getAllAgents);
router.put('/:id/permissions', agentPermissionController.updateAgentPermissions);
router.get('/:id/performance', agentPermissionController.getAgentPerformance);

module.exports = router;