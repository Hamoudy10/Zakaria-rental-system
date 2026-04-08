-- =====================================================
-- MARCH 2026 PAYMENT RECONCILIATION FIXES
-- =====================================================
-- Fixes:
-- 1. Zam Zam Abdi (MJB4) - Cash/Bank payment not recorded
-- 2. Maryam Omar - Payment mismatch investigation
--    - MJG2B: Shows KSh 20,000 paid ✅
--    - MJG1A: Shows KSh 0 paid ❌ (expects KSh 23,000)
--    - M-Pesa receipt: UC9I08TFH4 on 9/3/26 for KSh 20,000
--    - Account Number in M-Pesa: MJB2 (needs clarification)
-- 3. Update tenant_allocations.arrears_balance to reflect actual status
-- =====================================================

BEGIN;

-- =====================================================
-- FIX 1: Record Zam Zam Abdi's Cash Payment for March
-- =====================================================
-- Note: Update payment_date to actual payment date if different
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
    'CASH_MARCH_2026_' || t.id AS mpesa_transaction_id,
    NULL AS mpesa_receipt_number,
    t.phone_number,
    35000.00 AS amount,  -- Update if different amount
    '2026-03-15 10:00:00'::timestamp AS payment_date,  -- Update to actual date
    '2026-03-01'::date AS payment_month,
    'completed' AS status,
    0 AS allocated_to_arrears,
    0 AS allocated_to_water,
    35000.00 AS allocated_to_rent,  -- Full rent payment
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
    AND pu.unit_code = 'MJB4'
    AND NOT EXISTS (
        SELECT 1 FROM rent_payments rp
        WHERE rp.tenant_id = t.id
        AND rp.payment_month = '2026-03-01'::date
        AND rp.status = 'completed'
        AND rp.allocated_to_rent > 0
    );


-- =====================================================
-- FIX 2: Maryam Omar - Payment Reconciliation
-- =====================================================
-- SITUATION:
-- - Maryam has TWO active units: MJG2B (rent: 20,000) and MJG1A (rent: 23,000)
-- - M-Pesa receipt UC9I08TFH4 on 9/3/26 for KSh 20,000
-- - Account Number in M-Pesa message: MJB2
-- - System shows MJG2B as PAID (20,000) ✅
-- - System shows MJG1A as UNPAID (0) ❌
--
-- ANALYSIS:
-- The M-Pesa message says "Account Number MJB2" but the system recorded it under MJG2B.
-- This suggests:
-- Option A: The payment was INTENDED for MJG2B and was correctly allocated
-- Option B: MJB2 might be a third unit (check if it exists)
-- Option C: Account number format in M-Pesa differs from unit_code
--
-- RECOMMENDATION: 
-- If Maryam is supposed to pay for BOTH units (MJG2B + MJG1A):
-- - MJG2B is already paid ✅ (20,000)
-- - She still owes MJG1A (23,000)
--
-- If the MJB2 account refers to a DIFFERENT unit entirely, we need to investigate.
-- For now, we'll ADD the missing payment for MJG1A if it doesn't exist:
-- =====================================================

-- Check if MJB2 exists as a unit
SELECT 
    pu.unit_code,
    p.name AS property_name,
    t.first_name || ' ' || t.last_name AS tenant_name,
    ta.monthly_rent
FROM property_units pu
LEFT JOIN tenant_allocations ta ON ta.unit_id = pu.id AND ta.is_active = true
LEFT JOIN tenants t ON t.id = ta.tenant_id
LEFT JOIN properties p ON p.id = pu.property_id
WHERE pu.unit_code = 'MJB2';

-- If MJB2 exists and belongs to Maryam, the payment was correctly recorded
-- If MJB2 does NOT exist or belongs to someone else, there's a mapping issue

-- Add missing payment for MJG1A (March 2026)
-- UNCOMMENT AND RUN if Maryam needs to pay for BOTH units:
/*
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
    'PENDING_MJG1A_MARCH_2026' AS mpesa_transaction_id,
    NULL AS mpesa_receipt_number,
    t.phone_number,
    23000.00 AS amount,
    '2026-03-31 23:59:59'::timestamp AS payment_date,
    '2026-03-01'::date AS payment_month,
    'pending' AS status,  -- Mark as pending until confirmed
    0 AS allocated_to_arrears,
    0 AS allocated_to_water,
    23000.00 AS allocated_to_rent,
    0 AS remaining_balance,
    false AS is_advance_payment,
    'manual' AS payment_method,
    NOW() AS created_at,
    NOW() AS updated_at
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
INNER JOIN properties p ON p.id = pu.property_id
WHERE
    t.first_name = 'Maryam'
    AND t.last_name = 'Omar'
    AND pu.unit_code = 'MJG1A'
    AND NOT EXISTS (
        SELECT 1 FROM rent_payments rp
        WHERE rp.tenant_id = t.id
        AND rp.unit_id = pu.id
        AND rp.payment_month = '2026-03-01'::date
        AND rp.status = 'completed'
    );
*/


-- =====================================================
-- FIX 3: Update arrears_balance for all tenants
-- Recalculate based on actual payments made
-- =====================================================

UPDATE tenant_allocations ta
SET arrears_balance = COALESCE(calc.new_arrears, 0),
    updated_at = NOW()
FROM (
    SELECT
        ta_calc.id AS allocation_id,
        ta_calc.monthly_rent,
        ta_calc.arrears_balance AS old_arrears,
        
        -- Calculate months since allocation
        GREATEST(1, 
            EXTRACT(MONTH FROM AGE('2026-04-01'::date, ta_calc.allocation_date))::integer
        ) AS months_active,
        
        -- Total rent paid
        COALESCE(payments.total_paid_rent, 0) AS total_paid_rent,
        
        -- New arrears = (monthly_rent * months_active) + old_arrears - total_paid
        GREATEST(0, 
            (ta_calc.monthly_rent * GREATEST(1, 
                EXTRACT(MONTH FROM AGE('2026-04-01'::date, ta_calc.allocation_date))::integer
            ))
            + ta_calc.arrears_balance
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
-- VERIFICATION: Check results after fixes
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
WHERE
    t.first_name IN ('zam zam', 'Maryam')
    OR pu.unit_code IN ('MJB4', 'MJG2B', 'MJG1A', 'MJB2')
GROUP BY t.id, t.first_name, t.last_name, pu.unit_code, p.name, ta.monthly_rent, ta.arrears_balance
ORDER BY tenant_name, pu.unit_code;


COMMIT;

-- =====================================================
-- ADMIN ACTION REQUIRED:
-- =====================================================
-- 1. Zam Zam Abdi (MJB4): 
--    - Confirm payment amount (assumed KSh 35,000)
--    - Confirm payment date (update if different)
--    - Run the script to insert the payment
--
-- 2. Maryam Omar:
--    - Check if unit MJB2 exists (query included above)
--    - If MJB2 exists and belongs to Maryam: payment is correctly recorded
--    - If Maryam has TWO units (MJG2B + MJG1A):
--      * MJG2B is PAID ✅
--      * MJG1A still owes KSh 23,000 ❌
--      * Uncomment the INSERT statement to add pending payment
--
-- 3. After running fixes:
--    - Verify with the VERIFICATION query
--    - Refresh frontend PaymentManagement
--    - Check that Unpaid tab now shows correct tenants only
-- =====================================================
