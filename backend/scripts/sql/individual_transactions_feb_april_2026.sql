-- =====================================================
-- INDIVIDUAL TRANSACTION DETAILS - FEBRUARY TO APRIL 2026
-- =====================================================
-- Shows each payment with: Tenant Name, Date, M-Pesa Code, Unit
-- Includes: Completed, Pending, and Failed transactions
-- =====================================================

SELECT
    -- Transaction Month
    CASE
        WHEN rp.created_at >= '2026-02-01' AND rp.created_at < '2026-03-01' THEN 'February 2026'
        WHEN rp.created_at >= '2026-03-01' AND rp.created_at < '2026-04-01' THEN 'March 2026'
        WHEN rp.created_at >= '2026-04-01' AND rp.created_at < '2026-05-01' THEN 'April 2026'
    END AS month,
    
    -- Date & Time
    rp.created_at AS transaction_date,
    rp.payment_date AS payment_date,
    
    -- Tenant Information
    t.first_name || ' ' || t.last_name AS tenant_name,
    t.national_id AS tenant_id,
    t.phone_number AS tenant_phone,
    
    -- Property & Unit
    p.name AS property_name,
    pu.unit_code AS unit,
    
    -- Payment Details
    rp.amount AS amount,
    rp.status,
    
    -- M-Pesa Information
    rp.mpesa_transaction_id AS mpesa_code,
    rp.mpesa_receipt_number AS receipt_number,
    rp.phone_number AS payment_phone,
    
    -- Payment Method
    CASE
        WHEN rp.payment_method = 'mpesa' THEN 'M-Pesa'
        WHEN rp.payment_method = 'cash' THEN 'Cash'
        WHEN rp.payment_method = 'bank' THEN 'Bank Transfer'
        WHEN rp.payment_method = 'carry_forward' THEN 'Carry Forward'
        ELSE rp.payment_method
    END AS payment_method,
    
    -- Allocation Breakdown
    rp.allocated_to_arrears AS to_arrears,
    rp.allocated_to_water AS to_water,
    rp.allocated_to_rent AS to_rent,
    rp.remaining_balance AS remaining,
    rp.is_advance_payment AS is_advance
    
FROM rent_payments rp
LEFT JOIN tenants t ON rp.tenant_id = t.id
LEFT JOIN property_units pu ON rp.unit_id = pu.id
LEFT JOIN properties p ON rp.property_id = p.id

WHERE
    rp.created_at >= '2026-02-01 00:00:00'::timestamp
    AND rp.created_at < '2026-05-01 00:00:00'::timestamp

ORDER BY
    -- Priority: Pending/Failed first, then by date
    CASE rp.status
        WHEN 'pending' THEN 1
        WHEN 'failed' THEN 2
        ELSE 3
    END,
    rp.created_at DESC;
