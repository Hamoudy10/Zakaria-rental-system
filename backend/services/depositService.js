const pool = require("../config/database");

const toNumber = (value) => Number(value || 0);

/**
 * Ensure a charge row exists for allocation security deposit.
 * Idempotent: only inserts if no existing deposit_charge for allocation.
 */
async function ensureDepositCharge({
  client,
  tenantId,
  unitId,
  allocationId,
  requiredDeposit,
  createdBy = null,
  transactionDate = null,
}) {
  const db = client || pool;
  const amount = toNumber(requiredDeposit);
  if (!tenantId || !unitId || !allocationId || amount <= 0) {
    return { inserted: false };
  }

  const existing = await db.query(
    `SELECT id
     FROM tenant_deposit_transactions
     WHERE allocation_id = $1
       AND transaction_type = 'deposit_charge'
     LIMIT 1`,
    [allocationId],
  );

  if (existing.rows.length > 0) {
    return { inserted: false, existingId: existing.rows[0].id };
  }

  const insertResult = await db.query(
    `INSERT INTO tenant_deposit_transactions (
      tenant_id, unit_id, allocation_id, transaction_type, amount, status,
      payment_method, transaction_date, notes, created_by
    ) VALUES (
      $1, $2, $3, 'deposit_charge', $4, 'completed',
      'system', COALESCE($5, NOW()), 'Auto-created from allocation security_deposit.', $6
    )
    RETURNING id`,
    [tenantId, unitId, allocationId, amount, transactionDate, createdBy],
  );

  return { inserted: true, id: insertResult.rows[0]?.id };
}

/**
 * Ensure deposit payment rows cover the configured required deposit.
 * Idempotent: inserts only the outstanding amount (if any) for allocation.
 */
async function ensureDepositPaid({
  client,
  tenantId,
  unitId,
  allocationId,
  requiredDeposit,
  createdBy = null,
  transactionDate = null,
  paymentMethod = "system",
  notes = "Auto-marked as paid during tenant setup.",
}) {
  const db = client || pool;
  const amount = toNumber(requiredDeposit);
  if (!tenantId || !unitId || !allocationId || amount <= 0) {
    return { inserted: false };
  }

  const paidResult = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_paid
     FROM tenant_deposit_transactions
     WHERE allocation_id = $1
       AND transaction_type = 'deposit_payment'
       AND status = 'completed'`,
    [allocationId],
  );

  const alreadyPaid = toNumber(paidResult.rows?.[0]?.total_paid);
  const outstanding = Math.max(0, amount - alreadyPaid);

  if (outstanding <= 0) {
    return { inserted: false, alreadyPaid: true };
  }

  const insertResult = await db.query(
    `INSERT INTO tenant_deposit_transactions (
      tenant_id, unit_id, allocation_id, transaction_type, amount, status,
      payment_method, transaction_date, notes, created_by
    ) VALUES (
      $1, $2, $3, 'deposit_payment', $4, 'completed',
      $5, COALESCE($6, NOW()), $7, $8
    )
    RETURNING id`,
    [
      tenantId,
      unitId,
      allocationId,
      outstanding,
      paymentMethod,
      transactionDate,
      notes,
      createdBy,
    ],
  );

  return { inserted: true, id: insertResult.rows[0]?.id, amount: outstanding };
}

module.exports = {
  ensureDepositCharge,
  ensureDepositPaid,
};
