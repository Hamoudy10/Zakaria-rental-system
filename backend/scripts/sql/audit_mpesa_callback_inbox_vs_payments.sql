-- Audit callbacks received in mpesa_callback_inbox against posted rent_payments.
-- Default window: last 7 days.

-- 1) Summary
SELECT
  COUNT(*)::int AS total_callbacks,
  COUNT(*) FILTER (WHERE i.process_status = 'processed')::int AS processed_callbacks,
  COUNT(*) FILTER (WHERE i.process_status = 'failed')::int AS failed_callbacks,
  COUNT(*) FILTER (
    WHERE i.process_status IN ('pending', 'pending_unmatched', 'invalid')
  )::int AS open_callbacks,
  COUNT(*) FILTER (WHERE rp.id IS NULL)::int AS not_posted_to_rent_payments
FROM mpesa_callback_inbox i
LEFT JOIN rent_payments rp
  ON rp.mpesa_receipt_number = i.trans_id
WHERE i.received_at >= NOW() - INTERVAL '7 days';

-- 2) Callback rows not posted to rent_payments
SELECT
  i.trans_id,
  i.received_at,
  i.last_received_at,
  i.process_status,
  i.process_error,
  i.retry_count,
  i.bill_ref_number,
  i.msisdn,
  i.trans_amount,
  i.matched_payment_id
FROM mpesa_callback_inbox i
LEFT JOIN rent_payments rp
  ON rp.mpesa_receipt_number = i.trans_id
WHERE i.received_at >= NOW() - INTERVAL '7 days'
  AND rp.id IS NULL
ORDER BY i.received_at DESC;

