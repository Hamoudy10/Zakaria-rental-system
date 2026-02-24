-- Backfill rent_payments allocation fields for legacy rows.
-- Goal:
-- - Populate allocated_to_rent / allocated_to_water / allocated_to_arrears
-- - Keep per-row allocation total equal to amount
-- - Preserve previous behavior by defaulting any remainder to rent
--
-- Run on PostgreSQL.
-- Recommended: execute in a maintenance window and test on staging first.

BEGIN;

-- 1) PREVIEW: rows that will be updated
SELECT COUNT(*) AS rows_to_backfill
FROM rent_payments rp
WHERE rp.status = 'completed'
  AND rp.tenant_id IS NOT NULL
  AND rp.unit_id IS NOT NULL
  AND COALESCE(rp.amount, 0) > 0
  AND COALESCE(rp.allocated_to_rent, 0) = 0
  AND COALESCE(rp.allocated_to_water, 0) = 0
  AND COALESCE(rp.allocated_to_arrears, 0) = 0;

-- 2) OPTIONAL AUDIT SNAPSHOT (persistent table)
CREATE TABLE IF NOT EXISTS payment_allocation_backfill_audit (
  audit_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at TIMESTAMP NOT NULL DEFAULT NOW(),
  payment_id UUID NOT NULL,
  tenant_id UUID,
  unit_id UUID,
  payment_month DATE,
  amount NUMERIC,
  old_allocated_to_rent NUMERIC,
  old_allocated_to_water NUMERIC,
  old_allocated_to_arrears NUMERIC
);

INSERT INTO payment_allocation_backfill_audit (
  payment_id,
  tenant_id,
  unit_id,
  payment_month,
  amount,
  old_allocated_to_rent,
  old_allocated_to_water,
  old_allocated_to_arrears
)
SELECT
  rp.id,
  rp.tenant_id,
  rp.unit_id,
  DATE_TRUNC('month', rp.payment_month)::date,
  rp.amount,
  rp.allocated_to_rent,
  rp.allocated_to_water,
  rp.allocated_to_arrears
FROM rent_payments rp
WHERE rp.status = 'completed'
  AND rp.tenant_id IS NOT NULL
  AND rp.unit_id IS NOT NULL
  AND COALESCE(rp.amount, 0) > 0
  AND COALESCE(rp.allocated_to_rent, 0) = 0
  AND COALESCE(rp.allocated_to_water, 0) = 0
  AND COALESCE(rp.allocated_to_arrears, 0) = 0;

-- 3) BACKFILL
DO $$
DECLARE
  rec RECORD;
  cur_tenant UUID := NULL;
  cur_unit UUID := NULL;
  cur_month DATE := NULL;
  rent_target NUMERIC := 0;
  water_target NUMERIC := 0;
  existing_rent NUMERIC := 0;
  existing_water NUMERIC := 0;
  remaining_rent NUMERIC := 0;
  remaining_water NUMERIC := 0;
  alloc_rent NUMERIC := 0;
  alloc_water NUMERIC := 0;
  alloc_arrears NUMERIC := 0;
  remaining NUMERIC := 0;
BEGIN
  FOR rec IN
    SELECT
      rp.id,
      rp.tenant_id,
      rp.unit_id,
      DATE_TRUNC('month', rp.payment_month)::date AS payment_month,
      COALESCE(rp.amount, 0)::numeric AS amount,
      rp.payment_date,
      rp.created_at
    FROM rent_payments rp
    WHERE rp.status = 'completed'
      AND rp.tenant_id IS NOT NULL
      AND rp.unit_id IS NOT NULL
      AND COALESCE(rp.amount, 0) > 0
      AND COALESCE(rp.allocated_to_rent, 0) = 0
      AND COALESCE(rp.allocated_to_water, 0) = 0
      AND COALESCE(rp.allocated_to_arrears, 0) = 0
    ORDER BY
      rp.tenant_id,
      rp.unit_id,
      DATE_TRUNC('month', rp.payment_month),
      COALESCE(rp.payment_date, rp.created_at),
      rp.created_at,
      rp.id
  LOOP
    IF cur_tenant IS DISTINCT FROM rec.tenant_id
       OR cur_unit IS DISTINCT FROM rec.unit_id
       OR cur_month IS DISTINCT FROM rec.payment_month THEN
      cur_tenant := rec.tenant_id;
      cur_unit := rec.unit_id;
      cur_month := rec.payment_month;

      SELECT
        COALESCE(ta.monthly_rent, pu.rent_amount, 0)::numeric
      INTO rent_target
      FROM property_units pu
      LEFT JOIN tenant_allocations ta
        ON ta.tenant_id = rec.tenant_id
       AND ta.unit_id = rec.unit_id
       AND ta.is_active = true
      WHERE pu.id = rec.unit_id
      LIMIT 1;

      SELECT COALESCE(SUM(wb.amount), 0)::numeric
      INTO water_target
      FROM water_bills wb
      WHERE wb.tenant_id = rec.tenant_id
        AND (wb.unit_id = rec.unit_id OR wb.unit_id IS NULL)
        AND DATE_TRUNC('month', wb.bill_month) = rec.payment_month;

      SELECT
        COALESCE(SUM(COALESCE(rp2.allocated_to_rent, 0)), 0)::numeric,
        COALESCE(SUM(COALESCE(rp2.allocated_to_water, 0)), 0)::numeric
      INTO existing_rent, existing_water
      FROM rent_payments rp2
      WHERE rp2.tenant_id = rec.tenant_id
        AND rp2.unit_id = rec.unit_id
        AND rp2.status = 'completed'
        AND DATE_TRUNC('month', rp2.payment_month) = rec.payment_month
        AND (
          COALESCE(rp2.allocated_to_rent, 0) > 0 OR
          COALESCE(rp2.allocated_to_water, 0) > 0 OR
          COALESCE(rp2.allocated_to_arrears, 0) > 0
        );

      remaining_rent := GREATEST(0, rent_target - existing_rent);
      remaining_water := GREATEST(0, water_target - existing_water);
    END IF;

    alloc_arrears := 0;
    alloc_rent := LEAST(rec.amount, remaining_rent);
    remaining := rec.amount - alloc_rent;

    alloc_water := LEAST(remaining, remaining_water);
    remaining := remaining - alloc_water;

    -- Preserve historical totals: any extra remains in rent allocation.
    alloc_rent := alloc_rent + GREATEST(0, remaining);

    remaining_rent := GREATEST(0, remaining_rent - LEAST(alloc_rent, remaining_rent));
    remaining_water := GREATEST(0, remaining_water - alloc_water);

    UPDATE rent_payments
    SET
      allocated_to_rent = alloc_rent,
      allocated_to_water = alloc_water,
      allocated_to_arrears = alloc_arrears,
      updated_at = NOW()
    WHERE id = rec.id;
  END LOOP;
END $$;

-- 4) VERIFY: no target rows left unallocated
SELECT COUNT(*) AS rows_still_unallocated
FROM rent_payments rp
WHERE rp.status = 'completed'
  AND rp.tenant_id IS NOT NULL
  AND rp.unit_id IS NOT NULL
  AND COALESCE(rp.amount, 0) > 0
  AND COALESCE(rp.allocated_to_rent, 0) = 0
  AND COALESCE(rp.allocated_to_water, 0) = 0
  AND COALESCE(rp.allocated_to_arrears, 0) = 0;

-- 5) VERIFY: allocation totals match payment amount
SELECT COUNT(*) AS rows_with_mismatch
FROM rent_payments rp
WHERE rp.status = 'completed'
  AND rp.tenant_id IS NOT NULL
  AND rp.unit_id IS NOT NULL
  AND ABS(
    COALESCE(rp.amount, 0) -
    (COALESCE(rp.allocated_to_rent, 0) + COALESCE(rp.allocated_to_water, 0) + COALESCE(rp.allocated_to_arrears, 0))
  ) > 0.0001;

COMMIT;

-- If preview/verification is not as expected, run:
-- ROLLBACK;
