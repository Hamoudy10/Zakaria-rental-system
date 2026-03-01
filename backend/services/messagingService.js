// ============================================================
// MESSAGING SERVICE - UNIFIED SMS + WHATSAPP
// ============================================================
// Sends messages via both SMS (Celcom) and WhatsApp (Meta) in parallel.
// If recipient has no WhatsApp, SMS is still sent (default fallback).
// This is the SINGLE entry point all controllers should use for messaging.
// ============================================================

const SMSService = require("./smsService");
const WhatsAppService = require("./whatsappService");

class MessagingService {
  constructor() {
    this.sms = SMSService;
    this.whatsapp = WhatsAppService;

    console.log("📨 Messaging Service Initialized:", {
      sms: this.sms ? "✅ Loaded" : "❌ Missing",
      whatsapp: this.whatsapp ? "✅ Loaded" : "❌ Missing",
      whatsappConfigured: this.whatsapp.configured,
      mode: "parallel",
    });
  }

  // ============================================================
  // CORE PARALLEL SEND
  // ============================================================

  /**
   * Send message via both SMS and WhatsApp in parallel.
   * SMS always sends. WhatsApp sends if configured.
   * If WhatsApp fails (recipient not on WhatsApp), SMS still succeeds.
   *
   * @param {Function} smsFn - Async function that sends SMS (must return result object)
   * @param {Function} whatsappFn - Async function that sends WhatsApp (must return result object)
   * @returns {Object} Combined result from both channels
   */
  async sendParallel(smsFn, whatsappFn) {
    const results = {
      sms: { success: false, error: "Not attempted" },
      whatsapp: { success: false, error: "Not attempted" },
    };

    try {
      // Always attempt SMS
      const smsPromise = smsFn().catch((error) => {
        console.error("❌ SMS send error:", error.message);
        return { success: false, error: error.message, channel: "sms" };
      });

      // Attempt WhatsApp only if configured
      let whatsappPromise;
      if (this.whatsapp.configured) {
        whatsappPromise = whatsappFn().catch((error) => {
          console.error("❌ WhatsApp send error:", error.message);
          return {
            success: false,
            error: error.message,
            channel: "whatsapp",
          };
        });
      } else {
        whatsappPromise = Promise.resolve({
          success: false,
          error: "WhatsApp not configured",
          skipped: true,
          channel: "whatsapp",
        });
      }

      // Wait for both to complete
      const [smsResult, whatsappResult] = await Promise.all([
        smsPromise,
        whatsappPromise,
      ]);

      results.sms = smsResult;
      results.whatsapp = whatsappResult;

      // Log combined result
      console.log("📨 Messaging results:", {
        sms: results.sms.success ? "✅" : "❌",
        whatsapp: results.whatsapp.success
          ? "✅"
          : results.whatsapp.skipped
            ? "⏭️ Skipped"
            : results.whatsapp.notOnWhatsApp
              ? "📵 Not on WhatsApp"
              : "❌",
      });

      return results;
    } catch (error) {
      console.error("❌ Messaging parallel send error:", error);
      return results;
    }
  }

  // ============================================================
  // MESSAGE TYPE METHODS
  // ============================================================

  /**
   * Send welcome message via SMS + WhatsApp
   */
  async sendWelcomeMessage(
    tenantPhone,
    tenantName,
    unitCode,
    monthlyRent,
    dueDay = "1st",
    propertyName = "",
  ) {
    console.log("👋 Messaging: Sending welcome message:", {
      tenant: tenantName,
      unit: unitCode,
    });

    return this.sendParallel(
      () =>
        this.sms.sendWelcomeMessage(
          tenantPhone,
          tenantName,
          unitCode,
          monthlyRent,
          dueDay,
          propertyName,
        ),
      () =>
        this.whatsapp.sendWelcomeMessage(
          tenantPhone,
          tenantName,
          unitCode,
          monthlyRent,
          dueDay,
          propertyName,
        ),
    );
  }

  /**
   * Send payment confirmation via SMS + WhatsApp
   */
  async sendPaymentConfirmation(
    tenantPhone,
    tenantName,
    amount,
    unitCode,
    balance,
    month,
  ) {
    console.log("💰 Messaging: Sending payment confirmation:", {
      tenant: tenantName,
      amount,
    });

    return this.sendParallel(
      () =>
        this.sms.sendPaymentConfirmation(
          tenantPhone,
          tenantName,
          amount,
          unitCode,
          balance,
          month,
        ),
      () =>
        this.whatsapp.sendPaymentConfirmation(
          tenantPhone,
          tenantName,
          amount,
          unitCode,
          balance,
          month,
        ),
    );
  }

  /**
   * Send enhanced payment confirmation with breakdown via SMS + WhatsApp
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
    console.log("💰 Messaging: Sending enhanced payment confirmation:", {
      tenant: tenantName,
      amount,
      breakdown,
    });

    return this.sendParallel(
      () =>
        this.sms.sendEnhancedPaymentConfirmation(
          tenantPhone,
          tenantName,
          amount,
          unitCode,
          breakdown,
          balance,
          month,
        ),
      () =>
        this.whatsapp.sendEnhancedPaymentConfirmation(
          tenantPhone,
          tenantName,
          amount,
          unitCode,
          breakdown,
          balance,
          month,
        ),
    );
  }

  /**
   * Send bill notification via SMS + WhatsApp
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
    console.log("📋 Messaging: Sending bill notification:", {
      tenant: tenantName,
      unit: unitCode,
      total: totalDue,
    });

    return this.sendParallel(
      () =>
        this.sms.sendBillNotification(
          tenantPhone,
          tenantName,
          unitCode,
          month,
          rentDue,
          waterDue,
          arrearsDue,
          totalDue,
          paybillNumber,
        ),
      () =>
        this.whatsapp.sendBillNotification(
          tenantPhone,
          tenantName,
          unitCode,
          month,
          rentDue,
          waterDue,
          arrearsDue,
          totalDue,
          paybillNumber,
        ),
    );
  }

  /**
   * Send balance reminder via SMS + WhatsApp
   */
  async sendBalanceReminder(
    tenantPhone,
    tenantName,
    unitCode,
    balance,
    month,
    dueDate,
  ) {
    console.log("⏰ Messaging: Sending balance reminder:", {
      tenant: tenantName,
      balance,
    });

    return this.sendParallel(
      () =>
        this.sms.sendBalanceReminder(
          tenantPhone,
          tenantName,
          unitCode,
          balance,
          month,
          dueDate,
        ),
      () =>
        this.whatsapp.sendBalanceReminder(
          tenantPhone,
          tenantName,
          unitCode,
          balance,
          month,
          dueDate,
        ),
    );
  }

  /**
   * Send admin payment alert via SMS + WhatsApp
   */
  async sendAdminAlert(
    adminPhone,
    tenantName,
    amount,
    unitCode,
    balance,
    month,
  ) {
    console.log("👨‍💼 Messaging: Sending admin alert:", {
      admin: adminPhone,
      tenant: tenantName,
    });

    return this.sendParallel(
      () =>
        this.sms.sendAdminAlert(
          adminPhone,
          tenantName,
          amount,
          unitCode,
          balance,
          month,
        ),
      () =>
        this.whatsapp.sendAdminAlert(
          adminPhone,
          tenantName,
          amount,
          unitCode,
          balance,
          month,
        ),
    );
  }

  /**
   * Send detailed admin payment alert via SMS + WhatsApp
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
    console.log("👨‍💼 Messaging: Sending detailed admin alert:", {
      admin: adminPhone,
      tenant: tenantName,
    });

    return this.sendParallel(
      () =>
        this.sms.sendAdminPaymentAlert(
          adminPhone,
          tenantName,
          amount,
          unitCode,
          breakdown,
          balance,
          month,
        ),
      () =>
        this.whatsapp.sendAdminPaymentAlert(
          adminPhone,
          tenantName,
          amount,
          unitCode,
          breakdown,
          balance,
          month,
        ),
    );
  }

  /**
   * Send advance payment notification via SMS + WhatsApp
   */
  async sendAdvancePaymentNotification(
    tenantPhone,
    tenantName,
    amount,
    unitCode,
    monthsPaid,
    coveredMonthsText = "",
  ) {
    const safeUnitCode = unitCode || "N/A";
    const safeMonthsPaid = Number.isFinite(Number(monthsPaid))
      ? Math.max(1, Number(monthsPaid))
      : 1;
    const safeCoveredMonthsText = coveredMonthsText || "";

    console.log("🔮 Messaging: Sending advance payment notification:", {
      tenant: tenantName,
      amount,
      months: safeMonthsPaid,
      unit: safeUnitCode,
      coveredMonths: safeCoveredMonthsText,
    });

    return this.sendParallel(
      () =>
        this.sms.sendAdvancePaymentNotification(
          tenantPhone,
          tenantName,
          amount,
          safeUnitCode,
          safeMonthsPaid,
          safeCoveredMonthsText,
        ),
      () =>
        this.whatsapp.sendAdvancePaymentNotification(
          tenantPhone,
          tenantName,
          amount,
          safeUnitCode,
          safeMonthsPaid,
          safeCoveredMonthsText,
        ),
    );
  }

  /**
   * Send maintenance update via SMS + WhatsApp
   */
  async sendMaintenanceUpdate(tenantPhone, tenantName, unitCode, update) {
    console.log("🔧 Messaging: Sending maintenance update:", {
      tenant: tenantName,
      unit: unitCode,
    });

    return this.sendParallel(
      () =>
        this.sms.sendMaintenanceUpdate(
          tenantPhone,
          tenantName,
          unitCode,
          update,
        ),
      () =>
        this.whatsapp.sendMaintenanceUpdate(
          tenantPhone,
          tenantName,
          unitCode,
          update,
        ),
    );
  }

  /**
   * Send general announcement via SMS + WhatsApp
   * Used by bulk and targeted SMS endpoints
   */
  async sendAnnouncement(phone, message, title = "Announcement") {
    console.log("📢 Messaging: Sending announcement:", {
      to: phone,
      title,
    });

    return this.sendParallel(
      () => this.sms.sendSMS(phone, message),
      () => this.whatsapp.sendGeneralAnnouncement(phone, title, message),
    );
  }

  /**
   * Send raw SMS + WhatsApp general announcement
   * For cases where only plain text is available (bulk/targeted SMS)
   */
  async sendRawMessage(
    phone,
    message,
    messageType = "announcement",
    options = {},
  ) {
    const { logSMSNotification = false } = options;
    console.log("Messaging: Sending raw message:", {
      to: phone,
      type: messageType,
    });

    const result = await this.sendParallel(
      () => this.sms.sendSMS(phone, message),
      () =>
        this.whatsapp.sendGeneralAnnouncement(
          phone,
          this.getAnnouncementTitle(messageType),
          message,
        ),
    );

    if (logSMSNotification) {
      await this.sms.logSMSNotification(
        this.sms.formatPhoneNumber(phone),
        messageType,
        message,
        !!result.sms?.success,
      );
    }

    return result;
  }
  // ============================================================
  // QUEUE METHODS
  // ============================================================

  /**
   * Queue both SMS and WhatsApp messages for later sending
   * Used by cron billing to queue messages
   */
  async queueBillMessage(
    tenantPhone,
    smsMessage,
    templateParams,
    messageType = "bill_notification",
    billingMonth = null,
    agentId = null,
  ) {
    const results = {
      sms: { success: false },
      whatsapp: { success: false },
    };

    try {
      // Queue SMS
      const formattedPhone = this.sms.formatPhoneNumber(tenantPhone);
      await require("../config/database").query(
        `INSERT INTO sms_queue 
         (recipient_phone, message, message_type, status, billing_month, agent_id, created_at)
         VALUES ($1, $2, $3, 'pending', $4, $5, NOW())`,
        [formattedPhone, smsMessage, messageType, billingMonth, agentId],
      );
      results.sms = { success: true, queued: true };

      // Queue WhatsApp
      if (this.whatsapp.configured) {
        await this.whatsapp.queueMessage(
          tenantPhone,
          "monthly_bill_cron",
          templateParams,
          messageType,
          smsMessage,
          agentId,
        );
        results.whatsapp = { success: true, queued: true };
      }

      return results;
    } catch (error) {
      console.error("❌ Messaging: Queue bill error:", error);
      return results;
    }
  }

  /**
   * Process both SMS and WhatsApp queues
   * Called by cronService
   */
  async processQueues() {
    const results = {
      sms: { processed: 0, successful: 0, failed: 0 },
      whatsapp: { processed: 0, successful: 0, failed: 0, skipped: 0 },
    };

    try {
      // Process SMS queue
      console.log("🔄 Messaging: Processing SMS queue...");
      const smsResults = await this.sms.processQueuedSMS();
      results.sms = smsResults;

      // Process WhatsApp queue
      if (this.whatsapp.configured) {
        console.log("🔄 Messaging: Processing WhatsApp queue...");
        const whatsappResults = await this.whatsapp.processQueue();
        results.whatsapp = whatsappResults;
      } else {
        console.log("⏭️ Messaging: WhatsApp not configured, skipping queue");
      }

      console.log("✅ Messaging: Queue processing complete:", results);
      return results;
    } catch (error) {
      console.error("❌ Messaging: Queue processing error:", error);
      return results;
    }
  }

  // ============================================================
  // STATISTICS & STATUS
  // ============================================================

  /**
   * Get combined messaging statistics
   */
  async getStatistics() {
    try {
      const smsStats = await this.sms.getSMSStatistics();
      const whatsappStats = await this.whatsapp.getStatistics();

      return {
        success: true,
        data: {
          sms: smsStats.success ? smsStats.data : null,
          whatsapp: whatsappStats.success ? whatsappStats.data : null,
        },
      };
    } catch (error) {
      console.error("❌ Messaging: Statistics error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get combined service status
   */
  async getServiceStatus() {
    try {
      const smsStatus = await this.sms.checkServiceStatus();
      const whatsappStatus = await this.whatsapp.checkServiceStatus();

      return {
        sms: smsStatus,
        whatsapp: whatsappStatus,
        mode: "parallel",
        description:
          "SMS always sends. WhatsApp sends in parallel if configured and recipient has WhatsApp.",
      };
    } catch (error) {
      console.error("❌ Messaging: Service status error:", error);
      return { error: error.message };
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Get announcement title based on message type
   */
  getAnnouncementTitle(messageType) {
    const titles = {
      announcement: "Announcement",
      bill_notification: "Bill Notification",
      payment_reminder: "Payment Reminder",
      balance_reminder: "Balance Reminder",
      maintenance: "Maintenance Notice",
      emergency: "Emergency Notice",
      general: "Notice",
    };
    return titles[messageType] || "Announcement";
  }

  /**
   * Check if WhatsApp is available for a phone number.
   * Note: Meta API doesn't provide a direct "check if on WhatsApp" endpoint.
   * We determine this from send attempt results (error code 131026).
   * This method checks our local records for known non-WhatsApp numbers.
   */
  async isWhatsAppAvailable(phoneNumber) {
    try {
      const formattedPhone = this.whatsapp.formatPhoneNumber(phoneNumber);

      // Check if we've previously recorded this number as not on WhatsApp
      const result = await require("../config/database").query(
        `SELECT COUNT(*) as skip_count
         FROM whatsapp_notifications 
         WHERE phone_number = $1 AND status = 'skipped'
         AND sent_at > NOW() - INTERVAL '30 days'`,
        [formattedPhone],
      );

      const skipCount = parseInt(result.rows[0].skip_count);

      // If skipped 3+ times in last 30 days, likely not on WhatsApp
      if (skipCount >= 3) {
        return { available: false, reason: "Previously not on WhatsApp" };
      }

      return { available: true };
    } catch (error) {
      // If we can't check, assume available
      return { available: true };
    }
  }
}

// Export singleton instance
const messagingService = new MessagingService();
module.exports = messagingService;

