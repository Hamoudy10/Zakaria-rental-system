// backend/controllers/notificationController.js
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');
const SMSService = require('../services/smsService');

// Rate limiting to prevent excessive API calls
const userRequestTimestamps = new Map();
const RATE_LIMIT_WINDOW = 2000;

const checkRateLimit = (userId, endpoint) => {
  const now = Date.now();
  const key = `${userId}-${endpoint}`;
  const lastRequest = userRequestTimestamps.get(key);
  
  if (lastRequest && (now - lastRequest) < RATE_LIMIT_WINDOW) {
    return false;
  }
  
  userRequestTimestamps.set(key, now);
  return true;
};

// Get user notifications with pagination and filters
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!checkRateLimit(userId, 'getNotifications')) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please wait a moment.'
      });
    }

    const { 
      limit = 20, 
      page = 1,
      offset,
      type, 
      is_read,
      start_date,
      end_date
    } = req.query;

    const limitNum = parseInt(limit);
    // Support both page and offset for flexibility
    const offsetNum = offset !== undefined ? parseInt(offset) : (parseInt(page) - 1) * limitNum;

    console.log(`🔍 Fetching notifications for user: ${userId}`, { limit: limitNum, offset: offsetNum, type, is_read });

    let query = `SELECT * FROM notifications WHERE user_id = $1`;
    let countQuery = `SELECT COUNT(*) FROM notifications WHERE user_id = $1`;
    
    const queryParams = [userId];
    const countParams = [userId];

    if (type) {
      query += ` AND type = $${queryParams.length + 1}`;
      countQuery += ` AND type = $${countParams.length + 1}`;
      queryParams.push(type);
      countParams.push(type);
    }

    if (is_read !== undefined && is_read !== '') {
      query += ` AND is_read = $${queryParams.length + 1}`;
      countQuery += ` AND is_read = $${countParams.length + 1}`;
      queryParams.push(is_read === 'true' || is_read === true);
      countParams.push(is_read === 'true' || is_read === true);
    }

    if (start_date) {
      query += ` AND created_at >= $${queryParams.length + 1}`;
      countQuery += ` AND created_at >= $${countParams.length + 1}`;
      queryParams.push(new Date(start_date));
      countParams.push(new Date(start_date));
    }

    if (end_date) {
      query += ` AND created_at <= $${queryParams.length + 1}`;
      countQuery += ` AND created_at <= $${countParams.length + 1}`;
      queryParams.push(new Date(end_date));
      countParams.push(new Date(end_date));
    }

    query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limitNum, offsetNum);

    const [notificationsResult, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, countParams)
    ]);

    const totalCount = parseInt(countResult.rows[0]?.count || 0);
    const currentPage = Math.floor(offsetNum / limitNum) + 1;
    const totalPages = Math.ceil(totalCount / limitNum);

    console.log(`✅ Found ${notificationsResult.rows.length} notifications for user ${userId}`);

    res.json({
      success: true,
      data: {
        notifications: notificationsResult.rows,
        pagination: {
          currentPage,
          totalPages,
          totalCount,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
          limit: limitNum
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

    console.log('📨 Creating notification:', { userId, title, type });

    if (!title || !message || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, message, type'
      });
    }

    if (!userId && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'User ID is required for non-admin users'
      });
    }

    let notification;

    if (userId) {
      notification = await NotificationService.createNotification({
        userId,
        title,
        message,
        type,
        relatedEntityType: related_entity_type,
        relatedEntityId: related_entity_id
      });
    } else {
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
      notification = results[0];
    }

    console.log('✅ Notification created successfully');

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

    console.log('✅ Notification marked as read');

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

    if (!checkRateLimit(userId, 'markAllAsRead')) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please wait a moment.'
      });
    }

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

    if (!checkRateLimit(userId, 'getUnreadCount')) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please wait a moment.'
      });
    }

    const unreadCount = await NotificationService.getUnreadCount(userId);

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

    if (!checkRateLimit(userId, 'getNotificationStats')) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please wait a moment.'
      });
    }

    const totalQuery = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [userId]
    );

    const unreadQuery = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    const typeQuery = await pool.query(
      `SELECT type, COUNT(*) as count 
       FROM notifications 
       WHERE user_id = $1 
       GROUP BY type 
       ORDER BY count DESC`,
      [userId]
    );

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

    const deleteQuery = await pool.query(
      'DELETE FROM notifications WHERE id = $1 RETURNING *',
      [id]
    );

    console.log('✅ Notification deleted successfully');

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

    const countQuery = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = true',
      [userId]
    );

    const countBefore = parseInt(countQuery.rows[0].count);

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

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, message'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin users can create broadcast notifications'
      });
    }

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

// NEW: Send Bulk SMS to property tenants
const sendBulkSMS = async (req, res) => {
  try {
    const { propertyId, message, messageType = 'announcement' } = req.body;
    const userId = req.user.id;

    console.log('📱 Sending bulk SMS:', { propertyId, messageType, userId });

    if (!propertyId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: propertyId, message'
      });
    }

    if (message.length > 160) {
      return res.status(400).json({
        success: false,
        message: 'SMS message cannot exceed 160 characters'
      });
    }

    // Verify user has access to this property (admin or assigned agent)
    let accessQuery;
    if (req.user.role === 'admin') {
      accessQuery = await pool.query('SELECT id, name FROM properties WHERE id = $1', [propertyId]);
    } else {
      accessQuery = await pool.query(
        `SELECT p.id, p.name FROM properties p
         JOIN agent_property_assignments apa ON p.id = apa.property_id
         WHERE p.id = $1 AND apa.agent_id = $2 AND apa.is_active = true`,
        [propertyId, userId]
      );
    }

    if (accessQuery.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this property'
      });
    }

    const property = accessQuery.rows[0];

    // Get all active tenants in the property
    const tenantsQuery = await pool.query(
      `SELECT DISTINCT t.id, t.first_name, t.last_name, t.phone_number, pu.unit_code
       FROM tenants t
       JOIN tenant_allocations ta ON t.id = ta.tenant_id
       JOIN property_units pu ON ta.unit_id = pu.id
       WHERE pu.property_id = $1 AND ta.is_active = true AND t.phone_number IS NOT NULL`,
      [propertyId]
    );

    const tenants = tenantsQuery.rows;

    if (tenants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No tenants with phone numbers found in this property'
      });
    }

    console.log(`📤 Sending SMS to ${tenants.length} tenants in ${property.name}`);

    // Send SMS to each tenant
    const results = {
      total: tenants.length,
      sent: 0,
      failed: 0,
      errors: []
    };

    for (const tenant of tenants) {
      try {
        const smsResult = await SMSService.sendSMS(tenant.phone_number, message);
        if (smsResult.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({
            tenant: `${tenant.first_name} ${tenant.last_name}`,
            unit: tenant.unit_code,
            error: smsResult.error
          });
        }
      } catch (smsError) {
        results.failed++;
        results.errors.push({
          tenant: `${tenant.first_name} ${tenant.last_name}`,
          unit: tenant.unit_code,
          error: smsError.message
        });
      }
    }

    // Log the bulk SMS action
    await pool.query(
      `INSERT INTO sms_queue (recipient_phone, message, message_type, status, agent_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [`BULK_${propertyId}`, message, messageType, results.sent > 0 ? 'sent' : 'failed', userId]
    );

    console.log(`✅ Bulk SMS complete: ${results.sent} sent, ${results.failed} failed`);

    res.json({
      success: true,
      message: `SMS sent to ${results.sent} of ${results.total} tenants`,
      data: results
    });

  } catch (error) {
    console.error('❌ Send bulk SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending bulk SMS',
      error: error.message
    });
  }
};

// Health check endpoint
const healthCheck = async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time, COUNT(*) as notification_count FROM notifications');
    
    res.json({
      success: true,
      message: 'Notification service is healthy',
      data: {
        timestamp: result.rows[0].time,
        totalNotifications: parseInt(result.rows[0].notification_count),
        service: 'notifications'
      }
    });
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Notification service is unhealthy',
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
  createBroadcastNotification,
  sendBulkSMS,
  healthCheck
};