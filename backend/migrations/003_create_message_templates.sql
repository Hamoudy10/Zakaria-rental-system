-- Messaging Template Library + Event Bindings
-- Phase 1 foundation for admin-managed SMS/WhatsApp templates

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
);

CREATE INDEX IF NOT EXISTS idx_message_templates_category ON message_templates(category);
CREATE INDEX IF NOT EXISTS idx_message_templates_channel ON message_templates(channel);
CREATE INDEX IF NOT EXISTS idx_message_templates_active ON message_templates(is_active, is_archived);

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
);

CREATE INDEX IF NOT EXISTS idx_template_bindings_active ON message_template_bindings(is_active);

-- Seed default templates
INSERT INTO message_templates (
    template_key, name, description, category, channel,
    sms_body, whatsapp_template_name, whatsapp_fallback_body, variables
)
VALUES
(
    'monthly_bill_default',
    'Monthly Bill Default',
    'Default monthly billing message for cron and manual billing triggers',
    'billing',
    'both',
    'Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.',
    'monthly_bill_cron',
    'Hello {tenantName}, your {month} bill for {unitCode}: Rent: KSh {rent}, Water: KSh {water}, Arrears: KSh {arrears}. Total: KSh {total}. Pay via paybill {paybill}, Account: {unitCode}. Due by end of month.',
    '["tenantName","month","unitCode","rent","water","arrears","total","paybill"]'::jsonb
),
(
    'balance_reminder_default',
    'Balance Reminder Default',
    'Default reminder for overdue balances',
    'reminder',
    'both',
    'Reminder: Dear {tenantName}, your outstanding balance for {month} is KSh {total}. Please pay via paybill {paybill}, Account: {unitCode}.',
    'balance_reminder',
    'Reminder: Dear {tenantName}, your outstanding balance for {month} is KSh {total}. Please pay via paybill {paybill}, Account: {unitCode}.',
    '["tenantName","month","unitCode","total","paybill"]'::jsonb
),
(
    'payment_confirmation_default',
    'Payment Confirmation Default',
    'Default payment confirmation sent after successful payment posting',
    'payment',
    'both',
    'Payment received. Dear {tenantName}, we have received KSh {total} for {unitCode}. Thank you.',
    'payment_confirmation',
    'Payment received. Dear {tenantName}, we have received KSh {total} for {unitCode}. Thank you.',
    '["tenantName","unitCode","total"]'::jsonb
),
(
    'general_announcement_default',
    'General Announcement Default',
    'Default template for admin/agent bulk announcements',
    'announcement',
    'both',
    '{message}',
    'general_announcement',
    '{message}',
    '["message"]'::jsonb
)
ON CONFLICT (template_key) DO NOTHING;

-- Seed event bindings and connect defaults
INSERT INTO message_template_bindings (
    event_key, event_name, description, template_category, channel_preference,
    default_template_id, allow_agent_override, is_active
)
VALUES
(
    'monthly_bill_auto',
    'Monthly Bill Auto (Cron)',
    'Automatic monthly billing run',
    'billing',
    'both',
    (SELECT id FROM message_templates WHERE template_key = 'monthly_bill_default'),
    false,
    true
),
(
    'agent_manual_billing_trigger',
    'Agent Manual Billing Trigger',
    'Agent-triggered billing message queue',
    'billing',
    'both',
    (SELECT id FROM message_templates WHERE template_key = 'monthly_bill_default'),
    true,
    true
),
(
    'balance_reminder_auto',
    'Balance Reminder Auto',
    'Automated or scheduled balance reminder',
    'reminder',
    'both',
    (SELECT id FROM message_templates WHERE template_key = 'balance_reminder_default'),
    false,
    true
),
(
    'payment_confirmation_auto',
    'Payment Confirmation Auto',
    'Payment confirmation after successful payment posting',
    'payment',
    'both',
    (SELECT id FROM message_templates WHERE template_key = 'payment_confirmation_default'),
    false,
    true
),
(
    'agent_manual_general_trigger',
    'Agent Manual General Trigger',
    'Agent bulk or targeted custom announcements',
    'announcement',
    'both',
    (SELECT id FROM message_templates WHERE template_key = 'general_announcement_default'),
    true,
    true
)
ON CONFLICT (event_key) DO NOTHING;
