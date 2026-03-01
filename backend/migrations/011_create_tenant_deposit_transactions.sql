-- 011_create_tenant_deposit_transactions.sql
-- Deposit ledger for tenant allocations (separate from rent payments).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenant_deposit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
  allocation_id UUID NULL REFERENCES tenant_allocations(id) ON DELETE SET NULL,
  transaction_type VARCHAR(30) NOT NULL CHECK (
    transaction_type IN (
      'deposit_charge',
      'deposit_payment',
      'deposit_adjustment',
      'deposit_refund'
    )
  ),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (
    status IN ('pending', 'completed', 'failed', 'cancelled')
  ),
  payment_method VARCHAR(30) NULL,
  mpesa_receipt_number VARCHAR(50) NULL,
  phone_number VARCHAR(20) NULL,
  transaction_date TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_txn_tenant_id
  ON tenant_deposit_transactions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_deposit_txn_allocation_id
  ON tenant_deposit_transactions(allocation_id);

CREATE INDEX IF NOT EXISTS idx_deposit_txn_created_at
  ON tenant_deposit_transactions(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_deposit_txn_mpesa_receipt
  ON tenant_deposit_transactions(mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL;

-- Backfill one charge entry for allocations that already had security_deposit.
INSERT INTO tenant_deposit_transactions (
  tenant_id,
  unit_id,
  allocation_id,
  transaction_type,
  amount,
  status,
  payment_method,
  transaction_date,
  notes,
  created_by
)
SELECT
  ta.tenant_id,
  ta.unit_id,
  ta.id,
  'deposit_charge',
  ta.security_deposit,
  'completed',
  'system',
  COALESCE(ta.allocation_date, NOW()),
  'Auto-created from allocation security_deposit (migration backfill).',
  ta.allocated_by
FROM tenant_allocations ta
WHERE COALESCE(ta.security_deposit, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM tenant_deposit_transactions tdt
    WHERE tdt.allocation_id = ta.id
      AND tdt.transaction_type = 'deposit_charge'
  );
