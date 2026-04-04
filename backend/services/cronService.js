const cron = require('node-cron');
const pool = require('../config/database');
const BillingService = require('./billingService');
const SMSService = require('./smsService');
const NotificationService = require('./notificationService');
const MessagingService = require("./messagingService");
const WhatsAppService = require("./whatsappService");
const MessageTemplateService = require("./messageTemplateService");

class CronService {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.job = null;

    console.log("⏰ Cron Service Initialized");
  }

  // Get billing configuration from admin_settings
  async getBillingConfig() {
    try {
      const configResult = await pool.query(
        `SELECT setting_key, setting_value
         FROM admin_settings
         WHERE setting_key = ANY($1)`,
        [[
          "billing_day",
          "paybill_number",
          "company_name",
          "sms_billing_template",
          "whatsapp_billing_template_name",
          "whatsapp_billing_fallback_template",
        ]],
      );

      const configMap = Object.fromEntries(
        configResult.rows.map((row) => [row.setting_key, row.setting_value]),
      );

      const billingDay = configMap.billing_day || "28";
      const paybillNumber = configMap.paybill_number || "YOUR_PAYBILL_HERE";
      const companyName = configMap.company_name || "Rental Management";
      const smsBillingTemplate =
        configMap.sms_billing_template ||
        "Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.";
      const whatsappBillingTemplateName =
        configMap.whatsapp_billing_template_name || "monthly_bill_cron";
      const whatsappBillingFallbackTemplate =
        configMap.whatsapp_billing_fallback_template || smsBillingTemplate;

      return {
        billingDay: parseInt(billingDay, 10),
        paybillNumber,
        companyName,
        smsBillingTemplate,
        whatsappBillingTemplateName,
        whatsappBillingFallbackTemplate,
      };
    } catch (error) {
      console.error("Error getting billing config:", error);
      return {
        billingDay: 28,
        paybillNumber: "YOUR_PAYBILL_HERE",
        companyName: "Rental Management",
        smsBillingTemplate:
          "Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.",
        whatsappBillingTemplateName: "monthly_bill_cron",
        whatsappBillingFallbackTemplate:
          "Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.",
      };
    }
  }

  // ==================== NEW METHOD: CHECK EXPIRING LEASES ====================
  async checkExpiringLeases() {
    try {
      console.log("🔍 Checking for expiring leases...");

      // Find leases expiring in the next 30 days
      const result = await pool.query(`
        SELECT 
          ta.id as allocation_id,
          ta.tenant_id,
          ta.lease_end_date,
          ta.monthly_rent,
          t.first_name,
          t.last_name,
          t.phone_number,
          pu.unit_code,
          pu.property_id,
          p.name as property_name,
          (ta.lease_end_date - CURRENT_DATE) as days_remaining
        FROM tenant_allocations ta
        JOIN tenants t ON ta.tenant_id = t.id
        JOIN property_units pu ON ta.unit_id = pu.id
        JOIN properties p ON pu.property_id = p.id
        WHERE ta.is_active = true
          AND ta.lease_end_date IS NOT NULL
          AND ta.lease_end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
        ORDER BY ta.lease_end_date ASC
      `);

      const expiringLeases = result.rows;
      console.log(
        `📋 Found ${expiringLeases.length} leases expiring in the next 30 days`,
      );

      if (expiringLeases.length === 0) {
        return { success: true, count: 0, message: "No expiring leases found" };
      }

      // Get all admins
      const adminResult = await pool.query(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
      );
      const adminIds = adminResult.rows.map((a) => a.id);

      let notificationsSent = 0;

      for (const lease of expiringLeases) {
        try {
          const tenantName = `${lease.first_name} ${lease.last_name}`;
          const expiryDate = new Date(lease.lease_end_date).toLocaleDateString(
            "en-GB",
          );
          const daysRemaining = parseInt(lease.days_remaining);

          const message = `Lease for ${tenantName} at ${lease.unit_code} (${lease.property_name}) expires on ${expiryDate}. ${daysRemaining} days remaining.`;

          // Notify all admins
          for (const adminId of adminIds) {
            await NotificationService.createNotification({
              userId: adminId,
              title: "Lease Expiring Soon",
              message: message,
              type: "lease_expiring",
              relatedEntityType: "allocation",
              relatedEntityId: lease.allocation_id,
            });
          }

          // Notify assigned agent for this property
          const agentResult = await pool.query(
            `SELECT agent_id FROM agent_property_assignments 
             WHERE property_id = $1 AND is_active = true`,
            [lease.property_id],
          );

          if (agentResult.rows.length > 0) {
            const agentId = agentResult.rows[0].agent_id;
            // Only notify if not already an admin
            if (!adminIds.includes(agentId)) {
              await NotificationService.createNotification({
                userId: agentId,
                title: "Lease Expiring Soon",
                message: message,
                type: "lease_expiring",
                relatedEntityType: "allocation",
                relatedEntityId: lease.allocation_id,
              });
            }
          }

          notificationsSent++;
          console.log(`✅ Sent lease expiry notification for ${tenantName}`);
        } catch (notifyError) {
          console.error(
            `❌ Failed to notify for lease ${lease.allocation_id}:`,
            notifyError.message,
          );
        }
      }

      console.log(
        `✅ Lease expiry check complete. Sent ${notificationsSent} notifications.`,
      );

      return {
        success: true,
        count: expiringLeases.length,
        notificationsSent: notificationsSent,
      };
    } catch (error) {
      console.error("❌ Error checking expiring leases:", error);
      return { success: false, error: error.message };
    }
  }

  // ==================== NEW METHOD: CHECK OVERDUE RENT ====================
  async checkOverdueRent() {
    try {
      console.log("🔍 Checking for overdue rent payments...");

      const currentDate = new Date();
      const currentMonth = currentDate.toISOString().slice(0, 7); // YYYY-MM

      // Find tenants with unpaid or partially paid rent for current month
      // who are past their grace period
      const result = await pool.query(`
        SELECT 
          ta.id as allocation_id,
          ta.tenant_id,
          ta.monthly_rent,
          ta.lease_start_date,
          ta.lease_end_date,
          ta.rent_due_day,
          ta.grace_period_days,
          t.first_name,
          t.last_name,
          t.phone_number,
          pu.id as unit_id,
          pu.unit_code,
          pu.property_id,
          p.name as property_name,
          COALESCE(
            (SELECT SUM(
              CASE
                WHEN (
                  COALESCE(allocated_to_rent, 0) +
                  COALESCE(allocated_to_water, 0) +
                  COALESCE(allocated_to_arrears, 0)
                ) > 0 THEN COALESCE(allocated_to_rent, 0)
                ELSE COALESCE(amount, 0)
              END
            ) FROM rent_payments 
             WHERE tenant_id = ta.tenant_id 
             AND unit_id = ta.unit_id 
             AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', CURRENT_DATE)
             AND status = 'completed'), 0
          ) as amount_paid
        FROM tenant_allocations ta
        JOIN tenants t ON ta.tenant_id = t.id
        JOIN property_units pu ON ta.unit_id = pu.id
        JOIN properties p ON pu.property_id = p.id
        WHERE ta.is_active = true
          AND DATE_TRUNC('month', CURRENT_DATE) >= DATE_TRUNC('month', ta.lease_start_date)
          AND (
            ta.lease_end_date IS NULL OR
            DATE_TRUNC('month', CURRENT_DATE) <= DATE_TRUNC('month', ta.lease_end_date)
          )
          AND EXTRACT(DAY FROM CURRENT_DATE) > (COALESCE(ta.rent_due_day, 1) + COALESCE(ta.grace_period_days, 5))
      `);

      // Filter to only those with outstanding balance
      const overdueRents = result.rows.filter((r) => {
        const monthlyRent = parseFloat(r.monthly_rent);
        const amountPaid = parseFloat(r.amount_paid);
        return amountPaid < monthlyRent;
      });

      console.log(`📋 Found ${overdueRents.length} tenants with overdue rent`);

      if (overdueRents.length === 0) {
        return { success: true, count: 0, message: "No overdue rent found" };
      }

      // Get all admins
      const adminResult = await pool.query(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
      );
      const adminIds = adminResult.rows.map((a) => a.id);

      let notificationsSent = 0;

      for (const tenant of overdueRents) {
        try {
          const tenantName = `${tenant.first_name} ${tenant.last_name}`;
          const monthlyRent = parseFloat(tenant.monthly_rent);
          const amountPaid = parseFloat(tenant.amount_paid);
          const balance = monthlyRent - amountPaid;

          const dueDay = tenant.rent_due_day || 1;
          const gracePeriod = tenant.grace_period_days || 5;
          const daysOverdue = currentDate.getDate() - (dueDay + gracePeriod);

          const formattedBalance = balance.toLocaleString("en-KE");
          const monthName = currentDate.toLocaleString("en-US", {
            month: "long",
            year: "numeric",
          });

          const message = `Rent overdue: ${tenantName} (${tenant.unit_code} at ${tenant.property_name}) owes KSh ${formattedBalance} for ${monthName}. ${daysOverdue} days overdue.`;

          // Notify all admins
          for (const adminId of adminIds) {
            await NotificationService.createNotification({
              userId: adminId,
              title: "Rent Payment Overdue",
              message: message,
              type: "rent_overdue",
              relatedEntityType: "allocation",
              relatedEntityId: tenant.allocation_id,
            });
          }

          // Notify assigned agent for this property
          const agentResult = await pool.query(
            `SELECT agent_id FROM agent_property_assignments 
             WHERE property_id = $1 AND is_active = true`,
            [tenant.property_id],
          );

          if (agentResult.rows.length > 0) {
            const agentId = agentResult.rows[0].agent_id;
            // Only notify if not already an admin
            if (!adminIds.includes(agentId)) {
              await NotificationService.createNotification({
                userId: agentId,
                title: "Rent Payment Overdue",
                message: message,
                type: "rent_overdue",
                relatedEntityType: "allocation",
                relatedEntityId: tenant.allocation_id,
              });
            }
          }

          notificationsSent++;
          console.log(`✅ Sent overdue rent notification for ${tenantName}`);
        } catch (notifyError) {
          console.error(
            `❌ Failed to notify for overdue rent ${tenant.allocation_id}:`,
            notifyError.message,
          );
        }
      }

      console.log(
        `✅ Overdue rent check complete. Sent ${notificationsSent} notifications.`,
      );

      return {
        success: true,
        count: overdueRents.length,
        notificationsSent: notificationsSent,
      };
    } catch (error) {
      console.error("❌ Error checking overdue rent:", error);
      return { success: false, error: error.message };
    }
  }

  // Send monthly bills to all tenants
  async sendMonthlyBills() {
    if (this.isRunning) {
      console.log("⚠️ Billing process is already running");
      return;
    }

    try {
      this.isRunning = true;
      console.log("🚀 Starting monthly billing process...");

      // Get current month (format: YYYY-MM)
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      console.log("📅 Processing bills for:", currentMonth);

      // Get billing configuration
      const config = await this.getBillingConfig();

      const boundTemplate =
        await MessageTemplateService.getDefaultTemplateForEvent(
          "monthly_bill_auto",
        );
      if (boundTemplate) {
        if (boundTemplate.sms_body) {
          config.smsBillingTemplate = boundTemplate.sms_body;
        }
        if (boundTemplate.whatsapp_template_name) {
          config.whatsappBillingTemplateName =
            boundTemplate.whatsapp_template_name;
        }
        if (boundTemplate.whatsapp_fallback_body) {
          config.whatsappBillingFallbackTemplate =
            boundTemplate.whatsapp_fallback_body;
        }
      }
      console.log("⚙️ Billing config:", config);

      // Generate bills for all tenants
      const billingResult =
        await BillingService.generateMonthlyBills(currentMonth);

      console.log("📊 Billing generation complete:", {
        total: billingResult.totalTenants,
        bills: billingResult.billsGenerated,
        skipped: billingResult.skipped,
      });

      // Send SMS + WhatsApp for each bill
      const results = {
        total: billingResult.bills.length,
        success: 0,
        failed: 0,
        whatsapp_queued: 0,
        failedDetails: [],
      };

      // Rate limiting: 5 messages per second
      const rateLimitDelay = 200; // 200ms between messages

      for (let i = 0; i < billingResult.bills.length; i++) {
        const bill = billingResult.bills[i];

        try {
          console.log(
            `📱 Queueing bill for ${bill.tenantName} (${bill.unitCode})...`,
          );

          const smsMessage = this.createBillMessage(bill, config);
          const whatsappFallbackMessage = this.createWhatsAppFallbackMessage(
            bill,
            config,
          );

          // Build WhatsApp template params for monthly_bill_cron
          const billItems = [];
          if (bill.rentDue > 0) {
            billItems.push(`🏠 Rent: KSh ${this.formatAmount(bill.rentDue)}`);
          }
          if (bill.waterDue > 0) {
            billItems.push(`🚰 Water: KSh ${this.formatAmount(bill.waterDue)}`);
          }
          if (bill.arrearsDue > 0) {
            billItems.push(
              `📝 Arrears: KSh ${this.formatAmount(bill.arrearsDue)}`,
            );
          }
          const billItemsText =
            billItems.length > 0 ? billItems.join("\n") : "No charges";
          const totalDue = bill.rentDue + bill.waterDue + bill.arrearsDue;

          const whatsappParams = [
            bill.tenantName,
            bill.targetMonth,
            bill.unitCode,
            billItemsText,
            this.formatAmount(totalDue),
            config.paybillNumber,
            bill.unitCode,
          ];

          // Queue SMS
          await pool.query(
            `INSERT INTO sms_queue 
            (recipient_phone, message, message_type, status, billing_month, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              bill.tenantPhone,
              smsMessage,
              "bill_notification",
              "pending",
              currentMonth,
            ],
          );

          // Queue WhatsApp
          if (WhatsAppService.configured) {
            await WhatsAppService.queueMessage(
              bill.tenantPhone,
              config.whatsappBillingTemplateName,
              whatsappParams,
              "bill_notification",
              whatsappFallbackMessage,
              null,
            );
            results.whatsapp_queued++;
          }

          results.success++;
          console.log(`✅ Queued bill for ${bill.tenantName} (SMS + WhatsApp)`);
        } catch (error) {
          console.error(
            `❌ Failed to queue bill for ${bill.tenantName}:`,
            error.message,
          );
          results.failed++;
          results.failedDetails.push({
            tenantId: bill.tenantId,
            tenantName: bill.tenantName,
            unitCode: bill.unitCode,
            error: error.message,
          });
        }

        // Rate limiting delay
        if (i < billingResult.bills.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, rateLimitDelay));
        }
      }

      // Notify admins about the billing run
      await this.notifyAdminsAboutBillingRun(
        results,
        billingResult.skippedDetails,
      );

      // Log the billing run
      await this.logBillingRun({
        month: currentMonth,
        totalTenants: billingResult.totalTenants,
        billsSent: results.success,
        billsFailed: results.failed,
        skipped: billingResult.skipped,
        failedDetails: results.failedDetails,
        skippedDetails: billingResult.skippedDetails,
      });

      this.lastRun = new Date();
      this.isRunning = false;

      console.log("✅ Monthly billing process completed:", results);

      return {
        success: true,
        ...results,
        skipped: billingResult.skipped,
        month: currentMonth,
      };
    } catch (error) {
      console.error("❌ Error in monthly billing process:", error);
      this.isRunning = false;

      // Notify admins about the error
      await this.notifyAdminsAboutBillingError(error);

      throw error;
    }
  }

  // Create bill message for SMS
  createBillMessage(bill, config) {
    return this.renderBillingTemplate(config.smsBillingTemplate, bill, config);
  }

  createWhatsAppFallbackMessage(bill, config) {
    return this.renderBillingTemplate(
      config.whatsappBillingFallbackTemplate || config.smsBillingTemplate,
      bill,
      config,
    );
  }

  renderBillingTemplate(template, bill, config) {
    const totalDue = bill.rentDue + bill.waterDue + bill.arrearsDue;
    const variables = {
      tenantName: bill.tenantName,
      month: bill.targetMonth,
      unitCode: bill.unitCode,
      rent: this.formatAmount(bill.rentDue),
      water: this.formatAmount(bill.waterDue),
      arrears: this.formatAmount(bill.arrearsDue),
      total: this.formatAmount(totalDue),
      paybill: config.paybillNumber,
      companyName: config.companyName,
    };

    return (template || "").replace(/\{(\w+)\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(variables, key)
        ? variables[key]
        : match;
    });
  }

  // Format amount with commas
  formatAmount(amount) {
    return new Intl.NumberFormat("en-KE").format(amount.toFixed(2));
  }

  // Notify admins about billing run results
  async notifyAdminsAboutBillingRun(results, skippedDetails) {
    try {
      const adminUsers = await pool.query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active = true`,
      );

      let notificationMessage = `Monthly billing completed:\n`;
      notificationMessage += `✅ Success: ${results.success} tenants\n`;
      notificationMessage += `❌ Failed: ${results.failed} tenants\n`;
      notificationMessage += `⏭️ Skipped: ${skippedDetails.length} tenants (advance payment)\n`;

      if (results.failed > 0) {
        notificationMessage += `\nFailed tenants: ${results.failedDetails.map((d) => d.tenantName).join(", ")}`;
      }

      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,
          title: "Monthly Billing Complete",
          message: notificationMessage,
          type: "billing_complete",
          relatedEntityType: "billing_run",
        });
      }

      console.log("👨‍💼 Admins notified about billing run");
    } catch (error) {
      console.error("❌ Error notifying admins:", error);
    }
  }

  // Notify admins about billing error
  async notifyAdminsAboutBillingError(error) {
    try {
      const adminUsers = await pool.query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active = true`,
      );

      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,
          title: "Billing Process Failed",
          message: `Monthly billing process failed: ${error.message}`,
          type: "billing_error",
          relatedEntityType: "system",
        });
      }
    } catch (error) {
      console.error("❌ Error notifying admins about error:", error);
    }
  }

  // Log billing run to database
  async logBillingRun(data) {
    try {
      await pool.query(
        `INSERT INTO billing_runs 
        (month, total_tenants, bills_sent, bills_failed, skipped, 
         failed_details, skipped_details, run_date, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          data.month,
          data.totalTenants,
          data.billsSent,
          data.billsFailed,
          data.skipped,
          JSON.stringify(data.failedDetails),
          JSON.stringify(data.skippedDetails),
        ],
      );

      console.log("📝 Billing run logged to database");
    } catch (error) {
      console.error("❌ Error logging billing run:", error);
    }
  }

  // Start the cron job
  async start() {
    try {
      // Get billing day from config
      const config = await this.getBillingConfig();
      const billingDay = config.billingDay;

      // Schedule job to run at 9:00 AM on billing day
      const cronSchedule = `0 9 ${billingDay} * *`;

      console.log(`⏰ Scheduling billing job for day ${billingDay} at 9:00 AM`);
      console.log(`📅 Cron schedule: ${cronSchedule}`);

      this.job = cron.schedule(
        cronSchedule,
        async () => {
          console.log("⏰ Cron job triggered for monthly billing");
          await this.sendMonthlyBills();
        },
        {
          scheduled: true,
          timezone: "Africa/Nairobi",
        },
      );

      // Process SMS + WhatsApp queues every 5 minutes
      cron.schedule(
        "*/5 * * * *",
        async () => {
          console.log("🔄 Processing messaging queues (SMS + WhatsApp)...");
          try {
            const results = await MessagingService.processQueues();
            console.log("✅ Queue processing results:", {
              sms: results.sms,
              whatsapp: results.whatsapp,
            });
          } catch (queueError) {
            console.error("❌ Queue processing error:", queueError.message);
          }
        },
        {
          scheduled: true,
          timezone: "Africa/Nairobi",
        },
      );

      // ==================== NEW: LEASE EXPIRY CHECK ====================
      // Run daily at 8:00 AM to check for expiring leases
      cron.schedule(
        "0 8 * * *",
        async () => {
          console.log("⏰ Running daily lease expiry check...");
          await this.checkExpiringLeases();
        },
        {
          scheduled: true,
          timezone: "Africa/Nairobi",
        },
      );
      console.log("✅ Scheduled lease expiry check for 8:00 AM daily");

      // ==================== NEW: OVERDUE RENT CHECK ====================
      // Run daily at 9:00 AM to check for overdue rent
      cron.schedule(
        "0 10 * * *",
        async () => {
          console.log("⏰ Running daily overdue rent check...");
          await this.checkOverdueRent();
        },
        {
          scheduled: true,
          timezone: "Africa/Nairobi",
        },
      );
      console.log("✅ Scheduled overdue rent check for 10:00 AM daily");

      // ==================== M-PESA CALLBACK RECONCILIATION ====================
      cron.schedule(
        "*/5 * * * *",
        async () => {
          console.log("🔄 Running M-Pesa callback reconciliation...");
          try {
            const queueResult = await pool.query(
              `SELECT
                 i.id,
                 i.trans_id,
                 i.process_status,
                 i.raw_payload,
                 i.received_at
               FROM mpesa_callback_inbox i
               LEFT JOIN rent_payments rp
                 ON rp.mpesa_receipt_number = i.trans_id
               WHERE rp.id IS NULL
                 AND i.process_status = ANY($1::text[])
               ORDER BY i.received_at ASC
               LIMIT $2`,
              [["pending", "pending_unmatched"], 50],
            );

            const rows = queueResult.rows || [];
            if (rows.length === 0) {
              console.log("✅ M-Pesa reconciliation: no pending callbacks");
              return;
            }

            console.log(
              `📋 M-Pesa reconciliation: ${rows.length} pending callback(s) found`,
            );

            let succeeded = 0;
            let failed = 0;

            for (const row of rows) {
              const transId = row.trans_id;
              const payload =
                row.raw_payload && typeof row.raw_payload === "object"
                  ? row.raw_payload
                  : {};
              if (!payload.TransID) payload.TransID = transId;

              try {
                const paymentController = require("../controllers/paymentController");
                await paymentController.handleMpesaCallback(
                  { body: payload },
                  { status: () => ({ json: () => null }) },
                );

                const latest = await pool.query(
                  `SELECT process_status
                   FROM mpesa_callback_inbox
                   WHERE trans_id = $1
                   ORDER BY updated_at DESC NULLS LAST, received_at DESC
                   LIMIT 1`,
                  [transId],
                );
                const postStatus =
                  latest.rows[0]?.process_status || "unknown";
                if (postStatus === "processed" || postStatus === "duplicate") {
                  succeeded += 1;
                } else {
                  failed += 1;
                }
                console.log(
                  `✅ Reconciled ${transId}: ${postStatus}`,
                );
              } catch (error) {
                failed += 1;
                console.error(
                  `❌ Failed to reconcile ${transId}: ${error.message}`,
                );
              }
            }

            console.log(
              `✅ M-Pesa reconciliation complete: ${succeeded} succeeded, ${failed} failed`,
            );
          } catch (reconcileError) {
            console.error(
              "❌ M-Pesa reconciliation error:",
              reconcileError.message,
            );
          }
        },
        {
          scheduled: true,
          timezone: "Africa/Nairobi",
        },
      );
      console.log("✅ Scheduled M-Pesa callback reconciliation every 5 minutes");

      // ==================== M-PESA CALLBACK HEALTH MONITOR ====================
      cron.schedule(
        "*/15 * * * *",
        async () => {
          console.log("🔍 Running M-Pesa callback health check...");
          try {
            const result = await pool.query(
              `SELECT MAX(received_at) AS last_callback_at FROM mpesa_callback_inbox`,
            );
            const lastCallbackAt = result.rows?.[0]?.last_callback_at;

            if (!lastCallbackAt) {
              console.log("ℹ️ No callbacks recorded yet — skipping health check");
              return;
            }

            const secondsSinceLastCallback = Math.floor(
              (Date.now() - new Date(lastCallbackAt).getTime()) / 1000,
            );
            const hoursSinceLastCallback = Math.floor(secondsSinceLastCallback / 3600);

            if (hoursSinceLastCallback >= 2) {
              console.warn(
                `⚠️ M-Pesa callback gap detected: ${hoursSinceLastCallback} hours since last callback`,
              );

              const pendingCount = await pool.query(
                `SELECT COUNT(*) AS pending FROM mpesa_callback_inbox
                 WHERE process_status IN ('pending', 'failed', 'invalid', 'pending_unmatched')`,
              );
              const pending = parseInt(pendingCount.rows?.[0]?.pending || 0);

              const adminResult = await pool.query(
                "SELECT id FROM users WHERE role = 'admin' AND is_active = true",
              );

              for (const admin of adminResult.rows) {
                await NotificationService.createNotification({
                  userId: admin.id,
                  title: "⚠️ M-Pesa Callback Gap Detected",
                  message:
                    `No M-Pesa callbacks received in ${hoursSinceLastCallback} hours. ` +
                    `Last callback: ${new Date(lastCallbackAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}. ` +
                    `Pending inbox entries: ${pending}. ` +
                    `If you see missing payments, pull your M-Pesa statement and use the reconciliation tool.`,
                  type: "system_alert",
                  relatedEntityType: "mpesa_health",
                });
              }

              console.log(
                `✅ M-Pesa health alert sent to ${adminResult.rows.length} admin(s)`,
              );
            } else {
              console.log(
                `✅ M-Pesa callback health OK — last callback ${Math.floor(secondsSinceLastCallback / 60)} min ago`,
              );
            }
          } catch (healthError) {
            console.error(
              "❌ M-Pesa callback health check error:",
              healthError.message,
            );
          }
        },
        {
          scheduled: true,
          timezone: "Africa/Nairobi",
        },
      );
      console.log("✅ Scheduled M-Pesa callback health monitor every 15 minutes");

      // ==================== RENT ARREARS SYNC ====================
      cron.schedule(
        "0 6 * * *",
        async () => {
          console.log("🔄 Syncing rent arrears for all active allocations...");
          try {
            const result = await pool.query(`
              WITH all_time_rent AS (
                SELECT
                  ta.id AS allocation_id,
                  ta.tenant_id,
                  ta.unit_id,
                  ta.monthly_rent,
                  ta.lease_start_date,
                  ta.lease_end_date,
                  ta.arrears_balance AS current_arrears,
                  COALESCE(
                    (SELECT SUM(rp.amount) FROM rent_payments rp
                     WHERE rp.tenant_id = ta.tenant_id
                     AND rp.unit_id = ta.unit_id
                     AND rp.status = 'completed'
                     AND (
                       COALESCE(rp.allocated_to_rent, 0) +
                       COALESCE(rp.allocated_to_water, 0) +
                       COALESCE(rp.allocated_to_arrears, 0)
                     ) = 0),
                    0
                  ) AS unallocated_payments,
                  COALESCE(
                    (SELECT SUM(rp.allocated_to_arrears) FROM rent_payments rp
                     WHERE rp.tenant_id = ta.tenant_id
                     AND rp.unit_id = ta.unit_id
                     AND rp.status = 'completed'),
                    0
                  ) AS arrears_paid,
                  COALESCE(
                    (SELECT SUM(rp.allocated_to_rent) FROM rent_payments rp
                     WHERE rp.tenant_id = ta.tenant_id
                     AND rp.unit_id = ta.unit_id
                     AND rp.status = 'completed'),
                    0
                  ) AS rent_paid,
                  COALESCE(
                    (SELECT SUM(rp.allocated_to_water) FROM rent_payments rp
                     WHERE rp.tenant_id = ta.tenant_id
                     AND rp.unit_id = ta.unit_id
                     AND rp.status = 'completed'),
                    0
                  ) AS water_paid,
                  COALESCE(
                    (SELECT SUM(wb.amount) FROM water_bills wb
                     WHERE wb.tenant_id = ta.tenant_id
                     AND (wb.unit_id = ta.unit_id OR wb.unit_id IS NULL)),
                    0
                  ) AS total_water_billed
                FROM tenant_allocations ta
                WHERE ta.is_active = true
              ),
              calculated AS (
                SELECT
                  allocation_id,
                  tenant_id,
                  unit_id,
                  monthly_rent,
                  lease_start_date,
                  lease_end_date,
                  current_arrears,
                  unallocated_payments,
                  arrears_paid,
                  rent_paid,
                  water_paid,
                  total_water_billed,
                  GREATEST(
                    (
                      (monthly_rent * GREATEST(
                        EXTRACT(YEAR FROM AGE(NOW(), lease_start_date)) * 12 +
                        EXTRACT(MONTH FROM AGE(NOW(), lease_start_date)) + 1,
                        1
                      )::int)
                      - rent_paid
                      - unallocated_payments
                    ),
                    0
                  ) AS calculated_arrears
                FROM all_time_rent
              )
              UPDATE tenant_allocations ta
              SET arrears_balance = c.calculated_arrears
              FROM calculated c
              WHERE ta.id = c.allocation_id
                AND ABS(ta.arrears_balance - c.calculated_arrears) > 0.01
            `);
            console.log(`✅ Rent arrears synced: ${result.rowCount} allocations updated`);
          } catch (syncError) {
            console.error("❌ Rent arrears sync error:", syncError.message);
          }
        },
        {
          scheduled: true,
          timezone: "Africa/Nairobi",
        },
      );
      console.log("✅ Scheduled rent arrears sync daily at 6:00 AM");

      console.log("✅ Cron service started successfully");
    } catch (error) {
      console.error("❌ Error starting cron service:", error);
      throw error;
    }
  }

  // Stop the cron job
  stop() {
    if (this.job) {
      this.job.stop();
      console.log("🛑 Cron service stopped");
    }
  }

  // Get cron service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      jobActive: this.job ? true : false,
      leaseExpiryCheck: "Daily at 8:00 AM",
      overdueRentCheck: "Daily at 10:00 AM",
      queueProcessing: "Every 5 minutes (SMS + WhatsApp)",
      mpesaReconciliation: "Every 5 minutes",
      mpesaHealthMonitor: "Every 15 minutes",
      rentArrearsSync: "Daily at 6:00 AM",
      whatsappConfigured: WhatsAppService.configured,
    };
  }

  // Manual trigger for testing
  async triggerManualBilling() {
    console.log("🔄 Manual billing triggered");
    return await this.sendMonthlyBills();
  }

  // Manual trigger for testing lease expiry check
  async triggerLeaseExpiryCheck() {
    console.log("🔄 Manual lease expiry check triggered");
    return await this.checkExpiringLeases();
  }

  // Manual trigger for testing overdue rent check
  async triggerOverdueRentCheck() {
    console.log("🔄 Manual overdue rent check triggered");
    return await this.checkOverdueRent();
  }
}

// Create and export singleton instance
const cronService = new CronService();
module.exports = cronService;
