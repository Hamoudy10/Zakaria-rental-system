// ============================================================
// SMS SERVICE - CELCOM INTEGRATION TEMPLATE
// ============================================================
// 
// This is a template for Celcom integration.
// You'll need to update the sendSMS method based on Celcom's actual API format.
// 
// INSTRUCTIONS:
// 1. Get Celcom credentials and API documentation
// 2. Update the constructor with correct environment variables
// 3. Update sendSMS method to match Celcom's API format
// 4. Test with a single SMS before deploying
// ============================================================

const axios = require('axios');
const pool = require('../config/database');

class SMSService {
  constructor() {
    // ============================================================
    // UPDATE THESE based on what Celcom provides
    // ============================================================
    this.apiKey = process.env.SMS_API_KEY;
    this.senderId = process.env.SMS_SENDER_ID || 'ZakariaAgcy';
    this.username = process.env.SMS_USERNAME;
    this.password = process.env.SMS_PASSWORD;
    this.baseURL = process.env.SMS_BASE_URL || 'https://api.celcom.co.ke/sms/send'; // Update with actual URL
    
    console.log('📱 SMS Service Initialized (Celcom):', {
      hasApiKey: !!this.apiKey,
      hasSenderId: !!this.senderId,
      hasUsername: !!this.username,
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
    
    // Handle different formats
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      return '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('254') && cleaned.length === 12) {
      return cleaned;
    } else if (cleaned.startsWith('+254')) {
      return cleaned.substring(1);
    } else if (cleaned.startsWith('7') && cleaned.length === 9) {
      return '254' + cleaned;
    }
    
    console.warn('⚠️ Unusual phone number format:', cleaned);
    return cleaned;
  }

  // Validate phone number format
  validatePhoneNumber(phone) {
    const formatted = this.formatPhoneNumber(phone);
    const phoneRegex = /^254(7\d{8}|1\d{8}|0\d{8})$/;
    return phoneRegex.test(formatted);
  }

  // ============================================================
  // MAIN SMS SENDING METHOD - UPDATE THIS FOR CELCOM
  // ============================================================
  async sendSMS(phoneNumber, message) {
    try {
      console.log('📱 Attempting to send SMS via Celcom:', { 
        phoneNumber, 
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
      if (!this.apiKey) {
        console.warn('⚠️ SMS service not configured. Simulating success.');
        return { 
          success: true, 
          message: 'SMS service not configured - simulated success',
          simulated: true,
          messageId: 'simulated-' + Date.now()
        };
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      console.log('📞 Formatted phone number:', formattedPhone);

      // ============================================================
      // CELCOM API REQUEST - UPDATE BASED ON THEIR DOCUMENTATION
      // ============================================================
      
      // OPTION A: API Key in Authorization Header
      const payload = {
        to: formattedPhone,           // May need to change: 'phone', 'recipient', 'msisdn'
        message: message,             // May need to change: 'text', 'content', 'body'
        from: this.senderId,          // May need to change: 'sender', 'senderId', 'source'
        // Add any additional fields Celcom requires:
        // type: 'text',
        // dlr: true,  // delivery reports
      };

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // OPTION A: Bearer token
        'Authorization': `Bearer ${this.apiKey}`,
        // OPTION B: API Key header
        // 'X-API-Key': this.apiKey,
        // OPTION C: Custom header
        // 'Api-Key': this.apiKey,
      };

      console.log('🚀 Sending SMS via Celcom API...');

      const response = await axios.post(this.baseURL, payload, { 
        headers,
        timeout: 30000,
        // OPTION: If Celcom uses Basic Auth instead
        // auth: {
        //   username: this.username,
        //   password: this.password
        // }
      });

      console.log('✅ Celcom API Response:', response.data);

      // ============================================================
      // PARSE RESPONSE - UPDATE BASED ON CELCOM'S RESPONSE FORMAT
      // ============================================================
      
      // Example: { "status": "success", "messageId": "12345", "cost": 1.5 }
      // Or: { "code": 200, "data": { "id": "12345" } }
      // Or: { "result": "OK", "smsId": "12345" }
      
      const isSuccess = 
        response.data.status === 'success' ||
        response.data.code === 200 ||
        response.data.code === '200' ||
        response.data.result === 'OK' ||
        response.status === 200;

      if (isSuccess) {
        const messageId = 
          response.data.messageId || 
          response.data.id || 
          response.data.smsId ||
          response.data.data?.id ||
          'unknown';

        console.log('✅ SMS sent successfully:', {
          messageId,
          phone: formattedPhone
        });
        
        return { 
          success: true, 
          messageId: messageId,
          status: 'sent'
        };
      } else {
        const errorMessage = 
          response.data.message || 
          response.data.error ||
          response.data.description ||
          'SMS sending failed';

        console.error('❌ SMS sending failed:', errorMessage);
        return { 
          success: false, 
          error: errorMessage,
          statusCode: response.data.code || response.status
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
    } catch (queueError) {
      console.error('❌ Failed to queue SMS:', queueError);
    }
  }

  // Process queued SMS messages
  async processQueuedSMS() {
    try {
      console.log('🔄 Processing queued SMS messages...');
      
      const queuedSMS = await pool.query(
        `SELECT * FROM sms_queue 
         WHERE status = 'pending' AND attempts < 3
         ORDER BY created_at ASC 
         LIMIT 10`
      );
      
      console.log(`📨 Found ${queuedSMS.rows.length} queued SMS messages to process`);
      
      const results = { processed: 0, successful: 0, failed: 0 };
      
      for (const sms of queuedSMS.rows) {
        try {
          const result = await this.sendSMS(sms.recipient_phone, sms.message);
          
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
          } else {
            results.failed++;
          }
          results.processed++;
          
          // Rate limiting - adjust based on Celcom's limits
          await new Promise(resolve => setTimeout(resolve, 200)); // 5 SMS per second
          
        } catch (error) {
          console.error(`❌ Error processing queued SMS #${sms.id}:`, error);
          await pool.query(
            `UPDATE sms_queue 
             SET attempts = attempts + 1, last_attempt_at = NOW(), error_message = $1
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

  // Get paybill number from admin settings
  async getPaybillNumber() {
    try {
      const result = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = 'paybill_number'`
      );
      return result.rows[0]?.setting_value || 'YOUR_PAYBILL';
    } catch (error) {
      console.warn('⚠️ Could not fetch paybill number:', error.message);
      return 'YOUR_PAYBILL';
    }
  }

  // Send payment confirmation to tenant
  async sendPaymentConfirmation(tenantPhone, tenantName, amount, unitCode, balance, month, waterAmount) {
    try {
      let message;

      if (waterAmount && waterAmount > 0) {
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

      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(tenantPhone, 'payment_confirmation', message, result.success);
      return result;
      
    } catch (error) {
      console.error('❌ Error sending payment confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  // Send bill notification to tenant
  async sendBillNotification(tenantPhone, tenantName, unitCode, month, rentDue, waterDue, arrearsDue, totalDue, paybillNumber) {
    try {
      const message = `Hello ${tenantName}, your ${month} bill for ${unitCode}:\n` +
                     `🏠 Rent: KSh ${this.formatAmount(rentDue)}\n` +
                     `🚰 Water: KSh ${this.formatAmount(waterDue)}\n` +
                     `📝 Arrears: KSh ${this.formatAmount(arrearsDue)}\n` +
                     `💰 Total Due: KSh ${this.formatAmount(totalDue)}\n` +
                     `📱 Pay via paybill ${paybillNumber}, Account: ${unitCode}\n` +
                     `Due by end of month. Thank you!`;
      
      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(tenantPhone, 'bill_notification', message, result.success);
      return result;
      
    } catch (error) {
      console.error('❌ Error sending bill notification:', error);
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
      
      const result = await this.sendSMS(adminPhone, message);
      await this.logSMSNotification(adminPhone, 'admin_alert', message, result.success);
      return result;
      
    } catch (error) {
      console.error('❌ Error sending admin alert:', error);
      return { success: false, error: error.message };
    }
  }

  // Send welcome message to new tenant
  async sendWelcomeMessage(tenantPhone, tenantName, unitCode, monthlyRent, dueDate) {
    try {
      const paybill = await this.getPaybillNumber();
      const message = `Welcome ${tenantName}! You have been allocated to ${unitCode}. Monthly rent: KSh ${this.formatAmount(monthlyRent)}, due on ${dueDate} each month. For payments, use paybill ${paybill} with account ${unitCode}.`;
      
      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(tenantPhone, 'welcome_message', message, result.success);
      return result;
      
    } catch (error) {
      console.error('❌ Error sending welcome message:', error);
      return { success: false, error: error.message };
    }
  }

  // Send balance reminder to tenant
  async sendBalanceReminder(tenantPhone, tenantName, unitCode, balance, month, dueDate) {
    try {
      const message = `Hello ${tenantName}, your rent balance for ${unitCode} (${month}) is KSh ${this.formatAmount(balance)}. Please pay by ${dueDate} to avoid late fees.`;
      
      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(tenantPhone, 'balance_reminder', message, result.success);
      return result;
      
    } catch (error) {
      console.error('❌ Error sending balance reminder:', error);
      return { success: false, error: error.message };
    }
  }

  // Format amount with commas
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

  // Check SMS service status
  async checkServiceStatus() {
    return {
      configured: !!this.apiKey,
      apiKey: !!this.apiKey,
      senderId: !!this.senderId,
      username: this.username || 'not set',
      baseURL: this.baseURL,
      provider: 'Celcom'
    };
  }
}

// Create and export singleton instance
const smsService = new SMSService();
module.exports = smsService;