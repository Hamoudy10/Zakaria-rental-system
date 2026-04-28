-- =====================================================
-- DIRECT FIX: Ibrahim Mutembei - Remove KSh 8000 Balance
-- =====================================================
-- This script will:
-- 1. Show current state
-- 2. Force update to remove ALL balances
-- 3. Delete any April billing records
-- 4. Verify the fix worked
-- =====================================================

BEGIN;

-- STEP 1: Check CURRENT state
SELECT 
    'BEFORE FIX' AS status,
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.arrears_balance AS current_balance,
    ta.lease_start_date,
    ta.is_active
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBS03'
AND t.first_name = 'IBRAHIM'
AND t.last_name = 'MUTEMBEI';

-- STEP 2: FORCE UPDATE - Remove all balances
UPDATE tenant_allocations
SET 
    arrears_balance = 0,
    lease_start_date = '2026-05-01'::date,
    allocation_date = NOW(),
    updated_at = NOW()
WHERE tenant_id = (
    SELECT id FROM tenants 
    WHERE first_name = 'IBRAHIM' AND last_name = 'MUTEMBEI'
    LIMIT 1
)
AND unit_id = (
    SELECT id FROM property_units 
    WHERE unit_code = 'KBS03'
    LIMIT 1
);

-- STEP 3: Delete April 2026 water bill if exists
DELETE FROM water_bills
WHERE tenant_id = (
    SELECT id FROM tenants 
    WHERE first_name = 'IBRAHIM' AND last_name = 'MUTEMBEI'
    LIMIT 1
)
AND bill_month = '2026-04-01'::date;

-- STEP 4: Delete April 2026 payments if any
DELETE FROM rent_payments
WHERE tenant_id = (
    SELECT id FROM tenants 
    WHERE first_name = 'IBRAHIM' AND last_name = 'MUTEMBEI'
    LIMIT 1
)
AND payment_month = '2026-04-01'::date;

-- STEP 5: VERIFY the fix
SELECT 
    'AFTER FIX' AS status,
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.arrears_balance AS new_balance,
    ta.lease_start_date,
    ta.is_active,
    CASE 
        WHEN ta.arrears_balance = 0 
        THEN '✅ BALANCE REMOVED'
        ELSE '❌ Still has balance: ' || ta.arrears_balance
    END AS result
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBS03'
AND t.first_name = 'IBRAHIM'
AND t.last_name = 'MUTEMBEI';

COMMIT;

-- =====================================================
-- AFTER RUNNING THIS:
-- 1. Hard refresh your browser: Ctrl + Shift + R
-- 2. Check Payment Management → Unpaid tab
-- 3. Ibrahim should NOT appear in April billing
-- =====================================================
