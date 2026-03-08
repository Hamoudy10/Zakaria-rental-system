#!/usr/bin/env node

require("dotenv").config();

const pool = require("../config/database");

const printUsage = () => {
  console.log(`Usage:
  node scripts/checkMpesaCallbackInbox.js --receipt UC8Q78PBYA --receipt UC80G8UXKW
  node scripts/checkMpesaCallbackInbox.js --days 7 --status pending_unmatched

Options:
  --receipt <value>   One receipt to inspect. Repeat for multiple receipts.
  --days <number>     Recent-day window when no receipts are provided. Default: 7
  --status <value>    Optional inbox status filter for recent-window mode.
  --limit <number>    Max rows in recent-window mode. Default: 20
`);
};

const parseArgs = (argv) => {
  const options = {
    receipts: [],
    days: 7,
    status: null,
    limit: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--receipt") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --receipt");
      }
      options.receipts.push(String(value).trim().toUpperCase());
      i += 1;
      continue;
    }

    if (arg === "--days") {
      const value = Number.parseInt(argv[i + 1], 10);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("Invalid value for --days");
      }
      options.days = value;
      i += 1;
      continue;
    }

    if (arg === "--status") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --status");
      }
      options.status = String(value).trim();
      i += 1;
      continue;
    }

    if (arg === "--limit") {
      const value = Number.parseInt(argv[i + 1], 10);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("Invalid value for --limit");
      }
      options.limit = value;
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const classifyReceiptRows = (rows) =>
  rows.map((row) => {
    let classification = "posted_other";
    if (!row.inbox_trans_id && !row.payment_receipt) {
      classification = "not_received_from_safaricom";
    } else if (row.inbox_trans_id && !row.payment_receipt) {
      classification = "received_not_posted";
    } else if (["pending", "failed"].includes(row.payment_status)) {
      classification = "posted_pending";
    } else if (row.payment_status === "completed") {
      classification = "posted_completed";
    }

    return {
      receipt: row.receipt,
      classification,
      inbox_status: row.inbox_status || "-",
      inbox_error: row.inbox_error || "",
      inbox_received_at: row.inbox_received_at || null,
      inbox_retry_count: row.inbox_retry_count ?? 0,
      bill_ref_number: row.bill_ref_number || "",
      msisdn: row.msisdn || "",
      trans_amount: row.trans_amount || null,
      payment_id: row.payment_id || null,
      payment_status: row.payment_status || "-",
      payment_method: row.payment_method || "-",
      unit_id: row.unit_id || null,
      tenant_id: row.tenant_id || null,
      payment_created_at: row.payment_created_at || null,
    };
  });

const inspectReceipts = async (receipts) => {
  const result = await pool.query(
    `
      WITH input_receipts AS (
        SELECT unnest($1::text[]) AS receipt
      ),
      inbox_agg AS (
        SELECT DISTINCT ON (i.trans_id)
          i.trans_id,
          i.process_status,
          i.process_error,
          i.retry_count,
          i.received_at,
          i.bill_ref_number,
          i.msisdn,
          i.trans_amount
        FROM mpesa_callback_inbox i
        ORDER BY i.trans_id, i.received_at DESC, i.updated_at DESC
      ),
      payments_agg AS (
        SELECT DISTINCT ON (rp.mpesa_receipt_number)
          rp.mpesa_receipt_number,
          rp.id,
          rp.status,
          rp.payment_method,
          rp.unit_id,
          rp.tenant_id,
          rp.created_at
        FROM rent_payments rp
        ORDER BY rp.mpesa_receipt_number, rp.created_at DESC NULLS LAST, rp.id DESC
      )
      SELECT
        r.receipt,
        ia.trans_id AS inbox_trans_id,
        ia.process_status AS inbox_status,
        ia.process_error AS inbox_error,
        ia.retry_count AS inbox_retry_count,
        ia.received_at AS inbox_received_at,
        ia.bill_ref_number,
        ia.msisdn,
        ia.trans_amount,
        pa.mpesa_receipt_number AS payment_receipt,
        pa.id AS payment_id,
        pa.status AS payment_status,
        pa.payment_method,
        pa.unit_id,
        pa.tenant_id,
        pa.created_at AS payment_created_at
      FROM input_receipts r
      LEFT JOIN inbox_agg ia ON ia.trans_id = r.receipt
      LEFT JOIN payments_agg pa ON pa.mpesa_receipt_number = r.receipt
      ORDER BY r.receipt
    `,
    [receipts],
  );

  const rows = classifyReceiptRows(result.rows);
  console.table(rows);
};

const inspectRecent = async ({ days, status, limit }) => {
  const params = [days, limit];
  let statusClause = "";

  if (status) {
    params.splice(1, 0, status);
    statusClause = "AND i.process_status = $2";
  }

  const result = await pool.query(
    `
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
        rp.id AS payment_id,
        rp.status AS payment_status,
        rp.payment_method
      FROM mpesa_callback_inbox i
      LEFT JOIN rent_payments rp
        ON rp.mpesa_receipt_number = i.trans_id
      WHERE i.received_at >= NOW() - ($1::int * INTERVAL '1 day')
        ${statusClause}
      ORDER BY i.received_at DESC
      LIMIT $${status ? 3 : 2}
    `,
    params,
  );

  console.table(result.rows);
};

const main = async () => {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      printUsage();
      return;
    }

    if (options.receipts.length > 0) {
      await inspectReceipts(options.receipts);
      return;
    }

    await inspectRecent(options);
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error("Failed to inspect M-Pesa callback inbox:", error.message);
  printUsage();
  process.exit(1);
});
