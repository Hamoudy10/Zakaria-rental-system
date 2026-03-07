-- 019_add_water_expense_payment_fields.sql
-- Add explicit payment mode/details and supplier organization for water delivery expenses.

ALTER TABLE water_delivery_expenses
ADD COLUMN IF NOT EXISTS supplier_organization VARCHAR(150) NULL;

ALTER TABLE water_delivery_expenses
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'cash';

ALTER TABLE water_delivery_expenses
ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_water_delivery_expenses_payment_method'
  ) THEN
    ALTER TABLE water_delivery_expenses
    ADD CONSTRAINT chk_water_delivery_expenses_payment_method
    CHECK (payment_method IN ('cash', 'mpesa'));
  END IF;
END $$;

-- Backfill payment_reference from legacy mpesa_reference where possible.
UPDATE water_delivery_expenses
SET payment_reference = mpesa_reference
WHERE payment_reference IS NULL
  AND mpesa_reference IS NOT NULL;
