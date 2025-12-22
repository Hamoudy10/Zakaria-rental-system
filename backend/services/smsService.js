const axios = require('axios');
const pool = require('../config/database');

class SMSService {
  constructor() {
    this.apiKey = process.env.SMS_API_KEY;
    this.senderId = process.env.SMS_SENDER_ID;
    this.username = process.env.SMS_USERNAME || 'sandbox';
    this.baseURL = process.env.SMS_BASE_URL || 'https://api.sandbox.africastalking.com/version1/messaging';
    
    console.log('📱 SMS Service Initialized:', {
      hasApiKey: !!this.apiKey,
      hasSenderId: !!this.senderId,
      username: this.username,
      baseURL: this.baseURL
    });
  }

  // Format phone number to international format (254...)
  formatPhoneNumber(phone) {
    if (!phone) {
      throw new Error('Phone number is required');
    }
    
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    console.log('📞 Formatting phone number:', { original: phone, cleaned });
    
    // Handle different formats: 07..., 254..., +254...
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      // Format: 07XXXXXXXX -> 2547XXXXXXXX
      return '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('254') && cleaned.length === 12) {
      // Format: 2547XXXXXXXX
      return cleaned;
    } else if (cleaned.startsWith('+254') && cleaned.length === 13) {
      // Format: +2547XXXXXXXX
      return cleaned.substring(1);
    } else if (cleaned.startsWith('7') && cleaned.length === 9) {
      // Format: 7XXXXXXXX -> 2547XXXXXXXX
      return '254' + cleaned;
    } else {
      console.warn('⚠️ Unusual phone number format:', cleaned);
      // Try to return as is, but log warning
      return cleaned;
    }
  }

  // Validate phone number format
  validatePhoneNumber(phone) {
    const formatted = this.formatPhoneNumber(phone);
    // Kenyan phone number regex: 254 followed by 7, 1, or 0 and 8 digits
    const phoneRegex = /^254(7\d{8}|1\d{8}|0\d{8})$/;
    return phoneRegex.test(formatted);
  }

  // Send SMS using Africa's Talking API (or your preferred provider)
  async sendSMS(phoneNumber, message) {
    try {
      console.log('📱 Attempting to send SMS:', { 
        phoneNumber, 
        formattedPhone: this.formatPhoneNumber(phoneNumber),
        messageLength: message.length,
        messagePreview: message.substring(0, 50) + '...'
      });
      
      // Validate phone number
      if (!this.validatePhoneNumber(phoneNumber)) {
        console.error('❌ Invalid phone number format:', phoneNumber);
        return { 
          success: false, 
          message: 'Invalid phone number format',
          error: 'INVALID_PHONE_FORMAT'
        };
      }

      // Check if SMS service is configured
      if (!this.apiKey || !this.senderId) {
        console.warn('⚠️ SMS service not configured. Skipping SMS sending.');
        console.log('💡 To enable SMS, set SMS_API_KEY, SMS_SENDER_ID, and SMS_USERNAME in your .env file');
        
        // Simulate success for development
        return { 
          success: true, 
          message: 'SMS service not configured - simulated success',
          simulated: true,
          messageId: 'simulated-' + Date.now()
        };
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      console.log('📞 Formatted phone number:', formattedPhone);

      // For Africa's Talking API
      const payload = {
        username: this.username,
        to: formattedPhone,
        message: message,
        from: this.senderId
      };

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': this.apiKey,
        'Accept': 'application/json'
      };

      console.log('🚀 Sending SMS via Africa\'s Talking API...', {
        to: formattedPhone,
        from: this.senderId,
        messageLength: message.length
      });

      const response = await axios.post(this.baseURL, new URLSearchParams(payload), { 
        headers,
        timeout: 30000 // 30 second timeout
      });

      console.log('✅ Africa\'s Talking API Response:', response.data);

      if (response.data.SMSMessageData && response.data.SMSMessageData.Recipients) {
        const recipient = response.data.SMSMessageData.Recipients[0];
        
        if (recipient.status === 'Success') {
          console.log('✅ SMS sent successfully to:', formattedPhone, {
            messageId: recipient.messageId,
            cost: recipient.cost
          });
          
          return { 
            success: true, 
            messageId: recipient.messageId,
            cost: recipient.cost,
            status: recipient.status
          };
        } else {
          console.error('❌ SMS sending failed:', recipient.status, recipient.statusCode);
          return { 
            success: false, 
            error: recipient.status,
            statusCode: recipient.statusCode,
            message: `SMS failed: ${recipient.status}`
          };
        }
      } else {
        console.error('❌ Unexpected API response format:', response.data);
        return { 
          success: false, 
          error: 'UNEXPECTED_RESPONSE',
          message: 'Unexpected response format from SMS provider'
        };
      }

    } catch (error) {
      console.error('❌ Error sending SMS:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Queue the SMS for retry
      await this.queueSMSForRetry(phoneNumber, message, error.message);
      
      return { 
        success: false, 
        error: error.message,
        statusCode: error.response?.status,
        queued: true
      };
    }
  }

  // Queue SMS for retry in case of failure
  async queueSMSForRetry(phoneNumber, message, error = null) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      await pool.query(
        `INSERT INTO sms_queue (recipient_phone, message, message_type, status, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [formattedPhone, message, 'payment_notification', 'pending', error]
      );
      
      console.log('📨 SMS queued for retry:', formattedPhone);
    } catch (error) {
      console.error('❌ Failed to queue SMS:', error);
    }
  }

  // Process queued SMS messages
  async processQueuedSMS() {
    try {
      console.log('🔄 Processing queued SMS messages...');
      
      // Get pending SMS messages (limit to 10 at a time)
      const queuedSMS = await pool.query(
        `SELECT * FROM sms_queue 
         WHERE status = 'pending' AND attempts < 3
         ORDER BY created_at ASC 
         LIMIT 10`
      );
      
      console.log(`📨 Found ${queuedSMS.rows.length} queued SMS messages to process`);
      
      const results = {
        processed: 0,
        successful: 0,
        failed: 0
      };
      
      for (const sms of queuedSMS.rows) {
        try {
          const result = await this.sendSMS(sms.recipient_phone, sms.message);
          
          // Update SMS queue record
          await pool.query(
            `UPDATE sms_queue 
             SET status = $1, 
                 sent_at = $2, 
                 attempts = attempts + 1,
                 last_attempt_at = NOW(),
                 error_message = $3
             WHERE id = $4`,
            [
              result.success ? 'sent' : 'failed',
              result.success ? new Date() : null,
              result.error || null,
              sms.id
            ]
          );
          
          if (result.success) {
            results.successful++;
            console.log(`✅ Successfully sent queued SMS #${sms.id}`);
          } else {
            results.failed++;
            console.log(`❌ Failed to send queued SMS #${sms.id}:`, result.error);
          }
          
          results.processed++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`❌ Error processing queued SMS #${sms.id}:`, error);
          
          // Update attempt count
          await pool.query(
            `UPDATE sms_queue 
             SET attempts = attempts + 1,
                 last_attempt_at = NOW(),
                 error_message = $1
             WHERE id = $2`,
            [error.message, sms.id]
          );
          
          results.failed++;
          results.processed++;
        }
      }
      
      console.log('✅ SMS queue processing completed:', results);
      return results;
      
    } catch (error) {
      console.error('❌ Error processing SMS queue:', error);
      throw error;
    }
  }

  // Send payment confirmation to tenant
  async sendPaymentConfirmation(tenantPhone, tenantName, amount, unitCode, balance, month, waterAmount) {
    try {
      let message;

      if(waterAmount && waterAmount > 0) {
        if (balance > 0) {
          message = `Hello ${tenantName}, your rent payment of KSh ${this.formatAmount(amount)} for ${unitCode} (${month}) has been received. Water bill of KSh ${this.formatAmount(waterAmount)} is also due. Balance: KSh ${this.formatAmount(balance)}. Thank you!`;
        } else {
          message = `Hello ${tenantName}, your rent payment of KSh ${this.formatAmount(amount)} for ${unitCode} (${month}) has been received. Water bill of KSh ${this.formatAmount(waterAmount)} is also due. Payment complete! Thank you!`;
        }
      } else {
      if (balance > 0) {
        message = `Hello ${tenantName}, your rent payment of KSh ${this.formatAmount(amount)} for ${unitCode} (${month}) has been received. Balance: KSh ${this.formatAmount(balance)}. Thank you!`;
      } else {
        message = `Hello ${tenantName}, your rent payment of KSh ${this.formatAmount(amount)} for ${unitCode} (${month}) has been received. Payment complete! Thank you!`;
      }
    }
      console.log('💰 Sending payment confirmation SMS:', {
        tenantName,
        tenantPhone,
        amount,
        unitCode,
        balance,
        month,
        messageLength: message.length
      });
      
      const result = await this.sendSMS(tenantPhone, message);
      
      // Log the SMS notification
      await this.logSMSNotification(tenantPhone, 'payment_confirmation', message, result.success);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending payment confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  // Send payment alert to admin
  async sendAdminAlert(adminPhone, tenantName, amount, unitCode, balance, month) {
    try {
      let message;
      
      if (balance > 0) {
        message = `PAYMENT ALERT: ${tenantName} paid KSh ${this.formatAmount(amount)} for ${unitCode} (${month}). Balance: KSh ${this.formatAmount(balance)}`;
      } else {
        message = `PAYMENT ALERT: ${tenantName} paid KSh ${this.formatAmount(amount)} for ${unitCode} (${month}). Fully paid!`;
      }
      
      console.log('👨‍💼 Sending admin alert SMS:', {
        adminPhone,
        tenantName,
        amount,
        unitCode,
        balance,
        month
      });
      
      const result = await this.sendSMS(adminPhone, message);
      
      // Log the SMS notification
      await this.logSMSNotification(adminPhone, 'admin_alert', message, result.success);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending admin alert:', error);
      return { success: false, error: error.message };
    }
  }

  // Send balance reminder to tenant
  async sendBalanceReminder(tenantPhone, tenantName, unitCode, balance, month, dueDate) {
    try {
      const message = `Hello ${tenantName}, your rent balance for ${unitCode} (${month}) is KSh ${this.formatAmount(balance)}. Please pay by ${dueDate} to avoid late fees.`;
      
      console.log('⏰ Sending balance reminder SMS:', {
        tenantName,
        tenantPhone,
        unitCode,
        balance,
        month,
        dueDate
      });
      
      const result = await this.sendSMS(tenantPhone, message);
      
      // Log the SMS notification
      await this.logSMSNotification(tenantPhone, 'balance_reminder', message, result.success);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending balance reminder:', error);
      return { success: false, error: error.message };
    }
  }

  // Send advance payment notification
  async sendAdvancePaymentNotification(tenantPhone, tenantName, amount, unitCode, monthsPaid) {
    try {
      const message = `Hello ${tenantName}, your payment of KSh ${this.formatAmount(amount)} for ${unitCode} has been applied as advance payment for ${monthsPaid} future month(s). Thank you!`;
      
      console.log('🔮 Sending advance payment notification:', {
        tenantName,
        tenantPhone,
        amount,
        unitCode,
        monthsPaid
      });
      
      const result = await this.sendSMS(tenantPhone, message);
      
      // Log the SMS notification
      await this.logSMSNotification(tenantPhone, 'advance_payment', message, result.success);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending advance payment notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Send welcome message to new tenant
  async sendWelcomeMessage(tenantPhone, tenantName, unitCode, monthlyRent, dueDate) {
    try {
      const message = `Welcome ${tenantName}! You have been allocated to ${unitCode}. Monthly rent: KSh ${this.formatAmount(monthlyRent)}, due on ${dueDate} each month. For payments, use paybill [BUSINESS_NO] with account ${unitCode}.`;
      
      console.log('👋 Sending welcome message:', {
        tenantName,
        tenantPhone,
        unitCode,
        monthlyRent,
        dueDate
      });
      
      const result = await this.sendSMS(tenantPhone, message);
      
      // Log the SMS notification
      await this.logSMSNotification(tenantPhone, 'welcome_message', message, result.success);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending welcome message:', error);
      return { success: false, error: error.message };
    }
  }

  // Send maintenance update to tenant
  async sendMaintenanceUpdate(tenantPhone, tenantName, unitCode, update) {
    try {
      const message = `Hello ${tenantName}, maintenance update for ${unitCode}: ${update}`;
      
      console.log('🔧 Sending maintenance update:', {
        tenantName,
        tenantPhone,
        unitCode,
        update
      });
      
      const result = await this.sendSMS(tenantPhone, message);
      
      // Log the SMS notification
      await this.logSMSNotification(tenantPhone, 'maintenance_update', message, result.success);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending maintenance update:', error);
      return { success: false, error: error.message };
    }
  }

  // Format amount with commas for thousands
  formatAmount(amount) {
    return parseFloat(amount).toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Log SMS notification to database
  async logSMSNotification(phone, type, message, success) {
    try {
      await pool.query(
        `INSERT INTO sms_notifications (phone_number, message_type, message_content, status, sent_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [phone, type, message, success ? 'sent' : 'failed']
      );
    } catch (error) {
      console.error('❌ Failed to log SMS notification:', error);
    }
  }

  // Get SMS statistics
  async getSMSStatistics() {
    try {
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_sms,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_sms,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_sms,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_sms,
          MIN(sent_at) as first_sent,
          MAX(sent_at) as last_sent
        FROM sms_notifications
      `);
      
      const queueStats = await pool.query(`
        SELECT 
          COUNT(*) as total_queued,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_queued,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_queued,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_queued
        FROM sms_queue
      `);
      
      return {
        success: true,
        data: {
          notifications: stats.rows[0],
          queue: queueStats.rows[0]
        }
      };
      
    } catch (error) {
      console.error('❌ Error getting SMS statistics:', error);
      return { success: false, error: error.message };
    }
  }

  // Check SMS service status
  async checkServiceStatus() {
    const status = {
      configured: !!(this.apiKey && this.senderId),
      apiKey: !!this.apiKey,
      senderId: !!this.senderId,
      username: this.username,
      baseURL: this.baseURL
    };
    
    // Test credentials by making a simple balance check if configured
    if (status.configured) {
      try {
        // Try to get account balance (Africa's Talking specific)
        const response = await axios.get(
          `https://api.sandbox.africastalking.com/version1/user?username=${this.username}`,
          {
            headers: {
              'apiKey': this.apiKey,
              'Accept': 'application/json'
            },
            timeout: 10000
          }
        );
        
        status.credentialsValid = true;
        status.balance = response.data.UserData.balance;
        console.log('✅ SMS service credentials are valid, balance:', status.balance);
      } catch (error) {
        status.credentialsValid = false;
        status.error = error.message;
        console.error('❌ SMS service credentials test failed:', error.message);
      }
    }
    
    return status;
  }
}

// Create and export singleton instance
const smsService = new SMSService();
module.exports = smsService;