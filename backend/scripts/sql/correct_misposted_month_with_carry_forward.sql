-- Correct a tenant payment sequence where:
-- 1) the first payment was posted to the wrong current month,
-- 2) the second payment was then carried forward into the next month,
-- but the intended result is:
--   - first payment covers the previous month
--   - second payment covers the current month
--
-- Typical example:
-- - first payment should be February 2026
-- - system posted it to March 2026
-- - second payment was pushed to April 2026 as carry-forward
-- - correct end state should be February 2026 + March 2026 paid
--
-- Usage:
-- 1) Edit the ctx CTE values.
-- 2) Run PREVIEW and confirm the three payment IDs.
-- 3) Run EXECUTE inside a transaction.
-- 4) Run VERIFY and confirm month totals.

-- ====================
-- PREVIEW
-- ====================
WITH ctx AS (
  SELECT
    '<tenant_uuid>'::uuid AS tenant_id,
    '<unit_uuid>'::uuid AS unit_id,
    DATE '2026-02-01' AS correct_previous_month,
    DATE '2026-03-01' AS correct_current_month,
    DATE '2026-04-01' AS wrong_next_month,
    '<first_payment_root_id>'::uuid AS first_payment_root_id,
    '<second_payment_root_id>'::uuid AS second_payment_root_id,
    '<second_payment_carry_forward_id>'::uuid AS second_payment_carry_forward_id
)
SELECT
  rp.id,
  rp.original_payment_id,
  rp.payment_method,
  rp.status,
  rp.amount,
  rp.allocated_to_rent,
  rp.is_advance_payment,
  rp.payment_month,
  rp.payment_date,
  rp.mpesa_receipt_number,
  rp.created_at
FROM rent_payments rp
JOIN ctx c
  ON rp.tenant_id = c.tenant_id
 AND rp.unit_id = c.unit_id
WHERE rp.id IN (
  c.first_payment_root_id,
  c.second_payment_root_id,
  c.second_payment_carry_forward_id
)
ORDER BY rp.payment_date NULLS LAST, rp.created_at NULLS LAST, rp.id;

-- Optional month summary preview
WITH ctx AS (
  SELECT
    '<tenant_uuid>'::uuid AS tenant_id,
    '<unit_uuid>'::uuid AS unit_id,
    DATE '2026-02-01' AS from_month,
    DATE '2026-04-01' AS to_month,
    10000::numeric AS monthly_rent
)
SELECT
  DATE_TRUNC('month', rp.payment_month)::date AS month,
  SUM(
    CASE
      WHEN (
        COALESCE(rp.allocated_to_rent, 0) +
        COALESCE(rp.allocated_to_water, 0) +
        COALESCE(rp.allocated_to_arrears, 0)
      ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
      ELSE COALESCE(rp.amount, 0)
    END
  )::numeric AS rent_paid,
  SUM(rp.amount)::numeric AS raw_amount,
  GREATEST(
    0,
    (SELECT monthly_rent FROM ctx) - SUM(
      CASE
        WHEN (
          COALESCE(rp.allocated_to_rent, 0) +
          COALESCE(rp.allocated_to_water, 0) +
          COALESCE(rp.allocated_to_arrears, 0)
        ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
        ELSE COALESCE(rp.amount, 0)
      END
    )
  )::numeric AS balance
FROM rent_payments rp
JOIN ctx c
  ON rp.tenant_id = c.tenant_id
 AND rp.unit_id = c.unit_id
WHERE rp.status = 'completed'
  AND DATE_TRUNC('month', rp.payment_month) BETWEEN c.from_month AND c.to_month
GROUP BY 1
ORDER BY 1;

-- ====================
-- EXECUTE
-- ====================
BEGIN;

WITH ctx AS (
  SELECT
    '<tenant_uuid>'::uuid AS tenant_id,
    '<unit_uuid>'::uuid AS unit_id,
    DATE '2026-02-01' AS correct_previous_month,
    DATE '2026-03-01' AS correct_current_month,
    DATE '2026-04-01' AS wrong_next_month,
    '<first_payment_root_id>'::uuid AS first_payment_root_id,
    '<second_payment_root_id>'::uuid AS second_payment_root_id,
    '<second_payment_carry_forward_id>'::uuid AS second_payment_carry_forward_id
)
UPDATE rent_payments rp
SET payment_month = c.correct_previous_month,
    updated_at = NOW()
FROM ctx c
WHERE rp.id = c.first_payment_root_id
  AND rp.tenant_id = c.tenant_id
  AND rp.unit_id = c.unit_id
  AND rp.status = 'completed'
  AND COALESCE(rp.original_payment_id, rp.id) = rp.id;

WITH ctx AS (
  SELECT
    '<tenant_uuid>'::uuid AS tenant_id,
    '<unit_uuid>'::uuid AS unit_id,
    DATE '2026-03-01' AS correct_current_month,
    DATE '2026-04-01' AS wrong_next_month,
    '<second_payment_root_id>'::uuid AS second_payment_root_id,
    '<second_payment_carry_forward_id>'::uuid AS second_payment_carry_forward_id
)
UPDATE rent_payments rp
SET payment_month = c.correct_current_month,
    is_advance_payment = false,
    updated_at = NOW()
FROM ctx c
WHERE rp.id = c.second_payment_carry_forward_id
  AND rp.tenant_id = c.tenant_id
  AND rp.unit_id = c.unit_id
  AND rp.status = 'completed'
  AND rp.payment_method IN ('carry_forward', 'carry_forward_fix')
  AND rp.original_payment_id = c.second_payment_root_id
  AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', c.wrong_next_month);

COMMIT;

-- ====================
-- VERIFY
-- ====================
WITH ctx AS (
  SELECT
    '<tenant_uuid>'::uuid AS tenant_id,
    '<unit_uuid>'::uuid AS unit_id,
    DATE '2026-02-01' AS from_month,
    DATE '2026-04-01' AS to_month,
    10000::numeric AS monthly_rent
)
SELECT
  DATE_TRUNC('month', rp.payment_month)::date AS month,
  SUM(
    CASE
      WHEN (
        COALESCE(rp.allocated_to_rent, 0) +
        COALESCE(rp.allocated_to_water, 0) +
        COALESCE(rp.allocated_to_arrears, 0)
      ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
      ELSE COALESCE(rp.amount, 0)
    END
  )::numeric AS rent_paid,
  SUM(rp.amount)::numeric AS raw_amount,
  GREATEST(
    0,
    (SELECT monthly_rent FROM ctx) - SUM(
      CASE
        WHEN (
          COALESCE(rp.allocated_to_rent, 0) +
          COALESCE(rp.allocated_to_water, 0) +
          COALESCE(rp.allocated_to_arrears, 0)
        ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
        ELSE COALESCE(rp.amount, 0)
      END
    )
  )::numeric AS balance
FROM rent_payments rp
JOIN ctx c
  ON rp.tenant_id = c.tenant_id
 AND rp.unit_id = c.unit_id
WHERE rp.status = 'completed'
  AND DATE_TRUNC('month', rp.payment_month) BETWEEN c.from_month AND c.to_month
GROUP BY 1
ORDER BY 1;
