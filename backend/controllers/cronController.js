const cronService = require('../services/cronService');
const pool = require('../config/database');

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

// Helper function to check if agent manages property
const agentManagesProperty = async (agentId, propertyId) => {
  const res = await pool.query(
    `SELECT 1 FROM agent_property_assignments 
     WHERE agent_id = $1 AND property_id = $2 AND is_active = true`,
    [agentId, propertyId]
  );
  return res.rows.length > 0;
};

// Helper function to get agent's assigned properties
const getAgentProperties = async (agentId) => {
  const res = await pool.query(
    `SELECT property_id FROM agent_property_assignments 
     WHERE agent_id = $1 AND is_active = true`,
    [agentId]
  );
  return res.rows.map(row => row.property_id);
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

// MODIFIED: Get failed SMS with agent filtering
const getFailedSMS = async (req, res) => {
  try {
    const { billing_month, property_id } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    let query = `
      SELECT sq.*, 
             t.first_name, 
             t.last_name,
             pu.unit_code,
             p.name as property_name
      FROM sms_queue sq
      LEFT JOIN tenants t ON sq.recipient_phone = t.phone_number
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE sq.status = 'failed' 
        AND sq.message_type = 'bill_notification'
    `;
    
    const params = [];
    
    // Add agent property filtering for non-admin users
    if (userRole !== 'admin') {
      query += ` AND p.id IN (
        SELECT property_id FROM agent_property_assignments 
        WHERE agent_id = $${params.length + 1} AND is_active = true
      )`;
      params.push(userId);
    }
    
    // Add property filter if specified
    if (property_id) {
      // Verify agent has access to this property
      if (userRole !== 'admin') {
        const hasAccess = await agentManagesProperty(userId, property_id);
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this property'
          });
        }
      }
      query += ` AND p.id = $${params.length + 1}`;
      params.push(property_id);
    }
    
    if (billing_month) {
      query += ` AND sq.billing_month = $${params.length + 1}`;
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

// MODIFIED: Retry failed SMS with agent property validation
const retryFailedSMS = async (req, res) => {
  try {
    const { sms_ids, billing_month, property_id } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Build base query with agent filtering
    let query = `
      UPDATE sms_queue 
      SET status = 'pending',
          attempts = 0,
          error_message = NULL,
          last_attempt_at = NULL
      FROM tenants t
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE sms_queue.status = 'failed' 
        AND sms_queue.message_type = 'bill_notification'
        AND sms_queue.recipient_phone = t.phone_number
    `;
    
    const params = [];
    
    // Add agent property filtering for non-admin users
    if (userRole !== 'admin') {
      query += ` AND p.id IN (
        SELECT property_id FROM agent_property_assignments 
        WHERE agent_id = $${params.length + 1} AND is_active = true
      )`;
      params.push(userId);
    }
    
    // Add property filter if specified
    if (property_id) {
      if (userRole !== 'admin') {
        const hasAccess = await agentManagesProperty(userId, property_id);
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this property'
          });
        }
      }
      query += ` AND p.id = $${params.length + 1}`;
      params.push(property_id);
    }
    
    // Add SMS IDs or billing month filter
    if (sms_ids && sms_ids.length > 0) {
      query += ` AND sms_queue.id = ANY($${params.length + 1})`;
      params.push(sms_ids);
    } else if (billing_month) {
      query += ` AND sms_queue.billing_month = $${params.length + 1}`;
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

// NEW FUNCTION: Agent-triggered billing SMS
const triggerAgentBillingSMS = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { month, property_id, include_missing_water_bills = false } = req.body;
    
    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'Month parameter required (YYYY-MM)'
      });
    }
    
    // Get agent's assigned properties
    const agentProperties = await getAgentProperties(agentId);
    
    if (agentProperties.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No properties assigned to you. Contact admin to assign properties.'
      });
    }
    
    // Filter by specific property if provided
    let targetProperties = agentProperties;
    if (property_id) {
      if (!agentProperties.includes(property_id)) {
        return res.status(403).json({
          success: false,
          message: 'You are not assigned to this property'
        });
      }
      targetProperties = [property_id];
    }
    
    // Check for missing water bills
    const missingBillsQuery = `
      SELECT 
        ta.tenant_id,
        t.first_name,
        t.last_name,
        t.phone_number,
        pu.unit_code,
        p.name as property_name
      FROM tenant_allocations ta
      JOIN tenants t ON ta.tenant_id = t.id
      JOIN property_units pu ON ta.unit_id = pu.id
      JOIN properties p ON pu.property_id = p.id
      WHERE ta.is_active = true
        AND p.id = ANY($1)
        AND NOT EXISTS (
          SELECT 1 FROM water_bills wb 
          WHERE wb.tenant_id = ta.tenant_id 
          AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', $2::date)
        )
      ORDER BY p.name, pu.unit_code
    `;
    
    const missingBillsResult = await pool.query(missingBillsQuery, [targetProperties, `${month}-01`]);
    const missingBills = missingBillsResult.rows;
    
    // If there are missing bills and agent didn't confirm to proceed
    if (missingBills.length > 0 && !include_missing_water_bills) {
      return res.json({
        success: false,
        requires_confirmation: true,
        message: `${missingBills.length} tenant(s) have no water bills for ${month}.`,
        data: {
          missing_count: missingBills.length,
          missing_tenants: missingBills.map(t => ({
            name: `${t.first_name} ${t.last_name}`,
            unit: t.unit_code,
            property: t.property_name
          }))
        }
      });
    }
    
    // Get billing configuration
    const configResult = await pool.query(
      `SELECT 
        (SELECT setting_value FROM admin_settings WHERE setting_key = 'paybill_number') as paybill_number,
        (SELECT setting_value FROM admin_settings WHERE setting_key = 'company_name') as company_name`
    );
    
    const config = {
      paybillNumber: configResult.rows[0]?.paybill_number || 'YOUR_PAYBILL',
      companyName: configResult.rows[0]?.company_name || 'Rental Management'
    };
    
    // Get all active tenants in target properties
    const tenantsQuery = `
      SELECT 
        ta.tenant_id,
        t.first_name,
        t.last_name,
        t.phone_number,
        pu.unit_code,
        pu.id as unit_id,
        p.name as property_name,
        ta.monthly_rent,
        ta.arrears_balance,
        COALESCE(wb.amount, 0) as water_amount
      FROM tenant_allocations ta
      JOIN tenants t ON ta.tenant_id = t.id
      JOIN property_units pu ON ta.unit_id = pu.id
      JOIN properties p ON pu.property_id = p.id
      LEFT JOIN water_bills wb ON wb.tenant_id = ta.tenant_id 
        AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', $2::date)
      WHERE ta.is_active = true
        AND p.id = ANY($1)
      ORDER BY p.name, pu.unit_code
    `;
    
    const tenantsResult = await pool.query(tenantsQuery, [targetProperties, `${month}-01`]);
    const tenants = tenantsResult.rows;
    
    if (tenants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active tenants found in your assigned properties'
      });
    }
    
    // Queue SMS for each tenant
    const results = {
      total: tenants.length,
      queued: 0,
      failed: 0,
      details: []
    };
    
    for (const tenant of tenants) {
      try {
        // Calculate total due
        const rentDue = tenant.monthly_rent;
        const waterDue = tenant.water_amount;
        const arrearsDue = tenant.arrears_balance || 0;
        const totalDue = rentDue + waterDue + arrearsDue;
        
        // Create bill message
        const message = `Hello ${tenant.first_name} ${tenant.last_name},\n` +
          `Your ${month} bill for ${tenant.unit_code}:\n\n` +
          (rentDue > 0 ? `🏠 Rent: KSh ${rentDue.toLocaleString()}\n` : '') +
          (waterDue > 0 ? `🚰 Water: KSh ${waterDue.toLocaleString()}\n` : '') +
          (arrearsDue > 0 ? `📝 Arrears: KSh ${arrearsDue.toLocaleString()}\n` : '') +
          `\n💰 Total Due: KSh ${totalDue.toLocaleString()}\n` +
          `📱 Pay via paybill ${config.paybillNumber}\n` +
          `Account: ${tenant.unit_code}\n\n` +
          `Due by end of month.\n` +
          `- ${config.companyName}`;
        
        // Queue SMS
        await pool.query(
          `INSERT INTO sms_queue 
          (recipient_phone, message, message_type, status, billing_month, created_at, agent_id)
          VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
          [
            tenant.phone_number,
            message,
            'bill_notification',
            'pending',
            month,
            agentId
          ]
        );
        
        results.queued++;
        results.details.push({
          tenant: `${tenant.first_name} ${tenant.last_name}`,
          unit: tenant.unit_code,
          status: 'queued',
          total_due: totalDue
        });
        
      } catch (error) {
        console.error(`❌ Failed to queue SMS for ${tenant.first_name}:`, error.message);
        results.failed++;
        results.details.push({
          tenant: `${tenant.first_name} ${tenant.last_name}`,
          unit: tenant.unit_code,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Billing SMS triggered for ${results.queued} tenant(s)`,
      data: {
        ...results,
        property_count: targetProperties.length,
        month: month
      }
    });
    
  } catch (error) {
    console.error('❌ Error triggering agent billing SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger billing SMS',
      error: error.message
    });
  }
};

// Add to cronController.js
const getSMSHistory = async (req, res) => {
  try {
    const { status, start_date, end_date, property_id } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    let query = `
      SELECT sq.*, 
             t.first_name, 
             t.last_name,
             pu.unit_code,
             p.name as property_name
      FROM sms_queue sq
      LEFT JOIN tenants t ON sq.recipient_phone = t.phone_number
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Add agent property filtering for non-admin users
    if (userRole !== 'admin') {
      query += ` AND p.id IN (
        SELECT property_id FROM agent_property_assignments 
        WHERE agent_id = $${params.length + 1} AND is_active = true
      )`;
      params.push(userId);
    }
    
    // Add filters
    if (status) {
      query += ` AND sq.status = $${params.length + 1}`;
      params.push(status);
    }
    
    if (property_id) {
      // Verify agent has access to this property
      if (userRole !== 'admin') {
        const hasAccess = await agentManagesProperty(userId, property_id);
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this property'
          });
        }
      }
      query += ` AND p.id = $${params.length + 1}`;
      params.push(property_id);
    }
    
    if (start_date) {
      query += ` AND sq.created_at >= $${params.length + 1}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND sq.created_at <= $${params.length + 1}`;
      params.push(end_date);
    }
    
    query += ` ORDER BY sq.created_at DESC LIMIT 100`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error getting SMS history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SMS history',
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
  retryFailedSMS,
  getSMSHistory,
  triggerAgentBillingSMS
};