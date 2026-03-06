-- Classify specific M-Pesa receipts across callback inbox and rent payments.
-- Usage:
-- 1) Replace receipt values in the input_receipts CTE.
-- 2) Run the query.
--
-- Status meanings:
-- - not_received_from_safaricom: no callback inbox row and no rent_payment row
-- - received_not_posted: callback inbox row exists, but no rent_payment row
-- - posted_pending: rent_payment exists with pending/failed status
-- - posted_completed: rent_payment exists with completed status

WITH input_receipts AS (
  SELECT unnest(ARRAY[
    'UC63X8N4B8',
    'UC56J8FRIF'
  ]::text[]) AS receipt
),
inbox_agg AS (
  SELECT
    i.trans_id,
    COUNT(*)::int AS inbox_count,
    MAX(i.received_at) AS last_received_at,
    MAX(i.process_status) AS last_process_status,
    MAX(i.process_error) AS last_process_error,
    MAX(i.retry_count) AS last_retry_count
  FROM mpesa_callback_inbox i
  GROUP BY i.trans_id
),
payments_agg AS (
  SELECT DISTINCT ON (rp.mpesa_receipt_number)
    rp.mpesa_receipt_number,
    COUNT(*) OVER (PARTITION BY rp.mpesa_receipt_number)::int AS payment_count,
    rp.created_at AS last_payment_created_at,
    rp.status AS last_payment_status,
    rp.payment_method AS last_payment_method,
    rp.id AS payment_id
  FROM rent_payments rp
  ORDER BY rp.mpesa_receipt_number, rp.created_at DESC NULLS LAST, rp.id DESC
)
SELECT
  r.receipt,
  CASE
    WHEN ia.trans_id IS NULL AND pa.mpesa_receipt_number IS NULL
      THEN 'not_received_from_safaricom'
    WHEN ia.trans_id IS NOT NULL AND pa.mpesa_receipt_number IS NULL
      THEN 'received_not_posted'
    WHEN pa.last_payment_status IN ('pending', 'failed')
      THEN 'posted_pending'
    WHEN pa.last_payment_status = 'completed'
      THEN 'posted_completed'
    ELSE 'posted_other'
  END AS classification,
  COALESCE(pa.last_payment_method, '-') AS payment_method,
  CASE
    WHEN COALESCE(pa.last_payment_method, '') IN ('manual', 'manual_reconciled', 'paybill')
      THEN 'manual_or_backoffice'
    WHEN COALESCE(pa.last_payment_method, '') = 'mpesa'
      THEN 'auto_callback_path'
    ELSE '-'
  END AS posting_path,
  COALESCE(pa.last_payment_status, '-') AS payment_status,
  COALESCE(ia.last_process_status, '-') AS inbox_status,
  ia.last_process_error AS inbox_error,
  ia.last_received_at,
  ia.last_retry_count,
  pa.last_payment_created_at,
  pa.payment_id
FROM input_receipts r
LEFT JOIN inbox_agg ia ON ia.trans_id = r.receipt
LEFT JOIN payments_agg pa ON pa.mpesa_receipt_number = r.receipt
ORDER BY r.receipt;
