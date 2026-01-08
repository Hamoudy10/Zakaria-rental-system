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
    
    console.log('⏰ Cron Service Initialized');
  }

  // Get billing configuration from admin_settings
  async getBillingConfig() {
    try {
      const result = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = $1`,
        ['billing_day']
      );
      
      const billingDay = result.rows[0]?.setting_value || '28';
      
      // Get paybill number
      const paybillResult = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = $1`,
        ['paybill_number']
      );
      
      const paybillNumber = paybillResult.rows[0]?.setting_value || 'YOUR_PAYBILL_HERE';
      
      // Get company name for SMS
      const companyResult = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = $1`,
        ['company_name']
      );
      
      const companyName = companyResult.rows[0]?.setting_value || 'Rental Management';
      
      return {
        billingDay: parseInt(billingDay, 10),
        paybillNumber,
        companyName
      };
    } catch (error) {
      console.error('❌ Error getting billing config:', error);
      return {
        billingDay: 28,
        paybillNumber: 'YOUR_PAYBILL_HERE',
        companyName: 'Rental Management'
      };
    }
  }

  // Send monthly bills to all tenants
  async sendMonthlyBills() {
    if (this.isRunning) {
      console.log('⚠️ Billing process is already running');
      return;
    }

    try {
      this.isRunning = true;
      console.log('🚀 Starting monthly billing process...');

      // Get current month (format: YYYY-MM)
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      console.log('📅 Processing bills for:', currentMonth);

      // Get billing configuration
      const config = await this.getBillingConfig();
      console.log('⚙️ Billing config:', config);

      // Generate bills for all tenants
      const billingResult = await BillingService.generateMonthlyBills(currentMonth);
      
      console.log('📊 Billing generation complete:', {
        total: billingResult.totalTenants,
        bills: billingResult.billsGenerated,
        skipped: billingResult.skipped
      });

      // Send SMS for each bill
      const results = {
        total: billingResult.bills.length,
        success: 0,
        failed: 0,
        failedDetails: []
      };

      // Rate limiting: 5 SMS per second
      const rateLimitDelay = 200; // 200ms between SMS
      
      for (let i = 0; i < billingResult.bills.length; i++) {
        const bill = billingResult.bills[i];
        
        try {
          console.log(`📱 Sending bill to ${bill.tenantName} (${bill.unitCode})...`);
          
          // Send SMS via queue
          await pool.query(
            `INSERT INTO sms_queue 
            (recipient_phone, message, message_type, status, billing_month, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              bill.tenantPhone,
              this.createBillMessage(bill, config),
              'bill_notification',
              'pending',
              currentMonth
            ]
          );
          
          results.success++;
          console.log(`✅ Queued bill for ${bill.tenantName}`);
          
        } catch (error) {
          console.error(`❌ Failed to queue bill for ${bill.tenantName}:`, error.message);
          results.failed++;
          results.failedDetails.push({
            tenantId: bill.tenantId,
            tenantName: bill.tenantName,
            unitCode: bill.unitCode,
            error: error.message
          });
        }

        // Rate limiting delay
        if (i < billingResult.bills.length - 1) {
          await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
        }
      }

      // Notify admins about the billing run
      await this.notifyAdminsAboutBillingRun(results, billingResult.skippedDetails);

      // Log the billing run
      await this.logBillingRun({
        month: currentMonth,
        totalTenants: billingResult.totalTenants,
        billsSent: results.success,
        billsFailed: results.failed,
        skipped: billingResult.skipped,
        failedDetails: results.failedDetails,
        skippedDetails: billingResult.skippedDetails
      });

      this.lastRun = new Date();
      this.isRunning = false;
      
      console.log('✅ Monthly billing process completed:', results);
      
      return {
        success: true,
        ...results,
        skipped: billingResult.skipped,
        month: currentMonth
      };

    } catch (error) {
      console.error('❌ Error in monthly billing process:', error);
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
    return new Intl.NumberFormat('en-KE').format(amount.toFixed(2));
  }

  // Notify admins about billing run results
  async notifyAdminsAboutBillingRun(results, skippedDetails) {
    try {
      const adminUsers = await pool.query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active = true`
      );

      let notificationMessage = `Monthly billing completed:\n`;
      notificationMessage += `✅ Success: ${results.success} tenants\n`;
      notificationMessage += `❌ Failed: ${results.failed} tenants\n`;
      notificationMessage += `⏭️ Skipped: ${skippedDetails.length} tenants (advance payment)\n`;

      if (results.failed > 0) {
        notificationMessage += `\nFailed tenants: ${results.failedDetails.map(d => d.tenantName).join(', ')}`;
      }

      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,
          title: 'Monthly Billing Complete',
          message: notificationMessage,
          type: 'billing_complete',
          relatedEntityType: 'billing_run'
        });
      }

      console.log('👨‍💼 Admins notified about billing run');

    } catch (error) {
      console.error('❌ Error notifying admins:', error);
    }
  }

  // Notify admins about billing error
  async notifyAdminsAboutBillingError(error) {
    try {
      const adminUsers = await pool.query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active = true`
      );

      for (const admin of adminUsers.rows) {
        await NotificationService.createNotification({
          userId: admin.id,
          title: 'Billing Process Failed',
          message: `Monthly billing process failed: ${error.message}`,
          type: 'billing_error',
          relatedEntityType: 'system'
        });
      }
    } catch (error) {
      console.error('❌ Error notifying admins about error:', error);
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
          JSON.stringify(data.skippedDetails)
        ]
      );
      
      console.log('📝 Billing run logged to database');
    } catch (error) {
      console.error('❌ Error logging billing run:', error);
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
      
      this.job = cron.schedule(cronSchedule, async () => {
        console.log('⏰ Cron job triggered for monthly billing');
        await this.sendMonthlyBills();
      }, {
        scheduled: true,
        timezone: "Africa/Nairobi"
      });
      
      // Also process SMS queue every 5 minutes
      cron.schedule('*/5 * * * *', async () => {
        console.log('🔄 Processing SMS queue...');
        await SMSService.processQueuedSMS();
      }, {
        scheduled: true,
        timezone: "Africa/Nairobi"
      });
      
      console.log('✅ Cron service started successfully');
      
    } catch (error) {
      console.error('❌ Error starting cron service:', error);
      throw error;
    }
  }

  // Stop the cron job
  stop() {
    if (this.job) {
      this.job.stop();
      console.log('🛑 Cron service stopped');
    }
  }

  // Get cron service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      jobActive: this.job ? true : false
    };
  }

  // Manual trigger for testing
  async triggerManualBilling() {
    console.log('🔄 Manual billing triggered');
    return await this.sendMonthlyBills();
  }
}

// Create and export singleton instance
const cronService = new CronService();
module.exports = cronService;