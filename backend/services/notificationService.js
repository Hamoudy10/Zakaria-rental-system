// backend/services/notificationService.js
const pool = require('../config/database');

/**
 * NotificationService - Centralized notification management
 * 
 * NOTIFICATION TYPES (sync with frontend icons/colors):
 * - payment_success: Successful rent payment
 * - payment_received: Admin sees payment received
 * - payment_failed: Payment failure
 * - payment_pending: STK push initiated, awaiting confirmation
 * - payment_carry_forward: Advance payment applied to future month
 * - salary_paid: Agent receives salary
 * - salary_processed: Admin confirmation of salary payment
 * - complaint_created: New complaint filed
 * - complaint_resolved: Complaint resolved
 * - complaint_updated: Complaint status changed
 * - announcement: General announcement
 * - maintenance: Maintenance notice
 * - emergency: Emergency alert
 * - system_alert: System-level notification
 * - broadcast: Admin broadcast message
 */

class NotificationService {
  
  // ==================== CORE METHODS ====================

  /**
   * Create notification for a single user
   * @param {Object} notificationData
   * @returns {Object} Created notification
   */
  static async createNotification(notificationData) {
    const {
      userId,
      title,
      message,
      type,
      relatedEntityType = null,
      relatedEntityId = null
    } = notificationData;

    // Validate required fields
    if (!userId || !title || !message || !type) {
      console.error('❌ Missing required notification fields:', { userId, title, message, type });
      throw new Error('Missing required notification fields: userId, title, message, type');
    }

    try {
      const query = `
        INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, is_read, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
        RETURNING *
      `;
      
      const result = await pool.query(query, [
        userId,
        title,
        message,
        type,
        relatedEntityType,
        relatedEntityId
      ]);

      console.log(`✅ Notification created for user ${userId}: ${type}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Create notifications for multiple users (batch insert)
   * @param {Array} notificationsData - Array of notification objects
   * @returns {Array} Created notifications
   */
  static async createBulkNotifications(notificationsData) {
    if (!notificationsData || notificationsData.length === 0) {
      console.warn('⚠️ No notifications to create');
      return [];
    }

    try {
      // Use a transaction for consistency
      const client = await pool.connect();
      const createdNotifications = [];

      try {
        await client.query('BEGIN');

        for (const notification of notificationsData) {
          const { userId, title, message, type, relatedEntityType = null, relatedEntityId = null } = notification;

          if (!userId || !title || !message || !type) {
            console.warn('⚠️ Skipping invalid notification:', notification);
            continue;
          }

          const result = await client.query(
            `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, is_read, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, false, NOW()) RETURNING *`,
            [userId, title, message, type, relatedEntityType, relatedEntityId]
          );

          if (result.rows[0]) {
            createdNotifications.push(result.rows[0]);
          }
        }

        await client.query('COMMIT');
        console.log(`✅ Bulk created ${createdNotifications.length} notifications`);
        return createdNotifications;

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('❌ Error creating bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Mark a specific notification as read
   * @param {string} notificationId 
   * @param {string} userId 
   * @returns {Object|null} Updated notification or null if not found
   */
  static async markAsRead(notificationId, userId) {
    try {
      const query = `
        UPDATE notifications 
        SET is_read = true, read_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;
      
      const result = await pool.query(query, [notificationId, userId]);
      
      if (result.rows.length === 0) {
        console.warn(`⚠️ Notification ${notificationId} not found for user ${userId}`);
        return null;
      }

      console.log(`✅ Marked notification ${notificationId} as read`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {string} userId 
   * @returns {Array} Updated notifications
   */
  static async markAllAsRead(userId) {
    try {
      const query = `
        UPDATE notifications 
        SET is_read = true, read_at = NOW()
        WHERE user_id = $1 AND is_read = false
        RETURNING *
      `;
      
      const result = await pool.query(query, [userId]);
      console.log(`✅ Marked ${result.rows.length} notifications as read for user ${userId}`);
      return result.rows;
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count for a user
   * @param {string} userId 
   * @returns {number} Unread count
   */
  static async getUnreadCount(userId) {
    try {
      const query = `
        SELECT COUNT(*) as unread_count
        FROM notifications
        WHERE user_id = $1 AND is_read = false
      `;
      
      const result = await pool.query(query, [userId]);
      return parseInt(result.rows[0].unread_count || 0);
    } catch (error) {
      console.error('❌ Error fetching unread count:', error);
      throw error;
    }
  }

  /**
   * Get user notifications with pagination
   * @param {string} userId 
   * @param {number} limit 
   * @param {number} offset 
   * @returns {Array} Notifications
   */
  static async getUserNotifications(userId, limit = 20, offset = 0) {
    try {
      const query = `
        SELECT 
          n.*,
          CASE 
            WHEN n.related_entity_type = 'rent_payment' THEN (
              SELECT rp.mpesa_receipt_number FROM rent_payments rp WHERE rp.id::text = n.related_entity_id::text LIMIT 1
            )
            WHEN n.related_entity_type = 'salary_payment' THEN (
              SELECT sp.mpesa_receipt_number FROM salary_payments sp WHERE sp.id::text = n.related_entity_id::text LIMIT 1
            )
            ELSE NULL
          END as receipt_number
        FROM notifications n
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await pool.query(query, [userId, limit, offset]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching user notifications:', error);
      throw error;
    }
  }

  // ==================== PAYMENT NOTIFICATIONS ====================

  /**
   * Create payment success notification with partial payment support
   * Used by: paymentController after successful payment
   */
  static async createPaymentNotification(paymentData) {
    const {
      tenantId,
      tenantName,
      unitInfo,
      propertyInfo,
      amount,
      paymentMonth,
      mpesaReceipt,
      paymentId,
      allocatedAmount,
      carryForwardAmount = 0,
      remainingBalance = 0,
      isMonthComplete = true
    } = paymentData;

    try {
      const notifications = [];

      // Build tenant message
      let tenantMessage = `Your rent payment of KSh ${amount.toLocaleString()} has been received. `;
      
      if (carryForwardAmount > 0) {
        tenantMessage += `KSh ${allocatedAmount.toLocaleString()} applied to ${paymentMonth}, KSh ${carryForwardAmount.toLocaleString()} carried forward as advance.`;
      } else if (isMonthComplete) {
        tenantMessage += `Your rent for ${paymentMonth} is now fully paid.`;
      } else {
        tenantMessage += `Remaining balance for ${paymentMonth}: KSh ${remainingBalance.toLocaleString()}.`;
      }

      // Tenant notification
      notifications.push({
        userId: tenantId,
        title: 'Payment Successful',
        message: tenantMessage,
        type: 'payment_success',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      });

      // Admin notifications
      const adminQuery = await pool.query("SELECT id FROM users WHERE role = 'admin' AND is_active = true");
      
      for (const admin of adminQuery.rows) {
        let adminMessage = `${tenantName} paid KSh ${amount.toLocaleString()} for ${propertyInfo} (${unitInfo}). `;
        
        if (carryForwardAmount > 0) {
          adminMessage += `KSh ${carryForwardAmount.toLocaleString()} carried forward.`;
        } else if (!isMonthComplete) {
          adminMessage += `Balance: KSh ${remainingBalance.toLocaleString()}.`;
        } else {
          adminMessage += `Month ${paymentMonth} complete.`;
        }

        notifications.push({
          userId: admin.id,
          title: 'Payment Received',
          message: adminMessage,
          type: 'payment_received',
          relatedEntityType: 'rent_payment',
          relatedEntityId: paymentId
        });
      }

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('❌ Error creating payment notifications:', error);
      throw error;
    }
  }

  /**
   * Create payment failure notification
   * Used by: M-Pesa callback on failed transactions
   */
  static async createPaymentFailureNotification(paymentData) {
    const {
      tenantId,
      tenantName,
      unitInfo,
      propertyInfo,
      amount,
      paymentMonth,
      failureReason,
      paymentId
    } = paymentData;

    try {
      const notifications = [];

      // Tenant notification
      notifications.push({
        userId: tenantId,
        title: 'Payment Failed',
        message: `Your payment of KSh ${amount.toLocaleString()} for ${paymentMonth} failed. Reason: ${failureReason}. Please try again.`,
        type: 'payment_failed',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      });

      // Admin notifications
      const adminQuery = await pool.query("SELECT id FROM users WHERE role = 'admin' AND is_active = true");
      
      for (const admin of adminQuery.rows) {
        notifications.push({
          userId: admin.id,
          title: 'Payment Failed',
          message: `Payment failed for ${tenantName} (${propertyInfo} - ${unitInfo}). Amount: KSh ${amount.toLocaleString()}, Reason: ${failureReason}`,
          type: 'payment_failed',
          relatedEntityType: 'rent_payment',
          relatedEntityId: paymentId
        });
      }

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('❌ Error creating payment failure notifications:', error);
      throw error;
    }
  }

  /**
   * Create payment pending notification (STK push sent)
   */
  static async createPaymentPendingNotification(paymentData) {
    const { tenantId, amount, paymentMonth, paymentId } = paymentData;

    try {
      return await this.createNotification({
        userId: tenantId,
        title: 'Payment Initiated',
        message: `Your payment of KSh ${amount.toLocaleString()} for ${paymentMonth} has been initiated. Please enter your M-Pesa PIN to complete.`,
        type: 'payment_pending',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      });
    } catch (error) {
      console.error('❌ Error creating payment pending notification:', error);
      throw error;
    }
  }

  /**
   * Create carry-forward payment notification
   */
  static async createCarryForwardNotification(carryForwardData) {
    const { tenantId, amount, targetMonth, paymentId } = carryForwardData;

    try {
      return await this.createNotification({
        userId: tenantId,
        title: 'Advance Payment Applied',
        message: `KSh ${amount.toLocaleString()} has been applied to ${targetMonth} as advance payment.`,
        type: 'payment_carry_forward',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      });
    } catch (error) {
      console.error('❌ Error creating carry-forward notification:', error);
      throw error;
    }
  }

  // ==================== SALARY NOTIFICATIONS ====================

  /**
   * Create salary payment notification
   * Used by: paymentController.processSalaryPayment
   */
  static async createSalaryNotification(salaryData) {
    const {
      agentId,
      agentName,
      adminId,
      amount,
      paymentMonth,
      mpesaReceipt,
      salaryPaymentId
    } = salaryData;

    try {
      const notifications = [];

      // Agent notification
      notifications.push({
        userId: agentId,
        title: 'Salary Paid',
        message: `Your salary of KSh ${amount.toLocaleString()} for ${paymentMonth} has been processed. Receipt: ${mpesaReceipt || 'N/A'}`,
        type: 'salary_paid',
        relatedEntityType: 'salary_payment',
        relatedEntityId: salaryPaymentId
      });

      // Admin confirmation
      if (adminId) {
        notifications.push({
          userId: adminId,
          title: 'Salary Processed',
          message: `Salary of KSh ${amount.toLocaleString()} paid to ${agentName} for ${paymentMonth}.`,
          type: 'salary_processed',
          relatedEntityType: 'salary_payment',
          relatedEntityId: salaryPaymentId
        });
      }

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('❌ Error creating salary notifications:', error);
      throw error;
    }
  }

  // ==================== COMPLAINT NOTIFICATIONS ====================

  /**
   * Create complaint notification
   * Used by: complaintController
   */
  static async createComplaintNotification(complaintData) {
    const { complaintId, title, tenantId, tenantName, propertyName, unitCode, status, assignedAgentId } = complaintData;

    try {
      const notifications = [];

      if (status === 'created' || status === 'open') {
        // Notify admins and assigned agent about new complaint
        const adminQuery = await pool.query("SELECT id FROM users WHERE role = 'admin' AND is_active = true");
        
        for (const admin of adminQuery.rows) {
          notifications.push({
            userId: admin.id,
            title: 'New Complaint Filed',
            message: `${tenantName} filed a complaint at ${propertyName} (${unitCode}): "${title}"`,
            type: 'complaint_created',
            relatedEntityType: 'complaint',
            relatedEntityId: complaintId
          });
        }

        if (assignedAgentId) {
          notifications.push({
            userId: assignedAgentId,
            title: 'Complaint Assigned',
            message: `A complaint has been assigned to you at ${propertyName} (${unitCode}): "${title}"`,
            type: 'complaint_created',
            relatedEntityType: 'complaint',
            relatedEntityId: complaintId
          });
        }
      } else if (status === 'resolved' || status === 'closed') {
        // Notify tenant that complaint is resolved
        notifications.push({
          userId: tenantId,
          title: 'Complaint Resolved',
          message: `Your complaint "${title}" has been resolved. Thank you for your patience.`,
          type: 'complaint_resolved',
          relatedEntityType: 'complaint',
          relatedEntityId: complaintId
        });
      } else {
        // Notify tenant of status update
        notifications.push({
          userId: tenantId,
          title: 'Complaint Updated',
          message: `Your complaint "${title}" status has been updated to: ${status}.`,
          type: 'complaint_updated',
          relatedEntityType: 'complaint',
          relatedEntityId: complaintId
        });
      }

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('❌ Error creating complaint notifications:', error);
      throw error;
    }
  }

  // ==================== ALLOCATION NOTIFICATIONS ====================

  /**
   * Create tenant allocation notification
   * Used by: allocationsController
   */
  static async createAllocationNotification(allocationData) {
    const { tenantId, tenantName, propertyName, unitCode, monthlyRent, action, allocationId, adminId } = allocationData;

    try {
      const notifications = [];

      if (action === 'allocated') {
        // Notify tenant
        notifications.push({
          userId: tenantId,
          title: 'Unit Allocated',
          message: `You have been allocated to ${unitCode} at ${propertyName}. Monthly rent: KSh ${monthlyRent.toLocaleString()}.`,
          type: 'announcement',
          relatedEntityType: 'allocation',
          relatedEntityId: allocationId
        });

        // Notify admin
        if (adminId) {
          notifications.push({
            userId: adminId,
            title: 'Tenant Allocated',
            message: `${tenantName} has been allocated to ${unitCode} at ${propertyName}.`,
            type: 'announcement',
            relatedEntityType: 'allocation',
            relatedEntityId: allocationId
          });
        }
      } else if (action === 'deallocated') {
        // Notify admin only (tenant might already be gone)
        if (adminId) {
          notifications.push({
            userId: adminId,
            title: 'Tenant Deallocated',
            message: `${tenantName} has been removed from ${unitCode} at ${propertyName}.`,
            type: 'announcement',
            relatedEntityType: 'allocation',
            relatedEntityId: allocationId
          });
        }
      }

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('❌ Error creating allocation notifications:', error);
      throw error;
    }
  }

  // ==================== SYSTEM NOTIFICATIONS ====================

  /**
   * Create notification for all admins
   * Used by: System alerts, errors, important events
   */
  static async createAdminNotification(title, message, type = 'system_alert', relatedEntityId = null) {
    try {
      const adminQuery = await pool.query("SELECT id FROM users WHERE role = 'admin' AND is_active = true");
      
      if (adminQuery.rows.length === 0) {
        console.warn('⚠️ No active admins found for notification');
        return [];
      }

      const notifications = adminQuery.rows.map(admin => ({
        userId: admin.id,
        title,
        message,
        type,
        relatedEntityType: 'system',
        relatedEntityId
      }));

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('❌ Error creating admin notification:', error);
      throw error;
    }
  }

  /**
   * Create notification for property agents and admins
   * Used by: Property-specific events
   */
  static async createPropertyNotification(propertyId, title, message, type = 'announcement', relatedEntityId = null) {
    try {
      // Get admins
      const adminQuery = await pool.query("SELECT id FROM users WHERE role = 'admin' AND is_active = true");

      // Get agents assigned to this property
      const agentQuery = await pool.query(
        `SELECT agent_id FROM agent_property_assignments 
         WHERE property_id = $1 AND is_active = true`,
        [propertyId]
      );

      const recipientIds = new Set([
        ...adminQuery.rows.map(a => a.id),
        ...agentQuery.rows.map(a => a.agent_id)
      ]);

      if (recipientIds.size === 0) {
        console.warn('⚠️ No recipients found for property notification');
        return [];
      }

      const notifications = Array.from(recipientIds).map(userId => ({
        userId,
        title,
        message,
        type,
        relatedEntityType: 'property',
        relatedEntityId: relatedEntityId || propertyId
      }));

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('❌ Error creating property notification:', error);
      throw error;
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get payment-related notifications for a user
   */
  static async getPaymentNotifications(userId, limit = 10) {
    try {
      const query = `
        SELECT 
          n.*,
          rp.amount as payment_amount,
          rp.payment_month,
          rp.mpesa_receipt_number
        FROM notifications n
        LEFT JOIN rent_payments rp ON n.related_entity_id::text = rp.id::text 
          AND n.related_entity_type = 'rent_payment'
        WHERE n.user_id = $1 
        AND n.type IN ('payment_success', 'payment_failed', 'payment_carry_forward', 'payment_pending', 'payment_received')
        ORDER BY n.created_at DESC
        LIMIT $2
      `;
      
      const result = await pool.query(query, [userId, limit]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching payment notifications:', error);
      throw error;
    }
  }

  /**
   * Delete old notifications (cleanup job)
   * @param {number} daysOld - Delete notifications older than this many days
   */
  static async cleanupOldNotifications(daysOld = 90) {
    try {
      const result = await pool.query(
        `DELETE FROM notifications 
         WHERE is_read = true AND created_at < NOW() - INTERVAL '${daysOld} days'
         RETURNING id`
      );

      console.log(`🧹 Cleaned up ${result.rows.length} old notifications`);
      return result.rows.length;
    } catch (error) {
      console.error('❌ Error cleaning up notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics for a user
   */
  static async getNotificationStats(userId) {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_read = false THEN 1 END) as unread,
          COUNT(CASE WHEN type LIKE 'payment%' THEN 1 END) as payment_count,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as recent
        FROM notifications
        WHERE user_id = $1
      `;

      const result = await pool.query(query, [userId]);
      const stats = result.rows[0];

      return {
        total: parseInt(stats.total || 0),
        unread: parseInt(stats.unread || 0),
        paymentCount: parseInt(stats.payment_count || 0),
        recent: parseInt(stats.recent || 0)
      };
    } catch (error) {
      console.error('❌ Error fetching notification stats:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;