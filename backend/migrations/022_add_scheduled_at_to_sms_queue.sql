-- =====================================================
-- MIGRATION: Add scheduled_at and batch_id to sms_queue
-- =====================================================
-- Purpose: Allow cancellation of accidentally triggered billing SMS
-- Mechanism: 2-minute grace period before messages are sent
-- =====================================================

BEGIN;

-- Add scheduled_at column (when message should be sent)
ALTER TABLE sms_queue ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;

-- Add batch_id to group messages from same trigger
ALTER TABLE sms_queue ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Set scheduled_at for existing pending messages to immediate (backward compatibility)
UPDATE sms_queue 
SET scheduled_at = NOW() 
WHERE scheduled_at IS NULL AND status = 'pending';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_sms_queue_scheduled_at ON sms_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sms_queue_batch_id ON sms_queue(batch_id) WHERE batch_id IS NOT NULL;

COMMIT;

SELECT 'Migration: Added scheduled_at and batch_id to sms_queue' AS status;
