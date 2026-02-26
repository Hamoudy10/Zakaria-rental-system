const pool = require("../config/database");

class MessageTemplateService {
  render(body = "", variables = {}) {
    return String(body || "").replace(/\{(\w+)\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(variables, key)
        ? String(variables[key])
        : match;
    });
  }

  async getBinding(eventKey) {
    const bindingRes = await pool.query(
      `SELECT * FROM message_template_bindings
       WHERE event_key = $1 AND is_active = true`,
      [eventKey],
    );
    return bindingRes.rows[0] || null;
  }

  async getDefaultTemplateForEvent(eventKey) {
    const result = await pool.query(
      `SELECT b.event_key, b.event_name, b.channel_preference, b.allow_agent_override,
              t.*
       FROM message_template_bindings b
       LEFT JOIN message_templates t ON t.id = b.default_template_id
       WHERE b.event_key = $1
         AND b.is_active = true
         AND t.is_archived = false
         AND t.is_active = true`,
      [eventKey],
    );
    return result.rows[0] || null;
  }

  async getAvailableTemplatesForEvent(eventKey) {
    const binding = await this.getBinding(eventKey);
    if (!binding) return { binding: null, templates: [] };

    const params = [binding.template_category];
    let channelFilter = "";
    if (binding.channel_preference !== "any") {
      params.push(binding.channel_preference);
      channelFilter = `AND (channel = $${params.length} OR channel = 'both')`;
    }

    const templatesRes = await pool.query(
      `SELECT id, template_key, name, description, category, channel, variables,
              sms_body, whatsapp_template_name, whatsapp_fallback_body
       FROM message_templates
       WHERE is_active = true
         AND is_archived = false
         AND category = $1
         ${channelFilter}
       ORDER BY CASE WHEN id = $${params.length + 1}::uuid THEN 0 ELSE 1 END, name ASC`,
      [...params, binding.default_template_id || null],
    );

    return {
      binding,
      templates: templatesRes.rows,
    };
  }

  async buildRenderedMessage({
    eventKey,
    channel = "sms",
    variables = {},
    templateIdOverride = null,
  }) {
    let template = null;

    if (templateIdOverride) {
      const tRes = await pool.query(
        `SELECT * FROM message_templates
         WHERE id = $1 AND is_active = true AND is_archived = false`,
        [templateIdOverride],
      );
      template = tRes.rows[0] || null;
    } else {
      template = await this.getDefaultTemplateForEvent(eventKey);
    }

    if (!template) return null;

    const body =
      channel === "whatsapp"
        ? template.whatsapp_fallback_body || template.sms_body || ""
        : template.sms_body || template.whatsapp_fallback_body || "";

    return {
      template,
      rendered: this.render(body, variables),
    };
  }
}

module.exports = new MessageTemplateService();
