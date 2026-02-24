// ============================================================
// SMS SERVICE - CELCOM AFRICA INTEGRATION
// ============================================================
// Provider: Celcom Africa (https://isms.celcomafrica.com)
// Supports: Safaricom (07xx, 01xx), Airtel (07xx)
// ============================================================

const axios = require("axios");
const pool = require("../config/database");

class SMSService {
  constructor() {
    this.partnerId = process.env.SMS_PARTNER_ID;
    this.apiKey = process.env.SMS_API_KEY;
    this.senderId = process.env.SMS_SENDER_ID || "ZakariaAgcy";
    this.baseURL =
      process.env.SMS_BASE_URL ||
      "https://isms.celcomafrica.com/api/services/sendsms/";
    this.balanceURL = "https://isms.celcomafrica.com/api/services/getbalance/";
    this.dlrURL = "https://isms.celcomafrica.com/api/services/getdlr/";

    console.log("📱 SMS Service Initialized:", {
      provider: "Celcom Africa",
      configured: !!(this.partnerId && this.apiKey),
      senderId: this.senderId,
    });
  }

  // ============================================================
  // PHONE NUMBER FORMATTING & VALIDATION
  // ============================================================

  /**
   * Format phone number to international format (254...)
   * Supports: 07xxxxxxxx, 01xxxxxxxx, +254..., 254...
   */
  formatPhoneNumber(phone) {
    if (!phone) {
      throw new Error("Phone number is required");
    }

    // Remove all non-digit characters
    let cleaned = phone.toString().replace(/\D/g, "");

    console.log("📞 Formatting phone:", { original: phone, cleaned });

    // Handle different Kenyan phone formats
    if (cleaned.startsWith("0") && cleaned.length === 10) {
      // 07xxxxxxxx or 01xxxxxxxx -> 2547xxxxxxxx or 2541xxxxxxxx
      const formatted = "254" + cleaned.substring(1);
      console.log("📞 Converted 0xx format:", formatted);
      return formatted;
    }

    if (cleaned.startsWith("254") && cleaned.length === 12) {
      // Already in correct format
      return cleaned;
    }

    if (cleaned.startsWith("7") && cleaned.length === 9) {
      // 7xxxxxxxx -> 2547xxxxxxxx
      return "254" + cleaned;
    }

    if (cleaned.startsWith("1") && cleaned.length === 9) {
      // 1xxxxxxxx -> 2541xxxxxxxx (new Safaricom)
      return "254" + cleaned;
    }

    console.warn("⚠️ Non-standard phone format:", cleaned);
    return cleaned;
  }

  /**
   * Validate Kenyan phone number format
   * Accepts: 07xxxxxxxx, 01xxxxxxxx, 2547xxxxxxxx, 2541xxxxxxxx
   */
  validatePhoneNumber(phone) {
    try {
      const formatted = this.formatPhoneNumber(phone);
      // Kenyan numbers: 254 + (7 or 1) + 8 digits
      const isValid = /^254[17]\d{8}$/.test(formatted);
      console.log("📞 Phone validation:", { phone, formatted, isValid });
      return isValid;
    } catch (error) {
      console.error("📞 Phone validation error:", error.message);
      return false;
    }
  }

  // ============================================================
  // FORMATTING HELPERS
  // ============================================================

  /**
   * Format amount with thousands separator
   */
  formatAmount(amount) {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString("en-KE");
  }

  /**
   * Format date for display
   */
  formatDate(date) {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-KE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  /**
   * Get ordinal suffix for day (1st, 2nd, 3rd, etc.)
   */
  getOrdinalSuffix(day) {
    const num = parseInt(day);
    if (num >= 11 && num <= 13) return "th";
    switch (num % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  }

  /**
   * Format due day with ordinal
   */
  formatDueDay(day) {
    const num = parseInt(day) || 1;
    return `${num}${this.getOrdinalSuffix(num)}`;
  }

  /**
   * Get paybill number from settings
   */
  async getPaybillNumber() {
    try {
      const result = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = 'paybill_number'`,
      );
      return (
        result.rows[0]?.setting_value || process.env.MPESA_SHORT_CODE || "N/A"
      );
    } catch (error) {
      console.warn("⚠️ Could not fetch paybill:", error.message);
      return process.env.MPESA_SHORT_CODE || "N/A";
    }
  }

  // ============================================================
  // CORE SMS SENDING
  // ============================================================

  /**
   * Send SMS via Celcom API
   */
  async sendSMS(phoneNumber, message) {
    try {
      console.log("📱 Sending SMS:", {
        to: phoneNumber,
        length: message.length,
        preview: message.substring(0, 50) + "...",
      });

      // Validate phone
      if (!this.validatePhoneNumber(phoneNumber)) {
        console.error("❌ Invalid phone number:", phoneNumber);
        return {
          success: false,
          error: "Invalid phone number format",
          code: 1003,
        };
      }

      // Check configuration
      if (!this.partnerId || !this.apiKey) {
        console.warn("⚠️ SMS not configured - simulating success");
        return {
          success: true,
          simulated: true,
          messageId: "sim-" + Date.now(),
          message: "SMS service not configured",
        };
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      // Celcom API payload
      const payload = {
        partnerID: this.partnerId,
        apikey: this.apiKey,
        mobile: formattedPhone,
        message: message,
        shortcode: this.senderId,
        pass_type: "plain",
      };

      console.log("🚀 Calling Celcom API...");

      const response = await axios.post(this.baseURL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });

      console.log("📨 Celcom Response:", JSON.stringify(response.data));

      // Parse response
      if (response.data?.responses?.[0]) {
        const smsResponse = response.data.responses[0];
        const responseCode =
          smsResponse["response-code"] || smsResponse["respose-code"];

        if (responseCode === 200) {
          console.log("✅ SMS sent successfully:", {
            messageId: smsResponse.messageid,
            mobile: smsResponse.mobile,
          });

          return {
            success: true,
            messageId: smsResponse.messageid,
            networkId: smsResponse.networkid,
            mobile: smsResponse.mobile,
          };
        } else {
          const errorDesc = this.getErrorDescription(responseCode);
          console.error("❌ SMS failed:", responseCode, errorDesc);
          return {
            success: false,
            error: errorDesc,
            code: responseCode,
          };
        }
      }

      console.error("❌ Unexpected response format");
      return {
        success: false,
        error: "Unexpected API response",
        rawResponse: response.data,
      };
    } catch (error) {
      console.error("❌ SMS Error:", error.message);

      // Queue for retry
      await this.queueSMSForRetry(phoneNumber, message, error.message);

      return {
        success: false,
        error: error.message,
        queued: true,
      };
    }
  }

  /**
   * Get human-readable error description
   */
  getErrorDescription(code) {
    const errors = {
      200: "Success",
      1001: "Invalid sender ID",
      1002: "Network not allowed",
      1003: "Invalid mobile number",
      1004: "Low credits - please top up",
      1005: "System error - try again",
      1006: "Invalid credentials",
      1007: "System error",
      1008: "No delivery report",
      1009: "Unsupported data type",
      1010: "Unsupported request type",
      4090: "Internal error - try in 5 mins",
      4091: "No Partner ID",
      4092: "No API Key",
      4093: "Details not found",
    };
    return errors[code] || `Error code: ${code}`;
  }

  // ============================================================
  // WELCOME MESSAGE
  // ============================================================

  /**
   * Send welcome message to new tenant
   */
  async sendWelcomeMessage(
    tenantPhone,
    tenantName,
    unitCode,
    monthlyRent,
    dueDay = "1st",
    propertyName = "",
  ) {
    try {
      const paybill = await this.getPaybillNumber();
      const formattedRent = this.formatAmount(monthlyRent);
      const dueDayFormatted =
        typeof dueDay === "number" ? this.formatDueDay(dueDay) : dueDay;

      // Build welcome message with clear formatting
      const message = [
        `Dear ${tenantName},`,
        ``,
        `Welcome to ${propertyName || "Zakaria Housing"}!`,
        ``,
        `Unit: ${unitCode}`,
        `Rent: KES ${formattedRent}/month`,
        `Due: ${dueDayFormatted} of every month`,
        ``,
        `Payment Details:`,
        `Paybill: ${paybill}`,
        `Account: ${unitCode}`,
        ``,
        `Thank you for choosing us!`,
      ].join("\n");

      console.log("👋 Sending welcome SMS:", {
        tenant: tenantName,
        phone: tenantPhone,
        unit: unitCode,
        rent: monthlyRent,
      });

      const result = await this.sendSMS(tenantPhone, message);

      // Log to database
      await this.logSMSNotification(
        tenantPhone,
        "welcome_message",
        message,
        result.success,
      );

      return result;
    } catch (error) {
      console.error("❌ Welcome SMS error:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // PAYMENT CONFIRMATION
  // ============================================================

  /**
   * Send payment confirmation to tenant
   */
  async sendPaymentConfirmation(
    tenantPhone,
    tenantName,
    amount,
    unitCode,
    balance,
    month,
  ) {
    try {
      const formattedAmount = this.formatAmount(amount);
      const formattedBalance = this.formatAmount(balance);
      const status =
        balance <= 0 ? "FULLY PAID" : `Balance: KES ${formattedBalance}`;

      const message = [
        `Dear ${tenantName},`,
        ``,
        `Payment Received!`,
        ``,
        `Amount: KES ${formattedAmount}`,
        `Unit: ${unitCode}`,
        `Month: ${month}`,
        ``,
        `Status: ${status}`,
        ``,
        `Thank you!`,
      ].join("\n");

      console.log("💰 Sending payment confirmation:", {
        tenant: tenantName,
        amount: amount,
        balance: balance,
      });

      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(
        tenantPhone,
        "payment_confirmation",
        message,
        result.success,
      );

      return result;
    } catch (error) {
      console.error("❌ Payment confirmation error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send enhanced payment confirmation with breakdown
   */
  async sendEnhancedPaymentConfirmation(
    tenantPhone,
    tenantName,
    amount,
    unitCode,
    breakdown,
    balance,
    month,
  ) {
    try {
      const { rentPaid = 0, waterPaid = 0, arrearsPaid = 0 } = breakdown || {};
      const status =
        balance <= 0
          ? "FULLY PAID"
          : `Balance: KES ${this.formatAmount(balance)}`;

      // Build allocation breakdown
      const allocations = [];
      if (rentPaid > 0)
        allocations.push(`Rent: KES ${this.formatAmount(rentPaid)}`);
      if (waterPaid > 0)
        allocations.push(`Water: KES ${this.formatAmount(waterPaid)}`);
      if (arrearsPaid > 0)
        allocations.push(`Arrears: KES ${this.formatAmount(arrearsPaid)}`);

      const message = [
        `Dear ${tenantName},`,
        ``,
        `Payment Received!`,
        ``,
        `Total: KES ${this.formatAmount(amount)}`,
        `Unit: ${unitCode}`,
        `Month: ${month}`,
        ``,
        `Breakdown:`,
        ...allocations.map((a) => `- ${a}`),
        ``,
        `Status: ${status}`,
        ``,
        `Thank you!`,
      ].join("\n");

      console.log("💰 Sending enhanced payment confirmation:", {
        tenant: tenantName,
        amount,
        breakdown,
        balance,
      });

      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(
        tenantPhone,
        "payment_confirmation",
        message,
        result.success,
      );

      return result;
    } catch (error) {
      console.error("❌ Enhanced payment confirmation error:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // BILL NOTIFICATION
  // ============================================================

  /**
   * Send monthly bill notification to tenant
   */
  async sendBillNotification(
    tenantPhone,
    tenantName,
    unitCode,
    month,
    rentDue,
    waterDue,
    arrearsDue,
    totalDue,
    paybillNumber,
  ) {
    try {
      // Build itemized bill
      const items = [];
      if (rentDue > 0) items.push(`Rent: KES ${this.formatAmount(rentDue)}`);
      if (waterDue > 0) items.push(`Water: KES ${this.formatAmount(waterDue)}`);
      if (arrearsDue > 0)
        items.push(`Arrears: KES ${this.formatAmount(arrearsDue)}`);

      const message = [
        `Dear ${tenantName},`,
        ``,
        `BILL FOR ${month.toUpperCase()}`,
        `Unit: ${unitCode}`,
        ``,
        ...items.map((item) => `- ${item}`),
        ``,
        `TOTAL: KES ${this.formatAmount(totalDue)}`,
        ``,
        `Pay via:`,
        `Paybill: ${paybillNumber}`,
        `Account: ${unitCode}`,
        ``,
        `Thank you.`,
      ].join("\n");

      console.log("📋 Sending bill notification:", {
        tenant: tenantName,
        unit: unitCode,
        total: totalDue,
      });

      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(
        tenantPhone,
        "bill_notification",
        message,
        result.success,
      );

      return result;
    } catch (error) {
      console.error("❌ Bill notification error:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // BALANCE REMINDER
  // ============================================================

  /**
   * Send balance reminder to tenant
   */
  async sendBalanceReminder(
    tenantPhone,
    tenantName,
    unitCode,
    balance,
    month,
    dueDate,
  ) {
    try {
      const paybill = await this.getPaybillNumber();

      const message = [
        `Dear ${tenantName},`,
        ``,
        `PAYMENT REMINDER`,
        ``,
        `Unit: ${unitCode}`,
        `Month: ${month}`,
        `Balance: KES ${this.formatAmount(balance)}`,
        `Due: ${dueDate}`,
        ``,
        `Pay via:`,
        `Paybill: ${paybill}`,
        `Account: ${unitCode}`,
        ``,
        `Thank you.`,
      ].join("\n");

      console.log("⏰ Sending balance reminder:", {
        tenant: tenantName,
        balance: balance,
        dueDate: dueDate,
      });

      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(
        tenantPhone,
        "balance_reminder",
        message,
        result.success,
      );

      return result;
    } catch (error) {
      console.error("❌ Balance reminder error:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // ADMIN ALERTS
  // ============================================================

  /**
   * Send payment alert to admin
   */
  async sendAdminAlert(
    adminPhone,
    tenantName,
    amount,
    unitCode,
    balance,
    month,
  ) {
    try {
      const status =
        balance <= 0 ? "COMPLETE" : `Bal: KES ${this.formatAmount(balance)}`;

      const message = [
        `PAYMENT ALERT`,
        ``,
        `Tenant: ${tenantName}`,
        `Unit: ${unitCode}`,
        `Amount: KES ${this.formatAmount(amount)}`,
        `Month: ${month}`,
        `Status: ${status}`,
      ].join("\n");

      console.log("👨‍💼 Sending admin alert:", {
        admin: adminPhone,
        tenant: tenantName,
        amount: amount,
      });

      const result = await this.sendSMS(adminPhone, message);
      await this.logSMSNotification(
        adminPhone,
        "admin_alert",
        message,
        result.success,
      );

      return result;
    } catch (error) {
      console.error("❌ Admin alert error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send detailed payment alert to admin with breakdown
   */
  async sendAdminPaymentAlert(
    adminPhone,
    tenantName,
    amount,
    unitCode,
    breakdown,
    balance,
    month,
  ) {
    try {
      const { rentPaid = 0, waterPaid = 0, arrearsPaid = 0 } = breakdown || {};
      const status =
        balance <= 0 ? "COMPLETE" : `Bal: KES ${this.formatAmount(balance)}`;

      // Build compact breakdown
      const parts = [];
      if (rentPaid > 0) parts.push(`R:${this.formatAmount(rentPaid)}`);
      if (waterPaid > 0) parts.push(`W:${this.formatAmount(waterPaid)}`);
      if (arrearsPaid > 0) parts.push(`A:${this.formatAmount(arrearsPaid)}`);

      const message = [
        `PAYMENT RECEIVED`,
        ``,
        `${tenantName}`,
        `${unitCode} - ${month}`,
        `KES ${this.formatAmount(amount)}`,
        parts.length > 0 ? `(${parts.join(", ")})` : "",
        ``,
        status,
      ]
        .filter((line) => line)
        .join("\n");

      const result = await this.sendSMS(adminPhone, message);
      await this.logSMSNotification(
        adminPhone,
        "admin_payment_alert",
        message,
        result.success,
      );

      return result;
    } catch (error) {
      console.error("❌ Admin payment alert error:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // ADVANCE PAYMENT NOTIFICATION
  // ============================================================

  /**
   * Send advance payment notification
   */
  async sendAdvancePaymentNotification(
    tenantPhone,
    tenantName,
    amount,
    unitCode,
    monthsPaid,
    coveredMonthsText = "",
  ) {
    try {
      const safeUnit = unitCode || "N/A";
      const safeMonths = Number.isFinite(Number(monthsPaid))
        ? Math.max(1, Number(monthsPaid))
        : 1;
      const coveredLine = coveredMonthsText
        ? `Covers: ${coveredMonthsText}`
        : `Covers: ${safeMonths} month(s) ahead`;

      const message = [
        `Dear ${tenantName},`,
        ``,
        `ADVANCE PAYMENT`,
        ``,
        `Amount: KES ${this.formatAmount(amount)}`,
        `Unit: ${safeUnit}`,
        coveredLine,
        ``,
        `Thank you for paying in advance!`,
      ].join("\n");

      console.log("🔮 Sending advance payment notification:", {
        tenant: tenantName,
        amount: amount,
        months: safeMonths,
        unit: safeUnit,
        coveredMonths: coveredMonthsText || null,
      });

      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(
        tenantPhone,
        "advance_payment",
        message,
        result.success,
      );

      return result;
    } catch (error) {
      console.error("❌ Advance payment notification error:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // MAINTENANCE UPDATE
  // ============================================================

  /**
   * Send maintenance update to tenant
   */
  async sendMaintenanceUpdate(tenantPhone, tenantName, unitCode, update) {
    try {
      const message = [
        `Dear ${tenantName},`,
        ``,
        `MAINTENANCE UPDATE`,
        `Unit: ${unitCode}`,
        ``,
        update,
        ``,
        `Contact us for any questions.`,
      ].join("\n");

      console.log("🔧 Sending maintenance update:", {
        tenant: tenantName,
        unit: unitCode,
      });

      const result = await this.sendSMS(tenantPhone, message);
      await this.logSMSNotification(
        tenantPhone,
        "maintenance_update",
        message,
        result.success,
      );

      return result;
    } catch (error) {
      console.error("❌ Maintenance update error:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // SMS QUEUE & RETRY
  // ============================================================

  /**
   * Queue SMS for retry
   */
  async queueSMSForRetry(phoneNumber, message, error = null) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      await pool.query(
        `INSERT INTO sms_queue (recipient_phone, message, message_type, status, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [formattedPhone, message, "retry", "pending", error],
      );

      console.log("📨 SMS queued for retry:", formattedPhone);
    } catch (queueError) {
      console.error("❌ Failed to queue SMS:", queueError);
    }
  }

  /**
   * Process queued SMS messages
   */
  async processQueuedSMS() {
    try {
      console.log("🔄 Processing SMS queue...");

      const queuedSMS = await pool.query(
        `SELECT * FROM sms_queue 
         WHERE status = 'pending' AND attempts < 3
         ORDER BY created_at ASC 
         LIMIT 10`,
      );

      console.log(`📨 Found ${queuedSMS.rows.length} queued messages`);

      const results = { processed: 0, successful: 0, failed: 0 };

      for (const sms of queuedSMS.rows) {
        try {
          const result = await this.sendSMS(sms.recipient_phone, sms.message);

          await pool.query(
            `UPDATE sms_queue 
             SET status = $1, sent_at = $2, attempts = attempts + 1,
                 last_attempt_at = NOW(), error_message = $3
             WHERE id = $4`,
            [
              result.success ? "sent" : "failed",
              result.success ? new Date() : null,
              result.error || null,
              sms.id,
            ],
          );

          if (result.success) {
            results.successful++;
          } else {
            results.failed++;
          }
          results.processed++;

          // Rate limit: 200ms between messages
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`❌ Error processing SMS #${sms.id}:`, error);

          await pool.query(
            `UPDATE sms_queue 
             SET attempts = attempts + 1, last_attempt_at = NOW(), error_message = $1
             WHERE id = $2`,
            [error.message, sms.id],
          );

          results.failed++;
          results.processed++;
        }
      }

      console.log("✅ Queue processing complete:", results);
      return results;
    } catch (error) {
      console.error("❌ Queue processing error:", error);
      throw error;
    }
  }

  // ============================================================
  // BALANCE & DELIVERY REPORTS
  // ============================================================

  /**
   * Check Celcom account balance
   */
  async checkBalance() {
    try {
      if (!this.partnerId || !this.apiKey) {
        return { success: false, error: "SMS not configured" };
      }

      const response = await axios.post(
        this.balanceURL,
        {
          partnerID: this.partnerId,
          apikey: this.apiKey,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        },
      );

      console.log("💰 Balance response:", response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error("❌ Balance check error:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check delivery report for a message
   */
  async checkDeliveryReport(messageId) {
    try {
      if (!this.partnerId || !this.apiKey || !messageId) {
        return { success: false, error: "Missing parameters" };
      }

      const response = await axios.post(
        this.dlrURL,
        {
          partnerID: this.partnerId,
          apikey: this.apiKey,
          messageID: messageId,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        },
      );

      console.log("📬 Delivery report:", response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error("❌ Delivery report error:", error.message);
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // LOGGING & STATISTICS
  // ============================================================

  /**
   * Log SMS notification to database
   */
  async logSMSNotification(phone, type, message, success) {
    try {
      await pool.query(
        `INSERT INTO sms_notifications (phone_number, message_type, message_content, status, sent_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [phone, type, message, success ? "sent" : "failed"],
      );
    } catch (error) {
      console.error("❌ Failed to log SMS:", error);
    }
  }

  /**
   * Get SMS statistics
   */
  async getSMSStatistics() {
    try {
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          MIN(sent_at) as first_sent,
          MAX(sent_at) as last_sent
        FROM sms_notifications
      `);

      const queueStats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM sms_queue
      `);

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
          balance: balanceInfo,
        },
      };
    } catch (error) {
      console.error("❌ Statistics error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check service status
   */
  async checkServiceStatus() {
    const status = {
      provider: "Celcom Africa",
      configured: !!(this.partnerId && this.apiKey),
      partnerId: this.partnerId ? "✅ Set" : "❌ Missing",
      apiKey: this.apiKey ? "✅ Set" : "❌ Missing",
      senderId: this.senderId,
      baseURL: this.baseURL,
    };

    if (status.configured) {
      try {
        const balanceResult = await this.checkBalance();
        status.credentialsValid = balanceResult.success;
        if (balanceResult.success) {
          status.balance = balanceResult.data;
        } else {
          status.error = balanceResult.error;
        }
      } catch (error) {
        status.credentialsValid = false;
        status.error = error.message;
      }
    }

    return status;
  }
}

// Export singleton instance
const smsService = new SMSService();
module.exports = smsService;
