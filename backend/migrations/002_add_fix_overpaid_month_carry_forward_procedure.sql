-- Adds reusable procedure to repair legacy over-allocation in a given month
-- by moving overflow to future months as advance payments.

CREATE OR REPLACE PROCEDURE fix_overpaid_month_carry_forward(
  p_tenant_id uuid,
  p_unit_id uuid,
  p_target_month date,
  p_monthly_rent numeric,
  p_max_future_months integer DEFAULT 120
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_paid numeric := 0;
  v_overflow numeric := 0;
  v_remaining numeric := 0;

  v_property_id uuid;
  v_anchor_payment_id uuid;
  v_anchor_date timestamp;
  v_anchor_phone text;
  v_anchor_receipt text;

  r record;
  v_alloc numeric;
BEGIN
  IF p_monthly_rent IS NULL OR p_monthly_rent <= 0 THEN
    RAISE EXCEPTION 'p_monthly_rent must be > 0';
  END IF;

  IF p_max_future_months < 1 THEN
    RAISE EXCEPTION 'p_max_future_months must be >= 1';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_target_paid
  FROM rent_payments
  WHERE tenant_id = p_tenant_id
    AND unit_id = p_unit_id
    AND status = 'completed'
    AND DATE_TRUNC('month', payment_month) = DATE_TRUNC('month', p_target_month);

  v_overflow := GREATEST(0, v_target_paid - p_monthly_rent);

  IF v_overflow <= 0 THEN
    RAISE NOTICE 'No overflow found for tenant %, unit %, month %',
      p_tenant_id, p_unit_id, p_target_month;
    RETURN;
  END IF;

  CREATE TEMP TABLE _move_source ON COMMIT DROP AS
  WITH src AS (
    SELECT
      rp.id,
      rp.amount,
      rp.property_id,
      rp.payment_date,
      rp.phone_number,
      rp.mpesa_receipt_number,
      SUM(rp.amount) OVER (ORDER BY rp.payment_date DESC, rp.id DESC) AS running_total
    FROM rent_payments rp
    WHERE rp.tenant_id = p_tenant_id
      AND rp.unit_id = p_unit_id
      AND rp.status = 'completed'
      AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', p_target_month)
  )
  SELECT
    id,
    property_id,
    payment_date,
    phone_number,
    mpesa_receipt_number,
    CASE
      WHEN running_total <= v_overflow THEN amount
      WHEN running_total - amount < v_overflow THEN v_overflow - (running_total - amount)
      ELSE 0
    END::numeric AS move_amount
  FROM src;

  SELECT id, property_id, payment_date, phone_number, mpesa_receipt_number
  INTO v_anchor_payment_id, v_property_id, v_anchor_date, v_anchor_phone, v_anchor_receipt
  FROM _move_source
  WHERE move_amount > 0
  ORDER BY move_amount DESC
  LIMIT 1;

  IF v_anchor_payment_id IS NULL THEN
    RAISE EXCEPTION 'Could not determine source rows to move';
  END IF;

  UPDATE rent_payments rp
  SET amount = rp.amount - ms.move_amount
  FROM _move_source ms
  WHERE rp.id = ms.id
    AND ms.move_amount > 0;

  v_remaining := v_overflow;

  FOR r IN
    WITH months AS (
      SELECT (DATE_TRUNC('month', p_target_month) + (g.i || ' month')::interval)::date AS month_start
      FROM generate_series(1, p_max_future_months) AS g(i)
    ),
    paid AS (
      SELECT
        m.month_start,
        COALESCE(SUM(rp.amount), 0)::numeric AS already_paid
      FROM months m
      LEFT JOIN rent_payments rp
        ON rp.tenant_id = p_tenant_id
       AND rp.unit_id = p_unit_id
       AND rp.status = 'completed'
       AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', m.month_start)
      GROUP BY m.month_start
    )
    SELECT month_start, GREATEST(0, p_monthly_rent - already_paid) AS capacity
    FROM paid
    WHERE GREATEST(0, p_monthly_rent - already_paid) > 0
    ORDER BY month_start
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_alloc := LEAST(v_remaining, r.capacity);

    INSERT INTO rent_payments (
      tenant_id, unit_id, property_id, amount, payment_month, status,
      is_advance_payment, original_payment_id, payment_date,
      mpesa_transaction_id, mpesa_receipt_number, phone_number, payment_method
    ) VALUES (
      p_tenant_id, p_unit_id, v_property_id, v_alloc, r.month_start, 'completed',
      true, v_anchor_payment_id, v_anchor_date,
      'FIXCF_' || to_char(r.month_start, 'YYYYMM') || '_' || substr(md5(random()::text), 1, 8),
      COALESCE(left(v_anchor_receipt, 24), 'FIXCF') || '_F' || to_char(r.month_start, 'YYYYMM') || substr(md5(random()::text), 1, 4),
      v_anchor_phone,
      'carry_forward_fix'
    );

    v_remaining := v_remaining - v_alloc;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Overflow remainder not allocated: %', v_remaining;
  END IF;

  RAISE NOTICE 'Fix complete. Moved overflow % from %.', v_overflow, p_target_month;
END;
$$;
