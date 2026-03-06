-- Build an escalation-ready evidence bundle for selected receipt numbers.
-- Update the values in input_data with statement details before running.

WITH input_data AS (
  SELECT *
  FROM (
    VALUES
      -- receipt, statement_time, statement_amount, statement_msisdn, statement_account_ref, statement_payer_name
      ('UC63X8N4B8'::text, '2026-03-06 06:38:00'::timestamp, 27000.00::numeric, '254722711305'::text, 'Abdijabal New'::text, 'ABDIJABAL HUSSEIN HAJI'::text),
      ('UC56J8FRIF'::text, '2026-03-05 13:13:00'::timestamp, 22774.00::numeric, '254717199489'::text, 'KBA1'::text, 'KHADEGA HASAN SOFI MAHDI AL-AHDAL'::text)
  ) AS t(receipt, statement_time, statement_amount, statement_msisdn, statement_account_ref, statement_payer_name)
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
    rp.id AS payment_id,
    rp.status AS payment_status,
    rp.payment_method AS payment_method,
    rp.tenant_id AS tenant_id,
    rp.unit_id AS unit_id,
    rp.created_at AS payment_created_at
  FROM rent_payments rp
  ORDER BY rp.mpesa_receipt_number, rp.created_at DESC NULLS LAST, rp.id DESC
)
SELECT
  d.receipt,
  d.statement_time,
  d.statement_amount,
  d.statement_msisdn,
  d.statement_account_ref,
  d.statement_payer_name,
  CASE
    WHEN ia.trans_id IS NULL AND pa.mpesa_receipt_number IS NULL
      THEN 'not_received_from_safaricom'
    WHEN ia.trans_id IS NOT NULL AND pa.mpesa_receipt_number IS NULL
      THEN 'received_not_posted'
    WHEN pa.payment_status IN ('pending', 'failed')
      THEN 'posted_pending'
    WHEN pa.payment_status = 'completed'
      THEN 'posted_completed'
    ELSE 'posted_other'
  END AS classification,
  COALESCE(ia.last_process_status, '-') AS inbox_status,
  ia.last_process_error,
  ia.last_received_at,
  ia.last_retry_count,
  COALESCE(pa.payment_status, '-') AS payment_status,
  COALESCE(pa.payment_method, '-') AS payment_method,
  pa.payment_id,
  pa.tenant_id,
  pa.unit_id,
  pa.payment_created_at
FROM input_data d
LEFT JOIN inbox_agg ia ON ia.trans_id = d.receipt
LEFT JOIN payments_agg pa ON pa.mpesa_receipt_number = d.receipt
ORDER BY d.statement_time DESC;
