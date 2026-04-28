-- =====================================================
-- FIND & FIX: Ibrahim Mutembei - Remove KSh 8000 Balance
-- =====================================================
-- This script searches for Ibrahim by unit code KBS03
-- Then fixes his balance regardless of name formatting
-- =====================================================

BEGIN;

-- STEP 1: Find Ibrahim by unit code KBS03
SELECT 
    'FOUND TENANT' AS status,
    t.id AS tenant_id,
    t.first_name,
    t.last_name,
    t.phone_number,
    pu.unit_code,
    ta.id AS allocation_id,
    ta.arrears_balance AS current_balance,
    ta.lease_start_date,
    ta.allocation_date,
    ta.is_active
FROM tenant_allocations ta
INNER JOIN tenants t ON t.id = ta.tenant_id
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBS03'
AND ta.is_active = true;

-- STEP 2: Find ALL tenants with unit KBS03 (active or inactive)
SELECT 
    'ALL KBS03 RECORDS' AS status,
    t.first_name,
    t.last_name,
    t.phone_number,
    ta.arrears_balance,
    ta.lease_start_date,
    ta.is_active
FROM tenant_allocations ta
INNER JOIN tenants t ON t.id = ta.tenant_id
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBS03';

-- STEP 3: Update ALL active allocations for unit KBS03
-- This will fix Ibrahim regardless of name format
UPDATE tenant_allocations
SET 
    arrears_balance = 0,
    lease_start_date = '2026-05-01'::date,
    allocation_date = NOW(),
    updated_at = NOW()
WHERE unit_id = (
    SELECT id FROM property_units WHERE unit_code = 'KBS03'
)
AND is_active = true;

-- STEP 4: Delete April 2026 water bills for unit KBS03
DELETE FROM water_bills
WHERE unit_id = (
    SELECT id FROM property_units WHERE unit_code = 'KBS03'
)
AND bill_month = '2026-04-01'::date;

-- STEP 5: Delete April 2026 payments for unit KBS03
DELETE FROM rent_payments
WHERE unit_id = (
    SELECT id FROM property_units WHERE unit_code = 'KBS03'
)
AND payment_month = '2026-04-01'::date;

-- STEP 6: Verify the fix
SELECT 
    'FIXED' AS status,
    t.first_name || ' ' || t.last_name AS tenant_name,
    t.phone_number,
    pu.unit_code,
    ta.arrears_balance AS new_balance,
    ta.lease_start_date,
    ta.is_active,
    CASE 
        WHEN ta.arrears_balance = 0 AND ta.lease_start_date = '2026-05-01'::date
        THEN '✅ FIXED - No balance, starts May 2026'
        ELSE '❌ Issue remains'
    END AS result
FROM tenant_allocations ta
INNER JOIN tenants t ON t.id = ta.tenant_id
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBS03'
AND ta.is_active = true;

COMMIT;

-- =====================================================
-- AFTER RUNNING:
-- 1. Hard refresh browser: Ctrl + Shift + R
-- 2. Check Payment Management → Unpaid tab
-- 3. Ibrahim should NOT appear for April 2026
-- =====================================================
