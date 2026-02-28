// backend/controllers/notificationController.js
const pool = require('../config/database');
const NotificationService = require('../services/notificationService');
const SMSService = require('../services/smsService');
const MessagingService = require("../services/messagingService");
const MessageTemplateService = require("../services/messageTemplateService");

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
      target_roles,
      user_ids  // NEW: Support for specific user IDs
    } = req.body;

    console.log('📢 Creating broadcast notification:', { title, type, target_roles, user_ids });

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin users can create broadcast notifications'
      });
    }

    let users = [];

    // Determine recipients based on provided parameters
    if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
      // Send to specific users
      console.log(`📋 Sending to ${user_ids.length} specific users`);
      
      const usersResult = await pool.query(
        'SELECT id FROM users WHERE id = ANY($1::uuid[]) AND is_active = true',
        [user_ids]
      );
      users = usersResult.rows;
      
      if (users.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid users found with the provided IDs'
        });
      }
    } else if (target_roles && Array.isArray(target_roles) && target_roles.length > 0) {
      // Send to users by roles
      console.log(`📋 Sending to roles: ${target_roles.join(', ')}`);
      
      const usersResult = await pool.query(
        'SELECT id FROM users WHERE role = ANY($1) AND is_active = true',
        [target_roles]
      );
      users = usersResult.rows;
      
      if (users.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No active users found for the specified roles'
        });
      }
    } else {
      // No recipients specified - return error
      return res.status(400).json({
        success: false,
        message: 'Please specify target_roles or user_ids'
      });
    }

    console.log(`📤 Found ${users.length} recipients`);

    // Create notifications for all recipients
    const notificationsData = users.map(user => ({
      userId: user.id,
      title: title.trim(),
      message: message.trim(),
      type,
      relatedEntityType: 'broadcast'
    }));

    const createdNotifications = await NotificationService.createBulkNotifications(notificationsData);

    console.log(`✅ Broadcast notification sent to ${createdNotifications.length} users`);

    res.status(201).json({
      success: true,
      message: `Broadcast notification sent to ${createdNotifications.length} user(s)`,
      data: {
        sentCount: createdNotifications.length,
        recipientType: user_ids ? 'specific' : 'roles',
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
    const {
      propertyId,
      message,
      messageType = "announcement",
      template_id,
      template_variables = {},
    } = req.body;
    const userId = req.user.id;

    console.log("📱 Sending bulk SMS + WhatsApp:", {
      propertyId,
      messageType,
      userId,
    });

    if (!propertyId || (!message && !template_id)) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: propertyId and message or template_id",
      });
    }

    if (message && !template_id && message.length > 160) {
      return res.status(400).json({
        success: false,
        message: "SMS message cannot exceed 160 characters",
      });
    }

    const binding = await MessageTemplateService.getBinding(
      "agent_manual_general_trigger",
    );
    const useTemplateId =
      template_id &&
      (req.user.role === "admin" || binding?.allow_agent_override === true)
        ? template_id
        : null;

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

    console.log(`📤 Sending to ${tenants.length} tenants in ${property.name}`);

    const results = {
      total: tenants.length,
      sent: 0,
      failed: 0,
      errors: [],
      whatsapp_sent: 0,
      whatsapp_failed: 0,
    };

    for (const tenant of tenants) {
      try {
        let finalMessage = message;
        const rendered = await MessageTemplateService.buildRenderedMessage({
          eventKey: "agent_manual_general_trigger",
          channel: "sms",
          templateIdOverride: useTemplateId,
          variables: {
            tenantName: `${tenant.first_name} ${tenant.last_name}`.trim(),
            unitCode: tenant.unit_code,
            propertyName: property.name,
            message: message || "",
            ...template_variables,
          },
        });
        if (rendered?.rendered) {
          finalMessage = rendered.rendered;
        }
        if (!finalMessage || !String(finalMessage).trim()) {
          throw new Error("Resolved template message is empty");
        }

        // Send via both SMS + WhatsApp in parallel
        const msgResult = await MessagingService.sendRawMessage(
          tenant.phone_number,
          finalMessage,
          messageType,
        );

        // Log SMS to sms_queue
        await pool.query(
          `INSERT INTO sms_queue (recipient_phone, message, message_type, status, agent_id, sent_at, message_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            tenant.phone_number,
            finalMessage,
            messageType,
            msgResult.sms?.success ? "sent" : "failed",
            userId,
            msgResult.sms?.success ? new Date() : null,
            msgResult.sms?.messageId || null,
          ],
        );

        // Track SMS result
        if (msgResult.sms?.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({
            tenant: `${tenant.first_name} ${tenant.last_name}`,
            unit: tenant.unit_code,
            error: msgResult.sms?.error || "SMS failed",
            channel: "sms",
          });
        }

        // Track WhatsApp result
        if (msgResult.whatsapp?.success) {
          results.whatsapp_sent++;
        } else if (!msgResult.whatsapp?.skipped) {
          results.whatsapp_failed++;
        }
      } catch (sendError) {
        results.failed++;
        results.errors.push({
          tenant: `${tenant.first_name} ${tenant.last_name}`,
          unit: tenant.unit_code,
          error: sendError.message,
          channel: "both",
        });

        // Log failed SMS
        try {
          await pool.query(
            `INSERT INTO sms_queue (recipient_phone, message, message_type, status, error_message, agent_id, message_id, created_at)
             VALUES ($1, $2, $3, 'failed', $4, $5, $6, NOW())`,
            [
              tenant.phone_number,
              finalMessage,
              messageType,
              sendError.message,
              userId,
              null,
            ],
          );
        } catch (logError) {
          console.error("Failed to log SMS error:", logError);
        }
      }
    }

    console.log(
      `✅ Bulk messaging complete: SMS=${results.sent} sent/${results.failed} failed, WhatsApp=${results.whatsapp_sent} sent/${results.whatsapp_failed} failed`,
    );

    res.json({
      success: true,
      message: `Messages sent to ${results.sent} of ${results.total} tenants via SMS. ${results.whatsapp_sent} also received WhatsApp.`,
      data: {
        ...results,
        template_id_used: useTemplateId || null,
      },
    });
  } catch (error) {
    console.error("❌ Send bulk messaging error:", error);
    res.status(500).json({
      success: false,
      message: "Server error sending bulk messages",
      error: error.message,
    });
  }
};// =====================================================================
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
    const {
      tenantIds,
      message,
      messageType = "announcement",
      template_id,
      template_variables = {},
    } = req.body;
    const userId = req.user.id;

    console.log("📱 Sending targeted SMS + WhatsApp:", {
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

    if ((!message || message.trim().length === 0) && !template_id) {
      return res.status(400).json({
        success: false,
        message: "Message or template_id is required",
      });
    }

    if (message && !template_id && message.length > 160) {
      return res.status(400).json({
        success: false,
        message: "SMS message cannot exceed 160 characters",
      });
    }

    const binding = await MessageTemplateService.getBinding(
      "agent_manual_general_trigger",
    );
    const useTemplateId =
      template_id &&
      (req.user.role === "admin" || binding?.allow_agent_override === true)
        ? template_id
        : null;

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

    console.log(`📤 Sending to ${tenantsWithPhones.length} selected tenants`);

    const results = {
      total: tenantsWithPhones.length,
      sent: 0,
      failed: 0,
      skipped: tenants.length - tenantsWithPhones.length,
      errors: [],
      whatsapp_sent: 0,
      whatsapp_failed: 0,
    };

    for (const tenant of tenantsWithPhones) {
      try {
        let finalMessage = message;
        const rendered = await MessageTemplateService.buildRenderedMessage({
          eventKey: "agent_manual_general_trigger",
          channel: "sms",
          templateIdOverride: useTemplateId,
          variables: {
            tenantName: `${tenant.first_name} ${tenant.last_name}`.trim(),
            unitCode: tenant.unit_code,
            message: message || "",
            ...template_variables,
          },
        });
        if (rendered?.rendered) {
          finalMessage = rendered.rendered;
        }
        if (!finalMessage || !String(finalMessage).trim()) {
          throw new Error("Resolved template message is empty");
        }

        // Send via both SMS + WhatsApp in parallel
        const msgResult = await MessagingService.sendRawMessage(
          tenant.phone_number,
          finalMessage,
          messageType,
        );

        // Log SMS to sms_queue
        await pool.query(
          `INSERT INTO sms_queue (recipient_phone, message, message_type, status, agent_id, sent_at, message_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            tenant.phone_number,
            finalMessage,
            messageType,
            msgResult.sms?.success ? "sent" : "failed",
            userId,
            msgResult.sms?.success ? new Date() : null,
            msgResult.sms?.messageId || null,
          ],
        );

        // Track SMS result
        if (msgResult.sms?.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({
            tenant: `${tenant.first_name} ${tenant.last_name}`,
            unit: tenant.unit_code,
            error: msgResult.sms?.error || "SMS failed",
            channel: "sms",
          });
        }

        // Track WhatsApp result
        if (msgResult.whatsapp?.success) {
          results.whatsapp_sent++;
        } else if (!msgResult.whatsapp?.skipped) {
          results.whatsapp_failed++;
        }
      } catch (sendError) {
        results.failed++;
        results.errors.push({
          tenant: `${tenant.first_name} ${tenant.last_name}`,
          unit: tenant.unit_code,
          error: sendError.message,
          channel: "both",
        });

        // Log failed SMS
        try {
          await pool.query(
            `INSERT INTO sms_queue (recipient_phone, message, message_type, status, error_message, agent_id, message_id, created_at)
             VALUES ($1, $2, $3, 'failed', $4, $5, $6, NOW())`,
            [
              tenant.phone_number,
              finalMessage,
              messageType,
              sendError.message,
              userId,
              null,
            ],
          );
        } catch (logError) {
          console.error("Failed to log SMS error:", logError);
        }
      }
    }

    console.log(
      `✅ Targeted messaging complete: SMS=${results.sent} sent/${results.failed} failed, WhatsApp=${results.whatsapp_sent} sent/${results.whatsapp_failed} failed`,
    );

    res.json({
      success: true,
      message: `Messages sent to ${results.sent} of ${results.total} tenants via SMS. ${results.whatsapp_sent} also received WhatsApp.`,
      data: {
        ...results,
        template_id_used: useTemplateId || null,
      },
    });
  } catch (error) {
    console.error("❌ Send targeted messaging error:", error);
    res.status(500).json({
      success: false,
      message: "Server error sending targeted messages",
      error: error.message,
    });
  }
};

const getMessagingHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const {
      page = 1,
      limit = 20,
      status,
      channel, // 'sms', 'whatsapp', or 'all'
      startDate,
      endDate,
      search,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clauses for queue + notification tables
    const buildWhereClauses = (
      tableAlias,
      phoneColumn,
      messageColumn,
      dateColumn,
      hasAgentColumn,
      paramStartIndex,
    ) => {
      const whereClauses = [];
      const queryParams = [];
      let paramIndex = paramStartIndex;

      // Agent visibility:
      // 1) Explicitly agent-sent rows (agent_id)
      // 2) Auto/system rows to phones belonging to tenants in assigned properties
      if (userRole !== "admin") {
        const agentParamIndex = paramIndex++;
        queryParams.push(userId);

        const visibilityClauses = [];
        if (hasAgentColumn) {
          visibilityClauses.push(`${tableAlias}.agent_id = $${agentParamIndex}`);
        }

        visibilityClauses.push(`EXISTS (
          SELECT 1
          FROM tenants t
          JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
          JOIN property_units pu ON pu.id = ta.unit_id
          JOIN agent_property_assignments apa
            ON apa.property_id = pu.property_id
           AND apa.is_active = true
          WHERE apa.agent_id = $${agentParamIndex}
            AND (
              REPLACE(t.phone_number, '+', '') = REPLACE(${phoneColumn}, '+', '')
              OR REPLACE(t.phone_number, '+', '') = CONCAT('254', RIGHT(REPLACE(${phoneColumn}, '+', ''), 9))
              OR REPLACE(${phoneColumn}, '+', '') = CONCAT('254', RIGHT(REPLACE(t.phone_number, '+', ''), 9))
            )
        )`);

        whereClauses.push(`(${visibilityClauses.join(" OR ")})`);
      }

      // Status filter
      if (status && status !== "all") {
        whereClauses.push(`${tableAlias}.status = $${paramIndex++}`);
        queryParams.push(status);
      }

      // Date range filters
      if (startDate) {
        whereClauses.push(`${dateColumn} >= $${paramIndex++}`);
        queryParams.push(startDate);
      }

      if (endDate) {
        whereClauses.push(
          `${dateColumn} <= $${paramIndex++}::date + interval '1 day'`,
        );
        queryParams.push(endDate);
      }

      // Search filter
      if (search) {
        whereClauses.push(`(${phoneColumn} ILIKE $${paramIndex} OR ${messageColumn} ILIKE $${paramIndex})`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      return { whereClauses, queryParams, nextParamIndex: paramIndex };
    };

    // Determine which tables to query based on channel filter
    const includesSMS = !channel || channel === "all" || channel === "sms";
    const includesWhatsApp =
      !channel || channel === "all" || channel === "whatsapp";
    const [smsNotifTableCheck, waNotifTableCheck] = await Promise.all([
      pool.query(`SELECT to_regclass('public.sms_notifications') as table_name`),
      pool.query(
        `SELECT to_regclass('public.whatsapp_notifications') as table_name`,
      ),
    ]);
    const hasSMSNotificationsTable = !!smsNotifTableCheck.rows[0]?.table_name;
    const hasWhatsAppNotificationsTable =
      !!waNotifTableCheck.rows[0]?.table_name;

    let queries = [];
    let allParams = [];
    let currentParamIndex = 1;

    // SMS queue (agent initiated + queued/retry records)
    if (includesSMS && hasSMSNotificationsTable) {
      const smsWhere = buildWhereClauses(
        "sq",
        "sq.recipient_phone",
        "sq.message",
        "sq.created_at",
        true,
        currentParamIndex,
      );
      const smsWhereClause =
        smsWhere.whereClauses.length > 0
          ? `WHERE ${smsWhere.whereClauses.join(" AND ")}`
          : "";

      queries.push(`
        SELECT 
          sq.id::text as id,
          sq.recipient_phone,
          sq.message,
          sq.message_type,
          sq.status,
          sq.message_id,
          sq.delivery_status,
          sq.attempts,
          sq.last_attempt_at,
          sq.sent_at,
          sq.created_at,
          sq.error_message,
          sq.agent_id,
          'sms' as channel,
          NULL as template_name,
          'queue' as source,
          CONCAT(u.first_name, ' ', u.last_name) as sent_by_name
        FROM sms_queue sq
        LEFT JOIN users u ON sq.agent_id = u.id
        ${smsWhereClause}
      `);

      allParams = [...allParams, ...smsWhere.queryParams];
      currentParamIndex = smsWhere.nextParamIndex;
    }

    // SMS notifications (automatic immediate sends)
    if (includesSMS) {
      const smsNotifWhere = buildWhereClauses(
        "sn",
        "sn.phone_number",
        "sn.message_content",
        "sn.sent_at",
        false,
        currentParamIndex,
      );
      const smsNotifWhereClause =
        smsNotifWhere.whereClauses.length > 0
          ? `WHERE ${smsNotifWhere.whereClauses.join(" AND ")}`
          : "";

      queries.push(`
        SELECT
          CONCAT('smsn_', ROW_NUMBER() OVER ()) as id,
          sn.phone_number as recipient_phone,
          sn.message_content as message,
          sn.message_type,
          sn.status,
          NULL::text as message_id,
          NULL::text as delivery_status,
          NULL::int as attempts,
          NULL::timestamp as last_attempt_at,
          sn.sent_at,
          sn.sent_at as created_at,
          NULL::text as error_message,
          NULL::uuid as agent_id,
          'sms' as channel,
          NULL as template_name,
          'notification' as source,
          'System (Auto)' as sent_by_name
        FROM sms_notifications sn
        ${smsNotifWhereClause}
      `);

      allParams = [...allParams, ...smsNotifWhere.queryParams];
      currentParamIndex = smsNotifWhere.nextParamIndex;
    }

    // WhatsApp queue (agent initiated + queued/retry records)
    if (includesWhatsApp && hasWhatsAppNotificationsTable) {
      const waWhere = buildWhereClauses(
        "wq",
        "wq.recipient_phone",
        "COALESCE(wq.fallback_message, '')",
        "wq.created_at",
        true,
        currentParamIndex,
      );
      const waWhereClause =
        waWhere.whereClauses.length > 0
          ? `WHERE ${waWhere.whereClauses.join(" AND ")}`
          : "";

      queries.push(`
        SELECT 
          wq.id::text as id,
          wq.recipient_phone,
          wq.fallback_message as message,
          wq.message_type,
          wq.status,
          NULL::text as message_id,
          NULL::text as delivery_status,
          wq.attempts,
          wq.last_attempt_at,
          wq.sent_at,
          wq.created_at,
          wq.error_message,
          wq.agent_id,
          'whatsapp' as channel,
          wq.template_name,
          'queue' as source,
          CONCAT(u.first_name, ' ', u.last_name) as sent_by_name
        FROM whatsapp_queue wq
        LEFT JOIN users u ON wq.agent_id = u.id
        ${waWhereClause}
      `);

      allParams = [...allParams, ...waWhere.queryParams];
      currentParamIndex = waWhere.nextParamIndex;
    }

    // WhatsApp notifications (automatic immediate sends)
    if (includesWhatsApp) {
      const waNotifWhere = buildWhereClauses(
        "wn",
        "wn.phone_number",
        "COALESCE(wn.template_name, '')",
        "wn.sent_at",
        false,
        currentParamIndex,
      );
      const waNotifWhereClause =
        waNotifWhere.whereClauses.length > 0
          ? `WHERE ${waNotifWhere.whereClauses.join(" AND ")}`
          : "";

      queries.push(`
        SELECT
          CONCAT('wan_', ROW_NUMBER() OVER ()) as id,
          wn.phone_number as recipient_phone,
          wn.template_name as message,
          wn.message_type,
          wn.status,
          NULL::text as message_id,
          NULL::text as delivery_status,
          NULL::int as attempts,
          NULL::timestamp as last_attempt_at,
          wn.sent_at,
          wn.sent_at as created_at,
          wn.error_message,
          NULL::uuid as agent_id,
          'whatsapp' as channel,
          wn.template_name,
          'notification' as source,
          'System (Auto)' as sent_by_name
        FROM whatsapp_notifications wn
        ${waNotifWhereClause}
      `);

      allParams = [...allParams, ...waNotifWhere.queryParams];
      currentParamIndex = waNotifWhere.nextParamIndex;
    }

    // If no queries (shouldn't happen), return empty
    if (queries.length === 0) {
      return res.json({
        success: true,
        data: {
          messages: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalCount: 0,
            limit: parseInt(limit),
          },
        },
      });
    }

    // Combine queries with UNION ALL
    const combinedQuery = queries.join(" UNION ALL ");
    const baseParams = [...allParams];

    // Count query
    const countQuery = `SELECT COUNT(*) FROM (${combinedQuery}) as combined`;
    const countResult = await pool.query(countQuery, baseParams);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Add ordering and pagination
    const paginatedQuery = `
      SELECT * FROM (${combinedQuery}) as combined
      ORDER BY created_at DESC
      LIMIT $${currentParamIndex++} OFFSET $${currentParamIndex++}
    `;
    const paginatedParams = [...baseParams, parseInt(limit), offset];
    const historyResult = await pool.query(paginatedQuery, paginatedParams);

    // Get channel-specific counts for summary
    let channelCounts = { sms: 0, whatsapp: 0 };
    let statusCounts = { sent: 0, pending: 0, failed: 0, skipped: 0 };

    const summaryQuery = `
      SELECT channel, status, COUNT(*) as count
      FROM (${combinedQuery}) as combined
      GROUP BY channel, status
    `;

    try {
      const summaryResult = await pool.query(summaryQuery, baseParams);
      summaryResult.rows.forEach((row) => {
        const count = parseInt(row.count, 10) || 0;
        if (row.channel && channelCounts[row.channel] !== undefined) {
          channelCounts[row.channel] += count;
        }
        if (row.status) {
          statusCounts[row.status] = count;
        }
      });
    } catch (e) {
      console.warn("Messaging summary query failed:", e.message);
    }

    res.json({
      success: true,
      data: {
        messages: historyResult.rows,
        summary: {
          totalCount,
          channelCounts,
          statusCounts,
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("❌ Get messaging history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching messaging history",
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

    // Persist delivery outcome for later display in history tables
    await pool.query(
      `UPDATE sms_queue
       SET delivery_status = $1,
           status = CASE WHEN $1 = 'delivered' THEN 'delivered' ELSE status END,
           delivered_at = CASE WHEN $1 = 'delivered' THEN COALESCE($2::timestamp, NOW()) ELSE delivered_at END
       WHERE message_id = $3`,
      [status, deliveredAt, messageId],
    );

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

// ============================================================
// NEW: getTenantsByProperty - Get tenants for targeted SMS
// ============================================================
const getTenantsByProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'Property ID is required'
      });
    }

    // Verify access to property
    let accessCheck;
    if (req.user.role === 'admin') {
      accessCheck = await pool.query('SELECT id FROM properties WHERE id = $1', [propertyId]);
    } else {
      accessCheck = await pool.query(
        `SELECT p.id FROM properties p
         JOIN agent_property_assignments apa ON p.id = apa.property_id
         WHERE p.id = $1 AND apa.agent_id = $2 AND apa.is_active = true`,
        [propertyId, userId]
      );
    }

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this property'
      });
    }

    // Get all tenants in the property (with active allocations)
    const tenantsQuery = await pool.query(
      `SELECT DISTINCT 
         t.id, 
         t.first_name, 
         t.last_name, 
         t.phone_number,
         t.national_id,
         pu.unit_code,
         pu.unit_number,
         ta.is_active as allocation_active,
         ta.monthly_rent
       FROM tenants t
       JOIN tenant_allocations ta ON t.id = ta.tenant_id
       JOIN property_units pu ON ta.unit_id = pu.id
       WHERE pu.property_id = $1 AND ta.is_active = true
       ORDER BY pu.unit_number, t.first_name`,
      [propertyId]
    );

    console.log(`📋 Found ${tenantsQuery.rows.length} tenants in property ${propertyId}`);

    res.json({
      success: true,
      data: tenantsQuery.rows
    });

  } catch (error) {
    console.error('❌ Get tenants by property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching tenants',
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
  getMessagingHistory, // NEW
  getTenantsByProperty,
  checkDeliveryStatus,
  getSMSStats,
};
