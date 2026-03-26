-- Repair a root payment row that was rebalanced correctly by allocation
-- but left with amount = 0 after the rebalance update.
--
-- Use when:
-- - payment_method is not carry_forward / carry_forward_fix
-- - amount is 0
-- - allocated_to_rent / water / arrears shows a positive allocation
--
-- Steps:
-- 1) Fill the ctx values.
-- 2) Run PREVIEW.
-- 3) Run EXECUTE inside a transaction.
-- 4) Run VERIFY.

-- ====================
-- PREVIEW
-- ====================
WITH ctx AS (
  SELECT
    '<root_payment_id>'::uuid AS payment_id
)
SELECT
  rp.id,
  rp.payment_method,
  rp.status,
  rp.amount,
  rp.allocated_to_rent,
  rp.allocated_to_water,
  rp.allocated_to_arrears,
  (
    COALESCE(rp.allocated_to_rent, 0) +
    COALESCE(rp.allocated_to_water, 0) +
    COALESCE(rp.allocated_to_arrears, 0)
  ) AS expected_amount,
  rp.payment_month,
  rp.mpesa_receipt_number,
  rp.original_payment_id
FROM rent_payments rp
JOIN ctx c ON c.payment_id = rp.id;

-- ====================
-- EXECUTE
-- ====================
BEGIN;

WITH ctx AS (
  SELECT
    '<root_payment_id>'::uuid AS payment_id
)
UPDATE rent_payments rp
SET amount = (
      COALESCE(rp.allocated_to_rent, 0) +
      COALESCE(rp.allocated_to_water, 0) +
      COALESCE(rp.allocated_to_arrears, 0)
    ),
    updated_at = NOW()
FROM ctx c
WHERE rp.id = c.payment_id
  AND rp.status = 'completed'
  AND rp.payment_method NOT IN ('carry_forward', 'carry_forward_fix')
  AND COALESCE(rp.original_payment_id, rp.id) = rp.id
  AND COALESCE(rp.amount, 0) = 0
  AND (
    COALESCE(rp.allocated_to_rent, 0) +
    COALESCE(rp.allocated_to_water, 0) +
    COALESCE(rp.allocated_to_arrears, 0)
  ) > 0;

COMMIT;

-- ====================
-- VERIFY
-- ====================
WITH ctx AS (
  SELECT
    '<root_payment_id>'::uuid AS payment_id
)
SELECT
  rp.id,
  rp.amount,
  rp.allocated_to_rent,
  rp.allocated_to_water,
  rp.allocated_to_arrears,
  rp.payment_month,
  rp.payment_method,
  rp.status
FROM rent_payments rp
JOIN ctx c ON c.payment_id = rp.id;
