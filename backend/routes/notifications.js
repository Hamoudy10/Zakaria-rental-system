const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

// Admin middleware for admin-only routes
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

console.log('✅ Notifications routes loaded with real authentication');

// =============================================
// NOTIFICATION RETRIEVAL ENDPOINTS
// =============================================

/**
 * @route GET /api/notifications
 * @description Get all notifications for authenticated user with filtering and pagination
 * @access Private
 */
router.get('/', protect, async (req, res) => {
  try {
    await notificationController.getNotifications(req, res);
  } catch (error) {
    console.error('❌ Route error in GET /notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * @route GET /api/notifications/unread-count
 * @description Get unread notifications count for authenticated user
 * @access Private
 */
router.get('/unread-count', protect, async (req, res) => {
  try {
    await notificationController.getUnreadCount(req, res);
  } catch (error) {
    console.error('❌ Route error in GET /notifications/unread-count:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error fetching unread count',
      error: error.message
    });
  }
});

/**
 * @route GET /api/notifications/stats
 * @description Get notification statistics for authenticated user
 * @access Private
 */
router.get('/stats', protect, async (req, res) => {
  try {
    await notificationController.getNotificationStats(req, res);
  } catch (error) {
    console.error('❌ Route error in GET /notifications/stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error fetching notification stats',
      error: error.message
    });
  }
});

/**
 * @route GET /api/notifications/type/:type
 * @description Get notifications by type for authenticated user
 * @access Private
 */
router.get('/type/:type', protect, async (req, res) => {
  try {
    await notificationController.getNotificationsByType(req, res);
  } catch (error) {
    console.error('❌ Route error in GET /notifications/type/:type:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error fetching notifications by type',
      error: error.message
    });
  }
});

// =============================================
// NOTIFICATION MANAGEMENT ENDPOINTS
// =============================================

/**
 * @route POST /api/notifications
 * @description Create a new notification
 * @access Private (Admin can create broadcast notifications)
 */
router.post('/', protect, async (req, res) => {
  try {
    await notificationController.createNotification(req, res);
  } catch (error) {
    console.error('❌ Route error in POST /notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error creating notification',
      error: error.message
    });
  }
});

/**
 * @route POST /api/notifications/broadcast
 * @description Create a broadcast notification for multiple users
 * @access Private (Admin only)
 */
router.post('/broadcast', protect, requireAdmin, async (req, res) => {
  try {
    await notificationController.createBroadcastNotification(req, res);
  } catch (error) {
    console.error('❌ Route error in POST /notifications/broadcast:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error creating broadcast notification',
      error: error.message
    });
  }
});

/**
 * @route PUT /api/notifications/:id/read
 * @description Mark a specific notification as read
 * @access Private
 */
router.put('/:id/read', protect, async (req, res) => {
  try {
    await notificationController.markAsRead(req, res);
  } catch (error) {
    console.error('❌ Route error in PUT /notifications/:id/read:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error marking notification as read',
      error: error.message
    });
  }
});

/**
 * @route PUT /api/notifications/read-all
 * @description Mark all notifications as read for authenticated user
 * @access Private
 */
router.put('/read-all', protect, async (req, res) => {
  try {
    await notificationController.markAllAsRead(req, res);
  } catch (error) {
    console.error('❌ Route error in PUT /notifications/read-all:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error marking all notifications as read',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/notifications/:id
 * @description Delete a specific notification
 * @access Private
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    await notificationController.deleteNotification(req, res);
  } catch (error) {
    console.error('❌ Route error in DELETE /notifications/:id:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error deleting notification',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/notifications/clear-read
 * @description Clear all read notifications for authenticated user
 * @access Private
 */
router.delete('/clear-read', protect, async (req, res) => {
  try {
    await notificationController.clearReadNotifications(req, res);
  } catch (error) {
    console.error('❌ Route error in DELETE /notifications/clear-read:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error clearing read notifications',
      error: error.message
    });
  }
});

// =============================================
// ADMIN-ONLY ENDPOINTS
// =============================================

/**
 * @route GET /api/notifications/admin/all
 * @description Get all notifications in the system (Admin only)
 * @access Private (Admin only)
 */
router.get('/admin/all', protect, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      user_id, 
      type, 
      is_read, 
      start_date, 
      end_date 
    } = req.query;

    console.log('👨‍💼 Admin fetching all system notifications:', req.query);

    let query = `
      SELECT 
        n.*,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.phone_number
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE 1=1
    `;
    
    let countQuery = `SELECT COUNT(*) FROM notifications n WHERE 1=1`;
    const queryParams = [];
    const countParams = [];
    let paramCount = 0;

    // Add filters
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

    if (is_read !== undefined) {
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

    // Add ordering and pagination
    query += ` ORDER BY n.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    const offset = (page - 1) * limit;
    queryParams.push(parseInt(limit), offset);

    const pool = req.app.get('db');
    const [notificationsResult, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, countParams)
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    console.log(`✅ Admin retrieved ${notificationsResult.rows.length} system notifications`);

    res.json({
      success: true,
      data: {
        notifications: notificationsResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Admin get all notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching all notifications',
      error: error.message
    });
  }
});

/**
 * @route GET /api/notifications/admin/stats/overview
 * @description Get system-wide notification statistics (Admin only)
 * @access Private (Admin only)
 */
router.get('/admin/stats/overview', protect, requireAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    console.log('📊 Admin fetching system notification statistics');

    let dateFilter = '';
    const queryParams = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE created_at BETWEEN $1 AND $2';
      queryParams.push(new Date(start_date), new Date(end_date));
    }

    const pool = req.app.get('db');

    // Get overall stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = true THEN 1 END) as read_notifications,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread_notifications,
        COUNT(DISTINCT user_id) as affected_users,
        COUNT(CASE WHEN type = 'payment_success' THEN 1 END) as payment_success_count,
        COUNT(CASE WHEN type = 'payment_received' THEN 1 END) as payment_received_count,
        COUNT(CASE WHEN type = 'payment_failed' THEN 1 END) as payment_failed_count,
        COUNT(CASE WHEN type = 'salary_paid' THEN 1 END) as salary_paid_count,
        COUNT(CASE WHEN type = 'complaint_updated' THEN 1 END) as complaint_updated_count,
        COUNT(CASE WHEN type = 'announcement' THEN 1 END) as announcement_count,
        COUNT(CASE WHEN type = 'system_alert' THEN 1 END) as system_alert_count
      FROM notifications
      ${dateFilter}
    `;

    // Get daily trends for last 30 days
    const trendsQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_count,
        COUNT(CASE WHEN is_read = true THEN 1 END) as read_count,
        COUNT(CASE WHEN type LIKE 'payment%' THEN 1 END) as payment_notifications,
        COUNT(CASE WHEN type LIKE 'salary%' THEN 1 END) as salary_notifications
      FROM notifications
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `;

    // Get user role distribution
    const roleQuery = `
      SELECT 
        u.role,
        COUNT(n.id) as notification_count
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
      ${dateFilter ? dateFilter.replace('created_at', 'n.created_at') : ''}
      GROUP BY u.role
      ORDER BY notification_count DESC
    `;

    const [statsResult, trendsResult, roleResult] = await Promise.all([
      pool.query(statsQuery, queryParams),
      pool.query(trendsQuery),
      pool.query(roleQuery, queryParams)
    ]);

    const stats = {
      overview: statsResult.rows[0],
      daily_trends: trendsResult.rows,
      role_distribution: roleResult.rows
    };

    console.log('✅ Admin notification statistics retrieved');

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Admin notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching notification statistics',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/notifications/admin/clear-all/:userId
 * @description Clear all notifications for a specific user (Admin only)
 * @access Private (Admin only)
 */
router.delete('/admin/clear-all/:userId', protect, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`🧹 Admin clearing all notifications for user: ${userId}`);

    const pool = req.app.get('db');

    // Get count before deletion
    const countQuery = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [userId]
    );

    const countBefore = parseInt(countQuery.rows[0].count);

    // Delete all notifications for user
    const deleteQuery = await pool.query(
      'DELETE FROM notifications WHERE user_id = $1 RETURNING *',
      [userId]
    );

    console.log(`✅ Admin cleared ${deleteQuery.rows.length} notifications for user ${userId}`);

    res.json({
      success: true,
      message: `Cleared ${deleteQuery.rows.length} notifications for user`,
      data: {
        clearedCount: deleteQuery.rows.length,
        userId
      }
    });

  } catch (error) {
    console.error('❌ Admin clear user notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error clearing user notifications',
      error: error.message
    });
  }
});

// =============================================
// HEALTH CHECK ENDPOINT
// =============================================

/**
 * @route GET /api/notifications/health
 * @description Health check for notifications service
 * @access Public
 */
router.get('/health', async (req, res) => {
  try {
    const pool = req.app.get('db');
    
    // Test database connection
    const dbResult = await pool.query('SELECT NOW() as current_time');
    
    // Get some basic stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread_notifications
      FROM notifications
    `);

    res.json({
      success: true,
      message: 'Notifications service is healthy',
      data: {
        database: {
          connected: true,
          currentTime: dbResult.rows[0].current_time
        },
        notifications: statsResult.rows[0],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Notifications health check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Notifications service is unhealthy',
      error: error.message
    });
  }
});

// =============================================
// EXPORT ROUTER
// =============================================

module.exports = router;