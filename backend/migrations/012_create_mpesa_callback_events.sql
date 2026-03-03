-- Durable callback ingress table for M-Pesa C2B confirmations.
-- Purpose: never lose callback payloads even when downstream processing fails.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mpesa_callback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trans_id VARCHAR(64) NOT NULL UNIQUE,
  amount NUMERIC(12, 2),
  msisdn VARCHAR(32),
  bill_ref_number VARCHAR(100),
  trans_time VARCHAR(32),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (
    status IN ('received', 'processing', 'processed', 'failed')
  ),
  attempts INTEGER NOT NULL DEFAULT 0,
  processing_started_at TIMESTAMPTZ NULL,
  processed_at TIMESTAMPTZ NULL,
  processing_result TEXT NULL,
  last_error TEXT NULL,
  rent_payment_id UUID NULL REFERENCES rent_payments(id) ON DELETE SET NULL,
  first_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_status
  ON mpesa_callback_events(status);

CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_last_received
  ON mpesa_callback_events(last_received_at DESC);

CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_processed
  ON mpesa_callback_events(processed_at DESC);
