-- =====================================================
-- FIX: April 2026 Misallocated Payments
-- =====================================================
-- Problem: Rent payments incorrectly allocated to arrears
-- Impact: 7+ tenants showing as unpaid despite paying
-- Solution: Reallocate payments to correct categories
-- =====================================================

BEGIN;

-- STEP 1: Review affected payments before fixing
SELECT 
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent AS expected_rent,
    rp.amount AS paid_amount,
    rp.allocated_to_rent AS current_to_rent,
    rp.allocated_to_arrears AS current_to_arrears,
    rp.allocated_to_water AS current_to_water,
    rp.remaining_balance AS current_remaining,
    rp.mpesa_transaction_id,
    rp.payment_month
FROM rent_payments rp
INNER JOIN tenants t ON t.id = rp.tenant_id
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.unit_id = rp.unit_id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = rp.unit_id
WHERE rp.status = 'completed'
AND rp.payment_month >= '2026-03-01'::date
AND rp.amount >= ta.monthly_rent
AND rp.allocated_to_rent < ta.monthly_rent
ORDER BY rp.payment_month DESC, rp.payment_date DESC;

-- STEP 2: Fix each misallocated payment
-- Fix Thuma Jeilan Bobo (KBC3) - April 2026
UPDATE rent_payments
SET 
    allocated_to_rent = 25000,
    allocated_to_arrears = 0,
    allocated_to_water = 0,
    remaining_balance = 0,
    is_advance_payment = false,
    updated_at = NOW()
WHERE mpesa_transaction_id = 'UD68JBUVIJ';

-- Fix Abdijabal Hussein Hajji (KBD3) - April 2026
UPDATE rent_payments
SET 
    allocated_to_rent = 25000,
    allocated_to_arrears = 0,
    allocated_to_water = 0,
    remaining_balance = 0,
    is_advance_payment = false,
    updated_at = NOW()
WHERE mpesa_transaction_id = 'UD63F09DMR';

-- Fix Abdirahman Abdullahi (KBC1) - April 2026
UPDATE rent_payments
SET 
    allocated_to_rent = 20000,
    allocated_to_arrears = 0,
    allocated_to_water = 0,
    remaining_balance = 0,
    is_advance_payment = false,
    updated_at = NOW()
WHERE mpesa_transaction_id = 'UD7QVBR9A3';

-- Fix Zahra Abdirahman (KBD1) - April 2026
UPDATE rent_payments
SET 
    allocated_to_rent = 20000,
    allocated_to_arrears = 0,
    allocated_to_water = 0,
    remaining_balance = 0,
    is_advance_payment = false,
    updated_at = NOW()
WHERE mpesa_transaction_id = 'UD64I04RXL';

-- Fix Amal YAHYA (KBE1) - April 2026
UPDATE rent_payments
SET 
    allocated_to_rent = 20000,
    allocated_to_arrears = 0,
    allocated_to_water = 0,
    remaining_balance = 0,
    is_advance_payment = false,
    updated_at = NOW()
WHERE mpesa_transaction_id = 'UD6S08ZL1D';

-- Fix Esha Athman (MJA11) - April 2026
UPDATE rent_payments
SET 
    allocated_to_rent = 19000,
    allocated_to_arrears = 0,
    allocated_to_water = 0,
    remaining_balance = 0,
    is_advance_payment = false,
    updated_at = NOW()
WHERE mpesa_transaction_id = 'UD65Q08V09';

-- Fix AHMED MAHMOUD (MJC9) - April 2026
UPDATE rent_payments
SET 
    allocated_to_rent = 18000,
    allocated_to_arrears = 0,
    allocated_to_water = 0,
    remaining_balance = 0,
    is_advance_payment = false,
    updated_at = NOW()
WHERE mpesa_transaction_id = 'UD7J5BUYWH';

-- Fix Kifaya Jeilan Bobo (KBA2) - April 2026
-- She paid 27,000, should be 27,000 to rent (not 25,000)
UPDATE rent_payments
SET 
    allocated_to_rent = 27000,
    allocated_to_arrears = 0,
    allocated_to_water = 0,
    remaining_balance = 0,
    is_advance_payment = false,
    updated_at = NOW()
WHERE mpesa_transaction_id = 'UCQKEAHZYY';

-- Fix HANAN HUBII (MJA3) - March 2026 (manual payment)
UPDATE rent_payments
SET 
    allocated_to_rent = 35000,
    allocated_to_arrears = 0,
    allocated_to_water = 0,
    remaining_balance = 0,
    is_advance_payment = false,
    updated_at = NOW()
WHERE mpesa_transaction_id = 'MANUAL_1775295094164';

-- STEP 3: Verify fixes
SELECT 
    'FIXED' AS status,
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent AS expected_rent,
    rp.amount AS paid_amount,
    rp.allocated_to_rent AS now_to_rent,
    rp.allocated_to_arrears AS now_to_arrears,
    rp.remaining_balance AS now_remaining,
    rp.mpesa_transaction_id,
    CASE 
        WHEN rp.allocated_to_rent >= ta.monthly_rent THEN '✅ Correct'
        ELSE '❌ Still wrong'
    END AS verification
FROM rent_payments rp
INNER JOIN tenants t ON t.id = rp.tenant_id
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.unit_id = rp.unit_id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = rp.unit_id
WHERE rp.mpesa_transaction_id IN (
    'UD68JBUVIJ', 'UD63F09DMR', 'UD7QVBR9A3', 'UD64I04RXL',
    'UD6S08ZL1D', 'UD65Q08V09', 'UD7J5BUYWH', 'UCQKEAHZYY',
    'MANUAL_1775295094164'
)
ORDER BY rp.payment_month DESC;

COMMIT;

-- =====================================================
-- NEXT: Fix the backend bug causing this
-- File: backend/controllers/paymentController.js
-- Function: trackRentPayment() or allocatePayment()
-- Issue: Not properly allocating to rent before arrears
-- =====================================================
