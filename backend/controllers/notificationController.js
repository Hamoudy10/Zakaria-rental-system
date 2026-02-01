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
    const { propertyId, message, messageType = "announcement" } = req.body;
    const userId = req.user.id;

    console.log("📱 Sending bulk SMS:", { propertyId, messageType, userId });

    if (!propertyId || !message) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: propertyId, message",
      });
    }

    if (message.length > 160) {
      return res.status(400).json({
        success: false,
        message: "SMS message cannot exceed 160 characters",
      });
    }

    // Verify user has access to this property (admin or assigned agent)
    let accessQuery;
    if (req.user.role === "admin") {
      accessQuery = await pool.query(
        "SELECT id, name FROM properties WHERE id = $1",
        [propertyId],
      );
    } else {
      accessQuery = await pool.query(
        `SELECT p.id, p.name FROM properties p
         JOIN agent_property_assignments apa ON p.id = apa.property_id
         WHERE p.id = $1 AND apa.agent_id = $2 AND apa.is_active = true`,
        [propertyId, userId],
      );
    }

    if (accessQuery.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this property",
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
      [propertyId],
    );

    const tenants = tenantsQuery.rows;

    if (tenants.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No tenants with phone numbers found in this property",
      });
    }

    console.log(
      `📤 Sending SMS to ${tenants.length} tenants in ${property.name}`,
    );

    // Send SMS to each tenant and log individually
    const results = {
      total: tenants.length,
      sent: 0,
      failed: 0,
      errors: [],
    };

    for (const tenant of tenants) {
      try {
        const smsResult = await SMSService.sendSMS(
          tenant.phone_number,
          message,
        );

        // Log each SMS to the queue
        await pool.query(
          `INSERT INTO sms_queue (recipient_phone, message, message_type, status, agent_id, sent_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            tenant.phone_number,
            message,
            messageType,
            smsResult.success ? "sent" : "failed",
            userId,
            smsResult.success ? new Date() : null,
          ],
        );

        if (smsResult.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({
            tenant: `${tenant.first_name} ${tenant.last_name}`,
            unit: tenant.unit_code,
            error: smsResult.error,
          });
        }
      } catch (smsError) {
        results.failed++;
        results.errors.push({
          tenant: `${tenant.first_name} ${tenant.last_name}`,
          unit: tenant.unit_code,
          error: smsError.message,
        });

        // Log failed SMS
        try {
          await pool.query(
            `INSERT INTO sms_queue (recipient_phone, message, message_type, status, error_message, agent_id, created_at)
             VALUES ($1, $2, $3, 'failed', $4, $5, NOW())`,
            [
              tenant.phone_number,
              message,
              messageType,
              smsError.message,
              userId,
            ],
          );
        } catch (logError) {
          console.error("Failed to log SMS error:", logError);
        }
      }
    }

    console.log(
      `✅ Bulk SMS complete: ${results.sent} sent, ${results.failed} failed`,
    );

    res.json({
      success: true,
      message: `SMS sent to ${results.sent} of ${results.total} tenants`,
      data: results,
    });
  } catch (error) {
    console.error("❌ Send bulk SMS error:", error);
    res.status(500).json({
      success: false,
      message: "Server error sending bulk SMS",
      error: error.message,
    });
  }
};

// =====================================================================
// 2. NEW: Get tenants for a specific property
// =====================================================================

const getPropertyTenants = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: "Property ID is required",
      });
    }

    // Verify user has access to this property
    let accessCheck;
    if (userRole === "admin") {
      accessCheck = await pool.query(
        "SELECT id, name FROM properties WHERE id = $1",
        [propertyId],
      );
    } else {
      accessCheck = await pool.query(
        `SELECT p.id, p.name FROM properties p
         JOIN agent_property_assignments apa ON p.id = apa.property_id
         WHERE p.id = $1 AND apa.agent_id = $2 AND apa.is_active = true`,
        [propertyId, userId],
      );
    }

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this property",
      });
    }

    // Get all active tenants in the property
    const tenantsQuery = await pool.query(
      `SELECT 
        t.id, 
        t.first_name, 
        t.last_name, 
        t.phone_number,
        t.email,
        pu.unit_code,
        pu.unit_number,
        ta.is_active as allocation_active
       FROM tenants t
       JOIN tenant_allocations ta ON t.id = ta.tenant_id
       JOIN property_units pu ON ta.unit_id = pu.id
       WHERE pu.property_id = $1 AND ta.is_active = true
       ORDER BY pu.unit_code, t.first_name`,
      [propertyId],
    );

    res.json({
      success: true,
      data: {
        tenants: tenantsQuery.rows,
        property: accessCheck.rows[0],
      },
    });
  } catch (error) {
    console.error("❌ Get property tenants error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching tenants",
      error: error.message,
    });
  }
};

// =====================================================================
// 3. NEW: Send targeted SMS to selected tenants
// =====================================================================

const sendTargetedSMS = async (req, res) => {
  try {
    const { tenantIds, message, messageType = "announcement" } = req.body;
    const userId = req.user.id;

    console.log("📱 Sending targeted SMS:", {
      tenantCount: tenantIds?.length,
      messageType,
      userId,
    });

    // Validation
    if (!tenantIds || !Array.isArray(tenantIds) || tenantIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one tenant must be selected",
      });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    if (message.length > 160) {
      return res.status(400).json({
        success: false,
        message: "SMS message cannot exceed 160 characters",
      });
    }

    // Get tenant details with phone numbers
    // Also verify agent has access to these tenants via property assignments
    let tenantsQuery;

    if (req.user.role === "admin") {
      tenantsQuery = await pool.query(
        `SELECT DISTINCT t.id, t.first_name, t.last_name, t.phone_number, pu.unit_code
         FROM tenants t
         JOIN tenant_allocations ta ON t.id = ta.tenant_id
         JOIN property_units pu ON ta.unit_id = pu.id
         WHERE t.id = ANY($1::uuid[]) AND ta.is_active = true`,
        [tenantIds],
      );
    } else {
      // Agent: verify they have access via property assignments
      tenantsQuery = await pool.query(
        `SELECT DISTINCT t.id, t.first_name, t.last_name, t.phone_number, pu.unit_code
         FROM tenants t
         JOIN tenant_allocations ta ON t.id = ta.tenant_id
         JOIN property_units pu ON ta.unit_id = pu.id
         JOIN agent_property_assignments apa ON pu.property_id = apa.property_id
         WHERE t.id = ANY($1::uuid[]) 
           AND ta.is_active = true 
           AND apa.agent_id = $2 
           AND apa.is_active = true`,
        [tenantIds, userId],
      );
    }

    const tenants = tenantsQuery.rows;

    if (tenants.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No accessible tenants found with the provided IDs",
      });
    }

    // Filter tenants with valid phone numbers
    const tenantsWithPhones = tenants.filter((t) => t.phone_number);

    if (tenantsWithPhones.length === 0) {
      return res.status(400).json({
        success: false,
        message: "None of the selected tenants have phone numbers",
      });
    }

    console.log(
      `📤 Sending SMS to ${tenantsWithPhones.length} selected tenants`,
    );

    // Send SMS to each tenant
    const results = {
      total: tenantsWithPhones.length,
      sent: 0,
      failed: 0,
      skipped: tenants.length - tenantsWithPhones.length,
      errors: [],
    };

    for (const tenant of tenantsWithPhones) {
      try {
        const smsResult = await SMSService.sendSMS(
          tenant.phone_number,
          message,
        );

        // Log to sms_queue
        await pool.query(
          `INSERT INTO sms_queue (recipient_phone, message, message_type, status, agent_id, sent_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            tenant.phone_number,
            message,
            messageType,
            smsResult.success ? "sent" : "failed",
            userId,
            smsResult.success ? new Date() : null,
          ],
        );

        if (smsResult.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({
            tenant: `${tenant.first_name} ${tenant.last_name}`,
            unit: tenant.unit_code,
            error: smsResult.error,
          });
        }
      } catch (smsError) {
        results.failed++;
        results.errors.push({
          tenant: `${tenant.first_name} ${tenant.last_name}`,
          unit: tenant.unit_code,
          error: smsError.message,
        });

        // Log failed SMS
        try {
          await pool.query(
            `INSERT INTO sms_queue (recipient_phone, message, message_type, status, error_message, agent_id, created_at)
             VALUES ($1, $2, $3, 'failed', $4, $5, NOW())`,
            [
              tenant.phone_number,
              message,
              messageType,
              smsError.message,
              userId,
            ],
          );
        } catch (logError) {
          console.error("Failed to log SMS error:", logError);
        }
      }
    }

    console.log(
      `✅ Targeted SMS complete: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped (no phone)`,
    );

    res.json({
      success: true,
      message: `SMS sent to ${results.sent} of ${results.total} tenants`,
      data: results,
    });
  } catch (error) {
    console.error("❌ Send targeted SMS error:", error);
    res.status(500).json({
      success: false,
      message: "Server error sending targeted SMS",
      error: error.message,
    });
  }
};

// =====================================================================
// 4. NEW: Get SMS history with filters and pagination
// =====================================================================

const getSMSHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const {
      page = 1,
      limit = 20,
      status,
      startDate,
      endDate,
      search,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let baseQuery = `
      SELECT 
        sq.id,
        sq.recipient_phone,
        sq.message,
        sq.message_type,
        sq.status,
        sq.attempts,
        sq.last_attempt_at,
        sq.sent_at,
        sq.created_at,
        sq.error_message,
        sq.agent_id,
        CONCAT(u.first_name, ' ', u.last_name) as sent_by_name
      FROM sms_queue sq
      LEFT JOIN users u ON sq.agent_id = u.id
      WHERE 1=1
    `;

    const whereClauses = [];
    const queryParams = [];
    let paramIndex = 1;

    // Agent isolation: agents only see their own sent SMS
    if (userRole !== "admin") {
      whereClauses.push(`sq.agent_id = $${paramIndex++}`);
      queryParams.push(userId);
    }

    // Status filter
    if (status) {
      whereClauses.push(`sq.status = $${paramIndex++}`);
      queryParams.push(status);
    }

    // Date range filters
    if (startDate) {
      whereClauses.push(`sq.created_at >= $${paramIndex++}`);
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClauses.push(
        `sq.created_at <= $${paramIndex++}::date + interval '1 day'`,
      );
      queryParams.push(endDate);
    }

    // Search filter (phone or message)
    if (search) {
      whereClauses.push(
        `(sq.recipient_phone ILIKE $${paramIndex} OR sq.message ILIKE $${paramIndex})`,
      );
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Add where clauses to query
    if (whereClauses.length > 0) {
      baseQuery += ` AND ${whereClauses.join(" AND ")}`;
    }

    // Count query
    const countQuery = `SELECT COUNT(*) FROM (${baseQuery}) as filtered`;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Add ordering and pagination
    baseQuery += ` ORDER BY sq.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    queryParams.push(parseInt(limit), offset);

    const historyResult = await pool.query(baseQuery, queryParams);

    res.json({
      success: true,
      data: {
        history: historyResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("❌ Get SMS history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching SMS history",
      error: error.message,
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

// ============================================================
// NEW: checkDeliveryStatus - Check delivery report from Celcom
// ============================================================
const checkDeliveryStatus = async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: 'Message ID is required'
      });
    }

    console.log(`🔍 Checking delivery status for message: ${messageId}`);

    // Call Celcom delivery report API
    const dlrResult = await SMSService.checkDeliveryReport(messageId);

    if (!dlrResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to check delivery status',
        error: dlrResult.error
      });
    }

    // Parse Celcom DLR response
    // Response format: {"responses":[{"response-code":200,"message-id":"123","dlr-status":"DELIVERED","dlr-time":"2024-01-15 10:30:00"}]}
    const dlrData = dlrResult.data;
    let status = 'unknown';
    let deliveredAt = null;
    let reason = null;

    if (dlrData && dlrData.responses && dlrData.responses.length > 0) {
      const response = dlrData.responses[0];
      const dlrStatus = response['dlr-status'] || response['status'];
      
      // Map Celcom status to our status
      if (dlrStatus === 'DELIVERED' || dlrStatus === 'DeliveredToTerminal') {
        status = 'delivered';
        deliveredAt = response['dlr-time'] || response['delivered-time'] || new Date().toISOString();
      } else if (dlrStatus === 'EXPIRED' || dlrStatus === 'REJECTED' || dlrStatus === 'UNDELIVERED') {
        status = 'failed';
        reason = dlrStatus;
      } else if (dlrStatus === 'ACCEPTED' || dlrStatus === 'SENT') {
        status = 'sent';
      } else if (dlrStatus === 'PENDING' || dlrStatus === 'BUFFERED') {
        status = 'pending';
      } else {
        status = 'unknown';
        reason = `Unknown status: ${dlrStatus}`;
      }
    }

    // Update sms_queue with delivery status if we can find the record
    // Note: This is optional - depends on whether you store message_id in sms_queue
    
    console.log(`📬 Delivery status for ${messageId}: ${status}`);

    res.json({
      success: true,
      data: {
        messageId,
        status,
        deliveredAt,
        reason,
        rawResponse: dlrData
      }
    });

  } catch (error) {
    console.error('❌ Check delivery status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error checking delivery status',
      error: error.message
    });
  }
};

// ============================================================
// NEW: getSMSStats - Get SMS statistics
// ============================================================
const getSMSStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    let agentFilter = '';
    const queryParams = [];

    if (!isAdmin) {
      agentFilter = 'WHERE sq.agent_id = $1';
      queryParams.push(userId);
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_sms,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_count,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_count,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as month_count
      FROM sms_queue sq
      ${agentFilter}
    `;

    const result = await pool.query(statsQuery, queryParams);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Get SMS stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching SMS statistics',
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
  healthCheck,
  getPropertyTenants, // NEW
  sendTargetedSMS, // NEW
  getSMSHistory,
  checkDeliveryStatus,
  getSMSStats,
};