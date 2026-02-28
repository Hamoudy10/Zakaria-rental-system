// backend/controllers/cronController.js
const cronService = require("../services/cronService");
const pool = require("../config/database");
const MessageTemplateService = require("../services/messageTemplateService");

// Start cron service
const startCronService = async (req, res) => {
  try {
    await cronService.start();
    res.json({
      success: true,
      message: "Cron service started successfully",
      status: cronService.getStatus(),
    });
  } catch (error) {
    console.error("❌ Error starting cron service:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start cron service",
      error: error.message,
    });
  }
};

// Stop cron service
const stopCronService = async (req, res) => {
  try {
    cronService.stop();
    res.json({
      success: true,
      message: "Cron service stopped successfully",
      status: cronService.getStatus(),
    });
  } catch (error) {
    console.error("❌ Error stopping cron service:", error);
    res.status(500).json({
      success: false,
      message: "Failed to stop cron service",
      error: error.message,
    });
  }
};

// Helper function to check if agent manages property
const agentManagesProperty = async (agentId, propertyId) => {
  const res = await pool.query(
    `SELECT 1 FROM agent_property_assignments 
     WHERE agent_id = $1 AND property_id = $2 AND is_active = true`,
    [agentId, propertyId],
  );
  return res.rows.length > 0;
};

// Helper function to get agent's assigned properties
const getAgentProperties = async (agentId) => {
  const res = await pool.query(
    `SELECT property_id FROM agent_property_assignments 
     WHERE agent_id = $1 AND is_active = true`,
    [agentId],
  );
  return res.rows.map((row) => row.property_id);
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-KE").format(Number(value || 0).toFixed(2));

const renderBillingTemplate = (template, payload) => {
  return (template || "").replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(payload, key)
      ? payload[key]
      : match;
  });
};

// Trigger billing manually
const triggerManualBilling = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const result = await cronService.triggerManualBilling();

    res.json({
      success: true,
      message: "Manual billing triggered successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Error triggering manual billing:", error);
    res.status(500).json({
      success: false,
      message: "Failed to trigger manual billing",
      error: error.message,
    });
  }
};

// Get cron service status
const getCronStatus = async (req, res) => {
  try {
    const status = cronService.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error("❌ Error getting cron status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get cron status",
      error: error.message,
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
      const countResult = await client.query(
        "SELECT COUNT(*) as total FROM billing_runs",
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT * FROM billing_runs ORDER BY run_date DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      res.json({
        success: true,
        data: {
          billingRuns: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("❌ Error getting billing history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get billing history",
      error: error.message,
    });
  }
};

// Get failed SMS with agent filtering
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

    if (userRole !== "admin") {
      query += ` AND p.id IN (
        SELECT property_id FROM agent_property_assignments 
        WHERE agent_id = $${params.length + 1} AND is_active = true
      )`;
      params.push(userId);
    }

    if (property_id) {
      if (userRole !== "admin") {
        const hasAccess = await agentManagesProperty(userId, property_id);
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: "You do not have access to this property",
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
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("❌ Error getting failed SMS:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get failed SMS",
      error: error.message,
    });
  }
};

// Retry failed SMS
const retryFailedSMS = async (req, res) => {
  try {
    const { sms_ids, billing_month, property_id } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

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

    if (userRole !== "admin") {
      query += ` AND p.id IN (
        SELECT property_id FROM agent_property_assignments 
        WHERE agent_id = $${params.length + 1} AND is_active = true
      )`;
      params.push(userId);
    }

    if (property_id) {
      if (userRole !== "admin") {
        const hasAccess = await agentManagesProperty(userId, property_id);
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: "You do not have access to this property",
          });
        }
      }
      query += ` AND p.id = $${params.length + 1}`;
      params.push(property_id);
    }

    if (sms_ids && sms_ids.length > 0) {
      query += ` AND sms_queue.id = ANY($${params.length + 1})`;
      params.push(sms_ids);
    } else if (billing_month) {
      query += ` AND sms_queue.billing_month = $${params.length + 1}`;
      params.push(billing_month);
    } else {
      return res.status(400).json({
        success: false,
        message: "Provide either sms_ids or billing_month",
      });
    }

    const result = await pool.query(query, params);
    res.json({
      success: true,
      message: `${result.rowCount} SMS queued for retry`,
    });
  } catch (error) {
    console.error("❌ Error retrying failed SMS:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retry SMS",
      error: error.message,
    });
  }
};

// Trigger Agent Billing SMS
const triggerAgentBillingSMS = async (req, res) => {
  try {
    const agentId = req.user.id;
    const {
      month,
      property_id,
      include_missing_water_bills = false,
      template_id,
    } = req.body;
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    if (!month) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Month parameter required (YYYY-MM)",
        });
    }

    const agentProperties = await getAgentProperties(agentId);
    if (agentProperties.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No properties assigned to you." });
    }

    let targetProperties = agentProperties;
    if (property_id) {
      if (!agentProperties.includes(property_id)) {
        return res
          .status(403)
          .json({ success: false, message: "Access denied to this property" });
      }
      targetProperties = [property_id];
    }

    const missingBillsQuery = `
      SELECT ta.tenant_id, t.first_name, t.last_name, pu.unit_code, p.name as property_name
      FROM tenant_allocations ta
      JOIN tenants t ON ta.tenant_id = t.id
      JOIN property_units pu ON ta.unit_id = pu.id
      JOIN properties p ON pu.property_id = p.id
      WHERE ta.is_active = true AND p.id = ANY($1)
        AND NOT EXISTS (
          SELECT 1 FROM water_bills wb 
          WHERE wb.tenant_id = ta.tenant_id 
          AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', $2::date)
        )
      ORDER BY p.name, pu.unit_code
    `;

    const missingBillsResult = await pool.query(missingBillsQuery, [
      targetProperties,
      `${month}-01`,
    ]);
    const missingBills = missingBillsResult.rows;

    if (missingBills.length > 0 && !include_missing_water_bills) {
      return res.json({
        success: false,
        requires_confirmation: true,
        message: `${missingBills.length} tenant(s) have no water bills for ${month}.`,
        data: {
          missing_count: missingBills.length,
          missing_tenants: missingBills.map((t) => ({
            name: `${t.first_name} ${t.last_name}`,
            unit: t.unit_code,
            property: t.property_name,
          })),
        },
      });
    }

    const configResult = await pool.query(
      `SELECT setting_key, setting_value
       FROM admin_settings
       WHERE setting_key = ANY($1)`,
      [[
        "paybill_number",
        "company_name",
        "sms_billing_template",
      ]],
    );

    const configMap = Object.fromEntries(
      configResult.rows.map((row) => [row.setting_key, row.setting_value]),
    );

    const config = {
      paybillNumber: configMap.paybill_number || "YOUR_PAYBILL",
      companyName: configMap.company_name || "Rental Management",
      smsBillingTemplate:
        configMap.sms_billing_template ||
        "Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.",
    };
    const binding = await MessageTemplateService.getBinding(
      "agent_manual_billing_trigger",
    );
    const useTemplateId =
      template_id &&
      (req.user.role === "admin" || binding?.allow_agent_override === true)
        ? template_id
        : null;

    const tenantsQuery = `
      SELECT 
        ta.tenant_id, t.first_name, t.last_name, t.phone_number, pu.unit_code,
        ta.monthly_rent, ta.arrears_balance, COALESCE(wb.amount, 0) as water_amount
      FROM tenant_allocations ta
      JOIN tenants t ON ta.tenant_id = t.id
      JOIN property_units pu ON ta.unit_id = pu.id
      JOIN properties p ON pu.property_id = p.id
      LEFT JOIN water_bills wb ON wb.tenant_id = ta.tenant_id 
        AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', $2::date)
      WHERE ta.is_active = true AND p.id = ANY($1)
    `;

    const tenantsResult = await pool.query(tenantsQuery, [
      targetProperties,
      `${targetMonth}-01`,
    ]);
    const tenants = tenantsResult.rows;

    if (tenants.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No active tenants found" });
    }

    const results = {
      total: tenants.length,
      queued: 0,
      failed: 0,
      details: [],
    };

    for (const tenant of tenants) {
      try {
        const totalDue =
          Number(tenant.monthly_rent || 0) +
          Number(tenant.water_amount || 0) +
          Number(tenant.arrears_balance || 0);

        let message = renderBillingTemplate(config.smsBillingTemplate, {
          tenantName: `${tenant.first_name} ${tenant.last_name}`.trim(),
          month: targetMonth,
          unitCode: tenant.unit_code,
          rent: formatCurrency(tenant.monthly_rent),
          water: formatCurrency(tenant.water_amount),
          arrears: formatCurrency(tenant.arrears_balance),
          total: formatCurrency(totalDue),
          paybill: config.paybillNumber,
          companyName: config.companyName,
        });

        const rendered = await MessageTemplateService.buildRenderedMessage({
          eventKey: "agent_manual_billing_trigger",
          channel: "sms",
          templateIdOverride: useTemplateId,
          variables: {
            tenantName: `${tenant.first_name} ${tenant.last_name}`.trim(),
            month: targetMonth,
            unitCode: tenant.unit_code,
            rent: formatCurrency(tenant.monthly_rent),
            water: formatCurrency(tenant.water_amount),
            arrears: formatCurrency(tenant.arrears_balance),
            total: formatCurrency(totalDue),
            paybill: config.paybillNumber,
            companyName: config.companyName,
          },
        });
        if (rendered?.rendered) {
          message = rendered.rendered;
        }

        await pool.query(
          `INSERT INTO sms_queue (recipient_phone, message, message_type, status, billing_month, created_at, agent_id)
           VALUES ($1, $2, 'bill_notification', 'pending', $3, NOW(), $4)`,
          [tenant.phone_number, message, targetMonth, agentId],
        );
        results.queued++;
      } catch (error) {
        results.failed++;
        console.error(`Failed to queue SMS for ${tenant.first_name}:`, error);
      }
    }

    res.json({
      success: true,
      message: `Billing SMS triggered for ${results.queued} tenant(s)`,
      data: {
        ...results,
        template_id_used: useTemplateId || null,
      },
    });
  } catch (error) {
    console.error("❌ Error triggering agent billing SMS:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to trigger billing SMS",
        error: error.message,
      });
  }
};

// Get SMS History with robust filtering
const getSMSHistory = async (req, res) => {
  console.log("📥 getSMSHistory called with query params:", req.query);
  console.log("🔐 User:", req.user.id, "Role:", req.user.role);

  try {
    const {
      status,
      start_date,
      end_date,
      property_id,
      page = 1,
      limit = 50,
    } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    const offset = (page - 1) * limit;

    // Build WHERE clause and params separately
    let whereConditions = ["1=1"];
    const params = [];

    // Add agent property filtering for non-admin users
    // CRITICAL FIX: Allow agents to see their OWN sent SMS (agent_id = userId)
    // even if the property link is broken (e.g. tenant deleted or moved)
    if (userRole !== "admin") {
      whereConditions.push(`(
        p.id IN (
          SELECT property_id FROM agent_property_assignments 
          WHERE agent_id = $${params.length + 1}::uuid AND is_active = true
        ) OR sq.agent_id = $${params.length + 1}::uuid
      )`);
      params.push(userId); // Used twice
    }

    // Add filters
    if (status) {
      whereConditions.push(`sq.status = $${params.length + 1}`);
      params.push(status);
    }

    if (property_id) {
      whereConditions.push(`p.id = $${params.length + 1}::uuid`);
      params.push(property_id);
    }

    if (start_date) {
      whereConditions.push(`sq.created_at >= $${params.length + 1}`);
      params.push(start_date);
    }

    if (end_date) {
      whereConditions.push(`sq.created_at <= $${params.length + 1}`);
      params.push(end_date);
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    // Count query
    const countQuery = `
      SELECT COUNT(DISTINCT sq.id) as count
      FROM sms_queue sq
      LEFT JOIN tenants t
        ON RIGHT(regexp_replace(COALESCE(sq.recipient_phone, ''), '\\D', '', 'g'), 9) =
           RIGHT(regexp_replace(COALESCE(t.phone_number, ''), '\\D', '', 'g'), 9)
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      ${whereClause}
    `;

    console.log("📊 Count query:", countQuery);
    console.log("📊 Query params:", params);

    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    console.log("✅ Total count:", totalCount);

    // Main query
    const mainQuery = `
      SELECT 
        sq.id,
        sq.recipient_phone,
        sq.message,
        sq.message_type,
        sq.status,
        sq.attempts,
        sq.last_attempt_at,
        sq.sent_at,
        sq.created_at,
        t.first_name, 
        t.last_name,
        pu.unit_code,
        p.name as property_name
      FROM sms_queue sq
      LEFT JOIN tenants t
        ON RIGHT(regexp_replace(COALESCE(sq.recipient_phone, ''), '\\D', '', 'g'), 9) =
           RIGHT(regexp_replace(COALESCE(t.phone_number, ''), '\\D', '', 'g'), 9)
      LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
      LEFT JOIN property_units pu ON ta.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      ${whereClause}
      ORDER BY sq.created_at DESC 
      LIMIT $${params.length + 1} 
      OFFSET $${params.length + 2}
    `;

    const paginationParams = [...params, limit, offset];
    const result = await pool.query(mainQuery, paginationParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error getting SMS history:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to get SMS history",
        error: error.message,
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
  triggerAgentBillingSMS,
};
