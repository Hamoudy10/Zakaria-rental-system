-- assign_abdurhaman_muna_shop_history.sql
--
-- Intended final state:
--   - Abdurahman Omar records -> MKTS01
--   - Muna Gule records       -> MKTS02
--
-- This version deliberately uses NO TEMP TABLES because some SQL runners
-- execute statements on separate connections and lose temp relations.
--
-- Default behavior is safe: final statement is ROLLBACK.
-- After the preview/verification output looks correct, change ROLLBACK to COMMIT.

BEGIN;

-- ====================
-- VALIDATE
-- ====================
DO $$
DECLARE
  abdurahman_count integer;
  muna_count integer;
  mkts01_count integer;
  mkts02_count integer;
BEGIN
  SELECT COUNT(*)
  INTO abdurahman_count
  FROM tenants
  WHERE LOWER(TRIM(first_name)) = 'abdurahman'
    AND LOWER(TRIM(last_name)) = 'omar';

  SELECT COUNT(*)
  INTO muna_count
  FROM tenants
  WHERE LOWER(TRIM(first_name)) = 'muna'
    AND LOWER(TRIM(last_name)) = 'gule';

  SELECT COUNT(*)
  INTO mkts01_count
  FROM property_units
  WHERE UPPER(unit_code) = 'MKTS01';

  SELECT COUNT(*)
  INTO mkts02_count
  FROM property_units
  WHERE UPPER(unit_code) = 'MKTS02';

  IF abdurahman_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 tenant named Abdurahman Omar, found %', abdurahman_count;
  END IF;

  IF muna_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 tenant named Muna Gule, found %', muna_count;
  END IF;

  IF mkts01_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 unit MKTS01, found %', mkts01_count;
  END IF;

  IF mkts02_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 unit MKTS02, found %', mkts02_count;
  END IF;
END $$;

-- ====================
-- PREVIEW BEFORE
-- ====================
WITH tenant_unit_map AS (
  SELECT
    'abdurahman_omar' AS tenant_key,
    t.id AS tenant_id,
    t.first_name,
    t.last_name,
    'MKTS01' AS target_unit_code,
    pu.id AS target_unit_id,
    pu.property_id AS target_property_id,
    p.name AS target_property_name
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS01'
  LEFT JOIN properties p ON p.id = pu.property_id
  WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
    AND LOWER(TRIM(t.last_name)) = 'omar'
  UNION ALL
  SELECT
    'muna_gule' AS tenant_key,
    t.id AS tenant_id,
    t.first_name,
    t.last_name,
    'MKTS02' AS target_unit_code,
    pu.id AS target_unit_id,
    pu.property_id AS target_property_id,
    p.name AS target_property_name
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS02'
  LEFT JOIN properties p ON p.id = pu.property_id
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
)
SELECT 'tenant_map' AS section, *
FROM tenant_unit_map
ORDER BY tenant_key;

WITH tenant_unit_map AS (
  SELECT 'abdurahman_omar' AS tenant_key, t.id AS tenant_id
  FROM tenants t
  WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
    AND LOWER(TRIM(t.last_name)) = 'omar'
  UNION ALL
  SELECT 'muna_gule' AS tenant_key, t.id AS tenant_id
  FROM tenants t
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
),
watched_units AS (
  SELECT id AS unit_id, unit_code
  FROM property_units
  WHERE UPPER(unit_code) IN ('MKTS01', 'MKTS02', 'MKTS04')
)
SELECT tum.tenant_key, wu.unit_code, 'tenant_allocations' AS table_name, COUNT(*) AS row_count
FROM tenant_allocations ta
JOIN tenant_unit_map tum ON tum.tenant_id = ta.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = ta.unit_id
GROUP BY tum.tenant_key, wu.unit_code
UNION ALL
SELECT tum.tenant_key, wu.unit_code, 'rent_payments', COUNT(*)
FROM rent_payments rp
JOIN tenant_unit_map tum ON tum.tenant_id = rp.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = rp.unit_id
GROUP BY tum.tenant_key, wu.unit_code
UNION ALL
SELECT tum.tenant_key, wu.unit_code, 'water_bills', COUNT(*)
FROM water_bills wb
JOIN tenant_unit_map tum ON tum.tenant_id = wb.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = wb.unit_id
GROUP BY tum.tenant_key, wu.unit_code
UNION ALL
SELECT tum.tenant_key, wu.unit_code, 'tenant_deposit_transactions', COUNT(*)
FROM tenant_deposit_transactions tdt
JOIN tenant_unit_map tum ON tum.tenant_id = tdt.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = tdt.unit_id
GROUP BY tum.tenant_key, wu.unit_code
UNION ALL
SELECT tum.tenant_key, wu.unit_code, 'complaints', COUNT(*)
FROM complaints c
JOIN tenant_unit_map tum ON tum.tenant_id = c.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = c.unit_id
GROUP BY tum.tenant_key, wu.unit_code
ORDER BY tenant_key, table_name, unit_code;

-- ====================
-- BACKUPS
-- ====================
CREATE TABLE IF NOT EXISTS correction_backup_abdurahman_muna_tenant_allocations AS
SELECT NOW() AS backup_created_at, ta.*
FROM tenant_allocations ta
WHERE false;

CREATE TABLE IF NOT EXISTS correction_backup_abdurahman_muna_rent_payments AS
SELECT NOW() AS backup_created_at, rp.*
FROM rent_payments rp
WHERE false;

CREATE TABLE IF NOT EXISTS correction_backup_abdurahman_muna_water_bills AS
SELECT NOW() AS backup_created_at, wb.*
FROM water_bills wb
WHERE false;

CREATE TABLE IF NOT EXISTS correction_backup_abdurahman_muna_tenant_deposit_transactions AS
SELECT NOW() AS backup_created_at, tdt.*
FROM tenant_deposit_transactions tdt
WHERE false;

CREATE TABLE IF NOT EXISTS correction_backup_abdurahman_muna_complaints AS
SELECT NOW() AS backup_created_at, c.*
FROM complaints c
WHERE false;

WITH target_tenants AS (
  SELECT id AS tenant_id
  FROM tenants
  WHERE (LOWER(TRIM(first_name)) = 'abdurahman' AND LOWER(TRIM(last_name)) = 'omar')
     OR (LOWER(TRIM(first_name)) = 'muna' AND LOWER(TRIM(last_name)) = 'gule')
)
INSERT INTO correction_backup_abdurahman_muna_tenant_allocations
SELECT NOW(), ta.*
FROM tenant_allocations ta
JOIN target_tenants tt ON tt.tenant_id = ta.tenant_id;

WITH target_tenants AS (
  SELECT id AS tenant_id
  FROM tenants
  WHERE (LOWER(TRIM(first_name)) = 'abdurahman' AND LOWER(TRIM(last_name)) = 'omar')
     OR (LOWER(TRIM(first_name)) = 'muna' AND LOWER(TRIM(last_name)) = 'gule')
)
INSERT INTO correction_backup_abdurahman_muna_rent_payments
SELECT NOW(), rp.*
FROM rent_payments rp
JOIN target_tenants tt ON tt.tenant_id = rp.tenant_id;

WITH target_tenants AS (
  SELECT id AS tenant_id
  FROM tenants
  WHERE (LOWER(TRIM(first_name)) = 'abdurahman' AND LOWER(TRIM(last_name)) = 'omar')
     OR (LOWER(TRIM(first_name)) = 'muna' AND LOWER(TRIM(last_name)) = 'gule')
)
INSERT INTO correction_backup_abdurahman_muna_water_bills
SELECT NOW(), wb.*
FROM water_bills wb
JOIN target_tenants tt ON tt.tenant_id = wb.tenant_id;

WITH target_tenants AS (
  SELECT id AS tenant_id
  FROM tenants
  WHERE (LOWER(TRIM(first_name)) = 'abdurahman' AND LOWER(TRIM(last_name)) = 'omar')
     OR (LOWER(TRIM(first_name)) = 'muna' AND LOWER(TRIM(last_name)) = 'gule')
)
INSERT INTO correction_backup_abdurahman_muna_tenant_deposit_transactions
SELECT NOW(), tdt.*
FROM tenant_deposit_transactions tdt
JOIN target_tenants tt ON tt.tenant_id = tdt.tenant_id;

WITH target_tenants AS (
  SELECT id AS tenant_id
  FROM tenants
  WHERE (LOWER(TRIM(first_name)) = 'abdurahman' AND LOWER(TRIM(last_name)) = 'omar')
     OR (LOWER(TRIM(first_name)) = 'muna' AND LOWER(TRIM(last_name)) = 'gule')
)
INSERT INTO correction_backup_abdurahman_muna_complaints
SELECT NOW(), c.*
FROM complaints c
JOIN target_tenants tt ON tt.tenant_id = c.tenant_id;

-- ====================
-- EXECUTE
-- ====================
WITH tenant_unit_map AS (
  SELECT t.id AS tenant_id, pu.id AS target_unit_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS01'
  WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
    AND LOWER(TRIM(t.last_name)) = 'omar'
  UNION ALL
  SELECT t.id AS tenant_id, pu.id AS target_unit_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS02'
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
)
UPDATE tenant_allocations ta
SET unit_id = tum.target_unit_id,
    updated_at = NOW()
FROM tenant_unit_map tum
WHERE ta.tenant_id = tum.tenant_id
  AND ta.unit_id IS DISTINCT FROM tum.target_unit_id;

WITH tenant_unit_map AS (
  SELECT t.id AS tenant_id, pu.id AS target_unit_id, pu.property_id AS target_property_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS01'
  WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
    AND LOWER(TRIM(t.last_name)) = 'omar'
  UNION ALL
  SELECT t.id AS tenant_id, pu.id AS target_unit_id, pu.property_id AS target_property_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS02'
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
)
UPDATE rent_payments rp
SET unit_id = tum.target_unit_id,
    property_id = tum.target_property_id,
    updated_at = NOW()
FROM tenant_unit_map tum
WHERE rp.tenant_id = tum.tenant_id
  AND rp.unit_id IS DISTINCT FROM tum.target_unit_id;

WITH tenant_unit_map AS (
  SELECT t.id AS tenant_id, pu.id AS target_unit_id, pu.property_id AS target_property_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS01'
  WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
    AND LOWER(TRIM(t.last_name)) = 'omar'
  UNION ALL
  SELECT t.id AS tenant_id, pu.id AS target_unit_id, pu.property_id AS target_property_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS02'
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
)
UPDATE water_bills wb
SET unit_id = tum.target_unit_id,
    property_id = tum.target_property_id
FROM tenant_unit_map tum
WHERE wb.tenant_id = tum.tenant_id
  AND wb.unit_id IS DISTINCT FROM tum.target_unit_id;

WITH tenant_unit_map AS (
  SELECT t.id AS tenant_id, pu.id AS target_unit_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS01'
  WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
    AND LOWER(TRIM(t.last_name)) = 'omar'
  UNION ALL
  SELECT t.id AS tenant_id, pu.id AS target_unit_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS02'
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
)
UPDATE tenant_deposit_transactions tdt
SET unit_id = tum.target_unit_id,
    updated_at = NOW()
FROM tenant_unit_map tum
WHERE tdt.tenant_id = tum.tenant_id
  AND tdt.unit_id IS DISTINCT FROM tum.target_unit_id;

WITH tenant_unit_map AS (
  SELECT t.id AS tenant_id, pu.id AS target_unit_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS01'
  WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
    AND LOWER(TRIM(t.last_name)) = 'omar'
  UNION ALL
  SELECT t.id AS tenant_id, pu.id AS target_unit_id
  FROM tenants t
  JOIN property_units pu ON UPPER(pu.unit_code) = 'MKTS02'
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
)
UPDATE complaints c
SET unit_id = tum.target_unit_id,
    updated_at = NOW()
FROM tenant_unit_map tum
WHERE c.tenant_id = tum.tenant_id
  AND c.unit_id IS DISTINCT FROM tum.target_unit_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tenant_allocations'
      AND column_name = 'unit_code'
  ) THEN
    EXECUTE $sql$
      WITH tenant_unit_map AS (
        SELECT t.id AS tenant_id, 'MKTS01' AS target_unit_code
        FROM tenants t
        WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
          AND LOWER(TRIM(t.last_name)) = 'omar'
        UNION ALL
        SELECT t.id AS tenant_id, 'MKTS02' AS target_unit_code
        FROM tenants t
        WHERE LOWER(TRIM(t.first_name)) = 'muna'
          AND LOWER(TRIM(t.last_name)) = 'gule'
      )
      UPDATE tenant_allocations ta
      SET unit_code = tum.target_unit_code,
          updated_at = NOW()
      FROM tenant_unit_map tum
      WHERE ta.tenant_id = tum.tenant_id
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tenants'
      AND column_name = 'unit_code'
  ) THEN
    EXECUTE $sql$
      WITH tenant_unit_map AS (
        SELECT t.id AS tenant_id, 'MKTS01' AS target_unit_code
        FROM tenants t
        WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
          AND LOWER(TRIM(t.last_name)) = 'omar'
        UNION ALL
        SELECT t.id AS tenant_id, 'MKTS02' AS target_unit_code
        FROM tenants t
        WHERE LOWER(TRIM(t.first_name)) = 'muna'
          AND LOWER(TRIM(t.last_name)) = 'gule'
      )
      UPDATE tenants t
      SET unit_code = tum.target_unit_code,
          updated_at = NOW()
      FROM tenant_unit_map tum
      WHERE t.id = tum.tenant_id
    $sql$;
  END IF;
END $$;

UPDATE property_units pu
SET is_occupied = EXISTS (
  SELECT 1
  FROM tenant_allocations ta
  WHERE ta.unit_id = pu.id
    AND ta.is_active = true
)
WHERE UPPER(pu.unit_code) IN ('MKTS01', 'MKTS02', 'MKTS04');

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
  WHERE UPPER(unit_code) IN ('MKTS01', 'MKTS02', 'MKTS04')
);

-- ====================
-- VERIFY AFTER
-- ====================
WITH tenant_unit_map AS (
  SELECT 'abdurahman_omar' AS tenant_key, t.id AS tenant_id
  FROM tenants t
  WHERE LOWER(TRIM(t.first_name)) = 'abdurahman'
    AND LOWER(TRIM(t.last_name)) = 'omar'
  UNION ALL
  SELECT 'muna_gule' AS tenant_key, t.id AS tenant_id
  FROM tenants t
  WHERE LOWER(TRIM(t.first_name)) = 'muna'
    AND LOWER(TRIM(t.last_name)) = 'gule'
),
watched_units AS (
  SELECT id AS unit_id, unit_code
  FROM property_units
  WHERE UPPER(unit_code) IN ('MKTS01', 'MKTS02', 'MKTS04')
)
SELECT tum.tenant_key, wu.unit_code, 'tenant_allocations' AS table_name, COUNT(*) AS row_count
FROM tenant_allocations ta
JOIN tenant_unit_map tum ON tum.tenant_id = ta.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = ta.unit_id
GROUP BY tum.tenant_key, wu.unit_code
UNION ALL
SELECT tum.tenant_key, wu.unit_code, 'rent_payments', COUNT(*)
FROM rent_payments rp
JOIN tenant_unit_map tum ON tum.tenant_id = rp.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = rp.unit_id
GROUP BY tum.tenant_key, wu.unit_code
UNION ALL
SELECT tum.tenant_key, wu.unit_code, 'water_bills', COUNT(*)
FROM water_bills wb
JOIN tenant_unit_map tum ON tum.tenant_id = wb.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = wb.unit_id
GROUP BY tum.tenant_key, wu.unit_code
UNION ALL
SELECT tum.tenant_key, wu.unit_code, 'tenant_deposit_transactions', COUNT(*)
FROM tenant_deposit_transactions tdt
JOIN tenant_unit_map tum ON tum.tenant_id = tdt.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = tdt.unit_id
GROUP BY tum.tenant_key, wu.unit_code
UNION ALL
SELECT tum.tenant_key, wu.unit_code, 'complaints', COUNT(*)
FROM complaints c
JOIN tenant_unit_map tum ON tum.tenant_id = c.tenant_id
LEFT JOIN watched_units wu ON wu.unit_id = c.unit_id
GROUP BY tum.tenant_key, wu.unit_code
ORDER BY tenant_key, table_name, unit_code;

SELECT
  pu.unit_code,
  pu.is_occupied,
  COUNT(ta.id) FILTER (WHERE ta.is_active = true) AS active_allocations,
  STRING_AGG(
    CONCAT_WS(' ', t.first_name, t.last_name),
    ', ' ORDER BY t.first_name, t.last_name
  ) FILTER (WHERE ta.is_active = true) AS active_tenants
FROM property_units pu
LEFT JOIN tenant_allocations ta ON ta.unit_id = pu.id
LEFT JOIN tenants t ON t.id = ta.tenant_id
WHERE UPPER(pu.unit_code) IN ('MKTS01', 'MKTS02', 'MKTS04')
GROUP BY pu.unit_code, pu.is_occupied
ORDER BY pu.unit_code;

-- Safe default. Change this to COMMIT after confirming the output.
ROLLBACK;
