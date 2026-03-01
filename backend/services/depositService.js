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

module.exports = {
  ensureDepositCharge,
};
