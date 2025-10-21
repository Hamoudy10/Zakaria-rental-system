const pool = require('../config/database');
const NotificationService = require('../services/notificationService');

// Get user notifications with pagination and filters
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 20, 
      type, 
      is_read, 
      related_entity_type,
      start_date,
      end_date 
    } = req.query;

    const offset = (page - 1) * limit;

    console.log(`🔍 Fetching notifications for user: ${userId}`, {
      page, limit, type, is_read, related_entity_type
    });

    // Build query with filters
    let query = `
      SELECT 
        n.*,
        CASE 
          WHEN n.related_entity_type = 'rent_payment' THEN (
            SELECT rp.mpesa_receipt_number FROM rent_payments rp WHERE rp.id = n.related_entity_id
          )
          WHEN n.related_entity_type = 'salary_payment' THEN (
            SELECT sp.mpesa_receipt_number FROM salary_payments sp WHERE sp.id = n.related_entity_id
          )
          WHEN n.related_entity_type = 'complaint' THEN (
            SELECT c.title FROM complaints c WHERE c.id = n.related_entity_id
          )
          ELSE NULL
        END as related_entity_info
      FROM notifications n
      WHERE n.user_id = $1
    `;

    let countQuery = `SELECT COUNT(*) FROM notifications WHERE user_id = $1`;
    const queryParams = [userId];
    const countParams = [userId];
    let paramCount = 1;

    // Add filters
    if (type) {
      paramCount++;
      query += ` AND n.type = $${paramCount}`;
      countQuery += ` AND type = $${paramCount}`;
      queryParams.push(type);
      countParams.push(type);
    }

    if (is_read !== undefined) {
      paramCount++;
      query += ` AND n.is_read = $${paramCount}`;
      countQuery += ` AND is_read = $${paramCount}`;
      queryParams.push(is_read === 'true');
      countParams.push(is_read === 'true');
    }

    if (related_entity_type) {
      paramCount++;
      query += ` AND n.related_entity_type = $${paramCount}`;
      countQuery += ` AND related_entity_type = $${paramCount}`;
      queryParams.push(related_entity_type);
      countParams.push(related_entity_type);
    }

    if (start_date) {
      paramCount++;
      query += ` AND n.created_at >= $${paramCount}`;
      countQuery += ` AND created_at >= $${paramCount}`;
      queryParams.push(new Date(start_date));
      countParams.push(new Date(start_date));
    }

    if (end_date) {
      paramCount++;
      query += ` AND n.created_at <= $${paramCount}`;
      countQuery += ` AND created_at <= $${paramCount}`;
      queryParams.push(new Date(end_date));
      countParams.push(new Date(end_date));
    }

    // Add ordering and pagination
    query += ` ORDER BY n.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), offset);

    console.log('📊 Executing notification query with params:', queryParams);

    // Execute queries
    const notificationsResult = await pool.query(query, queryParams);
    const countResult = await pool.query(countQuery, countParams);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    console.log(`✅ Found ${notificationsResult.rows.length} notifications for user ${userId}`);

    res.json({
      success: true,
      data: {
        notifications: notificationsResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching notifications',
      error: error.message
    });
  }
};

// Create notification
const createNotification = async (req, res) => {
  try {
    const { 
      userId, 
      title, 
      message, 
      type, 
      related_entity_type, 
      related_entity_id 
    } = req.body;

    console.log('📨 Creating notification:', { 
      userId, title, type, related_entity_type, related_entity_id 
    });

    // Validate required fields
    if (!title || !message || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, message, type'
      });
    }

    // If userId is not provided and user is admin, it's a broadcast notification
    if (!userId && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'User ID is required for non-admin users'
      });
    }

    let notification;

    if (userId) {
      // Create single notification
      notification = await NotificationService.createNotification({
        userId,
        title,
        message,
        type,
        relatedEntityType: related_entity_type,
        relatedEntityId: related_entity_id
      });
    } else {
      // Create broadcast notification for all users (admin only)
      const allUsers = await pool.query('SELECT id FROM users WHERE is_active = true');
      const notificationsData = allUsers.rows.map(user => ({
        userId: user.id,
        title,
        message,
        type,
        relatedEntityType: related_entity_type,
        relatedEntityId: related_entity_id
      }));

      const results = await NotificationService.createBulkNotifications(notificationsData);
      notification = results[0]; // Return first one as sample
    }

    console.log('✅ Notification created successfully:', notification.id);

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: notification
    });

  } catch (error) {
    console.error('❌ Create notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating notification',
      error: error.message
    });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`📋 Marking notification as read: ${id} for user: ${userId}`);

    const notification = await NotificationService.markAsRead(id, userId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or access denied'
      });
    }

    console.log('✅ Notification marked as read:', id);

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });

  } catch (error) {
    console.error('❌ Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating notification',
      error: error.message
    });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📋 Marking all notifications as read for user: ${userId}`);

    const updatedNotifications = await NotificationService.markAllAsRead(userId);

    console.log(`✅ Marked ${updatedNotifications.length} notifications as read`);

    res.json({
      success: true,
      message: `Marked ${updatedNotifications.length} notifications as read`,
      data: {
        updatedCount: updatedNotifications.length,
        notifications: updatedNotifications
      }
    });

  } catch (error) {
    console.error('❌ Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating notifications',
      error: error.message
    });
  }
};

// Get unread notification count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`🔢 Getting unread count for user: ${userId}`);

    const unreadCount = await NotificationService.getUnreadCount(userId);

    console.log(`✅ Unread count: ${unreadCount} for user: ${userId}`);

    res.json({
      success: true,
      data: { 
        unreadCount,
        userId 
      }
    });

  } catch (error) {
    console.error('❌ Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching unread count',
      error: error.message
    });
  }
};

// Get notification statistics
const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📊 Getting notification stats for user: ${userId}`);

    // Get total notifications count
    const totalQuery = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [userId]
    );

    // Get unread count
    const unreadQuery = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    // Get notifications by type
    const typeQuery = await pool.query(
      `SELECT type, COUNT(*) as count 
       FROM notifications 
       WHERE user_id = $1 
       GROUP BY type 
       ORDER BY count DESC`,
      [userId]
    );

    // Get recent activity (last 7 days)
    const recentQuery = await pool.query(
      `SELECT COUNT(*) as recent_count 
       FROM notifications 
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
      [userId]
    );

    const stats = {
      total: parseInt(totalQuery.rows[0].count),
      unread: parseInt(unreadQuery.rows[0].count),
      byType: typeQuery.rows.reduce((acc, row) => {
        acc[row.type] = parseInt(row.count);
        return acc;
      }, {}),
      recent: parseInt(recentQuery.rows[0].recent_count)
    };

    console.log(`✅ Notification stats retrieved for user: ${userId}`, stats);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Get notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching notification statistics',
      error: error.message
    });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`🗑️ Deleting notification: ${id} for user: ${userId}`);

    // Verify the notification belongs to the user
    const verifyQuery = await pool.query(
      'SELECT id FROM notifications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (verifyQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or access denied'
      });
    }

    // Delete the notification
    const deleteQuery = await pool.query(
      'DELETE FROM notifications WHERE id = $1 RETURNING *',
      [id]
    );

    console.log('✅ Notification deleted successfully:', id);

    res.json({
      success: true,
      message: 'Notification deleted successfully',
      data: deleteQuery.rows[0]
    });

  } catch (error) {
    console.error('❌ Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting notification',
      error: error.message
    });
  }
};

// Clear all read notifications
const clearReadNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`🧹 Clearing all read notifications for user: ${userId}`);

    // Get count before deletion for response
    const countQuery = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = true',
      [userId]
    );

    const countBefore = parseInt(countQuery.rows[0].count);

    // Delete all read notifications
    const deleteQuery = await pool.query(
      'DELETE FROM notifications WHERE user_id = $1 AND is_read = true RETURNING *',
      [userId]
    );

    console.log(`✅ Cleared ${deleteQuery.rows.length} read notifications`);

    res.json({
      success: true,
      message: `Cleared ${deleteQuery.rows.length} read notifications`,
      data: {
        clearedCount: deleteQuery.rows.length,
        clearedNotifications: deleteQuery.rows
      }
    });

  } catch (error) {
    console.error('❌ Clear read notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error clearing read notifications',
      error: error.message
    });
  }
};

// Get notifications by type
const getNotificationsByType = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    console.log(`📨 Getting ${type} notifications for user: ${userId}`);

    const query = `
      SELECT * FROM notifications 
      WHERE user_id = $1 AND type = $2 
      ORDER BY created_at DESC 
      LIMIT $3 OFFSET $4
    `;

    const countQuery = `
      SELECT COUNT(*) FROM notifications 
      WHERE user_id = $1 AND type = $2
    `;

    const [notificationsResult, countResult] = await Promise.all([
      pool.query(query, [userId, type, parseInt(limit), offset]),
      pool.query(countQuery, [userId, type])
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    console.log(`✅ Found ${notificationsResult.rows.length} ${type} notifications`);

    res.json({
      success: true,
      data: {
        notifications: notificationsResult.rows,
        type,
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
    console.error('❌ Get notifications by type error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching notifications by type',
      error: error.message
    });
  }
};

// Create broadcast notification (admin only)
const createBroadcastNotification = async (req, res) => {
  try {
    const { 
      title, 
      message, 
      type = 'announcement',
      target_roles 
    } = req.body;

    console.log('📢 Creating broadcast notification:', { title, type, target_roles });

    // Validate required fields
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, message'
      });
    }

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin users can create broadcast notifications'
      });
    }

    // Build user query based on target roles
    let userQuery = 'SELECT id FROM users WHERE is_active = true';
    const userParams = [];

    if (target_roles && target_roles.length > 0) {
      userQuery += ` AND role = ANY($${userParams.length + 1})`;
      userParams.push(target_roles);
    }

    const usersResult = await pool.query(userQuery, userParams);
    const users = usersResult.rows;

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No users found for the specified criteria'
      });
    }

    // Create notifications for all target users
    const notificationsData = users.map(user => ({
      userId: user.id,
      title,
      message,
      type,
      relatedEntityType: 'broadcast'
    }));

    const createdNotifications = await NotificationService.createBulkNotifications(notificationsData);

    console.log(`✅ Broadcast notification sent to ${createdNotifications.length} users`);

    res.status(201).json({
      success: true,
      message: `Broadcast notification sent to ${createdNotifications.length} users`,
      data: {
        sentCount: createdNotifications.length,
        sampleNotification: createdNotifications[0]
      }
    });

  } catch (error) {
    console.error('❌ Create broadcast notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating broadcast notification',
      error: error.message
    });
  }
};

module.exports = {
  getNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getNotificationStats,
  deleteNotification,
  clearReadNotifications,
  getNotificationsByType,
  createBroadcastNotification
};