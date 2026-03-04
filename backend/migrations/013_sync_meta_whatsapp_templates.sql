-- Sync message template library with approved Meta WhatsApp templates.
-- This keeps UI templates (System Settings) aligned with live WhatsApp template names/params.

-- Upsert/align core defaults
INSERT INTO message_templates (
  template_key, name, description, category, channel,
  sms_body, whatsapp_template_name, whatsapp_fallback_body, variables, is_active, is_archived
)
VALUES
(
  'monthly_bill_default',
  'Monthly Bill Default',
  'Monthly bill notification aligned to monthly_bill_cron',
  'billing',
  'both',
  'Hello {tenantName}, your {month} bill for unit {unitCode} is ready. {items} Total Due: KES {total}. Paybill: {paybill}, Account: {account}.',
  'monthly_bill_cron',
  'Hello {tenantName}, your {month} bill for unit {unitCode} is ready. {items} Total Due: KES {total}. Paybill: {paybill}, Account: {account}.',
  '["tenantName","month","unitCode","items","total","paybill","account"]'::jsonb,
  true,
  false
),
(
  'balance_reminder_default',
  'Balance Reminder Default',
  'Outstanding balance reminder aligned to balance_reminder',
  'reminder',
  'both',
  'Reminder: Dear {tenantName}, your outstanding balance for {month} is KES {total}. Please pay via paybill {paybill}, Account: {account}.',
  'balance_reminder',
  'Reminder: Dear {tenantName}, your outstanding balance for {month} is KES {total}. Please pay via paybill {paybill}, Account: {account}.',
  '["tenantName","unitCode","month","total","dueDate","paybill","account"]'::jsonb,
  true,
  false
),
(
  'payment_confirmation_default',
  'Payment Confirmation Default',
  'Payment confirmation aligned to payment_confirmation',
  'payment',
  'both',
  'Dear {tenantName}, your payment has been received. Amount: KES {total}. Unit: {unitCode}. Month: {month}. Status: {status}.',
  'payment_confirmation',
  'Dear {tenantName}, your payment has been received. Amount: KES {total}. Unit: {unitCode}. Month: {month}. Status: {status}.',
  '["tenantName","total","unitCode","month","status"]'::jsonb,
  true,
  false
),
(
  'general_announcement_default',
  'General Announcement Default',
  'General broadcast announcement aligned to general_announcement',
  'announcement',
  'both',
  '{message}',
  'general_announcement',
  '{message}',
  '["title","message"]'::jsonb,
  true,
  false
)
ON CONFLICT (template_key)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  channel = EXCLUDED.channel,
  sms_body = EXCLUDED.sms_body,
  whatsapp_template_name = EXCLUDED.whatsapp_template_name,
  whatsapp_fallback_body = EXCLUDED.whatsapp_fallback_body,
  variables = EXCLUDED.variables,
  is_active = true,
  is_archived = false,
  updated_at = CURRENT_TIMESTAMP;

-- Insert additional WhatsApp-capable templates so they can be edited in System Settings
INSERT INTO message_templates (
  template_key, name, description, category, channel,
  sms_body, whatsapp_template_name, whatsapp_fallback_body, variables, is_active, is_archived
)
VALUES
(
  'rental_welcome_default',
  'Rental Welcome',
  'Tenant onboarding/welcome template',
  'announcement',
  'both',
  'Dear {tenantName}, your tenancy at {propertyName} has been registered. Unit: {unitCode}. Monthly Rent: KES {rent}. Due Date: {dueDay}. Paybill: {paybill}. Account: {account}.',
  'rental_welcome',
  'Dear {tenantName}, your tenancy at {propertyName} has been registered. Unit: {unitCode}. Monthly Rent: KES {rent}. Due Date: {dueDay}. Paybill: {paybill}. Account: {account}.',
  '["tenantName","propertyName","unitCode","rent","dueDay","paybill","account"]'::jsonb,
  true,
  false
),
(
  'payment_confirmation_detailed_default',
  'Payment Confirmation Detailed',
  'Detailed payment confirmation with allocation',
  'payment',
  'both',
  'Dear {tenantName}, payment received and allocated. Total Paid: KES {total}. Unit: {unitCode}. Month: {month}. Allocation: {allocation}. Status: {status}.',
  'payment_confirmation_detailed',
  'Dear {tenantName}, payment received and allocated. Total Paid: KES {total}. Unit: {unitCode}. Month: {month}. Allocation: {allocation}. Status: {status}.',
  '["tenantName","total","unitCode","month","allocation","status"]'::jsonb,
  true,
  false
),
(
  'admin_payment_alert_default',
  'Admin Payment Alert',
  'Admin payment alert summary',
  'payment',
  'both',
  'Payment notification: Tenant {tenantName}, Unit {unitCode}, Amount KES {total}, Month {month}, Status {status}.',
  'admin_payment_alert',
  'Payment notification: Tenant {tenantName}, Unit {unitCode}, Amount KES {total}, Month {month}, Status {status}.',
  '["tenantName","unitCode","total","month","status"]'::jsonb,
  true,
  false
),
(
  'admin_payment_alert_detailed_default',
  'Admin Payment Alert Detailed',
  'Admin payment alert with allocation details',
  'payment',
  'both',
  'Payment notification: Tenant {tenantName}, Unit {unitCode}, Month {month}, Amount KES {total}, Allocation {allocation}, Status {status}.',
  'admin_payment_alert_detailed',
  'Payment notification: Tenant {tenantName}, Unit {unitCode}, Month {month}, Amount KES {total}, Allocation {allocation}, Status {status}.',
  '["tenantName","unitCode","month","total","allocation","status"]'::jsonb,
  true,
  false
),
(
  'advance_payment_default',
  'Advance Payment',
  'Advance payment confirmation template',
  'payment',
  'both',
  'Dear {tenantName}, an advance payment has been recorded. Amount: KES {total}. Unit: {unitCode}. Coverage: {months}.',
  'advance_payment',
  'Dear {tenantName}, an advance payment has been recorded. Amount: KES {total}. Unit: {unitCode}. Coverage: {months}.',
  '["tenantName","total","unitCode","months"]'::jsonb,
  true,
  false
),
(
  'bill_notification_default',
  'Bill Notification',
  'Manual bill notification template',
  'billing',
  'both',
  'Dear {tenantName}, your bill for {month} is ready. Unit: {unitCode}. {items} Total Due: KES {total}. Paybill: {paybill}. Account: {account}.',
  'bill_notification',
  'Dear {tenantName}, your bill for {month} is ready. Unit: {unitCode}. {items} Total Due: KES {total}. Paybill: {paybill}. Account: {account}.',
  '["tenantName","month","unitCode","items","total","paybill","account"]'::jsonb,
  true,
  false
)
ON CONFLICT (template_key)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  channel = EXCLUDED.channel,
  sms_body = EXCLUDED.sms_body,
  whatsapp_template_name = EXCLUDED.whatsapp_template_name,
  whatsapp_fallback_body = EXCLUDED.whatsapp_fallback_body,
  variables = EXCLUDED.variables,
  is_active = true,
  is_archived = false,
  updated_at = CURRENT_TIMESTAMP;
