-- Add provider tracking fields for SMS delivery checks.
ALTER TABLE sms_queue
ADD COLUMN IF NOT EXISTS message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(100),
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_sms_queue_message_id
  ON sms_queue(message_id);
