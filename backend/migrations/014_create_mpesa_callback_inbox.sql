-- Durable inbox for Safaricom C2B callbacks.
-- Purpose:
-- 1) Persist callback before business processing/ack handling.
-- 2) Support idempotency and retries by TransID.
-- 3) Provide auditability for "received but not posted" cases.

CREATE TABLE IF NOT EXISTS mpesa_callback_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trans_id VARCHAR(64) NOT NULL,
  bill_ref_number VARCHAR(64),
  msisdn VARCHAR(32),
  trans_amount NUMERIC(12, 2),
  trans_time_raw VARCHAR(32),
  payer_first_name VARCHAR(100),
  payer_middle_name VARCHAR(100),
  payer_last_name VARCHAR(100),
  raw_payload JSONB NOT NULL,
  process_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  process_error TEXT,
  matched_payment_id UUID NULL REFERENCES rent_payments(id) ON DELETE SET NULL,
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Idempotency key for C2B callbacks.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mpesa_callback_inbox_trans_id
  ON mpesa_callback_inbox(trans_id);

CREATE INDEX IF NOT EXISTS idx_mpesa_callback_inbox_status
  ON mpesa_callback_inbox(process_status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_mpesa_callback_inbox_processed_at
  ON mpesa_callback_inbox(processed_at);

