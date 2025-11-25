// backend/routes/agents.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware').authMiddleware;
const requireRole = require('../middleware/authMiddleware').requireRole;

console.log('🔄 Loading AGENT routes...');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Agent dashboard stats
router.get('/dashboard/stats', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    // This will be replaced by agent-properties endpoints
    res.json({
      success: true,
      data: {
        assignedProperties: 0,
        activeComplaints: 0,
        pendingPayments: 0,
        resolvedThisWeek: 0
      }
    });
  } catch (error) {
    console.error('Error fetching agent dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats'
    });
  }
});

// Agent complaints - these will be replaced by agent-properties endpoints
router.get('/complaints', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    res.json({
      success: true,
      data: [],
      message: 'Use /api/agent-properties/my-complaints instead'
    });
  } catch (error) {
    console.error('Error fetching agent complaints:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints'
    });
  }
});

router.get('/complaints/recent', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error fetching recent complaints:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent complaints'
    });
  }
});

// Agent tenants with payment status
router.get('/tenants/payments', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    res.json({
      success: true,
      data: [],
      message: 'Use /api/agent-properties/my-tenants instead'
    });
  } catch (error) {
    console.error('Error fetching tenant payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant payments'
    });
  }
});

// Agent properties
router.get('/properties', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    res.json({
      success: true,
      data: [],
      message: 'Use /api/agent-properties/my-properties instead'
    });
  } catch (error) {
    console.error('Error fetching agent properties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties'
    });
  }
});

// Payment alerts
router.get('/payments/alerts', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error fetching payment alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment alerts'
    });
  }
});

// Send payment reminder
router.post('/tenants/send-reminder', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    const { tenantId } = req.body;
    
    // Placeholder implementation
    res.json({
      success: true,
      message: 'Payment reminder sent successfully'
    });
  } catch (error) {
    console.error('Error sending payment reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send payment reminder'
    });
  }
});

// Send bulk SMS
router.post('/notifications/send-bulk-sms', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    const { propertyId, message, messageType } = req.body;
    
    // Placeholder implementation
    console.log('Sending bulk SMS:', { propertyId, message, messageType });
    
    res.json({
      success: true,
      message: 'Bulk SMS sent successfully'
    });
  } catch (error) {
    console.error('Error sending bulk SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk SMS'
    });
  }
});

// Agent profile update
router.put('/profile', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    const { first_name, last_name, phone_number, email } = req.body;
    const userId = req.user.id;
    
    // Placeholder implementation
    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating agent profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Agent salary history
router.get('/salary-history', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error fetching salary history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salary history'
    });
  }
});

// Agent performance metrics
router.get('/performance', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance metrics'
    });
  }
});

// Agent activities
router.get('/activities', requireRole(['agent', 'admin']), async (req, res) => {
  try {
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activities'
    });
  }
});

console.log('✅ AGENT ROUTES LOADED');

module.exports = router;