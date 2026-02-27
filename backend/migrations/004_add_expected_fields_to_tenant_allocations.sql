-- Add persisted expected-rent fields for tenant allocations
ALTER TABLE tenant_allocations
  ADD COLUMN IF NOT EXISTS month_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_amount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_month_expected NUMERIC(12, 2) DEFAULT 0;

-- Backfill existing rows
UPDATE tenant_allocations ta
SET
  month_count = CASE
    WHEN ta.lease_start_date IS NULL OR ta.monthly_rent IS NULL THEN 0
    WHEN COALESCE(ta.lease_end_date, CURRENT_DATE) < ta.lease_start_date THEN 0
    ELSE (
      ((EXTRACT(YEAR FROM COALESCE(ta.lease_end_date, CURRENT_DATE)) - EXTRACT(YEAR FROM ta.lease_start_date)) * 12) +
      (EXTRACT(MONTH FROM COALESCE(ta.lease_end_date, CURRENT_DATE)) - EXTRACT(MONTH FROM ta.lease_start_date)) +
      1
    )::INTEGER
  END,
  expected_amount = CASE
    WHEN ta.lease_start_date IS NULL OR ta.monthly_rent IS NULL THEN 0
    WHEN COALESCE(ta.lease_end_date, CURRENT_DATE) < ta.lease_start_date THEN 0
    ELSE ROUND(
      (
        (
          ((EXTRACT(YEAR FROM COALESCE(ta.lease_end_date, CURRENT_DATE)) - EXTRACT(YEAR FROM ta.lease_start_date)) * 12) +
          (EXTRACT(MONTH FROM COALESCE(ta.lease_end_date, CURRENT_DATE)) - EXTRACT(MONTH FROM ta.lease_start_date)) +
          1
        ) * ta.monthly_rent
      )::NUMERIC,
      2
    )
  END,
  current_month_expected = CASE
    WHEN ta.lease_start_date IS NULL OR ta.monthly_rent IS NULL THEN 0
    WHEN DATE_TRUNC('month', CURRENT_DATE) BETWEEN
         DATE_TRUNC('month', ta.lease_start_date) AND
         DATE_TRUNC('month', COALESCE(ta.lease_end_date, CURRENT_DATE))
      THEN ROUND(ta.monthly_rent::NUMERIC, 2)
    ELSE 0
  END;
