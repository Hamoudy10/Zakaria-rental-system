-- Reusable ops script: repair overpaid target month by carrying overflow forward.
-- Usage:
-- 1) Edit the values in the ctx CTE.
-- 2) Run PREVIEW block.
-- 3) Run EXECUTE block.
-- 4) Run VERIFY block.

-- ====================
-- PREVIEW
-- ====================
WITH ctx AS (
  SELECT
    '42357843-48d9-4bbc-b524-09b1b80eb4e4'::uuid AS tenant_id,
    '3efbe582-a73b-4c14-8686-fdc754de799d'::uuid AS unit_id,
    DATE '2026-02-01' AS target_month,
    10000::numeric AS monthly_rent
),
months AS (
  SELECT
    DATE_TRUNC('month', rp.payment_month)::date AS month,
    SUM(rp.amount)::numeric AS paid
  FROM rent_payments rp
  JOIN ctx c ON c.tenant_id = rp.tenant_id AND c.unit_id = rp.unit_id
  WHERE rp.status = 'completed'
  GROUP BY 1
)
SELECT
  to_char(month, 'YYYY-MM') AS month,
  paid,
  GREATEST(0, (SELECT monthly_rent FROM ctx) - paid) AS balance
FROM months
WHERE month >= (SELECT target_month FROM ctx)
ORDER BY month;

-- ====================
-- EXECUTE
-- ====================
BEGIN;

CALL fix_overpaid_month_carry_forward(
  '42357843-48d9-4bbc-b524-09b1b80eb4e4'::uuid,
  '3efbe582-a73b-4c14-8686-fdc754de799d'::uuid,
  DATE '2026-02-01',
  10000::numeric,
  120
);

COMMIT;

-- ====================
-- VERIFY
-- ====================
SELECT
  DATE_TRUNC('month', payment_month)::date AS month,
  SUM(amount)::numeric AS paid
FROM rent_payments
WHERE tenant_id = '42357843-48d9-4bbc-b524-09b1b80eb4e4'::uuid
  AND unit_id = '3efbe582-a73b-4c14-8686-fdc754de799d'::uuid
  AND status = 'completed'
GROUP BY 1
ORDER BY 1;
