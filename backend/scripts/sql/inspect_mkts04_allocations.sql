-- inspect_mkts04_allocations.sql
-- Read-only inspection for records currently attached to unit MKTS04.

WITH target_unit AS (
  SELECT
    pu.id AS unit_id,
    pu.unit_code,
    pu.property_id,
    p.name AS property_name,
    pu.is_active,
    pu.is_occupied,
    pu.rent_amount
  FROM property_units pu
  LEFT JOIN properties p ON p.id = pu.property_id
  WHERE UPPER(pu.unit_code) = 'MKTS04'
)
SELECT
  'unit' AS section,
  tu.unit_id,
  tu.unit_code,
  tu.property_name,
  tu.is_active,
  tu.is_occupied,
  tu.rent_amount
FROM target_unit tu;

WITH target_unit AS (
  SELECT id AS unit_id
  FROM property_units
  WHERE UPPER(unit_code) = 'MKTS04'
)
SELECT
  'tenant_allocations' AS section,
  ta.id AS record_id,
  ta.tenant_id,
  CONCAT_WS(' ', t.first_name, t.last_name) AS tenant_name,
  ta.is_active,
  ta.lease_start_date,
  ta.lease_end_date,
  ta.monthly_rent,
  ta.security_deposit,
  ta.arrears_balance,
  ta.allocation_date,
  ta.updated_at
FROM tenant_allocations ta
JOIN target_unit tu ON tu.unit_id = ta.unit_id
LEFT JOIN tenants t ON t.id = ta.tenant_id
ORDER BY ta.is_active DESC, ta.allocation_date DESC NULLS LAST, ta.updated_at DESC NULLS LAST;

WITH target_unit AS (
  SELECT id AS unit_id
  FROM property_units
  WHERE UPPER(unit_code) = 'MKTS04'
)
SELECT
  'rent_payments' AS section,
  rp.id AS record_id,
  rp.tenant_id,
  CONCAT_WS(' ', t.first_name, t.last_name) AS tenant_name,
  COUNT(*) OVER (PARTITION BY rp.tenant_id) AS tenant_payment_count_for_mkts04,
  rp.amount,
  rp.allocated_to_rent,
  rp.allocated_to_water,
  rp.allocated_to_arrears,
  rp.remaining_balance,
  rp.payment_month,
  rp.payment_date,
  rp.status,
  rp.payment_method,
  rp.mpesa_receipt_number,
  rp.created_at,
  rp.updated_at
FROM rent_payments rp
JOIN target_unit tu ON tu.unit_id = rp.unit_id
LEFT JOIN tenants t ON t.id = rp.tenant_id
ORDER BY t.first_name, t.last_name, rp.payment_month, rp.payment_date NULLS LAST, rp.created_at NULLS LAST;

WITH target_unit AS (
  SELECT id AS unit_id
  FROM property_units
  WHERE UPPER(unit_code) = 'MKTS04'
)
SELECT
  'water_bills' AS section,
  wb.id AS record_id,
  wb.tenant_id,
  CONCAT_WS(' ', t.first_name, t.last_name) AS tenant_name,
  wb.amount,
  wb.bill_month,
  wb.created_at
FROM water_bills wb
JOIN target_unit tu ON tu.unit_id = wb.unit_id
LEFT JOIN tenants t ON t.id = wb.tenant_id
ORDER BY t.first_name, t.last_name, wb.bill_month, wb.created_at NULLS LAST;

WITH target_unit AS (
  SELECT id AS unit_id
  FROM property_units
  WHERE UPPER(unit_code) = 'MKTS04'
)
SELECT
  'summary' AS section,
  CONCAT_WS(' ', t.first_name, t.last_name) AS tenant_name,
  COUNT(DISTINCT ta.id) AS allocation_count,
  COUNT(DISTINCT rp.id) AS rent_payment_count,
  COALESCE(SUM(DISTINCT rp.amount), 0) AS distinct_payment_amount_sum,
  COUNT(DISTINCT wb.id) AS water_bill_count,
  COALESCE(SUM(DISTINCT wb.amount), 0) AS distinct_water_bill_amount_sum
FROM target_unit tu
LEFT JOIN tenant_allocations ta ON ta.unit_id = tu.unit_id
LEFT JOIN rent_payments rp ON rp.unit_id = tu.unit_id
LEFT JOIN water_bills wb ON wb.unit_id = tu.unit_id
LEFT JOIN tenants t ON t.id = COALESCE(ta.tenant_id, rp.tenant_id, wb.tenant_id)
GROUP BY tenant_name
ORDER BY tenant_name;
