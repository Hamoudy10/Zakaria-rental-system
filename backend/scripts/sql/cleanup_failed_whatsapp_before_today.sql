-- Cleanup failed WhatsApp rows logged before today.
-- Safe scope:
-- 1) whatsapp_notifications: status='failed' and sent_at date before today
-- 2) whatsapp_queue: status='failed' and created_at date before today
--
-- Run in a transaction.
-- Optional: execute preview SELECTs first.

BEGIN;

-- Preview counts (optional)
SELECT COUNT(*) AS failed_notifications_before_today
FROM whatsapp_notifications
WHERE status = 'failed'
  AND sent_at::date < CURRENT_DATE;

SELECT COUNT(*) AS failed_queue_before_today
FROM whatsapp_queue
WHERE status = 'failed'
  AND created_at::date < CURRENT_DATE;

-- Delete old failed WhatsApp notifications
DELETE FROM whatsapp_notifications
WHERE status = 'failed'
  AND sent_at::date < CURRENT_DATE;

-- Delete old failed WhatsApp queue rows
DELETE FROM whatsapp_queue
WHERE status = 'failed'
  AND created_at::date < CURRENT_DATE;

COMMIT;

