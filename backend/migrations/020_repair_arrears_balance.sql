-- ============================================================
-- MIGRATION 020: REPAIR ARREARS BALANCE
-- ============================================================
-- Purpose: Recalculate arrears_balance for all tenant allocations
--          using the correct formula.
--
-- Background: The previous daily 6 AM arrears sync cron had a
--             broken formula that was corrupting arrears data.
--             It was disabled. This migration repairs the damage.
--
-- Formula:
--   total_expected = monthly_rent × months_from_lease_start_to_now
--   total_paid = SUM(allocated_to_rent + allocated_to_arrears)
--   arrears = GREATEST(0, total_expected - total_paid)
--
-- Safety:
--   - Creates backup table for audit/rollback
--   - Reports top 10 largest changes
-- ============================================================

BEGIN;

-- Step 1: Backup current arrears values for audit trail
DROP TABLE IF EXISTS arrears_repair_backup_020;
CREATE TABLE arrears_repair_backup_020 AS
SELECT 
  id,
  tenant_id,
  unit_id,
  monthly_rent,
  lease_start_date,
  lease_end_date,
  is_active,
  arrears_balance AS old_arrears_balance,
  NOW() AS backed_up_at
FROM tenant_allocations
WHERE monthly_rent > 0;

-- Step 2: Repair using PL/pgSQL loop (avoids UPDATE FROM syntax issues)
DO $$
DECLARE
  rec RECORD;
  calc_end DATE;
  total_months INT;
  total_paid NUMERIC;
  new_arrears NUMERIC;
  updated_count INT := 0;
BEGIN
  FOR rec IN 
    SELECT id, tenant_id, unit_id, monthly_rent, 
           lease_start_date, lease_end_date, is_active,
           arrears_balance AS old_arrears
    FROM tenant_allocations
    WHERE monthly_rent > 0 AND lease_start_date IS NOT NULL
  LOOP
    -- Determine end date for calculation
    IF rec.is_active = true THEN
      calc_end := CURRENT_DATE;
    ELSIF rec.lease_end_date IS NOT NULL THEN
      calc_end := rec.lease_end_date;
    ELSE
      calc_end := CURRENT_DATE;
    END IF;

    -- Calculate total months (inclusive)
    total_months := GREATEST(
      (EXTRACT(YEAR FROM AGE(calc_end, rec.lease_start_date)) * 12 +
       EXTRACT(MONTH FROM AGE(calc_end, rec.lease_start_date)) + 1)::int,
      1
    );

    -- Calculate total paid toward rent and arrears
    SELECT COALESCE(SUM(
      COALESCE(rp.allocated_to_rent, 0) + COALESCE(rp.allocated_to_arrears, 0)
    ), 0)
    INTO total_paid
    FROM rent_payments rp
    WHERE rp.tenant_id = rec.tenant_id
      AND rp.unit_id = rec.unit_id
      AND rp.status = 'completed'
      AND DATE_TRUNC('month', rp.payment_month) <= DATE_TRUNC('month', calc_end);

    -- Calculate new arrears
    new_arrears := GREATEST(0, (rec.monthly_rent * total_months) - total_paid);

    -- Update if difference is significant
    IF ABS(rec.old_arrears - new_arrears) > 0.01 THEN
      UPDATE tenant_allocations
      SET arrears_balance = new_arrears
      WHERE id = rec.id;
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'ARREARS REPAIR COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Allocations updated: %', updated_count;
  RAISE NOTICE 'Backup saved to: arrears_repair_backup_020';
  RAISE NOTICE '========================================';
END $$;

-- Step 3: Show top 10 largest changes
DO $$
DECLARE
  row RECORD;
BEGIN
  RAISE NOTICE 'TOP 10 LARGEST ARREARS CHANGES:';
  FOR row IN 
    SELECT 
      b.id,
      b.tenant_id,
      b.old_arrears_balance,
      ta.arrears_balance AS new_arrears_balance,
      ROUND(b.old_arrears_balance - ta.arrears_balance, 2) AS difference
    FROM arrears_repair_backup_020 b
    JOIN tenant_allocations ta ON ta.id = b.id
    WHERE ABS(b.old_arrears_balance - ta.arrears_balance) > 0.01
    ORDER BY ABS(b.old_arrears_balance - ta.arrears_balance) DESC
    LIMIT 10
  LOOP
    RAISE NOTICE '  Allocation %: old=%, new=%, diff=%', 
      row.id, row.old_arrears_balance, row.new_arrears_balance, row.difference;
  END LOOP;
END $$;

COMMIT;
