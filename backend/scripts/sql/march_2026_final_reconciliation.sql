-- =====================================================
-- MARCH 2026 PAYMENT RECONCILIATION - FINAL FIXES
-- =====================================================
-- Date: April 8, 2026
-- Based on actual payment verification
-- =====================================================

BEGIN;

-- =====================================================
-- FIX 1: Zam Zam Abdi - Record Manual Cash Payment
-- =====================================================
-- Unit: MJB4
-- Amount: KSh 35,000
-- Method: Cash/Bank (not recorded previously)
-- =====================================================

INSERT INTO rent_payments (
    tenant_id,
    unit_id,
    property_id,
    mpesa_transaction_id,
    mpesa_receipt_number,
    phone_number,
    amount,
    payment_date,
    payment_month,
    status,
    allocated_to_arrears,
    allocated_to_water,
    allocated_to_rent,
    remaining_balance,
    is_advance_payment,
    payment_method,
    created_at,
    updated_at
)
SELECT
    t.id AS tenant_id,
    pu.id AS unit_id,
    p.id AS property_id,
    'MANUAL_CASH_MARCH_2026_ZAMZAM' AS mpesa_transaction_id,
    NULL AS mpesa_receipt_number,
    t.phone_number,
    35000.00 AS amount,
    '2026-03-20 12:00:00'::timestamp AS payment_date,
    '2026-03-01'::date AS payment_month,
    'completed' AS status,
    0 AS allocated_to_arrears,
    0 AS allocated_to_water,
    35000.00 AS allocated_to_rent,
    0 AS remaining_balance,
    false AS is_advance_payment,
    'cash' AS payment_method,
    NOW() AS created_at,
    NOW() AS updated_at
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
INNER JOIN properties p ON p.id = pu.property_id
WHERE
    t.first_name = 'zam zam'
    AND t.last_name = 'Abdi'
    AND pu.unit_code = 'MJB4';


-- =====================================================
-- FIX 2: Maryam Omar - Add Missing Payment for MJG1A
-- =====================================================
-- CONFIRMED: Maryam has TWO active units
-- Unit MJG2B: ✅ PAID KSh 20,000 (M-Pesa UC9I08TFH4)
-- Unit MJG1A: ❌ UNPAID KSh 23,000
-- 
-- NOTE: We're NOT adding payment for MJG1A because
-- she genuinely hasn't paid for it yet.
-- This will correctly show as unpaid in the system.
-- =====================================================

-- No INSERT needed - MJG1A should remain unpaid
-- This query just verifies the situation:
SELECT 
    'Maryam Omar - Two Units Status' AS info,
    pu.unit_code,
    ta.monthly_rent AS expected,
    COALESCE(SUM(rp.allocated_to_rent), 0) AS paid,
    ta.monthly_rent - COALESCE(SUM(rp.allocated_to_rent), 0) AS outstanding,
    CASE 
        WHEN COALESCE(SUM(rp.allocated_to_rent), 0) >= ta.monthly_rent THEN '✅ PAID'
        ELSE '❌ UNPAID'
    END AS status
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id
    AND rp.unit_id = ta.unit_id
    AND rp.status = 'completed'
    AND rp.payment_month = '2026-03-01'::date
WHERE t.first_name = 'Maryam' AND t.last_name = 'Omar'
GROUP BY pu.unit_code, ta.monthly_rent
ORDER BY pu.unit_code;


-- =====================================================
-- FIX 3: Mohamed Abdirahman Idris - MJA7 Occupied
-- =====================================================
-- Status: Currently occupying MJA7 but NO payment record
-- Action: Leave as unpaid (tenant genuinely hasn't paid)
-- No database fix needed - tenant owes the money
-- =====================================================

-- Just verify the situation:
SELECT 
    'Mohamed Idris - MJA7 Status' AS info,
    pu.unit_code,
    ta.monthly_rent AS expected,
    COALESCE(SUM(rp.allocated_to_rent), 0) AS paid,
    ta.arrears_balance AS current_arrears
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id
    AND rp.unit_id = ta.unit_id
    AND rp.status = 'completed'
    AND rp.payment_month = '2026-03-01'::date
WHERE t.first_name = 'Mohamed' 
AND t.last_name = 'Abdirahman idris'
GROUP BY pu.unit_code, ta.monthly_rent, ta.arrears_balance;


-- =====================================================
-- FIX 4: Recalculate ALL Arrears Balances
-- =====================================================
-- This ensures tenant_allocations.arrears_balance 
-- matches actual payment history
-- =====================================================

UPDATE tenant_allocations ta
SET arrears_balance = COALESCE(calc.new_arrears, 0),
    updated_at = NOW()
FROM (
    SELECT
        ta_calc.id AS allocation_id,
        ta_calc.monthly_rent,
        ta_calc.arrears_balance AS old_arrears,
        ta_calc.allocation_date,
        
        -- Calculate total months tenant has been active (up to end of March)
        GREATEST(1, 
            EXTRACT(MONTH FROM AGE('2026-03-31'::date, DATE_TRUNC('month', ta_calc.allocation_date)))::integer + 1
        ) AS months_active,
        
        -- Total rent paid across all time
        COALESCE(payments.total_paid_rent, 0) AS total_paid_rent,
        
        -- Calculate new arrears:
        -- Total owed = monthly_rent * months_active
        -- Arrears = MAX(0, total_owed - total_paid)
        GREATEST(0, 
            (ta_calc.monthly_rent * GREATEST(1, 
                EXTRACT(MONTH FROM AGE('2026-03-31'::date, DATE_TRUNC('month', ta_calc.allocation_date)))::integer + 1
            ))
            - COALESCE(payments.total_paid_rent, 0)
        ) AS new_arrears
        
    FROM tenant_allocations ta_calc
    LEFT JOIN (
        SELECT 
            unit_id,
            SUM(allocated_to_rent) AS total_paid_rent
        FROM rent_payments
        WHERE status = 'completed'
        GROUP BY unit_id
    ) payments ON payments.unit_id = ta_calc.unit_id
    WHERE ta_calc.is_active = true
) calc
WHERE ta.id = calc.allocation_id;


-- =====================================================
-- VERIFICATION QUERY 1: Zam Zam After Fix
-- =====================================================

SELECT 
    'VERIFICATION: Zam Zam Abdi' AS check_name,
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent AS expected,
    COALESCE(SUM(rp.allocated_to_rent), 0) AS paid,
    CASE 
        WHEN COALESCE(SUM(rp.allocated_to_rent), 0) >= ta.monthly_rent THEN '✅ NOW PAID'
        ELSE '❌ STILL UNPAID'
    END AS status
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id
    AND rp.unit_id = ta.unit_id
    AND rp.status = 'completed'
    AND rp.payment_month = '2026-03-01'::date
WHERE t.first_name = 'zam zam' AND t.last_name = 'Abdi'
GROUP BY t.first_name, t.last_name, pu.unit_code, ta.monthly_rent;


-- =====================================================
-- VERIFICATION QUERY 2: All March 2026 Payment Status
-- =====================================================

SELECT
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    p.name AS property_name,
    ta.monthly_rent AS expected_rent,
    COALESCE(SUM(rp.allocated_to_rent), 0) AS paid_to_rent,
    ta.arrears_balance AS current_arrears,
    
    CASE
        WHEN COALESCE(SUM(rp.allocated_to_rent), 0) >= ta.monthly_rent THEN '✅ Paid'
        WHEN COALESCE(SUM(rp.allocated_to_rent), 0) > 0 THEN '⚠️ Partial'
        ELSE '❌ Unpaid'
    END AS march_status

FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id AND pu.is_active = true
INNER JOIN properties p ON p.id = pu.property_id
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id
    AND rp.unit_id = ta.unit_id
    AND rp.status = 'completed'
    AND rp.payment_month = '2026-03-01'::date
GROUP BY t.id, t.first_name, t.last_name, pu.unit_code, p.name, ta.monthly_rent, ta.arrears_balance
ORDER BY
    CASE
        WHEN COALESCE(SUM(rp.allocated_to_rent), 0) >= ta.monthly_rent THEN 1
        WHEN COALESCE(SUM(rp.allocated_to_rent), 0) > 0 THEN 2
        ELSE 3
    END,
    tenant_name;


-- =====================================================
-- VERIFICATION QUERY 3: Summary Statistics
-- =====================================================

SELECT
    COUNT(*) AS total_active_tenants,
    
    COUNT(*) FILTER (WHERE 
        COALESCE(SUM(rp.allocated_to_rent), 0) >= ta.monthly_rent
    ) AS fully_paid,
    
    COUNT(*) FILTER (WHERE 
        COALESCE(SUM(rp.allocated_to_rent), 0) > 0 
        AND COALESCE(SUM(rp.allocated_to_rent), 0) < ta.monthly_rent
    ) AS partial_payment,
    
    COUNT(*) FILTER (WHERE 
        COALESCE(SUM(rp.allocated_to_rent), 0) = 0
    ) AS no_payment

FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id
    AND rp.unit_id = ta.unit_id
    AND rp.status = 'completed'
    AND rp.payment_month = '2026-03-01'::date
GROUP BY t.id, ta.monthly_rent;


COMMIT;

-- =====================================================
-- SUMMARY OF CHANGES:
-- =====================================================
-- ✅ Zam Zam Abdi (MJB4): Added manual cash payment KSh 35,000
-- ✅ Maryam Omar (MJG2B): Already paid KSh 20,000 (no change)
-- ✅ Maryam Omar (MJG1A): Correctly shows as UNPAID KSh 23,000
-- ✅ Mohamed Idris (MJA7): Correctly shows as UNPAID KSh 19,000
-- ✅ All arrears balances recalculated based on actual payments
-- =====================================================

-- AFTER RUNNING THIS SCRIPT:
-- 1. Refresh the frontend PaymentManagement page
-- 2. Check that Zam Zam now appears in PAID tab
-- 3. Check that Maryam (MJG1A) and Mohamed appear in UNPAID tab
-- 4. Verify arrears balances are correct
-- =====================================================
