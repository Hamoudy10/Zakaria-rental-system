-- 018_create_water_delivery_expenses.sql
-- Track water delivery costs per property for water-only profitability analysis.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS water_delivery_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  vendor_name VARCHAR(150) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  bill_month DATE NOT NULL,
  mpesa_reference VARCHAR(64),
  liters_delivered NUMERIC(12, 2),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_water_delivery_expenses_bill_month
    CHECK (bill_month = DATE_TRUNC('month', bill_month)::date)
);

CREATE INDEX IF NOT EXISTS idx_water_delivery_expenses_property_month
  ON water_delivery_expenses(property_id, bill_month DESC);

CREATE INDEX IF NOT EXISTS idx_water_delivery_expenses_expense_date
  ON water_delivery_expenses(expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_water_delivery_expenses_recorded_by
  ON water_delivery_expenses(recorded_by);

CREATE INDEX IF NOT EXISTS idx_water_delivery_expenses_mpesa_reference
  ON water_delivery_expenses(mpesa_reference)
  WHERE mpesa_reference IS NOT NULL;
