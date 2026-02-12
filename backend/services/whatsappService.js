// ============================================================
// WHATSAPP SERVICE - META CLOUD API INTEGRATION
// ============================================================
// Provider: Meta WhatsApp Business Cloud API
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
// Free Tier: 1,000 service conversations/month
// ============================================================

const axios = require("axios");
const pool = require("../config/database");

class WhatsAppService {
  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
    this.baseURL = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;

    this.configured = !!(
      this.phoneNumberId &&
      this.accessToken &&
      this.businessAccountId
    );

    console.log("📱 WhatsApp Service Initialized:", {
      provider: "Meta Cloud API",
      configured: this.configured,
      phoneNumberId: this.phoneNumberId ? "✅ Set" : "❌ Missing",
      accessToken: this.accessToken ? "✅ Set" : "❌ Missing",
      businessAccountId: this.businessAccountId ? "✅ Set" : "❌ Missing",
      apiVersion: this.apiVersion,
    });
  }

  // ============================================================
  // PHONE NUMBER FORMATTING
  // ============================================================

  formatPhoneNumber(phone) {
    if (!phone) {
      throw new Error("Phone number is required");
    }

    let cleaned = phone.toString().replace(/\D/g, "");

    if (cleaned.startsWith("0") && cleaned.length === 10) {
      cleaned = "254" + cleaned.substring(1);
    } else if (cleaned.startsWith("7") && cleaned.length === 9) {
      cleaned = "254" + cleaned;
    } else if (cleaned.startsWith("1") && cleaned.length === 9) {
      cleaned = "254" + cleaned;
    }

    return cleaned;
  }

  validatePhoneNumber(phone) {
    try {
      const formatted = this.formatPhoneNumber(phone);
      return /^254[17]\d{8}$/.test(formatted);
    } catch (error) {
      return false;
    }
  }

  // ============================================================
  // FORMATTING HELPERS
  // ============================================================

  formatAmount(amount) {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString("en-KE");
  }

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

  formatDueDay(day) {
    const num = parseInt(day) || 1;
    return `${num}${this.getOrdinalSuffix(num)}`;
  }

  async getPaybillNumber() {
    try {
      const result = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = 'paybill_number'`,
      );
      return (
        result.rows[0]?.setting_value || process.env.MPESA_SHORT_CODE || "N/A"
      );
    } catch (error) {
      return process.env.MPESA_SHORT_CODE || "N/A";
    }
  }

  // ============================================================
  // CORE WHATSAPP SENDING
  // ============================================================

  async sendTemplateMessage(
    phoneNumber,
    templateName,
    templateParams = [],
    languageCode = "en",
  ) {
    try {
      console.log("📱 WhatsApp: Sending template message:", {
        to: phoneNumber,
        template: templateName,
        paramsCount: templateParams.length,
      });

      if (!this.validatePhoneNumber(phoneNumber)) {
        console.error("❌ WhatsApp: Invalid phone number:", phoneNumber);
        return {
          success: false,
          error: "Invalid phone number format",
          channel: "whatsapp",
        };
      }

      if (!this.configured) {
        console.warn("⚠️ WhatsApp not configured - skipping");
        return {
          success: false,
          error: "WhatsApp service not configured",
          skipped: true,
          channel: "whatsapp",
        };
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      const components = [];

      if (templateParams.length > 0) {
        components.push({
          type: "body",
          parameters: templateParams.map((param) => ({
            type: "text",
            text: String(param),
          })),
        });
      }

      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: languageCode,
          },
          components: components.length > 0 ? components : undefined,
        },
      };

      console.log(
        "🚀 WhatsApp: Calling Meta API...",
        JSON.stringify(payload, null, 2),
      );

      const response = await axios.post(`${this.baseURL}/messages`, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      console.log(
        "📨 WhatsApp Response:",
        JSON.stringify(response.data, null, 2),
      );

      if (response.data?.messages?.[0]?.id) {
        const messageId = response.data.messages[0].id;
        const messageStatus =
          response.data.messages[0].message_status || "accepted";

        console.log("✅ WhatsApp message sent successfully:", {
          messageId,
          status: messageStatus,
        });

        return {
          success: true,
          messageId: messageId,
          status: messageStatus,
          channel: "whatsapp",
        };
      }

      if (response.data?.error) {
        const errorMsg =
          response.data.error.message || "Unknown WhatsApp API error";
        const errorCode = response.data.error.code;

        console.error("❌ WhatsApp API error:", errorCode, errorMsg);

        return {
          success: false,
          error: errorMsg,
          code: errorCode,
          channel: "whatsapp",
        };
      }

      console.error("❌ WhatsApp: Unexpected response format");
      return {
        success: false,
        error: "Unexpected API response",
        rawResponse: response.data,
        channel: "whatsapp",
      };
    } catch (error) {
      console.error(
        "❌ WhatsApp Error:",
        error.response?.data || error.message,
      );

      const metaError = error.response?.data?.error;
      let errorMessage = error.message;
      let errorCode = null;

      if (metaError) {
        errorMessage = metaError.message || error.message;
        errorCode = metaError.code;

        if (errorCode === 131026) {
          console.warn("⚠️ WhatsApp: Recipient not on WhatsApp:", phoneNumber);
          return {
            success: false,
            error: "Recipient not on WhatsApp",
            code: 131026,
            notOnWhatsApp: true,
            channel: "whatsapp",
          };
        }

        if (errorCode === 131047) {
          console.warn("⚠️ WhatsApp: Template required for this recipient");
          return {
            success: false,
            error: "Template message required",
            code: 131047,
            channel: "whatsapp",
          };
        }

        if (errorCode === 131048) {
          console.warn("⚠️ WhatsApp: Rate limited by Meta");
          return {
            success: false,
            error: "Rate limited - try again later",
            code: 131048,
            channel: "whatsapp",
          };
        }

        if (errorCode === 132000) {
          console.error("❌ WhatsApp: Template not found:", errorMessage);
          return {
            success: false,
            error: "Template not found or not approved",
            code: 132000,
            channel: "whatsapp",
          };
        }

        if (errorCode === 132001) {
          console.error(
            "❌ WhatsApp: Template parameter mismatch:",
            errorMessage,
          );
          return {
            success: false,
            error: "Template parameter mismatch",
            code: 132001,
            channel: "whatsapp",
          };
        }
      }

      await this.queueForRetry(phoneNumber, null, [], errorMessage);

      return {
        success: false,
        error: errorMessage,
        code: errorCode,
        queued: true,
        channel: "whatsapp",
      };
    }
  }

  // ============================================================
  // MESSAGE TYPE METHODS (Matched to submitted Meta templates)
  // ============================================================

  /**
   * Send welcome message via WhatsApp
   * Template: rental_welcome (7 params)
   * {{1}}=name, {{2}}=property, {{3}}=unit, {{4}}=rent, {{5}}=dueDay, {{6}}=paybill, {{7}}=account
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

      const params = [
        tenantName,
        propertyName || "Zakaria Housing",
        unitCode,
        formattedRent,
        dueDayFormatted,
        paybill,
        unitCode, // {{7}} = Account number (same as unit code)
      ];

      console.log("👋 WhatsApp: Sending welcome message:", {
        tenant: tenantName,
        unit: unitCode,
      });

      const result = await this.sendTemplateMessage(
        tenantPhone,
        "rental_welcome",
        params,
      );

      await this.logNotification(
        tenantPhone,
        "rental_welcome",
        params,
        "welcome_message",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp welcome message error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send payment confirmation via WhatsApp
   * Template: payment_confirmation (5 params)
   * {{1}}=name, {{2}}=amount, {{3}}=unit, {{4}}=month, {{5}}=status
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
      const status =
        balance <= 0
          ? "FULLY PAID"
          : `Balance: KES ${this.formatAmount(balance)}`;

      const params = [tenantName, formattedAmount, unitCode, month, status];

      console.log("💰 WhatsApp: Sending payment confirmation:", {
        tenant: tenantName,
        amount,
      });

      const result = await this.sendTemplateMessage(
        tenantPhone,
        "payment_confirmation",
        params,
      );

      await this.logNotification(
        tenantPhone,
        "payment_confirmation",
        params,
        "payment_confirmation",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp payment confirmation error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send enhanced payment confirmation with breakdown via WhatsApp
   * Template: payment_confirmation_detailed (6 params)
   * {{1}}=name, {{2}}=amount, {{3}}=unit, {{4}}=month, {{5}}=breakdown, {{6}}=status
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

      const allocations = [];
      if (rentPaid > 0)
        allocations.push(`- Rent: KES ${this.formatAmount(rentPaid)}`);
      if (waterPaid > 0)
        allocations.push(`- Water: KES ${this.formatAmount(waterPaid)}`);
      if (arrearsPaid > 0)
        allocations.push(`- Arrears: KES ${this.formatAmount(arrearsPaid)}`);

      const breakdownText =
        allocations.length > 0 ? allocations.join("\n") : "- Full payment";

      const params = [
        tenantName,
        this.formatAmount(amount),
        unitCode,
        month,
        breakdownText,
        status,
      ];

      console.log("💰 WhatsApp: Sending enhanced payment confirmation:", {
        tenant: tenantName,
        amount,
        breakdown,
      });

      const result = await this.sendTemplateMessage(
        tenantPhone,
        "payment_confirmation_detailed",
        params,
      );

      await this.logNotification(
        tenantPhone,
        "payment_confirmation_detailed",
        params,
        "payment_confirmation",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp enhanced payment confirmation error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send bill notification via WhatsApp
   * Template: bill_notification (7 params)
   * {{1}}=name, {{2}}=month, {{3}}=unit, {{4}}=items, {{5}}=total, {{6}}=paybill, {{7}}=account
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
      const items = [];
      if (rentDue > 0) items.push(`- Rent: KES ${this.formatAmount(rentDue)}`);
      if (waterDue > 0)
        items.push(`- Water: KES ${this.formatAmount(waterDue)}`);
      if (arrearsDue > 0)
        items.push(`- Arrears: KES ${this.formatAmount(arrearsDue)}`);

      const itemsText = items.length > 0 ? items.join("\n") : "- No charges";

      const params = [
        tenantName,
        month.toUpperCase(),
        unitCode,
        itemsText,
        this.formatAmount(totalDue),
        paybillNumber,
        unitCode, // {{7}} = Account number (same as unit code)
      ];

      console.log("📋 WhatsApp: Sending bill notification:", {
        tenant: tenantName,
        unit: unitCode,
        total: totalDue,
      });

      const result = await this.sendTemplateMessage(
        tenantPhone,
        "bill_notification",
        params,
      );

      await this.logNotification(
        tenantPhone,
        "bill_notification",
        params,
        "bill_notification",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp bill notification error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send balance reminder via WhatsApp
   * Template: balance_reminder (7 params)
   * {{1}}=name, {{2}}=unit, {{3}}=month, {{4}}=balance, {{5}}=dueDate, {{6}}=paybill, {{7}}=account
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

      const params = [
        tenantName,
        unitCode,
        month,
        this.formatAmount(balance),
        dueDate,
        paybill,
        unitCode, // {{7}} = Account number (same as unit code)
      ];

      console.log("⏰ WhatsApp: Sending balance reminder:", {
        tenant: tenantName,
        balance,
      });

      const result = await this.sendTemplateMessage(
        tenantPhone,
        "balance_reminder",
        params,
      );

      await this.logNotification(
        tenantPhone,
        "balance_reminder",
        params,
        "balance_reminder",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp balance reminder error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send admin payment alert via WhatsApp
   * Template: admin_payment_alert (5 params)
   * {{1}}=tenant, {{2}}=unit, {{3}}=amount, {{4}}=month, {{5}}=status
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

      const params = [
        tenantName,
        unitCode,
        this.formatAmount(amount),
        month,
        status,
      ];

      console.log("👨‍💼 WhatsApp: Sending admin alert:", {
        admin: adminPhone,
        tenant: tenantName,
      });

      const result = await this.sendTemplateMessage(
        adminPhone,
        "admin_payment_alert",
        params,
      );

      await this.logNotification(
        adminPhone,
        "admin_payment_alert",
        params,
        "admin_alert",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp admin alert error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send detailed admin payment alert via WhatsApp
   * Template: admin_payment_alert_detailed (6 params)
   * {{1}}=tenant, {{2}}=unit, {{3}}=month, {{4}}=amount, {{5}}=allocation, {{6}}=status
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

      const parts = [];
      if (rentPaid > 0) parts.push(`R:${this.formatAmount(rentPaid)}`);
      if (waterPaid > 0) parts.push(`W:${this.formatAmount(waterPaid)}`);
      if (arrearsPaid > 0) parts.push(`A:${this.formatAmount(arrearsPaid)}`);

      const breakdownText = parts.length > 0 ? `(${parts.join(", ")})` : "";

      const params = [
        tenantName,
        unitCode,
        month,
        this.formatAmount(amount),
        breakdownText,
        status,
      ];

      console.log("👨‍💼 WhatsApp: Sending detailed admin alert:", {
        admin: adminPhone,
        tenant: tenantName,
      });

      const result = await this.sendTemplateMessage(
        adminPhone,
        "admin_payment_alert_detailed",
        params,
      );

      await this.logNotification(
        adminPhone,
        "admin_payment_alert_detailed",
        params,
        "admin_payment_alert",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp detailed admin alert error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send advance payment notification via WhatsApp
   * Template: advance_payment (4 params)
   * {{1}}=name, {{2}}=amount, {{3}}=unit, {{4}}=months
   */
  async sendAdvancePaymentNotification(
    tenantPhone,
    tenantName,
    amount,
    unitCode,
    monthsPaid,
  ) {
    try {
      const params = [
        tenantName,
        this.formatAmount(amount),
        unitCode,
        String(monthsPaid),
      ];

      console.log("🔮 WhatsApp: Sending advance payment notification:", {
        tenant: tenantName,
        amount,
        months: monthsPaid,
      });

      const result = await this.sendTemplateMessage(
        tenantPhone,
        "advance_payment",
        params,
      );

      await this.logNotification(
        tenantPhone,
        "advance_payment",
        params,
        "advance_payment",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp advance payment error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send maintenance update via WhatsApp
   * Template: maintenance_update (3 params)
   * {{1}}=name, {{2}}=unit, {{3}}=update
   */
  async sendMaintenanceUpdate(tenantPhone, tenantName, unitCode, update) {
    try {
      const params = [tenantName, unitCode, update];

      console.log("🔧 WhatsApp: Sending maintenance update:", {
        tenant: tenantName,
        unit: unitCode,
      });

      const result = await this.sendTemplateMessage(
        tenantPhone,
        "maintenance_update",
        params,
      );

      await this.logNotification(
        tenantPhone,
        "maintenance_update",
        params,
        "maintenance_update",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp maintenance update error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send general announcement via WhatsApp
   * Template: general_announcement (2 params)
   * {{1}}=title, {{2}}=message
   */
  async sendGeneralAnnouncement(phone, title, message) {
    try {
      const params = [title || "Announcement", message];

      console.log("📢 WhatsApp: Sending announcement:", {
        to: phone,
        title,
      });

      const result = await this.sendTemplateMessage(
        phone,
        "general_announcement",
        params,
      );

      await this.logNotification(
        phone,
        "general_announcement",
        params,
        "announcement",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp announcement error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  /**
   * Send monthly bill (cron job format) via WhatsApp
   * Template: monthly_bill_cron (8 params)
   * {{1}}=name, {{2}}=month, {{3}}=unit, {{4}}=items, {{5}}=total, {{6}}=paybill, {{7}}=account, {{8}}=company
   */
  async sendMonthlyBillCron(
    tenantPhone,
    tenantName,
    targetMonth,
    unitCode,
    billItems,
    totalDue,
    paybillNumber,
    companyName,
  ) {
    try {
      const params = [
        tenantName,
        targetMonth,
        unitCode,
        billItems,
        this.formatAmount(totalDue),
        paybillNumber,
        unitCode, // {{7}} = Account number (same as unit code)
        companyName,
      ];

      console.log("📋 WhatsApp: Sending monthly bill (cron):", {
        tenant: tenantName,
        unit: unitCode,
        total: totalDue,
      });

      const result = await this.sendTemplateMessage(
        tenantPhone,
        "monthly_bill_cron",
        params,
      );

      await this.logNotification(
        tenantPhone,
        "monthly_bill_cron",
        params,
        "bill_notification",
        result,
      );

      return result;
    } catch (error) {
      console.error("❌ WhatsApp monthly bill cron error:", error);
      return { success: false, error: error.message, channel: "whatsapp" };
    }
  }

  // ============================================================
  // QUEUE & RETRY
  // ============================================================

  async queueForRetry(
    phoneNumber,
    templateName,
    templateParams = [],
    error = null,
    messageType = "retry",
    fallbackMessage = null,
  ) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      await pool.query(
        `INSERT INTO whatsapp_queue 
         (recipient_phone, template_name, template_params, fallback_message, 
          message_type, status, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW())`,
        [
          formattedPhone,
          templateName || "unknown",
          JSON.stringify(templateParams),
          fallbackMessage,
          messageType,
          error,
        ],
      );

      console.log("📨 WhatsApp: Queued for retry:", formattedPhone);
    } catch (queueError) {
      console.error("❌ WhatsApp: Failed to queue:", queueError);
    }
  }

  async queueMessage(
    phoneNumber,
    templateName,
    templateParams = [],
    messageType = "general",
    fallbackMessage = null,
    agentId = null,
  ) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      await pool.query(
        `INSERT INTO whatsapp_queue 
         (recipient_phone, template_name, template_params, fallback_message,
          message_type, status, agent_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW())`,
        [
          formattedPhone,
          templateName,
          JSON.stringify(templateParams),
          fallbackMessage,
          messageType,
          agentId,
        ],
      );

      console.log("📨 WhatsApp: Message queued:", {
        phone: formattedPhone,
        template: templateName,
      });

      return { success: true, queued: true };
    } catch (error) {
      console.error("❌ WhatsApp: Queue error:", error);
      return { success: false, error: error.message };
    }
  }

  async processQueue() {
    try {
      console.log("🔄 WhatsApp: Processing queue...");

      const queuedMessages = await pool.query(
        `SELECT * FROM whatsapp_queue 
         WHERE status = 'pending' AND attempts < max_attempts
         ORDER BY created_at ASC 
         LIMIT 10`,
      );

      console.log(
        `📨 WhatsApp: Found ${queuedMessages.rows.length} queued messages`,
      );

      const results = { processed: 0, successful: 0, failed: 0, skipped: 0 };

      for (const msg of queuedMessages.rows) {
        try {
          let templateParams;
          try {
            templateParams =
              typeof msg.template_params === "string"
                ? JSON.parse(msg.template_params)
                : msg.template_params || [];
          } catch (parseError) {
            templateParams = [];
          }

          const result = await this.sendTemplateMessage(
            msg.recipient_phone,
            msg.template_name,
            templateParams,
          );

          if (result.notOnWhatsApp) {
            await pool.query(
              `UPDATE whatsapp_queue 
               SET status = 'skipped', attempts = attempts + 1,
                   last_attempt_at = NOW(), error_message = $1
               WHERE id = $2`,
              ["Recipient not on WhatsApp", msg.id],
            );
            results.skipped++;
          } else {
            await pool.query(
              `UPDATE whatsapp_queue 
               SET status = $1, sent_at = $2, attempts = attempts + 1,
                   last_attempt_at = NOW(), error_message = $3,
                   whatsapp_message_id = $4
               WHERE id = $5`,
              [
                result.success ? "sent" : "failed",
                result.success ? new Date() : null,
                result.error || null,
                result.messageId || null,
                msg.id,
              ],
            );

            if (result.success) {
              results.successful++;
            } else {
              results.failed++;
            }
          }

          results.processed++;

          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          console.error(
            `❌ WhatsApp: Error processing message #${msg.id}:`,
            error,
          );

          await pool.query(
            `UPDATE whatsapp_queue 
             SET attempts = attempts + 1, last_attempt_at = NOW(), error_message = $1
             WHERE id = $2`,
            [error.message, msg.id],
          );

          results.failed++;
          results.processed++;
        }
      }

      console.log("✅ WhatsApp: Queue processing complete:", results);
      return results;
    } catch (error) {
      console.error("❌ WhatsApp: Queue processing error:", error);
      throw error;
    }
  }

  // ============================================================
  // LOGGING & STATISTICS
  // ============================================================

  async logNotification(
    phone,
    templateName,
    templateParams,
    messageType,
    result,
  ) {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);

      await pool.query(
        `INSERT INTO whatsapp_notifications 
         (phone_number, template_name, template_params, message_type, status, 
          whatsapp_message_id, error_message, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          formattedPhone,
          templateName,
          JSON.stringify(templateParams),
          messageType,
          result.success ? "sent" : result.notOnWhatsApp ? "skipped" : "failed",
          result.messageId || null,
          result.error || null,
        ],
      );
    } catch (error) {
      console.error("❌ WhatsApp: Failed to log notification:", error);
    }
  }

  async getStatistics() {
    try {
      const notifStats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped,
          MIN(sent_at) as first_sent,
          MAX(sent_at) as last_sent
        FROM whatsapp_notifications
      `);

      const queueStats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped
        FROM whatsapp_queue
      `);

      const templateStats = await pool.query(`
        SELECT 
          template_name,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM whatsapp_notifications
        GROUP BY template_name
        ORDER BY total DESC
      `);

      return {
        success: true,
        data: {
          notifications: notifStats.rows[0],
          queue: queueStats.rows[0],
          byTemplate: templateStats.rows,
        },
      };
    } catch (error) {
      console.error("❌ WhatsApp: Statistics error:", error);
      return { success: false, error: error.message };
    }
  }

  async checkServiceStatus() {
    const status = {
      provider: "Meta WhatsApp Cloud API",
      configured: this.configured,
      phoneNumberId: this.phoneNumberId ? "✅ Set" : "❌ Missing",
      accessToken: this.accessToken ? "✅ Set" : "❌ Missing",
      businessAccountId: this.businessAccountId ? "✅ Set" : "❌ Missing",
      apiVersion: this.apiVersion,
    };

    if (this.configured) {
      try {
        const response = await axios.get(
          `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
            },
            timeout: 10000,
          },
        );

        status.apiConnected = true;
        status.phoneInfo = {
          displayPhoneNumber: response.data.display_phone_number,
          verifiedName: response.data.verified_name,
          qualityRating: response.data.quality_rating,
        };
      } catch (error) {
        status.apiConnected = false;
        status.error = error.response?.data?.error?.message || error.message;
      }
    }

    return status;
  }

  // ============================================================
  // WEBHOOK HANDLING (for delivery status updates)
  // ============================================================

  async processWebhook(webhookData) {
    try {
      if (!webhookData?.entry?.[0]?.changes?.[0]?.value) {
        return { processed: false, reason: "Invalid webhook format" };
      }

      const value = webhookData.entry[0].changes[0].value;

      if (value.statuses && value.statuses.length > 0) {
        for (const statusUpdate of value.statuses) {
          const messageId = statusUpdate.id;
          const status = statusUpdate.status;
          const recipientId = statusUpdate.recipient_id;

          console.log("📬 WhatsApp: Status update:", {
            messageId,
            status,
            recipient: recipientId,
          });

          await pool.query(
            `UPDATE whatsapp_notifications 
             SET status = $1 
             WHERE whatsapp_message_id = $2`,
            [status === "failed" ? "failed" : "sent", messageId],
          );

          await pool.query(
            `UPDATE whatsapp_queue 
             SET status = $1 
             WHERE whatsapp_message_id = $2`,
            [status === "failed" ? "failed" : "sent", messageId],
          );

          if (status === "failed") {
            const errorData = statusUpdate.errors?.[0];
            const errorMsg = errorData
              ? `${errorData.code}: ${errorData.title}`
              : "Delivery failed";

            console.error("❌ WhatsApp: Message delivery failed:", errorMsg);

            await pool.query(
              `UPDATE whatsapp_notifications 
               SET error_message = $1 
               WHERE whatsapp_message_id = $2`,
              [errorMsg, messageId],
            );
          }
        }

        return {
          processed: true,
          statusUpdates: value.statuses.length,
        };
      }

      return { processed: false, reason: "No status updates in webhook" };
    } catch (error) {
      console.error("❌ WhatsApp: Webhook processing error:", error);
      return { processed: false, error: error.message };
    }
  }
}

// Export singleton instance
const whatsappService = new WhatsAppService();
module.exports = whatsappService;
