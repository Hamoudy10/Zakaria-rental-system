-- =====================================================
-- FEBRUARY - APRIL 2026 PAYMENT TRANSACTIONS REPORT
-- =====================================================
-- Includes: Completed, Pending, Failed payments
-- Shows: Manual & Automatic (M-Pesa) payments
-- Reconciliation status included
-- =====================================================
-- HOW TO USE:
-- Option 1: Run ALL 3 months (Feb-April) - Use as-is
-- Option 2: Filter by specific month - Change the date range in WHERE clauses
-- =====================================================

-- MAIN QUERY: All February-April 2026 Transactions
SELECT
    -- Payment Identification
    rp.id AS payment_id,
    rp.mpesa_transaction_id,
    rp.mpesa_receipt_number,
    rp.payment_method,
    
    -- Status & Reconciliation
    rp.status,
    CASE
        WHEN rp.status = 'completed' THEN '✅ Reconciled'
        WHEN rp.status = 'pending' THEN '⏳ Pending Reconciliation'
        WHEN rp.status = 'failed' THEN '❌ Failed'
        WHEN rp.status = 'overdue' THEN '⚠️ Overdue'
        ELSE rp.status
    END AS reconciliation_status,
    
    -- Tenant Information
    t.id AS tenant_id,
    t.first_name || ' ' || t.last_name AS tenant_name,
    t.national_id AS tenant_national_id,
    t.phone_number AS tenant_phone,
    
    -- Property & Unit Information
    p.name AS property_name,
    p.property_code,
    pu.unit_code,
    
    -- Payment Details
    rp.amount,
    rp.payment_date,
    rp.payment_month,
    rp.phone_number AS payment_phone,
    
    -- Allocation Breakdown
    rp.allocated_to_arrears,
    rp.allocated_to_water,
    rp.allocated_to_rent,
    rp.remaining_balance,
    rp.is_advance_payment,
    
    -- Month Label
    CASE
        WHEN rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01' THEN '📅 February 2026'
        WHEN rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01' THEN '📅 March 2026'
        WHEN rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01' THEN '📅 April 2026'
        ELSE 'Other'
    END AS transaction_month,
    
    -- Source Indicator
    CASE
        WHEN rp.payment_method = 'mpesa' AND rp.status = 'completed' THEN '📱 Automatic (M-Pesa)'
        WHEN rp.payment_method = 'mpesa' AND rp.status = 'pending' THEN '📱 M-Pesa (Pending)'
        WHEN rp.payment_method = 'mpesa' AND rp.status = 'failed' THEN '📱 M-Pesa (Failed)'
        WHEN rp.payment_method = 'carry_forward' THEN '🔄 Carry Forward'
        WHEN rp.payment_method IN ('cash', 'bank') THEN '💵 Manual (' || rp.payment_method || ')'
        ELSE rp.payment_method
    END AS payment_source,
    
    -- Timestamps
    rp.created_at,
    rp.updated_at
    
FROM rent_payments rp
LEFT JOIN tenants t ON rp.tenant_id = t.id
LEFT JOIN property_units pu ON rp.unit_id = pu.id
LEFT JOIN properties p ON rp.property_id = p.id

WHERE
    -- Filter: February - April 2026 by CREATED_AT (when payment was actually recorded)
    rp.created_at >= '2026-02-01 00:00:00'::timestamp
    AND rp.created_at < '2026-05-01 00:00:00'::timestamp

ORDER BY
    -- Priority: Pending first (need attention), then by month, then by date
    CASE rp.status
        WHEN 'pending' THEN 1
        WHEN 'failed' THEN 2
        WHEN 'completed' THEN 3
        WHEN 'overdue' THEN 4
        ELSE 5
    END,
    rp.created_at DESC;


-- =====================================================
-- SUMMARY STATISTICS (FEBRUARY - APRIL 2026)
-- =====================================================

SELECT
    -- Overall Counts
    COUNT(*) AS total_transactions,
    
    COUNT(*) FILTER (WHERE rp.status = 'completed') AS completed_count,
    COUNT(*) FILTER (WHERE rp.status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE rp.status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE rp.status = 'overdue') AS overdue_count,
    
    -- Amounts by Status
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.status = 'completed'), 0) AS total_completed_amount,
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.status = 'pending'), 0) AS total_pending_amount,
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.status = 'failed'), 0) AS total_failed_amount,
    
    -- Payment Methods
    COUNT(*) FILTER (WHERE rp.payment_method = 'mpesa') AS mpesa_count,
    COUNT(*) FILTER (WHERE rp.payment_method IN ('cash', 'bank')) AS manual_count,
    COUNT(*) FILTER (WHERE rp.payment_method = 'carry_forward') AS carry_forward_count,
    
    -- Allocation Totals (Completed Only)
    COALESCE(SUM(rp.allocated_to_arrears) FILTER (WHERE rp.status = 'completed'), 0) AS total_allocated_arrears,
    COALESCE(SUM(rp.allocated_to_water) FILTER (WHERE rp.status = 'completed'), 0) AS total_allocated_water,
    COALESCE(SUM(rp.allocated_to_rent) FILTER (WHERE rp.status = 'completed'), 0) AS total_allocated_rent,
    COALESCE(SUM(rp.remaining_balance) FILTER (WHERE rp.status = 'completed'), 0) AS total_remaining_balance,
    
    -- Advance Payments
    COUNT(*) FILTER (WHERE rp.is_advance_payment = true) AS advance_payment_count,
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.is_advance_payment = true), 0) AS total_advance_amount,
    
    -- Monthly Breakdown
    COUNT(*) FILTER (WHERE rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01') AS february_count,
    COUNT(*) FILTER (WHERE rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01') AS march_count,
    COUNT(*) FILTER (WHERE rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01') AS april_count,
    
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01'), 0) AS february_amount,
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01'), 0) AS march_amount,
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01'), 0) AS april_amount

FROM rent_payments rp
WHERE
    rp.created_at >= '2026-02-01 00:00:00'::timestamp
    AND rp.created_at < '2026-05-01 00:00:00'::timestamp;


-- =====================================================
-- MONTHLY SUMMARY BREAKDOWN
-- =====================================================

SELECT
    month_name,
    
    COUNT(*) AS total_transactions,
    COUNT(*) FILTER (WHERE rp.status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE rp.status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE rp.status = 'failed') AS failed,
    
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.status = 'completed'), 0) AS total_collected,
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.status = 'pending'), 0) AS total_pending,
    
    COUNT(*) FILTER (WHERE rp.payment_method = 'mpesa') AS mpesa_count,
    COUNT(*) FILTER (WHERE rp.payment_method IN ('cash', 'bank')) AS manual_count

FROM rent_payments rp
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01' THEN 'February 2026'
        WHEN rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01' THEN 'March 2026'
        WHEN rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01' THEN 'April 2026'
    END AS month_name,
    CASE
        WHEN rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01' THEN 1
        WHEN rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01' THEN 2
        WHEN rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01' THEN 3
    END AS month_order
) months
WHERE
    rp.created_at >= '2026-02-01 00:00:00'::timestamp
    AND rp.created_at < '2026-05-01 00:00:00'::timestamp

GROUP BY month_name, month_order
ORDER BY month_order;


-- =====================================================
-- PENDING PAYMENTS ONLY (Need Reconciliation) - Feb-April 2026
-- =====================================================

SELECT
    CASE
        WHEN rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01' THEN 'February 2026'
        WHEN rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01' THEN 'March 2026'
        WHEN rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01' THEN 'April 2026'
    END AS transaction_month,
    
    rp.id AS payment_id,
    rp.mpesa_transaction_id,
    rp.mpesa_receipt_number,
    
    t.first_name || ' ' || t.last_name AS tenant_name,
    t.phone_number AS tenant_phone,
    pu.unit_code,
    p.name AS property_name,
    
    rp.amount,
    rp.payment_date,
    rp.payment_method,
    rp.status,
    
    -- Time since payment was recorded
    NOW() - rp.created_at AS hours_since_recorded,
    rp.created_at,
    
    -- Action Required
    CASE
        WHEN rp.status = 'pending' AND rp.payment_method = 'mpesa' THEN '⚠️ Check M-Pesa callback - may need manual reconciliation'
        WHEN rp.status = 'pending' AND rp.payment_method IN ('cash', 'bank') THEN '⚠️ Manual payment awaiting admin approval'
        ELSE 'Review required'
    END AS action_required

FROM rent_payments rp
LEFT JOIN tenants t ON rp.tenant_id = t.id
LEFT JOIN property_units pu ON rp.unit_id = pu.id
LEFT JOIN properties p ON rp.property_id = p.id

WHERE
    rp.status = 'pending'
    AND rp.created_at >= '2026-02-01 00:00:00'::timestamp
    AND rp.created_at < '2026-05-01 00:00:00'::timestamp

ORDER BY rp.created_at ASC;


-- =====================================================
-- FAILED PAYMENTS ONLY (February - April 2026)
-- =====================================================

SELECT
    CASE
        WHEN rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01' THEN 'February 2026'
        WHEN rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01' THEN 'March 2026'
        WHEN rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01' THEN 'April 2026'
    END AS transaction_month,
    
    rp.id AS payment_id,
    rp.mpesa_transaction_id,
    rp.mpesa_receipt_number,
    
    t.first_name || ' ' || t.last_name AS tenant_name,
    t.phone_number AS tenant_phone,
    pu.unit_code,
    p.name AS property_name,
    
    rp.amount,
    rp.payment_date,
    rp.payment_method,
    rp.status,
    
    rp.created_at,
    rp.updated_at

FROM rent_payments rp
LEFT JOIN tenants t ON rp.tenant_id = t.id
LEFT JOIN property_units pu ON rp.unit_id = pu.id
LEFT JOIN properties p ON rp.property_id = p.id

WHERE
    rp.status = 'failed'
    AND rp.created_at >= '2026-02-01 00:00:00'::timestamp
    AND rp.created_at < '2026-05-01 00:00:00'::timestamp

ORDER BY rp.created_at DESC;


-- =====================================================
-- DAILY BREAKDOWN (February - April 2026)
-- =====================================================

SELECT
    rp.created_at::date AS payment_day,
    
    CASE
        WHEN rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01' THEN 'February'
        WHEN rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01' THEN 'March'
        WHEN rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01' THEN 'April'
    END AS month_name,
    
    COUNT(*) AS transaction_count,
    COUNT(*) FILTER (WHERE rp.status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE rp.status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE rp.status = 'failed') AS failed,
    
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.status = 'completed'), 0) AS daily_collected,
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.status = 'pending'), 0) AS daily_pending,
    
    COUNT(*) FILTER (WHERE rp.payment_method = 'mpesa') AS mpesa_payments,
    COUNT(*) FILTER (WHERE rp.payment_method IN ('cash', 'bank')) AS manual_payments

FROM rent_payments rp
WHERE
    rp.created_at >= '2026-02-01 00:00:00'::timestamp
    AND rp.created_at < '2026-05-01 00:00:00'::timestamp

GROUP BY 
    rp.created_at::date,
    CASE
        WHEN rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01' THEN 'February'
        WHEN rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01' THEN 'March'
        WHEN rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01' THEN 'April'
    END
ORDER BY payment_day DESC;

