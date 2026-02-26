const pool = require("../config/database");

const ALLOWED_CHANNELS = new Set(["sms", "whatsapp", "both"]);
const ALLOWED_BINDING_CHANNELS = new Set(["sms", "whatsapp", "both", "any"]);

const extractVariables = (text = "") => {
  const matches = text.match(/\{(\w+)\}/g) || [];
  return Array.from(new Set(matches.map((item) => item.slice(1, -1))));
};

const normalizeVariables = (payload = {}) => {
  if (Array.isArray(payload.variables)) {
    return Array.from(
      new Set(payload.variables.map((item) => String(item).trim()).filter(Boolean)),
    );
  }

  const inferred = [
    ...extractVariables(payload.sms_body),
    ...extractVariables(payload.whatsapp_fallback_body),
  ];
  return Array.from(new Set(inferred));
};

const validateTemplatePayload = (payload, isUpdate = false) => {
  const errors = [];
  const channel = payload.channel ? String(payload.channel).toLowerCase() : null;

  if (!isUpdate || payload.template_key !== undefined) {
    if (!payload.template_key || !String(payload.template_key).trim()) {
      errors.push("template_key is required");
    }
  }

  if (!isUpdate || payload.name !== undefined) {
    if (!payload.name || !String(payload.name).trim()) {
      errors.push("name is required");
    }
  }

  if (!isUpdate || payload.channel !== undefined) {
    if (!channel || !ALLOWED_CHANNELS.has(channel)) {
      errors.push("channel must be one of: sms, whatsapp, both");
    }
  }

  const effectiveChannel = channel || null;

  if (
    effectiveChannel &&
    (effectiveChannel === "sms" || effectiveChannel === "both") &&
    (!payload.sms_body || !String(payload.sms_body).trim())
  ) {
    errors.push("sms_body is required when channel is sms or both");
  }

  if (
    effectiveChannel &&
    (effectiveChannel === "whatsapp" || effectiveChannel === "both") &&
    (!payload.whatsapp_template_name ||
      !String(payload.whatsapp_template_name).trim())
  ) {
    errors.push(
      "whatsapp_template_name is required when channel is whatsapp or both",
    );
  }

  return errors;
};

const renderTemplate = (body = "", variables = {}) =>
  String(body || "").replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key])
      : match;
  });

const initializeMessageTemplateSystem = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS message_templates (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          template_key VARCHAR(120) UNIQUE NOT NULL,
          name VARCHAR(180) NOT NULL,
          description TEXT,
          category VARCHAR(60) NOT NULL DEFAULT 'general',
          channel VARCHAR(20) NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'both')),
          sms_body TEXT,
          whatsapp_template_name VARCHAR(150),
          whatsapp_fallback_body TEXT,
          variables JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_active BOOLEAN NOT NULL DEFAULT true,
          is_archived BOOLEAN NOT NULL DEFAULT false,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_templates_category ON message_templates(category);
      CREATE INDEX IF NOT EXISTS idx_message_templates_channel ON message_templates(channel);
      CREATE INDEX IF NOT EXISTS idx_message_templates_active ON message_templates(is_active, is_archived);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS message_template_bindings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          event_key VARCHAR(120) UNIQUE NOT NULL,
          event_name VARCHAR(180) NOT NULL,
          description TEXT,
          template_category VARCHAR(60) NOT NULL DEFAULT 'general',
          channel_preference VARCHAR(20) NOT NULL DEFAULT 'sms'
              CHECK (channel_preference IN ('sms', 'whatsapp', 'both', 'any')),
          default_template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
          allow_agent_override BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_template_bindings_active ON message_template_bindings(is_active);
    `);

    await client.query(
      `INSERT INTO message_templates (
         template_key, name, description, category, channel,
         sms_body, whatsapp_template_name, whatsapp_fallback_body, variables
       ) VALUES
       ('monthly_bill_default', 'Monthly Bill Default', 'Default monthly billing message for cron and manual billing triggers', 'billing', 'both',
        'Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.',
        'monthly_bill_cron',
        'Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.',
        '["tenantName","month","unitCode","rent","water","arrears","total","paybill"]'::jsonb
       ),
       ('balance_reminder_default', 'Balance Reminder Default', 'Default reminder for overdue balances', 'reminder', 'both',
        'Reminder: Dear {tenantName}, your outstanding balance for {month} is KSh {total}. Please pay via paybill {paybill}, Account: {unitCode}.',
        'balance_reminder',
        'Reminder: Dear {tenantName}, your outstanding balance for {month} is KSh {total}. Please pay via paybill {paybill}, Account: {unitCode}.',
        '["tenantName","month","unitCode","total","paybill"]'::jsonb
       ),
       ('payment_confirmation_default', 'Payment Confirmation Default', 'Default payment confirmation sent after successful payment posting', 'payment', 'both',
        'Payment received. Dear {tenantName}, we have received KSh {total} for {unitCode}. Thank you.',
        'payment_confirmation',
        'Payment received. Dear {tenantName}, we have received KSh {total} for {unitCode}. Thank you.',
        '["tenantName","unitCode","total"]'::jsonb
       ),
       ('general_announcement_default', 'General Announcement Default', 'Default template for admin/agent bulk announcements', 'announcement', 'both',
        '{message}',
        'general_announcement',
        '{message}',
        '["message"]'::jsonb
       )
       ON CONFLICT (template_key) DO NOTHING`,
    );

    await client.query(
      `INSERT INTO message_template_bindings (
         event_key, event_name, description, template_category, channel_preference,
         default_template_id, allow_agent_override, is_active
       ) VALUES
       ('monthly_bill_auto', 'Monthly Bill Auto (Cron)', 'Automatic monthly billing run', 'billing', 'both',
         (SELECT id FROM message_templates WHERE template_key = 'monthly_bill_default'), false, true),
       ('agent_manual_billing_trigger', 'Agent Manual Billing Trigger', 'Agent-triggered billing message queue', 'billing', 'both',
         (SELECT id FROM message_templates WHERE template_key = 'monthly_bill_default'), true, true),
       ('balance_reminder_auto', 'Balance Reminder Auto', 'Automated or scheduled balance reminder', 'reminder', 'both',
         (SELECT id FROM message_templates WHERE template_key = 'balance_reminder_default'), false, true),
       ('payment_confirmation_auto', 'Payment Confirmation Auto', 'Payment confirmation after successful payment posting', 'payment', 'both',
         (SELECT id FROM message_templates WHERE template_key = 'payment_confirmation_default'), false, true),
       ('agent_manual_general_trigger', 'Agent Manual General Trigger', 'Agent bulk or targeted custom announcements', 'announcement', 'both',
         (SELECT id FROM message_templates WHERE template_key = 'general_announcement_default'), true, true)
       ON CONFLICT (event_key) DO NOTHING`,
    );

    await client.query("COMMIT");
    console.log("Message template system initialized");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error initializing message template system:", error);
  } finally {
    client.release();
  }
};

const listTemplates = async (req, res) => {
  try {
    const {
      include_archived = "false",
      category,
      channel,
      search,
      is_active,
      limit = 100,
      page = 1,
    } = req.query;
    const includeArchived = include_archived === "true";
    const offset = (Number(page) - 1) * Number(limit);

    const where = ["1=1"];
    const params = [];

    if (!includeArchived) {
      where.push("mt.is_archived = false");
    }
    if (category) {
      params.push(category);
      where.push(`mt.category = $${params.length}`);
    }
    if (channel) {
      params.push(channel);
      where.push(`mt.channel = $${params.length}`);
    }
    if (is_active !== undefined && is_active !== "") {
      params.push(is_active === "true");
      where.push(`mt.is_active = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(mt.name ILIKE $${params.length} OR mt.template_key ILIKE $${params.length} OR COALESCE(mt.description, '') ILIKE $${params.length})`,
      );
    }

    params.push(Number(limit), offset);
    const query = `
      SELECT mt.*
      FROM message_templates mt
      WHERE ${where.join(" AND ")}
      ORDER BY mt.created_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `;

    const countParams = params.slice(0, -2);
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM message_templates mt
      WHERE ${where.join(" AND ")}
    `;

    const [rowsResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    return res.json({
      success: true,
      data: rowsResult.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(countResult.rows[0].total),
      },
    });
  } catch (error) {
    console.error("List templates error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch templates",
      error: error.message,
    });
  }
};

const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM message_templates WHERE id = $1`,
      [id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Get template error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch template",
      error: error.message,
    });
  }
};

const createTemplate = async (req, res) => {
  try {
    const errors = validateTemplatePayload(req.body, false);
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join(", ") });
    }

    const payload = req.body;
    const variables = normalizeVariables(payload);

    const result = await pool.query(
      `INSERT INTO message_templates (
         template_key, name, description, category, channel, sms_body,
         whatsapp_template_name, whatsapp_fallback_body, variables,
         is_active, created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        String(payload.template_key).trim(),
        String(payload.name).trim(),
        payload.description || null,
        payload.category || "general",
        String(payload.channel).toLowerCase(),
        payload.sms_body || null,
        payload.whatsapp_template_name || null,
        payload.whatsapp_fallback_body || null,
        JSON.stringify(variables),
        payload.is_active !== undefined ? !!payload.is_active : true,
        req.user?.id || null,
        req.user?.id || null,
      ],
    );

    return res.status(201).json({
      success: true,
      message: "Template created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create template error:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "template_key already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to create template",
      error: error.message,
    });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const existingResult = await pool.query(
      `SELECT * FROM message_templates WHERE id = $1`,
      [id],
    );
    if (!existingResult.rows.length) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    const merged = { ...existingResult.rows[0], ...req.body };
    const errors = validateTemplatePayload(merged, true);
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join(", ") });
    }

    const variables = normalizeVariables(merged);

    const updated = await pool.query(
      `UPDATE message_templates
       SET template_key = $1,
           name = $2,
           description = $3,
           category = $4,
           channel = $5,
           sms_body = $6,
           whatsapp_template_name = $7,
           whatsapp_fallback_body = $8,
           variables = $9::jsonb,
           is_active = $10,
           updated_by = $11,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12
       RETURNING *`,
      [
        String(merged.template_key).trim(),
        String(merged.name).trim(),
        merged.description || null,
        merged.category || "general",
        String(merged.channel).toLowerCase(),
        merged.sms_body || null,
        merged.whatsapp_template_name || null,
        merged.whatsapp_fallback_body || null,
        JSON.stringify(variables),
        merged.is_active !== undefined ? !!merged.is_active : true,
        req.user?.id || null,
        id,
      ],
    );

    return res.json({
      success: true,
      message: "Template updated successfully",
      data: updated.rows[0],
    });
  } catch (error) {
    console.error("Update template error:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "template_key already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to update template",
      error: error.message,
    });
  }
};

const archiveTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE message_templates
       SET is_archived = true,
           is_active = false,
           updated_by = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [req.user?.id || null, id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return res.json({
      success: true,
      message: "Template archived successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Archive template error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to archive template",
      error: error.message,
    });
  }
};

const restoreTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE message_templates
       SET is_archived = false,
           is_active = true,
           updated_by = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [req.user?.id || null, id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return res.json({
      success: true,
      message: "Template restored successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Restore template error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to restore template",
      error: error.message,
    });
  }
};

const previewTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { variables = {}, channel = "sms" } = req.body;

    const result = await pool.query(
      `SELECT * FROM message_templates WHERE id = $1`,
      [id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    const template = result.rows[0];
    const body =
      channel === "whatsapp"
        ? template.whatsapp_fallback_body || template.sms_body || ""
        : template.sms_body || template.whatsapp_fallback_body || "";

    return res.json({
      success: true,
      data: {
        template_id: template.id,
        channel,
        rendered: renderTemplate(body, variables),
        template,
      },
    });
  } catch (error) {
    console.error("Preview template error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to preview template",
      error: error.message,
    });
  }
};

const listBindings = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*,
              t.template_key AS default_template_key,
              t.name AS default_template_name,
              t.channel AS default_template_channel
       FROM message_template_bindings b
       LEFT JOIN message_templates t ON t.id = b.default_template_id
       ORDER BY b.event_key ASC`,
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("List bindings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch template bindings",
      error: error.message,
    });
  }
};

const updateBinding = async (req, res) => {
  try {
    const { eventKey } = req.params;
    const payload = req.body || {};

    const existing = await pool.query(
      `SELECT * FROM message_template_bindings WHERE event_key = $1`,
      [eventKey],
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: "Binding not found" });
    }

    if (
      payload.channel_preference &&
      !ALLOWED_BINDING_CHANNELS.has(String(payload.channel_preference).toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "channel_preference must be one of: sms, whatsapp, both, any",
      });
    }

    let defaultTemplateId = payload.default_template_id;
    if (defaultTemplateId) {
      const template = await pool.query(
        `SELECT id FROM message_templates WHERE id = $1 AND is_archived = false`,
        [defaultTemplateId],
      );
      if (!template.rows.length) {
        return res.status(400).json({
          success: false,
          message: "default_template_id is invalid or archived",
        });
      }
    } else {
      defaultTemplateId = existing.rows[0].default_template_id;
    }

    const merged = {
      ...existing.rows[0],
      ...payload,
      default_template_id: defaultTemplateId,
    };

    const result = await pool.query(
      `UPDATE message_template_bindings
       SET event_name = $1,
           description = $2,
           template_category = $3,
           channel_preference = $4,
           default_template_id = $5,
           allow_agent_override = $6,
           is_active = $7,
           updated_by = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE event_key = $9
       RETURNING *`,
      [
        merged.event_name,
        merged.description || null,
        merged.template_category || "general",
        String(merged.channel_preference || "sms").toLowerCase(),
        merged.default_template_id || null,
        !!merged.allow_agent_override,
        merged.is_active !== undefined ? !!merged.is_active : true,
        req.user?.id || null,
        eventKey,
      ],
    );

    return res.json({
      success: true,
      message: "Binding updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update binding error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update binding",
      error: error.message,
    });
  }
};

const getTemplatesForEvent = async (req, res) => {
  try {
    const eventKey = req.query.event_key;
    if (!eventKey) {
      return res
        .status(400)
        .json({ success: false, message: "event_key is required" });
    }

    const bindingRes = await pool.query(
      `SELECT * FROM message_template_bindings WHERE event_key = $1 AND is_active = true`,
      [eventKey],
    );
    if (!bindingRes.rows.length) {
      return res.status(404).json({ success: false, message: "Binding not found" });
    }
    const binding = bindingRes.rows[0];

    const filters = [
      `is_archived = false`,
      `is_active = true`,
      `category = $1`,
    ];
    const params = [binding.template_category];

    if (binding.channel_preference !== "any") {
      params.push(binding.channel_preference);
      filters.push(
        `(channel = $${params.length} OR channel = 'both')`,
      );
    }

    const templates = await pool.query(
      `SELECT id, template_key, name, description, category, channel, variables,
              sms_body, whatsapp_template_name, whatsapp_fallback_body
       FROM message_templates
       WHERE ${filters.join(" AND ")}
       ORDER BY CASE WHEN id = $${params.length + 1}::uuid THEN 0 ELSE 1 END, name ASC`,
      [...params, binding.default_template_id || null],
    );

    return res.json({
      success: true,
      data: {
        binding,
        templates: templates.rows,
      },
    });
  } catch (error) {
    console.error("Get templates for event error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch event templates",
      error: error.message,
    });
  }
};

module.exports = {
  initializeMessageTemplateSystem,
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  archiveTemplate,
  restoreTemplate,
  previewTemplate,
  listBindings,
  updateBinding,
  getTemplatesForEvent,
  renderTemplate,
};
