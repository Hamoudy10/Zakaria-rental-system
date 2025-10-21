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

  // Create payment notification with detailed information
  static async createPaymentNotification(paymentData) {
    const {
      tenantId,
      tenantName,
      unitInfo,
      propertyInfo,
      amount,
      paymentMonth,
      mpesaReceipt,
      paymentId
    } = paymentData;

    try {
      // Get all admin users
      const adminQuery = await pool.query(
        "SELECT id FROM users WHERE role = 'admin'"
      );
      
      const admins = adminQuery.rows;
      const notifications = [];

      // Notification for tenant
      const tenantNotification = {
        userId: tenantId,
        title: 'Rent Payment Confirmed',
        message: `Your rent payment of KSh ${amount} for ${paymentMonth} has been successfully processed. Receipt: ${mpesaReceipt}`,
        type: 'payment_success',
        relatedEntityType: 'rent_payment',
        relatedEntityId: paymentId
      };
      notifications.push(tenantNotification);

      // Notifications for all admins
      admins.forEach(admin => {
        const adminNotification = {
          userId: admin.id,
          title: 'Tenant Rent Payment Received',
          message: `Tenant ${tenantName} has paid KSh ${amount} for ${unitInfo} at ${propertyInfo} for ${paymentMonth}. Receipt: ${mpesaReceipt}`,
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
}

module.exports = NotificationService;