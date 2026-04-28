-- =====================================================
-- FIX: Exclude Ibrahim Mutembei from April 2026 Billing
-- =====================================================
-- Ibrahim starts paying from NEXT MONTH (May 2026)
-- Remove him from April 2026 billing expectations
-- =====================================================

BEGIN;

-- STEP 1: Find Ibrahim's current allocation
SELECT 
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.allocation_date,
    ta.lease_start_date,
    ta.lease_end_date,
    ta.monthly_rent,
    ta.arrears_balance,
    ta.is_active
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBS03'
AND t.first_name = 'IBRAHIM'
AND t.last_name = 'MUTEMBEI';

-- STEP 2: Update allocation to start from May 2026
-- Set lease_start_date to next month so billing excludes April
UPDATE tenant_allocations
SET 
    lease_start_date = '2026-05-01'::date,
    allocation_date = NOW(),  -- Reset allocation date to now
    arrears_balance = 0,       -- No arrears for a new tenant
    updated_at = NOW()
WHERE tenant_id = (
    SELECT t.id FROM tenants t
    WHERE t.first_name = 'IBRAHIM' AND t.last_name = 'MUTEMBEI'
)
AND unit_id = (
    SELECT pu.id FROM property_units pu
    WHERE pu.unit_code = 'KBS03'
)
AND is_active = true;

-- STEP 3: Verify the change
SELECT 
    'IBRAHIM MUTEMBEI - UPDATED' AS status,
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.allocation_date,
    ta.lease_start_date,
    ta.monthly_rent,
    ta.arrears_balance,
    CASE 
        WHEN ta.lease_start_date >= '2026-05-01'::date 
        THEN '✅ Will start paying from May 2026'
        ELSE '❌ Still active for April'
    END AS verification
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBS03'
AND t.first_name = 'IBRAHIM'
AND t.last_name = 'MUTEMBEI';

COMMIT;

-- =====================================================
-- HOW TO HANDLE FUTURE "STARTS NEXT MONTH" TENANTS:
-- =====================================================
-- When allocating a new tenant who starts next month:
-- 1. Set lease_start_date to 1st of next month
-- 2. Set allocation_date to NOW()
-- 3. Set arrears_balance = 0
-- 
-- The billing system automatically checks:
-- DATE_TRUNC('month', payment_month) >= DATE_TRUNC('month', lease_start_date)
-- So tenants with lease_start in May won't be billed for April
-- =====================================================
