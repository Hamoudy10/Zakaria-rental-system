-- =====================================================
-- INVESTIGATE HASHIM YUSUF - KBB2 PAYMENT DISCREPANCY
-- =====================================================
-- Frontend shows: 30,000 total due
-- SMS shows: 57,000 total due
-- Need to find why there's a 27,000 difference
-- =====================================================

-- STEP 1: Check tenant details and allocation
SELECT 
    t.id AS tenant_id,
    t.first_name || ' ' || t.last_name AS tenant_name,
    t.phone_number,
    pu.unit_code,
    ta.monthly_rent,
    ta.arrears_balance,
    ta.allocation_date,
    ta.is_active
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
WHERE pu.unit_code = 'KBB2'
AND t.first_name = 'Hashim';

-- STEP 2: Check ALL payments for this tenant
SELECT 
    rp.id,
    rp.payment_date,
    rp.payment_month,
    rp.amount,
    rp.allocated_to_rent,
    rp.allocated_to_water,
    rp.allocated_to_arrears,
    rp.status,
    rp.payment_method,
    rp.created_at
FROM rent_payments rp
INNER JOIN tenants t ON t.id = rp.tenant_id
INNER JOIN property_units pu ON pu.id = rp.unit_id
WHERE pu.unit_code = 'KBB2'
AND t.first_name = 'Hashim'
ORDER BY rp.payment_month, rp.payment_date;

-- STEP 3: Check water bills
SELECT 
    wb.id,
    wb.amount,
    wb.bill_month,
    wb.notes,
    wb.created_at
FROM water_bills wb
INNER JOIN tenants t ON t.id = wb.tenant_id
INNER JOIN property_units pu ON pu.id = wb.unit_id
WHERE pu.unit_code = 'KBB2'
AND t.first_name = 'Hashim'
ORDER BY wb.bill_month;

-- STEP 4: Calculate what the billing SMS query would calculate
SELECT
    ta.monthly_rent,
    ta.arrears_balance,
    
    -- Calculate months active (as of April 2026)
    GREATEST(1, 
        EXTRACT(MONTH FROM AGE('2026-04-01'::date, DATE_TRUNC('month', ta.allocation_date)))::integer + 1
    ) AS months_active,
    
    -- Total rent ever owed
    ta.monthly_rent * GREATEST(1, 
        EXTRACT(MONTH FROM AGE('2026-04-01'::date, DATE_TRUNC('month', ta.allocation_date)))::integer + 1
    ) AS total_rent_owed,
    
    -- Total rent paid (using the new logic)
    COALESCE(SUM(
        CASE
            WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
        END
    ), 0) AS total_rent_paid_all_time,
    
    -- Actual arrears (new calculation)
    GREATEST(0, (
        ta.monthly_rent * GREATEST(1, 
            EXTRACT(MONTH FROM AGE('2026-04-01'::date, DATE_TRUNC('month', ta.allocation_date)))::integer + 1
        )
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
    )) AS actual_arrears_new_logic,
    
    -- April rent due
    GREATEST(0, ta.monthly_rent - COALESCE(SUM(
        CASE
            WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
        END
    ) FILTER (WHERE rp.payment_month = '2026-04-01'::date), 0)) AS april_rent_due,
    
    -- Water due (if any)
    COALESCE(wb_april.amount, 0) AS april_water_bill,
    COALESCE(SUM(rp.allocated_to_water) FILTER (WHERE rp.payment_month = '2026-04-01'::date), 0) AS april_water_paid,
    
    -- Total due (what SMS would calculate)
    GREATEST(0, ta.monthly_rent - COALESCE(SUM(
        CASE
            WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
        END
    ) FILTER (WHERE rp.payment_month = '2026-04-01'::date), 0))
    + COALESCE(wb_april.amount, 0) - COALESCE(SUM(rp.allocated_to_water) FILTER (WHERE rp.payment_month = '2026-04-01'::date), 0)
    + GREATEST(0, (
        ta.monthly_rent * GREATEST(1, 
            EXTRACT(MONTH FROM AGE('2026-04-01'::date, DATE_TRUNC('month', ta.allocation_date)))::integer + 1
        )
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
    )) AS total_due_sms_calculation

FROM tenant_allocations ta
INNER JOIN tenants t ON t.id = ta.tenant_id
INNER JOIN property_units pu ON pu.id = ta.unit_id
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id AND rp.unit_id = pu.id AND rp.status = 'completed'
LEFT JOIN water_bills wb_april ON wb_april.tenant_id = t.id AND wb_april.unit_id = pu.id AND wb_april.bill_month = '2026-04-01'::date
WHERE pu.unit_code = 'KBB2'
AND t.first_name = 'Hashim'
AND ta.is_active = true
GROUP BY ta.monthly_rent, ta.arrears_balance, ta.allocation_date, wb_april.amount;

-- STEP 5: What the FRONTEND payment status shows
SELECT
    t.first_name || ' ' || t.last_name AS tenant_name,
    pu.unit_code,
    ta.monthly_rent AS expected_rent,
    COALESCE(SUM(
        CASE
            WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
        END
    ), 0) AS rent_paid_april,
    ta.monthly_rent - COALESCE(SUM(
        CASE
            WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
        END
    ), 0) AS rent_due_frontend,
    ta.arrears_balance,
    COALESCE(SUM(rp.allocated_to_arrears), 0) AS arrears_paid,
    COALESCE(wb.amount, 0) AS water_bill,
    COALESCE(SUM(rp.allocated_to_water), 0) AS water_paid
FROM tenants t
INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
INNER JOIN property_units pu ON pu.id = ta.unit_id
LEFT JOIN rent_payments rp ON rp.tenant_id = t.id
    AND rp.unit_id = ta.unit_id
    AND rp.status = 'completed'
    AND rp.payment_month = '2026-04-01'::date
LEFT JOIN water_bills wb ON wb.tenant_id = t.id
    AND (wb.unit_id = pu.id OR wb.unit_id IS NULL)
    AND wb.bill_month = '2026-04-01'::date
WHERE pu.unit_code = 'KBB2'
AND t.first_name = 'Hashim'
GROUP BY t.first_name, t.last_name, pu.unit_code, ta.monthly_rent, ta.arrears_balance, wb.amount;
