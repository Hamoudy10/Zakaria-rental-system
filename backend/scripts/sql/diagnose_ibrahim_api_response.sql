-- =====================================================
-- DIAGNOSTIC: What does the API see for Ibrahim?
-- =====================================================
-- This shows EXACTLY what the getTenantPaymentStatus API returns
-- So we can see why frontend shows KSh 8000
-- =====================================================

-- STEP 1: Check what API reads from tenant_allocations
SELECT 
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent,
    ta.arrears_balance AS arrears_from_db,
    ta.lease_start_date,
    ta.is_active
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBS03'
AND t.first_name ILIKE '%IBRAHIM%';

-- STEP 2: Check if there are any April 2026 water bills
SELECT 
    wb.id,
    wb.amount,
    wb.bill_month,
    wb.notes,
    wb.created_at
FROM water_bills wb
INNER JOIN tenants t ON t.id = wb.tenant_id
INNER JOIN property_units pu ON pu.id = wb.unit_id
WHERE pu.unit_code = 'KBS03'
AND t.first_name ILIKE '%IBRAHIM%'
AND wb.bill_month >= '2026-04-01'::date;

-- STEP 3: Check ALL payment records (any month)
SELECT 
    rp.id,
    rp.payment_month,
    rp.amount,
    rp.allocated_to_rent,
    rp.allocated_to_water,
    rp.allocated_to_arrears,
    rp.remaining_balance,
    rp.status,
    rp.payment_method,
    rp.mpesa_transaction_id,
    rp.created_at
FROM rent_payments rp
INNER JOIN tenants t ON t.id = rp.tenant_id
INNER JOIN property_units pu ON pu.id = rp.unit_id
WHERE pu.unit_code = 'KBS03'
AND t.first_name ILIKE '%IBRAHIM%'
ORDER BY rp.payment_month DESC;

-- STEP 4: Simulate what API calculates for April 2026
SELECT 
    'API CALCULATION FOR APRIL 2026' AS check_name,
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent,
    ta.arrears_balance AS arrears_from_db,
    
    -- What API calculates as rent_paid for April
    COALESCE((
        SELECT SUM(
            CASE
                WHEN (
                    COALESCE(rp.allocated_to_rent, 0) +
                    COALESCE(rp.allocated_to_water, 0) +
                    COALESCE(rp.allocated_to_arrears, 0)
                ) > 0 THEN COALESCE(rp.allocated_to_rent, 0) + COALESCE(rp.allocated_to_arrears, 0)
                ELSE COALESCE(rp.amount, 0)
            END
        )
        FROM rent_payments rp
        WHERE rp.tenant_id = t.id 
        AND rp.unit_id = pu.id
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', '2026-04-01'::date)
        AND rp.status = 'completed'
    ), 0) AS rent_paid_april,
    
    -- What API calculates as water_bill for April
    COALESCE((
        SELECT wb.amount FROM water_bills wb
        WHERE wb.tenant_id = t.id
        AND (wb.unit_id = pu.id OR wb.unit_id IS NULL)
        AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', '2026-04-01'::date)
        ORDER BY CASE WHEN wb.unit_id = pu.id THEN 0 ELSE 1 END
        LIMIT 1
    ), 0) AS water_bill_april,
    
    -- What API calculates as arrears_paid (ALL TIME)
    COALESCE((
        SELECT SUM(COALESCE(rp.allocated_to_arrears, 0))
        FROM rent_payments rp
        WHERE rp.tenant_id = t.id
        AND rp.unit_id = pu.id
        AND rp.status = 'completed'
    ), 0) AS arrears_paid_all_time,
    
    -- rawArrearsDue = arrears - arrearsPaid
    GREATEST(0, ta.arrears_balance - COALESCE((
        SELECT SUM(COALESCE(rp.allocated_to_arrears, 0))
        FROM rent_payments rp
        WHERE rp.tenant_id = t.id
        AND rp.unit_id = pu.id
        AND rp.status = 'completed'
    ), 0)) AS raw_arrears_due,
    
    -- rawRentDue = monthly_rent - rent_paid
    GREATEST(0, ta.monthly_rent - COALESCE((
        SELECT SUM(
            CASE
                WHEN (
                    COALESCE(rp.allocated_to_rent, 0) +
                    COALESCE(rp.allocated_to_water, 0) +
                    COALESCE(rp.allocated_to_arrears, 0)
                ) > 0 THEN COALESCE(rp.allocated_to_rent, 0) + COALESCE(rp.allocated_to_arrears, 0)
                ELSE COALESCE(rp.amount, 0)
            END
        )
        FROM rent_payments rp
        WHERE rp.tenant_id = t.id 
        AND rp.unit_id = pu.id
        AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', '2026-04-01'::date)
        AND rp.status = 'completed'
    ), 0)) AS raw_rent_due,
    
    -- Expected total_due
    CASE
        WHEN ta.arrears_balance = 0 THEN '✅ Should be 0 (or just water bill)'
        ELSE '❌ Still has arrears: ' || ta.arrears_balance
    END AS expected_result

FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBS03'
AND t.first_name ILIKE '%IBRAHIM%';

-- =====================================================
-- AFTER RUNNING THIS:
-- Share the results of all 4 steps
-- This will show us EXACTLY why the API returns 8000
-- =====================================================
