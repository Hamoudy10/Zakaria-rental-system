const cronService = require('../services/cronService');

// Start cron service
const startCronService = async (req, res) => {
  try {
    await cronService.start();
    
    res.json({
      success: true,
      message: 'Cron service started successfully',
      status: cronService.getStatus()
    });
  } catch (error) {
    console.error('❌ Error starting cron service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start cron service',
      error: error.message
    });
  }
};

// Stop cron service
const stopCronService = async (req, res) => {
  try {
    cronService.stop();
    
    res.json({
      success: true,
      message: 'Cron service stopped successfully',
      status: cronService.getStatus()
    });
  } catch (error) {
    console.error('❌ Error stopping cron service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop cron service',
      error: error.message
    });
  }
};

// Trigger billing manually
const triggerManualBilling = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const result = await cronService.triggerManualBilling();
    
    res.json({
      success: true,
      message: 'Manual billing triggered successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error triggering manual billing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger manual billing',
      error: error.message
    });
  }
};

// Get cron service status
const getCronStatus = async (req, res) => {
  try {
    const status = cronService.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('❌ Error getting cron status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cron status',
      error: error.message
    });
  }
};

// Get billing run history
const getBillingHistory = async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    const client = await pool.connect();
    
    try {
      // Get total count
      const countResult = await client.query(
        'SELECT COUNT(*) as total FROM billing_runs'
      );
      const total = parseInt(countResult.rows[0].total);
      
      // Get billing runs
      const result = await client.query(
        `SELECT * FROM billing_runs 
         ORDER BY run_date DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      res.json({
        success: true,
        data: {
          billingRuns: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Error getting billing history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get billing history',
      error: error.message
    });
  }
};

// Get failed SMS from queue for manual retry
const getFailedSMS = async (req, res) => {
  try {
    const { billing_month } = req.query;
    
    let query = `
      SELECT sq.*, 
             t.first_name, 
             t.last_name,
             pu.unit_code
      FROM sms_queue sq
      LEFT JOIN tenants t ON sq.recipient_phone = t.phone_number
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      WHERE sq.status = 'failed' 
        AND sq.message_type = 'bill_notification'
    `;
    
    const params = [];
    
    if (billing_month) {
      query += ` AND sq.billing_month = $1`;
      params.push(billing_month);
    }
    
    query += ` ORDER BY sq.created_at DESC LIMIT 100`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error getting failed SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get failed SMS',
      error: error.message
    });
  }
};

// Retry failed SMS
const retryFailedSMS = async (req, res) => {
  try {
    const { sms_ids, billing_month } = req.body;
    
    let query = `
      UPDATE sms_queue 
      SET status = 'pending',
          attempts = 0,
          error_message = NULL,
          last_attempt_at = NULL
      WHERE status = 'failed' 
        AND message_type = 'bill_notification'
    `;
    
    const params = [];
    
    if (sms_ids && sms_ids.length > 0) {
      query += ` AND id = ANY($1)`;
      params.push(sms_ids);
    } else if (billing_month) {
      query += ` AND billing_month = $1`;
      params.push(billing_month);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Provide either sms_ids or billing_month'
      });
    }
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      message: `${result.rowCount} SMS queued for retry`
    });
    
  } catch (error) {
    console.error('❌ Error retrying failed SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry SMS',
      error: error.message
    });
  }
};

module.exports = {
  startCronService,
  stopCronService,
  triggerManualBilling,
  getCronStatus,
  getBillingHistory,
  getFailedSMS,
  retryFailedSMS
};