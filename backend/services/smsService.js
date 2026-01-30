// ============================================================
// SMS SERVICE - CELCOM AFRICA INTEGRATION
// ============================================================
// Documentation: https://isms.celcomafrica.com/api/services/sendsms/
// Updated: Ready for production use with Celcom
// ============================================================

const axios = require('axios');
const pool = require('../config/database');

class SMSService {
  constructor() {
    // Celcom credentials from environment variables
    this.partnerId = process.env.SMS_PARTNER_ID;
    this.apiKey = process.env.SMS_API_KEY;
    this.senderId = process.env.SMS_SENDER_ID || 'ZakariaAgcy';
    this.baseURL = process.env.SMS_BASE_URL || 'https://isms.celcomafrica.com/api/services/sendsms/';
    this.balanceURL = 'https://isms.celcomafrica.com/api/services/getbalance/';
    this.dlrURL = 'https://isms.celcomafrica.com/api/services/getdlr/';
    
    console.log('📱 SMS Service Initialized (Celcom Africa):', {
      hasPartnerId: !!this.partnerId,
      hasApiKey: !!this.apiKey,
      senderId: this.senderId,
      baseURL: this.baseURL
    });
  }

  // Format phone number to international format (254...)
  formatPhoneNumber(phone) {
    if (!phone) {
      throw new Error('Phone number is required');
    }
    
    // Remove any non-digit characters
    let cleaned = phone.toString().replace(/\D/g, '');
    
    console.log('📞 Formatting phone number:', { original: phone, cleaned });
    
    // Handle different formats: 07..., 254..., +254...
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      // Format: 07XXXXXXXX -> 2547XXXXXXXX
      return '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('254') && cleaned.length === 12) {
      // Format: 2547XXXXXXXX - already correct
      return cleaned;
    } else if (cleaned.startsWith('+254')) {
      // Format: +2547XXXXXXXX -> 2547XXXXXXXX
      return cleaned.substring(1);
    } else if (cleaned.startsWith('7') && cleaned.length === 9) {
      // Format: 7XXXXXXXX -> 2547XXXXXXXX
      return '254' + cleaned;
    } else if (cleaned.startsWith('1') && cleaned.length === 9) {
      // Format: 1XXXXXXXX -> 2541XXXXXXXX (Safaricom new numbers)
      return '254' + cleaned;
    } else {
      console.warn('⚠️ Unusual phone number format:', cleaned);
      return cleaned;
    }
  }

  // Validate phone number format
  validatePhoneNumber(phone) {
    try {
      const formatted = this.formatPhoneNumber(phone);
      // Kenyan phone number regex: 254 followed by 7, 1, or 0 and 8 digits
      const phoneRegex = /^254(7\d{8}|1\d{8}|0\d{8})$/;
      return phoneRegex.test(formatted);
    } catch (error) {
      return false;
    }
  }

  // ============================================================
  // MAIN SMS SENDING METHOD - CELCOM API
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
          error: 'INVALID_PHONE_FORMAT',
          code: 1003
        };
      }

      // Check if SMS service is configured
      if (!this.partnerId || !this.apiKey) {
        console.warn('⚠️ SMS service not configured. Simulating success for development.');
        console.log('💡 To enable SMS, set SMS_PARTNER_ID, SMS_API_KEY, and SMS_SENDER_ID in your .env file');
        
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

      // Celcom API payload (POST method - JSON)
      const payload = {
        partnerID: this.partnerId,
        apikey: this.apiKey,
        mobile: formattedPhone,
        message: message,
        shortcode: this.senderId,
        pass_type: 'plain'
      };

      console.log('🚀 Sending SMS via Celcom API...', {
        to: formattedPhone,
        from: this.senderId,
        messageLength: message.length
      });

      const response = await axios.post(this.baseURL, payload, { 
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      console.log('✅ Celcom API Response:', response.data);

      // Parse Celcom response
      // Success format: {"responses":[{"response-code":200,"response-description":"Success","mobile":254703727272,"messageid":8290842,"networkid":"1"}]}
      if (response.data && response.data.responses && response.data.responses.length > 0) {
        const smsResponse = response.data.responses[0];
        const responseCode = smsResponse['response-code'] || smsResponse['respose-code']; // Handle typo in their API
        
        if (responseCode === 200) {
          console.log('✅ SMS sent successfully to:', formattedPhone, {
            messageId: smsResponse.messageid,
            networkId: smsResponse.networkid
          });
          
          return { 
            success: true, 
            messageId: smsResponse.messageid,
            networkId: smsResponse.networkid,
            mobile: smsResponse.mobile,
            status: 'sent',
            responseCode: 200
          };
        } else {
          const errorDescription = this.getErrorDescription(responseCode);
          console.error('❌ SMS sending failed:', responseCode, errorDescription);
          
          return { 
            success: false, 
            error: errorDescription,
            code: responseCode,
            message: `SMS failed: ${errorDescription}`
          };
        }
      } else {
        console.error('❌ Unexpected API response format:', response.data);
        return { 
          success: false, 
          error: 'UNEXPECTED_RESPONSE',
          message: 'Unexpected response format from Celcom API',
          rawResponse: response.data
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

  // Get human-readable error description from Celcom error codes
  getErrorDescription(code) {
    const errorCodes = {
      200: 'Success',
      1001: 'Invalid sender ID - Check your shortcode is registered with Celcom',
      1002: 'Network not allowed',
      1003: 'Invalid mobile number - Check phone number format',
      1004: 'Low bulk credits - Please top up your Celcom account',
      1005: 'System error - Try again later',
      1006: 'Invalid credentials - Check your Partner ID and API Key',
      1007: 'System error - Try again later',
      1008: 'No Delivery Report available',
      1009: 'Unsupported data type',
      1010: 'Unsupported request type',
      4090: 'Internal Error - Try again after 5 minutes',
      4091: 'No Partner ID is set',
      4092: 'No API Key provided',
      4093: 'Details not found'
    };
    
    return errorCodes[code] || `Unknown error (code: ${code})`;
  }

  // Check account balance
  async checkBalance() {
    try {
      if (!this.partnerId || !this.apiKey) {
        return { 
          success: false, 
          error: 'SMS service not configured' 
        };
      }

      const payload = {
        partnerID: this.partnerId,
        apikey: this.apiKey
      };

      const response = await axios.post(this.balanceURL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      console.log('💰 Celcom Balance Response:', response.data);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Error checking balance:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check delivery report for a message
  async checkDeliveryReport(messageId) {
    try {
      if (!this.partnerId || !this.apiKey || !messageId) {
        return { 
          success: false, 
          error: 'Missing required parameters' 
        };
      }

      const payload = {
        partnerID: this.partnerId,
        apikey: this.apiKey,
        messageID: messageId
      };

      const response = await axios.post(this.dlrURL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      console.log('📬 Delivery Report Response:', response.data);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Error checking delivery report:', error.message);
      return {
        success: false,
        error: error.message
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
          
          // Rate limiting - 200ms delay between messages (5 SMS per second)
          await new Promise(resolve => setTimeout(resolve, 200));
          
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

  // Get paybill number from admin settings
  async getPaybillNumber() {
    try {
      const result = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = 'paybill_number'`
      );
      return result.rows[0]?.setting_value || process.env.MPESA_SHORT_CODE || 'YOUR_PAYBILL';
    } catch (error) {
      console.warn('⚠️ Could not fetch paybill number:', error.message);
      return process.env.MPESA_SHORT_CODE || 'YOUR_PAYBILL';
    }
  }

  // Send payment confirmation to tenant
  async sendPaymentConfirmation(tenantPhone, tenantName, amount, unitCode, balance, month, waterAmount = 0) {
    try {
      let message;

      if (waterAmount && waterAmount > 0) {
        if (balance > 0) {
          message = `Hello ${tenantName}, your payment of KSh ${this.formatAmount(amount)} for ${unitCode} (${month}) received. Water: KSh ${this.formatAmount(waterAmount)} due. Balance: KSh ${this.formatAmount(balance)}. Thank you!`;
        } else {
          message = `Hello ${tenantName}, your payment of KSh ${this.formatAmount(amount)} for ${unitCode} (${month}) received. Water: KSh ${this.formatAmount(waterAmount)} due. Rent complete! Thank you!`;
        }
      } else {
        if (balance > 0) {
          message = `Hello ${tenantName}, your payment of KSh ${this.formatAmount(amount)} for ${unitCode} (${month}) received. Balance: KSh ${this.formatAmount(balance)}. Thank you!`;
        } else {
          message = `Hello ${tenantName}, your payment of KSh ${this.formatAmount(amount)} for ${unitCode} (${month}) received. Payment complete! Thank you!`;
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

  // Send bill notification to tenant
  async sendBillNotification(tenantPhone, tenantName, unitCode, month, rentDue, waterDue, arrearsDue, totalDue, paybillNumber) {
    try {
      // Keep message concise for SMS (160 char limit for single SMS)
      let message = `Hello ${tenantName}, ${month} bill for ${unitCode}: `;
      
      const parts = [];
      if (rentDue > 0) parts.push(`Rent KSh ${this.formatAmount(rentDue)}`);
      if (waterDue > 0) parts.push(`Water KSh ${this.formatAmount(waterDue)}`);
      if (arrearsDue > 0) parts.push(`Arrears KSh ${this.formatAmount(arrearsDue)}`);
      
      message += parts.join(', ');
      message += `. Total: KSh ${this.formatAmount(totalDue)}. `;
      message += `Pay via ${paybillNumber}, Acc: ${unitCode}`;
      
      console.log('📋 Sending bill notification:', {
        tenantName,
        tenantPhone,
        unitCode,
        month,
        totalDue,
        messageLength: message.length
      });
      
      const result = await this.sendSMS(tenantPhone, message);
      
      await this.logSMSNotification(tenantPhone, 'bill_notification', message, result.success);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending bill notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Send enhanced payment confirmation with breakdown
  async sendEnhancedPaymentConfirmation(tenantPhone, tenantName, amount, unitCode, breakdown, balance, month) {
    try {
      const { rentPaid, waterPaid, arrearsPaid } = breakdown;
      
      let message = `Hi ${tenantName}, KSh ${this.formatAmount(amount)} received for ${unitCode} (${month}). `;
      
      const parts = [];
      if (rentPaid > 0) parts.push(`Rent: ${this.formatAmount(rentPaid)}`);
      if (waterPaid > 0) parts.push(`Water: ${this.formatAmount(waterPaid)}`);
      if (arrearsPaid > 0) parts.push(`Arrears: ${this.formatAmount(arrearsPaid)}`);
      
      if (parts.length > 0) {
        message += parts.join(', ') + '. ';
      }
      
      if (balance > 0) {
        message += `Bal: KSh ${this.formatAmount(balance)}`;
      } else {
        message += `Fully paid!`;
      }
      
      console.log('💰 Sending enhanced payment confirmation:', {
        tenantName,
        tenantPhone,
        amount,
        breakdown,
        messageLength: message.length
      });
      
      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(tenantPhone, 'payment_confirmation', message, result.success);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending enhanced payment confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  // Send admin payment alert
  async sendAdminAlert(adminPhone, tenantName, amount, unitCode, balance, month) {
    try {
      let message;
      
      if (balance > 0) {
        message = `PAYMENT: ${tenantName} paid KSh ${this.formatAmount(amount)} for ${unitCode} (${month}). Bal: KSh ${this.formatAmount(balance)}`;
      } else {
        message = `PAYMENT: ${tenantName} paid KSh ${this.formatAmount(amount)} for ${unitCode} (${month}). Fully paid!`;
      }
      
      console.log('👨‍💼 Sending admin alert SMS:', {
        adminPhone,
        tenantName,
        amount,
        unitCode,
        balance,
        month,
        messageLength: message.length
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

  // Send admin payment alert with breakdown
  async sendAdminPaymentAlert(adminPhone, tenantName, amount, unitCode, breakdown, balance, month) {
    try {
      const { rentPaid, waterPaid, arrearsPaid } = breakdown;
      
      let message = `PAYMENT: ${tenantName} - KSh ${this.formatAmount(amount)} for ${unitCode} (${month}). `;
      
      const parts = [];
      if (rentPaid > 0) parts.push(`R:${this.formatAmount(rentPaid)}`);
      if (waterPaid > 0) parts.push(`W:${this.formatAmount(waterPaid)}`);
      if (arrearsPaid > 0) parts.push(`A:${this.formatAmount(arrearsPaid)}`);
      
      if (parts.length > 0) {
        message += parts.join(' ') + '. ';
      }
      
      if (balance > 0) {
        message += `Bal: KSh ${this.formatAmount(balance)}`;
      } else {
        message += `Complete!`;
      }
      
      const result = await this.sendSMS(adminPhone, message);
      await this.logSMSNotification(adminPhone, 'admin_payment_alert', message, result.success);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending admin payment alert:', error);
      return { success: false, error: error.message };
    }
  }

  // Send balance reminder to tenant
  async sendBalanceReminder(tenantPhone, tenantName, unitCode, balance, month, dueDate) {
    try {
      const message = `Hello ${tenantName}, your rent balance for ${unitCode} (${month}) is KSh ${this.formatAmount(balance)}. Please pay by ${dueDate}. Thank you!`;
      
      console.log('⏰ Sending balance reminder SMS:', {
        tenantName,
        tenantPhone,
        unitCode,
        balance,
        month,
        dueDate,
        messageLength: message.length
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
      const message = `Hello ${tenantName}, your payment of KSh ${this.formatAmount(amount)} for ${unitCode} has been applied as advance for ${monthsPaid} month(s). Thank you!`;
      
      console.log('🔮 Sending advance payment notification:', {
        tenantName,
        tenantPhone,
        amount,
        unitCode,
        monthsPaid,
        messageLength: message.length
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
      const paybill = await this.getPaybillNumber();
      const message = `Welcome ${tenantName}! You're now at ${unitCode}. Rent: KSh ${this.formatAmount(monthlyRent)}, due ${dueDate} monthly. Pay via Paybill ${paybill}, Acc: ${unitCode}. Welcome!`;
      
      console.log('👋 Sending welcome message:', {
        tenantName,
        tenantPhone,
        unitCode,
        monthlyRent,
        dueDate,
        paybill,
        messageLength: message.length
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
      const message = `Hello ${tenantName}, update for ${unitCode}: ${update}`;
      
      console.log('🔧 Sending maintenance update:', {
        tenantName,
        tenantPhone,
        unitCode,
        update,
        messageLength: message.length
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
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

      // Also get balance if configured
      let balanceInfo = null;
      if (this.partnerId && this.apiKey) {
        const balanceResult = await this.checkBalance();
        if (balanceResult.success) {
          balanceInfo = balanceResult.data;
        }
      }
      
      return {
        success: true,
        data: {
          notifications: stats.rows[0],
          queue: queueStats.rows[0],
          balance: balanceInfo
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
      provider: 'Celcom Africa',
      configured: !!(this.partnerId && this.apiKey),
      partnerId: this.partnerId ? '✅ Set' : '❌ Missing',
      apiKey: this.apiKey ? '✅ Set' : '❌ Missing',
      senderId: this.senderId,
      baseURL: this.baseURL
    };
    
    // Test credentials by checking balance if configured
    if (status.configured) {
      try {
        const balanceResult = await this.checkBalance();
        status.credentialsValid = balanceResult.success;
        if (balanceResult.success) {
          status.balance = balanceResult.data;
          console.log('✅ SMS service credentials are valid');
        } else {
          status.error = balanceResult.error;
          console.error('❌ SMS service credentials test failed:', balanceResult.error);
        }
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