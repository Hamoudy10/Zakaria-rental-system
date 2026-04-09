-- =====================================================
-- FIX: Recalculate ALL Tenant Arrears Balances
-- =====================================================
-- Problem: tenant_allocations.arrears_balance is STALE
-- It wasn't updated after payments, causing false arrears
-- Solution: Recalculate from actual payment history
-- =====================================================

BEGIN;

-- STEP 1: Review current arrears vs actual for ALL tenants
SELECT 
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent,
    ta.arrears_balance AS current_arrears_in_db,
    
    -- Calculate months active
    GREATEST(1, 
        EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', NOW()), DATE_TRUNC('month', ta.allocation_date)))::integer
    ) AS months_active,
    
    -- Total rent owed (monthly_rent * months_active)
    ta.monthly_rent * GREATEST(1, 
        EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', NOW()), DATE_TRUNC('month', ta.allocation_date)))::integer
    ) AS total_rent_owed,
    
    -- Total rent paid (all time)
    COALESCE(SUM(
        CASE
            WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
        END
    ), 0) AS total_rent_paid,
    
    -- True arrears (total owed - total paid - current month rent)
    GREATEST(0, 
        (ta.monthly_rent * GREATEST(1, 
            EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', NOW()), DATE_TRUNC('month', ta.allocation_date)))::integer
        ))
        - COALESCE(SUM(
            CASE
                WHEN (
                    COALESCE(rp.allocated_to_rent, 0) +
                    COALESCE(rp.allocated_to_water, 0) +
                    COALESCE(rp.allocated_to_arrears, 0)
                ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
                ELSE COALESCE(rp.amount, 0)
            END
        ), 0)
        - ta.monthly_rent  -- Exclude current month
    ) AS true_arrears,
    
    -- Difference (what needs to be fixed)
    ta.arrears_balance - GREATEST(0, 
        (ta.monthly_rent * GREATEST(1, 
            EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', NOW()), DATE_TRUNC('month', ta.allocation_date)))::integer
        ))
        - COALESCE(SUM(
            CASE
                WHEN (
                    COALESCE(rp.allocated_to_rent, 0) +
                    COALESCE(rp.allocated_to_water, 0) +
                    COALESCE(rp.allocated_to_arrears, 0)
                ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
                ELSE COALESCE(rp.amount, 0)
            END
        ), 0)
        - ta.monthly_rent
    ) AS arrears_discrepancy

FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id 
    AND rp.unit_id = ta.unit_id 
    AND rp.status = 'completed'
GROUP BY t.first_name, t.last_name, pu.unit_code, ta.monthly_rent, ta.arrears_balance, ta.allocation_date
HAVING ta.arrears_balance != GREATEST(0, 
    (ta.monthly_rent * GREATEST(1, 
        EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', NOW()), DATE_TRUNC('month', ta.allocation_date)))::integer
    ))
    - COALESCE(SUM(
        CASE
            WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
        END
    ), 0)
    - ta.monthly_rent
)
ORDER BY ABS(ta.arrears_balance - GREATEST(0, 
    (ta.monthly_rent * GREATEST(1, 
        EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', NOW()), DATE_TRUNC('month', ta.allocation_date)))::integer
    ))
    - COALESCE(SUM(
        CASE
            WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
        END
    ), 0)
    - ta.monthly_rent
)) DESC;

-- STEP 2: Update ALL tenants' arrears_balance to match actual payment history
UPDATE tenant_allocations ta
SET arrears_balance = COALESCE(calc.true_arrears, 0),
    updated_at = NOW()
FROM (
    SELECT
        ta_calc.id AS allocation_id,
        -- True arrears = (monthly_rent * months_active) - total_rent_paid - current_month_rent
        GREATEST(0,
            (ta_calc.monthly_rent * GREATEST(1, 
                EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', NOW()), DATE_TRUNC('month', ta_calc.allocation_date)))::integer
            ))
            - COALESCE(SUM(
                CASE
                    WHEN (
                        COALESCE(rp.allocated_to_rent, 0) +
                        COALESCE(rp.allocated_to_water, 0) +
                        COALESCE(rp.allocated_to_arrears, 0)
                    ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
                    ELSE COALESCE(rp.amount, 0)
                END
            ), 0)
            - ta_calc.monthly_rent  -- Exclude current month
        ) AS true_arrears
    FROM tenant_allocations ta_calc
    LEFT JOIN rent_payments rp ON rp.tenant_id = ta_calc.tenant_id 
        AND rp.unit_id = ta_calc.unit_id 
        AND rp.status = 'completed'
    WHERE ta_calc.is_active = true
    GROUP BY ta_calc.id, ta_calc.monthly_rent, ta_calc.allocation_date
) calc
WHERE ta.id = calc.allocation_id;

-- STEP 3: Verify Kifaya specifically
SELECT 
    'KIFAYA CHECK' AS check_name,
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent,
    ta.arrears_balance AS updated_arrears,
    COALESCE(SUM(
        CASE
            WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
        END
    ), 0) AS total_rent_paid,
    CASE 
        WHEN ta.arrears_balance = 0 THEN '✅ Correct - No arrears'
        ELSE '❌ Still has arrears: ' || ta.arrears_balance
    END AS verification
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id 
    AND rp.unit_id = ta.unit_id 
    AND rp.status = 'completed'
WHERE pu.unit_code = 'KBA2'
AND t.first_name = 'Kifaya'
GROUP BY t.first_name, t.last_name, pu.unit_code, ta.monthly_rent, ta.arrears_balance;

-- STEP 4: Summary of changes
SELECT 
    'SUMMARY' AS info,
    COUNT(*) AS total_tenants_updated,
    COUNT(*) FILTER (WHERE arrears_balance = 0) AS tenants_with_zero_arrears,
    COUNT(*) FILTER (WHERE arrears_balance > 0) AS tenants_with_actual_arrears,
    SUM(arrears_balance) AS total_arrears_in_system
FROM tenant_allocations
WHERE is_active = true;

COMMIT;

-- =====================================================
-- AFTER RUNNING THIS SCRIPT:
-- 1. Refresh PaymentManagement frontend
-- 2. Kifaya should show KSh 0 arrears
-- 3. Only tenants who ACTUALLY owe money should show arrears
-- 4. Total due should match actual unpaid rent + water bills
-- =====================================================
