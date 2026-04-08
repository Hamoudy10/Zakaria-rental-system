-- =====================================================
-- MARCH 2026 ARREARS RECONCILIATION REPORT
-- =====================================================
-- Shows: Which tenants ACTUALLY owe money for March
-- Compares: Expected rent vs Amount paid in March
-- Helps: Identify real arrears vs false positives
-- =====================================================

-- =====================================================
-- QUERY 1: Who ACTUALLY Owes Money for March 2026
-- =====================================================

WITH march_payments AS (
    -- All payments recorded in March 2026
    SELECT
        rp.tenant_id,
        rp.unit_id,
        SUM(rp.allocated_to_rent) AS total_paid_to_rent,
        SUM(rp.allocated_to_water) AS total_paid_to_water,
        SUM(rp.allocated_to_arrears) AS total_paid_to_arrears,
        SUM(rp.amount) AS total_amount_paid
    FROM rent_payments rp
    WHERE
        rp.status = 'completed'
        AND rp.created_at >= '2026-03-01 00:00:00'::timestamp
        AND rp.created_at < '2026-04-01 00:00:00'::timestamp
    GROUP BY rp.tenant_id, rp.unit_id
),

march_water_bills AS (
    -- Water bills for March 2026
    SELECT
        wb.tenant_id,
        wb.unit_id,
        SUM(wb.amount) AS water_bill_amount
    FROM water_bills wb
    WHERE
        wb.bill_month = '2026-03-01'::date
    GROUP BY wb.tenant_id, wb.unit_id
),

tenant_march_summary AS (
    SELECT
        -- Tenant Details
        t.id AS tenant_id,
        t.first_name || ' ' || t.last_name AS tenant_name,
        t.national_id,
        t.phone_number,

        -- Property & Unit
        p.name AS property_name,
        pu.unit_code,

        -- Expected Rent for March
        ta.monthly_rent AS expected_rent,

        -- Actual Payments in March
        COALESCE(mp.total_paid_to_rent, 0) AS paid_to_rent,
        COALESCE(mp.total_paid_to_water, 0) AS paid_to_water,
        COALESCE(mp.total_paid_to_arrears, 0) AS paid_to_arrears,
        COALESCE(mp.total_amount_paid, 0) AS total_paid,

        -- Water Bill
        COALESCE(wb.water_bill_amount, 0) AS water_bill,

        -- Balances
        CASE
            WHEN ta.monthly_rent - COALESCE(mp.total_paid_to_rent, 0) > 0
            THEN ta.monthly_rent - COALESCE(mp.total_paid_to_rent, 0)
            ELSE 0
        END AS outstanding_rent,

        CASE
            WHEN COALESCE(wb.water_bill_amount, 0) - COALESCE(mp.total_paid_to_water, 0) > 0
            THEN COALESCE(wb.water_bill_amount, 0) - COALESCE(mp.total_paid_to_water, 0)
            ELSE 0
        END AS outstanding_water,

        ta.arrears_balance AS previous_arrears,

        -- Final Status
        CASE
            WHEN COALESCE(mp.total_paid_to_rent, 0) >= ta.monthly_rent
            AND COALESCE(wb.water_bill_amount, 0) = 0
            THEN '✅ PAID IN FULL'

            WHEN COALESCE(mp.total_paid_to_rent, 0) >= ta.monthly_rent
            AND COALESCE(mp.total_paid_to_water, 0) >= COALESCE(wb.water_bill_amount, 0)
            THEN '✅ PAID (Rent + Water)'

            WHEN COALESCE(mp.total_paid_to_rent, 0) >= ta.monthly_rent
            AND COALESCE(mp.total_paid_to_water, 0) < COALESCE(wb.water_bill_amount, 0)
            THEN '⚠️ PAID RENT, OWES WATER'

            WHEN COALESCE(mp.total_paid_to_rent, 0) < ta.monthly_rent
            AND COALESCE(mp.total_paid_to_rent, 0) > 0
            THEN '❌ PARTIAL PAYMENT'

            WHEN COALESCE(mp.total_paid_to_rent, 0) = 0
            THEN '❌ NO PAYMENT'

            ELSE 'Unknown'
        END AS payment_status

    FROM tenants t

    -- Active allocations as of March
    INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id
        AND ta.is_active = true

    -- Unit & Property
    INNER JOIN property_units pu ON pu.id = ta.unit_id
        AND pu.is_active = true
    INNER JOIN properties p ON p.id = pu.property_id

    -- March Payments (LEFT JOIN to include tenants who didn't pay)
    LEFT JOIN march_payments mp ON mp.tenant_id = t.id
        AND mp.unit_id = ta.unit_id

    -- March Water Bills (LEFT JOIN - not all tenants have water bills)
    LEFT JOIN march_water_bills wb ON wb.tenant_id = t.id
        AND wb.unit_id = ta.unit_id
)

-- FINAL QUERY: Show tenants with ANY outstanding balance for March
SELECT
    -- Month
    'March 2026' AS report_month,

    -- Tenant Info
    tenant_name,
    national_id,
    phone_number,

    -- Property & Unit
    property_name,
    unit_code,

    -- Expected vs Paid
    expected_rent,
    paid_to_rent,
    outstanding_rent,

    -- Water
    water_bill,
    paid_to_water,
    outstanding_water,

    -- Arrears
    previous_arrears,
    paid_to_arrears,

    -- Total Outstanding
    outstanding_rent + outstanding_water AS total_owed,

    -- Status
    payment_status

FROM tenant_march_summary

WHERE
    -- Show ONLY tenants who actually owe money
    outstanding_rent > 0
    OR outstanding_water > 0
    OR (previous_arrears > 0 AND paid_to_arrears < previous_arrears)

ORDER BY
    -- Priority: No payment first, then partial, then water only
    CASE
        WHEN payment_status = '❌ NO PAYMENT' THEN 1
        WHEN payment_status = '❌ PARTIAL PAYMENT' THEN 2
        WHEN payment_status = '⚠️ PAID RENT, OWES WATER' THEN 3
        ELSE 4
    END,
    total_owed DESC;


-- =====================================================
-- QUERY 2: SUMMARY STATISTICS
-- =====================================================

WITH march_payments AS (
    SELECT
        rp.tenant_id,
        rp.unit_id,
        SUM(rp.allocated_to_rent) AS total_paid_to_rent,
        SUM(rp.allocated_to_water) AS total_paid_to_water,
        SUM(rp.allocated_to_arrears) AS total_paid_to_arrears,
        SUM(rp.amount) AS total_amount_paid
    FROM rent_payments rp
    WHERE
        rp.status = 'completed'
        AND rp.created_at >= '2026-03-01 00:00:00'::timestamp
        AND rp.created_at < '2026-04-01 00:00:00'::timestamp
    GROUP BY rp.tenant_id, rp.unit_id
),

march_water_bills AS (
    SELECT
        wb.tenant_id,
        wb.unit_id,
        SUM(wb.amount) AS water_bill_amount
    FROM water_bills wb
    WHERE
        wb.bill_month = '2026-03-01'::date
    GROUP BY wb.tenant_id, wb.unit_id
),

tenant_march_summary AS (
    SELECT
        t.id AS tenant_id,
        t.first_name || ' ' || t.last_name AS tenant_name,
        ta.monthly_rent AS expected_rent,
        COALESCE(mp.total_paid_to_rent, 0) AS paid_to_rent,
        COALESCE(mp.total_paid_to_water, 0) AS paid_to_water,
        COALESCE(mp.total_paid_to_arrears, 0) AS paid_to_arrears,
        COALESCE(wb.water_bill_amount, 0) AS water_bill,

        CASE
            WHEN ta.monthly_rent - COALESCE(mp.total_paid_to_rent, 0) > 0
            THEN ta.monthly_rent - COALESCE(mp.total_paid_to_rent, 0)
            ELSE 0
        END AS outstanding_rent,

        CASE
            WHEN COALESCE(wb.water_bill_amount, 0) - COALESCE(mp.total_paid_to_water, 0) > 0
            THEN COALESCE(wb.water_bill_amount, 0) - COALESCE(mp.total_paid_to_water, 0)
            ELSE 0
        END AS outstanding_water,

        ta.arrears_balance AS previous_arrears,

        CASE
            WHEN COALESCE(mp.total_paid_to_rent, 0) >= ta.monthly_rent
            AND COALESCE(wb.water_bill_amount, 0) = 0
            THEN '✅ PAID IN FULL'
            WHEN COALESCE(mp.total_paid_to_rent, 0) >= ta.monthly_rent
            AND COALESCE(mp.total_paid_to_water, 0) >= COALESCE(wb.water_bill_amount, 0)
            THEN '✅ PAID (Rent + Water)'
            WHEN COALESCE(mp.total_paid_to_rent, 0) >= ta.monthly_rent
            AND COALESCE(mp.total_paid_to_water, 0) < COALESCE(wb.water_bill_amount, 0)
            THEN '⚠️ PAID RENT, OWES WATER'
            WHEN COALESCE(mp.total_paid_to_rent, 0) < ta.monthly_rent
            AND COALESCE(mp.total_paid_to_rent, 0) > 0
            THEN '❌ PARTIAL PAYMENT'
            WHEN COALESCE(mp.total_paid_to_rent, 0) = 0
            THEN '❌ NO PAYMENT'
            ELSE 'Unknown'
        END AS payment_status

    FROM tenants t
    INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
    INNER JOIN property_units pu ON pu.id = ta.unit_id AND pu.is_active = true
    INNER JOIN properties p ON p.id = pu.property_id
    LEFT JOIN march_payments mp ON mp.tenant_id = t.id AND mp.unit_id = ta.unit_id
    LEFT JOIN march_water_bills wb ON wb.tenant_id = t.id AND wb.unit_id = ta.unit_id
)

SELECT
    COUNT(*) AS total_active_tenants,

    COUNT(*) FILTER (WHERE payment_status LIKE '%PAID%') AS fully_paid,
    COUNT(*) FILTER (WHERE payment_status = '❌ PARTIAL PAYMENT') AS partial_payment,
    COUNT(*) FILTER (WHERE payment_status = '❌ NO PAYMENT') AS no_payment,
    COUNT(*) FILTER (WHERE payment_status = '⚠️ PAID RENT, OWES WATER') AS owes_water_only,

    SUM(expected_rent) AS total_expected_rent,
    SUM(paid_to_rent) AS total_collected_rent,
    SUM(outstanding_rent) AS total_outstanding_rent,

    SUM(water_bill) AS total_water_billed,
    SUM(paid_to_water) AS total_collected_water,
    SUM(outstanding_water) AS total_outstanding_water,

    ROUND(
        (COUNT(*) FILTER (WHERE payment_status LIKE '%PAID%')::numeric / NULLIF(COUNT(*), 0)) * 100,
        2
    ) AS payment_rate_percent

FROM tenant_march_summary;


-- =====================================================
-- QUERY 3: ALL TENANTS (Including those who paid) - For Verification
-- =====================================================

WITH march_payments AS (
    SELECT
        rp.tenant_id,
        rp.unit_id,
        SUM(rp.allocated_to_rent) AS total_paid_to_rent,
        SUM(rp.allocated_to_water) AS total_paid_to_water,
        SUM(rp.allocated_to_arrears) AS total_paid_to_arrears,
        SUM(rp.amount) AS total_amount_paid
    FROM rent_payments rp
    WHERE
        rp.status = 'completed'
        AND rp.created_at >= '2026-03-01 00:00:00'::timestamp
        AND rp.created_at < '2026-04-01 00:00:00'::timestamp
    GROUP BY rp.tenant_id, rp.unit_id
),

march_water_bills AS (
    SELECT
        wb.tenant_id,
        wb.unit_id,
        SUM(wb.amount) AS water_bill_amount
    FROM water_bills wb
    WHERE
        wb.bill_month = '2026-03-01'::date
    GROUP BY wb.tenant_id, wb.unit_id
),

tenant_march_summary AS (
    SELECT
        t.first_name || ' ' || t.last_name AS tenant_name,
        pu.unit_code,
        p.name AS property_name,
        ta.monthly_rent AS expected_rent,
        COALESCE(mp.total_paid_to_rent, 0) AS paid_to_rent,
        COALESCE(wb.water_bill_amount, 0) AS water_bill,
        COALESCE(mp.total_paid_to_water, 0) AS paid_to_water,

        CASE
            WHEN ta.monthly_rent - COALESCE(mp.total_paid_to_rent, 0) > 0
            THEN ta.monthly_rent - COALESCE(mp.total_paid_to_rent, 0)
            ELSE 0
        END AS outstanding_rent,

        CASE
            WHEN COALESCE(wb.water_bill_amount, 0) - COALESCE(mp.total_paid_to_water, 0) > 0
            THEN COALESCE(wb.water_bill_amount, 0) - COALESCE(mp.total_paid_to_water, 0)
            ELSE 0
        END AS outstanding_water,

        CASE
            WHEN COALESCE(mp.total_paid_to_rent, 0) >= ta.monthly_rent
            AND COALESCE(wb.water_bill_amount, 0) = 0
            THEN '✅ PAID IN FULL'
            WHEN COALESCE(mp.total_paid_to_rent, 0) >= ta.monthly_rent
            AND COALESCE(mp.total_paid_to_water, 0) >= COALESCE(wb.water_bill_amount, 0)
            THEN '✅ PAID (Rent + Water)'
            WHEN COALESCE(mp.total_paid_to_rent, 0) >= ta.monthly_rent
            AND COALESCE(mp.total_paid_to_water, 0) < COALESCE(wb.water_bill_amount, 0)
            THEN '⚠️ PAID RENT, OWES WATER'
            WHEN COALESCE(mp.total_paid_to_rent, 0) < ta.monthly_rent
            AND COALESCE(mp.total_paid_to_rent, 0) > 0
            THEN '❌ PARTIAL PAYMENT'
            WHEN COALESCE(mp.total_paid_to_rent, 0) = 0
            THEN '❌ NO PAYMENT'
            ELSE 'Unknown'
        END AS payment_status

    FROM tenants t
    INNER JOIN tenant_allocations ta ON ta.tenant_id = t.id AND ta.is_active = true
    INNER JOIN property_units pu ON pu.id = ta.unit_id AND pu.is_active = true
    INNER JOIN properties p ON p.id = pu.property_id
    LEFT JOIN march_payments mp ON mp.tenant_id = t.id AND mp.unit_id = ta.unit_id
    LEFT JOIN march_water_bills wb ON wb.tenant_id = t.id AND wb.unit_id = ta.unit_id
)

SELECT
    tenant_name,
    unit_code,
    property_name,
    expected_rent,
    paid_to_rent,
    CASE
        WHEN paid_to_rent >= expected_rent THEN '✅ Paid'
        WHEN paid_to_rent > 0 THEN '⚠️ Partial'
        ELSE '❌ Unpaid'
    END AS march_status,
    water_bill,
    paid_to_water,
    payment_status,
    outstanding_rent + outstanding_water AS total_owed

FROM tenant_march_summary

ORDER BY
    CASE
        WHEN payment_status LIKE '%PAID%' THEN 1
        WHEN payment_status = '❌ PARTIAL PAYMENT' THEN 2
        WHEN payment_status = '❌ NO PAYMENT' THEN 3
        ELSE 4
    END,
    tenant_name;
