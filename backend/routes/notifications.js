// backend/routes/notifications.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const pool = require('../config/database');

const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');

// Helper to call controller safely
const callController = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    console.error(`❌ Route error:`, error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

console.log('✅ Notifications routes loaded');

// =============================================
// STATIC ROUTES FIRST (before parameterized routes)
// =============================================

// Health check (public)
router.get('/health', callController(notificationController.healthCheck));

// Unread count
router.get('/unread-count', authMiddleware, callController(notificationController.getUnreadCount));

// Stats
router.get('/stats', authMiddleware, callController(notificationController.getNotificationStats));

// Mark all as read
router.put('/read-all', authMiddleware, callController(notificationController.markAllAsRead));

// Clear read notifications
router.delete('/clear-read', authMiddleware, callController(notificationController.clearReadNotifications));

// =============================================
// ADMIN ROUTES
// =============================================

// Admin: Get all system notifications
router.get('/admin/all', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, user_id, type, is_read, start_date, end_date } = req.query;

    let query = `
      SELECT n.*, u.first_name, u.last_name, u.email, u.role, u.phone_number
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE 1=1
    `;
    
    let countQuery = `SELECT COUNT(*) FROM notifications n WHERE 1=1`;
    const queryParams = [];
    const countParams = [];
    let paramCount = 0;

    if (user_id) {
      paramCount++;
      query += ` AND n.user_id = $${paramCount}`;
      countQuery += ` AND n.user_id = $${paramCount}`;
      queryParams.push(user_id);
      countParams.push(user_id);
    }

    if (type) {
      paramCount++;
      query += ` AND n.type = $${paramCount}`;
      countQuery += ` AND n.type = $${paramCount}`;
      queryParams.push(type);
      countParams.push(type);
    }

    if (is_read !== undefined && is_read !== '') {
      paramCount++;
      query += ` AND n.is_read = $${paramCount}`;
      countQuery += ` AND n.is_read = $${paramCount}`;
      queryParams.push(is_read === 'true');
      countParams.push(is_read === 'true');
    }

    if (start_date) {
      paramCount++;
      query += ` AND n.created_at >= $${paramCount}`;
      countQuery += ` AND n.created_at >= $${paramCount}`;
      queryParams.push(new Date(start_date));
      countParams.push(new Date(start_date));
    }

    if (end_date) {
      paramCount++;
      query += ` AND n.created_at <= $${paramCount}`;
      countQuery += ` AND n.created_at <= $${paramCount}`;
      queryParams.push(new Date(end_date));
      countParams.push(new Date(end_date));
    }

    query += ` ORDER BY n.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    queryParams.push(parseInt(limit), offset);

    const [notificationsResult, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, countParams)
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.json({
      success: true,
      data: {
        notifications: notificationsResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Admin get all notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Admin: Get system-wide stats
router.get('/admin/stats/overview', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const queryParams = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE created_at BETWEEN $1 AND $2';
      queryParams.push(new Date(start_date), new Date(end_date));
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = true THEN 1 END) as read_notifications,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread_notifications,
        COUNT(DISTINCT user_id) as affected_users
      FROM notifications
      ${dateFilter}
    `;

    const trendsQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_count
      FROM notifications
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `;

    const [statsResult, trendsResult] = await Promise.all([
      pool.query(statsQuery, queryParams),
      pool.query(trendsQuery)
    ]);

    res.json({
      success: true,
      data: {
        overview: statsResult.rows[0],
        daily_trends: trendsResult.rows
      }
    });

  } catch (error) {
    console.error('❌ Admin notification stats error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Admin: Clear all notifications for a user
router.delete('/admin/clear-all/:userId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const deleteQuery = await pool.query(
      'DELETE FROM notifications WHERE user_id = $1 RETURNING *',
      [userId]
    );

    res.json({
      success: true,
      message: `Cleared ${deleteQuery.rows.length} notifications for user`,
      data: { clearedCount: deleteQuery.rows.length, userId }
    });

  } catch (error) {
    console.error('❌ Admin clear user notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// =============================================
// BROADCAST & BULK SMS ROUTES
// =============================================

// Create broadcast notification (admin only)
router.post('/broadcast', authMiddleware, requireAdmin, callController(notificationController.createBroadcastNotification));

// Send bulk SMS to property tenants (admin or agent)
router.post('/bulk-sms', authMiddleware, callController(notificationController.sendBulkSMS));

// Create broadcast notification (admin only)
router.post('/broadcast', authMiddleware, requireAdmin, callController(notificationController.createBroadcastNotification));

// Send bulk SMS to property tenants (admin or agent)
router.post('/bulk-sms', authMiddleware, callController(notificationController.sendBulkSMS));

// Get tenants by property (for targeted SMS)
router.get('/tenants/:propertyId', authMiddleware, callController(notificationController.getTenantsByProperty));


// NEW: Send targeted SMS to selected tenants
router.post('/targeted-sms', authMiddleware, callController(notificationController.sendTargetedSMS));

// NEW: Get SMS history with filters and pagination
router.get('/sms-history', authMiddleware, callController(notificationController.getMessagingHistory));

// Check delivery status for a specific message
router.get('/delivery-status/:messageId', authMiddleware, callController(notificationController.checkDeliveryStatus));

// Get SMS statistics
router.get('/sms-stats', authMiddleware, callController(notificationController.getSMSStats));



// =============================================
// NOTIFICATION TYPE ROUTE
// =============================================

// Get notifications by type
router.get('/type/:type', authMiddleware, callController(notificationController.getNotificationsByType));

// =============================================
// PARAMETERIZED ROUTES LAST
// =============================================

// Create notification
router.post('/', authMiddleware, callController(notificationController.createNotification));

// Get all notifications for user
router.get('/', authMiddleware, callController(notificationController.getNotifications));

// Mark specific notification as read
router.put('/:id/read', authMiddleware, callController(notificationController.markAsRead));

// Delete specific notification
router.delete('/:id', authMiddleware, callController(notificationController.deleteNotification));

module.exports = router;