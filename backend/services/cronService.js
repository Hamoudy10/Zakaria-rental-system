const cron = require('node-cron');
const pool = require('../config/database');
const BillingService = require('./billingService');
const SMSService = require('./smsService');
const NotificationService = require('./notificationService');

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
      const result = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = $1`,
        ["billing_day"],
      );

      const billingDay = result.rows[0]?.setting_value || "28";

      // Get paybill number
      const paybillResult = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = $1`,
        ["paybill_number"],
      );

      const paybillNumber =
        paybillResult.rows[0]?.setting_value || "YOUR_PAYBILL_HERE";

      // Get company name for SMS
      const companyResult = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = $1`,
        ["company_name"],
      );

      const companyName =
        companyResult.rows[0]?.setting_value || "Rental Management";

      return {
        billingDay: parseInt(billingDay, 10),
        paybillNumber,
        companyName,
      };
    } catch (error) {
      console.error("❌ Error getting billing config:", error);
      return {
        billingDay: 28,
        paybillNumber: "YOUR_PAYBILL_HERE",
        companyName: "Rental Management",
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
            (SELECT SUM(amount) FROM rent_payments 
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
      console.log("⚙️ Billing config:", config);

      // Generate bills for all tenants
      const billingResult =
        await BillingService.generateMonthlyBills(currentMonth);

      console.log("📊 Billing generation complete:", {
        total: billingResult.totalTenants,
        bills: billingResult.billsGenerated,
        skipped: billingResult.skipped,
      });

      // Send SMS for each bill
      const results = {
        total: billingResult.bills.length,
        success: 0,
        failed: 0,
        failedDetails: [],
      };

      // Rate limiting: 5 SMS per second
      const rateLimitDelay = 200; // 200ms between SMS

      for (let i = 0; i < billingResult.bills.length; i++) {
        const bill = billingResult.bills[i];

        try {
          console.log(
            `📱 Sending bill to ${bill.tenantName} (${bill.unitCode})...`,
          );

          // Send SMS via queue
          await pool.query(
            `INSERT INTO sms_queue 
            (recipient_phone, message, message_type, status, billing_month, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              bill.tenantPhone,
              this.createBillMessage(bill, config),
              "bill_notification",
              "pending",
              currentMonth,
            ],
          );

          results.success++;
          console.log(`✅ Queued bill for ${bill.tenantName}`);
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
    const totalDue = bill.rentDue + bill.waterDue + bill.arrearsDue;

    let message = `Hello ${bill.tenantName},\n`;
    message += `Your ${bill.targetMonth} bill for ${bill.unitCode}:\n\n`;

    if (bill.rentDue > 0) {
      message += `🏠 Rent: KSh ${this.formatAmount(bill.rentDue)}\n`;
    }

    if (bill.waterDue > 0) {
      message += `🚰 Water: KSh ${this.formatAmount(bill.waterDue)}\n`;
    }

    if (bill.arrearsDue > 0) {
      message += `📝 Arrears: KSh ${this.formatAmount(bill.arrearsDue)}\n`;
    }

    message += `\n💰 Total Due: KSh ${this.formatAmount(totalDue)}\n`;
    message += `📱 Pay via paybill ${config.paybillNumber}\n`;
    message += `Account: ${bill.unitCode}\n\n`;
    message += `Due by end of month.\n`;
    message += `- ${config.companyName}`;

    return message;
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

      // Also process SMS queue every 5 minutes
      cron.schedule(
        "*/5 * * * *",
        async () => {
          console.log("🔄 Processing SMS queue...");
          await SMSService.processQueuedSMS();
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
      leaseExpiryCheck: "Daily at 8:00 AM", // NEW
      overdueRentCheck: "Daily at 10:00 AM"
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