const pool = require('../config/database');

class NotificationService {
  // Create notification for a single user
  static async createNotification(notificationData) {
    const {
      userId,
      title,
      message,
      type,
      relatedEntityType = null,
      relatedEntityId = null
    } = notificationData;

    try {
      const query = `
        INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
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

      return result.rows[0];
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Create notifications for multiple users
  static async createBulkNotifications(notificationsData) {
    try {
      const queries = notificationsData.map(notification => {
        return pool.query(
          `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
          [
            notification.userId,
            notification.title,
            notification.message,
            notification.type,
            notification.relatedEntityType,
            notification.relatedEntityId
          ]
        );
      });

      const results = await Promise.all(queries);
      return results.map(result => result.rows[0]);
    } catch (error) {
      console.error('Error creating bulk notifications:', error);
      throw error;
    }
  }

  // ENHANCED: Create payment notification with partial payment support
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
      carryForwardAmount,
      remainingBalance,
      isMonthComplete
    } = paymentData;

    try {
      // Get all admin users
      const adminQuery = await pool.query(
        "SELECT id FROM users WHERE role = 'admin'"
      );
      
      const admins = adminQuery.rows;
      const notifications = [];

      // Notification for tenant
      let tenantMessage = `Your rent payment of KSh ${amount} has been processed successfully. `;
      
      if (carryForwardAmount > 0) {
        tenantMessage += `KSh ${allocatedAmount} applied to ${paymentMonth}, KSh ${carryForwardAmount} carried forward to future months.`;
      } else if (isMonthComplete) {
        tenantMessage += `Your rent for ${paymentMonth} is now fully paid.`;
      } else {
        tenantMessage += `Your rent for ${paymentMonth} is partially paid. Remaining balance: KSh ${remainingBalance}.`;
      }

      const tenantNotification = {
        userId: tenantId,
        title: 'Payment Successful',
        message: tenantMessage,
        type: 'payment_success',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      };
      notifications.push(tenantNotification);

      // Notifications for all admins
      admins.forEach(admin => {
        let adminMessage = `Tenant ${tenantName} has paid KSh ${amount} for ${propertyInfo} - ${unitInfo} (${paymentMonth}). `;
        
        if (carryForwardAmount > 0) {
          adminMessage += `KSh ${carryForwardAmount} carried forward to future months.`;
        } else if (!isMonthComplete) {
          adminMessage += `Remaining balance: KSh ${remainingBalance}.`;
        } else {
          adminMessage += `Payment for ${paymentMonth} is now complete.`;
        }

        const adminNotification = {
          userId: admin.id,
          title: 'Tenant Payment Received',
          message: adminMessage,
          type: 'payment_received',
          relatedEntityType: 'rent_payment',
          relatedEntityId: paymentId
        };
        notifications.push(adminNotification);
      });

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('Error creating payment notifications:', error);
      throw error;
    }
  }

  // ENHANCED: Create payment failure notification for both tenant and admin
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

      // Notification for tenant
      const tenantNotification = {
        userId: tenantId,
        title: 'Payment Failed',
        message: `Your rent payment of KSh ${amount} for ${paymentMonth} failed. Reason: ${failureReason}`,
        type: 'payment_failed',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      };
      notifications.push(tenantNotification);

      // Notifications for all admins
      const adminQuery = await pool.query(
        "SELECT id FROM users WHERE role = 'admin'"
      );
      
      adminQuery.rows.forEach(admin => {
        const adminNotification = {
          userId: admin.id,
          title: 'Payment Failure Alert',
          message: `Payment failed for tenant ${tenantName} (${propertyInfo} - ${unitInfo}). Amount: KSh ${amount}, Month: ${paymentMonth}. Reason: ${failureReason}`,
          type: 'payment_failed',
          relatedEntityType: 'rent_payment',
          relatedEntityId: paymentId
        };
        notifications.push(adminNotification);
      });

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('Error creating payment failure notifications:', error);
      throw error;
    }
  }

  // Create carry-forward payment notification
  static async createCarryForwardNotification(carryForwardData) {
    const {
      tenantId,
      amount,
      targetMonth,
      paymentId
    } = carryForwardData;

    try {
      const notification = {
        userId: tenantId,
        title: 'Payment Carry-Forward',
        message: `Your payment of KSh ${amount} has been carried forward to ${targetMonth} as advance payment.`,
        type: 'payment_carry_forward',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      };

      return await this.createNotification(notification);
    } catch (error) {
      console.error('Error creating carry-forward notification:', error);
      throw error;
    }
  }

  // Create salary payment notification
  static async createSalaryNotification(salaryData) {
    const {
      agentId,
      agentName,
      adminId,
      adminName,
      amount,
      paymentMonth,
      mpesaReceipt,
      salaryPaymentId
    } = salaryData;

    try {
      const notifications = [];

      // Notification for agent
      const agentNotification = {
        userId: agentId,
        title: 'Salary Payment Received',
        message: `Your salary of KSh ${amount} for ${paymentMonth} has been processed. Receipt: ${mpesaReceipt}`,
        type: 'salary_paid',
        relatedEntityType: 'salary_payment',
        relatedEntityId: salaryPaymentId
      };
      notifications.push(agentNotification);

      // Notification for admin (confirmation)
      const adminNotification = {
        userId: adminId,
        title: 'Salary Payment Processed',
        message: `Salary payment of KSh ${amount} to ${agentName} for ${paymentMonth} has been completed. Receipt: ${mpesaReceipt}`,
        type: 'salary_processed',
        relatedEntityType: 'salary_payment',
        relatedEntityId: salaryPaymentId
      };
      notifications.push(adminNotification);

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('Error creating salary notifications:', error);
      throw error;
    }
  }

  // Get user notifications
  static async getUserNotifications(userId, limit = 20, offset = 0) {
    try {
      const query = `
        SELECT 
          n.*,
          CASE 
            WHEN n.related_entity_type = 'rent_payment' THEN (
              SELECT rp.mpesa_receipt_number FROM rent_payments rp WHERE rp.id = n.related_entity_id
            )
            WHEN n.related_entity_type = 'salary_payment' THEN (
              SELECT sp.mpesa_receipt_number FROM salary_payments sp WHERE sp.id = n.related_entity_id
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
      console.error('Error fetching user notifications:', error);
      throw error;
    }
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    try {
      const query = `
        UPDATE notifications 
        SET is_read = true, read_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;
      
      const result = await pool.query(query, [notificationId, userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read
  static async markAllAsRead(userId) {
    try {
      const query = `
        UPDATE notifications 
        SET is_read = true, read_at = NOW()
        WHERE user_id = $1 AND is_read = false
        RETURNING *
      `;
      
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  // Get unread notification count
  static async getUnreadCount(userId) {
    try {
      const query = `
        SELECT COUNT(*) as unread_count
        FROM notifications
        WHERE user_id = $1 AND is_read = false
      `;
      
      const result = await pool.query(query, [userId]);
      return parseInt(result.rows[0].unread_count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
      throw error;
    }
  }

  // NEW: Get payment-related notifications for user
  static async getPaymentNotifications(userId, limit = 10) {
    try {
      const query = `
        SELECT 
          n.*,
          rp.amount as payment_amount,
          rp.payment_month,
          rp.mpesa_receipt_number
        FROM notifications n
        LEFT JOIN rent_payments rp ON n.related_entity_id = rp.id AND n.related_entity_type = 'rent_payment'
        WHERE n.user_id = $1 
        AND n.type IN ('payment_success', 'payment_failed', 'payment_carry_forward', 'payment_pending')
        ORDER BY n.created_at DESC
        LIMIT $2
      `;
      
      const result = await pool.query(query, [userId, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching payment notifications:', error);
      throw error;
    }
  }

  // NEW: Create system-wide notification for admins
  static async createAdminNotification(title, message, type = 'system_alert') {
    try {
      const adminQuery = await pool.query(
        "SELECT id FROM users WHERE role = 'admin'"
      );
      
      const notifications = adminQuery.rows.map(admin => ({
        userId: admin.id,
        title,
        message,
        type,
        relatedEntityType: 'system'
      }));

      return await this.createBulkNotifications(notifications);
    } catch (error) {
      console.error('Error creating admin notification:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;