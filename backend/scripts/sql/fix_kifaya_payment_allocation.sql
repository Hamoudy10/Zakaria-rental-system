-- =====================================================
-- INVESTIGATE & FIX: Kifaya Jeilan Bobo (KBA2) Payment Allocation
-- =====================================================
-- Issue: April payment of KSh 27,000 only allocated KSh 25,000 to rent
-- Missing KSh 2,000 (shows remaining: 0 but unallocated)
-- =====================================================

BEGIN;

-- STEP 1: Check rent amount mismatch
SELECT 
    pu.unit_code,
    pu.rent_amount AS unit_default_rent,
    ta.monthly_rent AS tenant_actual_rent,
    ta.id AS allocation_id,
    t.first_name || ' ' || t.last_name AS tenant_name,
    (pu.rent_amount != ta.monthly_rent) AS rent_mismatch
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBA2'
AND t.first_name = 'Kifaya';

-- STEP 2: Check the problematic April payment
SELECT 
    rp.id,
    rp.amount,
    rp.allocated_to_rent,
    rp.allocated_to_water,
    rp.allocated_to_arrears,
    rp.remaining_balance,
    rp.payment_month,
    rp.payment_date,
    rp.mpesa_transaction_id
FROM rent_payments rp
INNER JOIN tenants t ON t.id = rp.tenant_id
INNER JOIN property_units pu ON pu.id = rp.unit_id
WHERE pu.unit_code = 'KBA2'
AND t.first_name = 'Kifaya'
AND rp.payment_month = '2026-04-01'::date;

-- STEP 3: Fix the April payment allocation
-- Allocate the missing KSh 2,000 to rent
UPDATE rent_payments
SET 
    allocated_to_rent = 27000,
    remaining_balance = 0,
    updated_at = NOW()
WHERE id = (
    SELECT rp.id
    FROM rent_payments rp
    INNER JOIN tenants t ON t.id = rp.tenant_id
    INNER JOIN property_units pu ON pu.id = rp.unit_id
    WHERE pu.unit_code = 'KBA2'
    AND t.first_name = 'Kifaya'
    AND rp.payment_month = '2026-04-01'::date
);

-- STEP 4: Update unit rent_amount to match tenant's actual rent (if mismatched)
UPDATE property_units
SET rent_amount = (
    SELECT ta.monthly_rent 
    FROM tenant_allocations ta 
    WHERE ta.unit_id = property_units.id 
    AND ta.is_active = true 
    LIMIT 1
)
WHERE unit_code = 'KBA2'
AND rent_amount != (
    SELECT ta.monthly_rent 
    FROM tenant_allocations ta 
    INNER JOIN tenants t ON t.id = ta.tenant_id
    WHERE ta.unit_id = property_units.id 
    AND ta.is_active = true 
    AND t.first_name = 'Kifaya'
    LIMIT 1
);

-- STEP 5: Verify the fix
SELECT 
    'FIXED' AS status,
    rp.amount,
    rp.allocated_to_rent,
    rp.allocated_to_water,
    rp.allocated_to_arrears,
    rp.remaining_balance,
    CASE 
        WHEN rp.allocated_to_rent = 27000 THEN '✅ Correctly allocated'
        ELSE '❌ Still incorrect'
    END AS verification
FROM rent_payments rp
INNER JOIN tenants t ON t.id = rp.tenant_id
INNER JOIN property_units pu ON pu.id = rp.unit_id
WHERE pu.unit_code = 'KBA2'
AND t.first_name = 'Kifaya'
AND rp.payment_month = '2026-04-01'::date;

COMMIT;

-- =====================================================
-- CHECK FOR SIMILAR ISSUES IN OTHER TENANTS
-- =====================================================
-- Find all payments where allocated_to_rent < monthly_rent but amount >= monthly_rent

SELECT 
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent AS expected_rent,
    rp.amount AS paid_amount,
    rp.allocated_to_rent,
    rp.amount - rp.allocated_to_rent AS missing_amount,
    rp.payment_month,
    rp.payment_date,
    rp.mpesa_transaction_id
FROM rent_payments rp
INNER JOIN tenants t ON t.id = rp.tenant_id
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.unit_id = rp.unit_id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = rp.unit_id
WHERE rp.status = 'completed'
AND rp.amount >= ta.monthly_rent
AND rp.allocated_to_rent < ta.monthly_rent
AND rp.payment_month >= '2026-03-01'::date
ORDER BY rp.payment_month DESC, missing_amount DESC;
