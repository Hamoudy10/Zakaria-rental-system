-- move_muna_gule_mkts04_to_mkts02.sql
--
-- Purpose:
--   Move only MUNA GULE records currently attached to MKTS04 over to MKTS02.
--   This removes Muna's allocation/payment history from MKTS04 by changing
--   those records' unit_id to MKTS02.
--
-- Safe default:
--   Ends with ROLLBACK. Review the preview/verification output first.
--   Change only the final ROLLBACK to COMMIT when ready to save.

BEGIN;

-- ====================
-- VALIDATE
-- ====================
DO $$
DECLARE
  muna_count integer;
  mkts04_count integer;
  mkts02_count integer;
BEGIN
  SELECT COUNT(*)
  INTO muna_count
  FROM tenants
  WHERE LOWER(TRIM(first_name)) = 'muna'
    AND LOWER(TRIM(last_name)) = 'gule';

  SELECT COUNT(*)
  INTO mkts04_count
  FROM property_units
  WHERE UPPER(unit_code) = 'MKTS04';

  SELECT COUNT(*)
  INTO mkts02_count
  FROM property_units
  WHERE UPPER(unit_code) = 'MKTS02';

  IF muna_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 tenant named Muna Gule, found %', muna_count;
  END IF;

  IF mkts04_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 unit MKTS04, found %', mkts04_count;
  END IF;

  IF mkts02_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 unit MKTS02, found %', mkts02_count;
  END IF;
END $$;

-- ====================
-- PREVIEW BEFORE
-- ====================
WITH ctx AS (
  SELECT
    t.id AS tenant_id,
    CONCAT_WS(' ', t.first_name, t.last_name) AS tenant_name,
    from_unit.id AS from_unit_id,
    from_unit.unit_code AS from_unit_code,
    to_unit.id AS to_unit_id,
    to_unit.unit_code AS to_unit_code,
    to_unit.property_id AS to_property_id
  FROM tenants t
  CROSS JOIN property_units from_unit
  CROSS JOIN property_units to_unit
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
    AND UPPER(from_unit.unit_code) = 'MKTS04'
    AND UPPER(to_unit.unit_code) = 'MKTS02'
)
SELECT
  'before_counts' AS section,
  ctx.tenant_name,
  ctx.from_unit_code,
  ctx.to_unit_code,
  (SELECT COUNT(*) FROM tenant_allocations ta WHERE ta.tenant_id = ctx.tenant_id AND ta.unit_id = ctx.from_unit_id) AS allocations_on_mkts04,
  (SELECT COUNT(*) FROM rent_payments rp WHERE rp.tenant_id = ctx.tenant_id AND rp.unit_id = ctx.from_unit_id) AS rent_payments_on_mkts04,
  (SELECT COALESCE(SUM(rp.amount), 0) FROM rent_payments rp WHERE rp.tenant_id = ctx.tenant_id AND rp.unit_id = ctx.from_unit_id) AS rent_payment_amount_on_mkts04,
  (SELECT COUNT(*) FROM water_bills wb WHERE wb.tenant_id = ctx.tenant_id AND wb.unit_id = ctx.from_unit_id) AS water_bills_on_mkts04,
  (SELECT COALESCE(SUM(wb.amount), 0) FROM water_bills wb WHERE wb.tenant_id = ctx.tenant_id AND wb.unit_id = ctx.from_unit_id) AS water_bill_amount_on_mkts04
FROM ctx;

-- ====================
-- EXECUTE
-- ====================
WITH ctx AS (
  SELECT
    t.id AS tenant_id,
    from_unit.id AS from_unit_id,
    to_unit.id AS to_unit_id
  FROM tenants t
  CROSS JOIN property_units from_unit
  CROSS JOIN property_units to_unit
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
    AND UPPER(from_unit.unit_code) = 'MKTS04'
    AND UPPER(to_unit.unit_code) = 'MKTS02'
)
UPDATE tenant_allocations ta
SET unit_id = ctx.to_unit_id,
    updated_at = NOW()
FROM ctx
WHERE ta.tenant_id = ctx.tenant_id
  AND ta.unit_id = ctx.from_unit_id;

WITH ctx AS (
  SELECT
    t.id AS tenant_id,
    from_unit.id AS from_unit_id,
    to_unit.id AS to_unit_id,
    to_unit.property_id AS to_property_id
  FROM tenants t
  CROSS JOIN property_units from_unit
  CROSS JOIN property_units to_unit
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
    AND UPPER(from_unit.unit_code) = 'MKTS04'
    AND UPPER(to_unit.unit_code) = 'MKTS02'
)
UPDATE rent_payments rp
SET unit_id = ctx.to_unit_id,
    property_id = ctx.to_property_id,
    updated_at = NOW()
FROM ctx
WHERE rp.tenant_id = ctx.tenant_id
  AND rp.unit_id = ctx.from_unit_id;

WITH ctx AS (
  SELECT
    t.id AS tenant_id,
    from_unit.id AS from_unit_id,
    to_unit.id AS to_unit_id,
    to_unit.property_id AS to_property_id
  FROM tenants t
  CROSS JOIN property_units from_unit
  CROSS JOIN property_units to_unit
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
    AND UPPER(from_unit.unit_code) = 'MKTS04'
    AND UPPER(to_unit.unit_code) = 'MKTS02'
)
UPDATE water_bills wb
SET unit_id = ctx.to_unit_id,
    property_id = ctx.to_property_id
FROM ctx
WHERE wb.tenant_id = ctx.tenant_id
  AND wb.unit_id = ctx.from_unit_id;

-- Optional tables, guarded so this script still runs if they are empty.
WITH ctx AS (
  SELECT
    t.id AS tenant_id,
    from_unit.id AS from_unit_id,
    to_unit.id AS to_unit_id
  FROM tenants t
  CROSS JOIN property_units from_unit
  CROSS JOIN property_units to_unit
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
    AND UPPER(from_unit.unit_code) = 'MKTS04'
    AND UPPER(to_unit.unit_code) = 'MKTS02'
)
UPDATE tenant_deposit_transactions tdt
SET unit_id = ctx.to_unit_id,
    updated_at = NOW()
FROM ctx
WHERE tdt.tenant_id = ctx.tenant_id
  AND tdt.unit_id = ctx.from_unit_id;

WITH ctx AS (
  SELECT
    t.id AS tenant_id,
    from_unit.id AS from_unit_id,
    to_unit.id AS to_unit_id
  FROM tenants t
  CROSS JOIN property_units from_unit
  CROSS JOIN property_units to_unit
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
    AND UPPER(from_unit.unit_code) = 'MKTS04'
    AND UPPER(to_unit.unit_code) = 'MKTS02'
)
UPDATE complaints c
SET unit_id = ctx.to_unit_id,
    updated_at = NOW()
FROM ctx
WHERE c.tenant_id = ctx.tenant_id
  AND c.unit_id = ctx.from_unit_id;

UPDATE property_units pu
SET is_occupied = EXISTS (
  SELECT 1
  FROM tenant_allocations ta
  WHERE ta.unit_id = pu.id
    AND ta.is_active = true
)
WHERE UPPER(pu.unit_code) IN ('MKTS02', 'MKTS04');

UPDATE properties p
SET available_units = (
  SELECT COUNT(*)
  FROM property_units pu
  WHERE pu.property_id = p.id
    AND pu.is_active = true
    AND pu.is_occupied = false
)
WHERE p.id IN (
  SELECT DISTINCT property_id
  FROM property_units
  WHERE UPPER(unit_code) IN ('MKTS02', 'MKTS04')
);

-- ====================
-- VERIFY AFTER
-- ====================
WITH ctx AS (
  SELECT
    t.id AS tenant_id,
    CONCAT_WS(' ', t.first_name, t.last_name) AS tenant_name,
    from_unit.id AS from_unit_id,
    from_unit.unit_code AS from_unit_code,
    to_unit.id AS to_unit_id,
    to_unit.unit_code AS to_unit_code
  FROM tenants t
  CROSS JOIN property_units from_unit
  CROSS JOIN property_units to_unit
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
    AND UPPER(from_unit.unit_code) = 'MKTS04'
    AND UPPER(to_unit.unit_code) = 'MKTS02'
)
SELECT
  'after_counts' AS section,
  ctx.tenant_name,
  ctx.from_unit_code,
  ctx.to_unit_code,
  (SELECT COUNT(*) FROM tenant_allocations ta WHERE ta.tenant_id = ctx.tenant_id AND ta.unit_id = ctx.from_unit_id) AS allocations_left_on_mkts04,
  (SELECT COUNT(*) FROM rent_payments rp WHERE rp.tenant_id = ctx.tenant_id AND rp.unit_id = ctx.from_unit_id) AS rent_payments_left_on_mkts04,
  (SELECT COUNT(*) FROM water_bills wb WHERE wb.tenant_id = ctx.tenant_id AND wb.unit_id = ctx.from_unit_id) AS water_bills_left_on_mkts04,
  (SELECT COUNT(*) FROM tenant_allocations ta WHERE ta.tenant_id = ctx.tenant_id AND ta.unit_id = ctx.to_unit_id) AS allocations_now_on_mkts02,
  (SELECT COUNT(*) FROM rent_payments rp WHERE rp.tenant_id = ctx.tenant_id AND rp.unit_id = ctx.to_unit_id) AS rent_payments_now_on_mkts02,
  (SELECT COALESCE(SUM(rp.amount), 0) FROM rent_payments rp WHERE rp.tenant_id = ctx.tenant_id AND rp.unit_id = ctx.to_unit_id) AS rent_payment_amount_now_on_mkts02,
  (SELECT COUNT(*) FROM water_bills wb WHERE wb.tenant_id = ctx.tenant_id AND wb.unit_id = ctx.to_unit_id) AS water_bills_now_on_mkts02
FROM ctx;

-- Safe default. Change this to COMMIT after confirming the output.
ROLLBACK;
