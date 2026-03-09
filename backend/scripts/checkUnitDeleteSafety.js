#!/usr/bin/env node

require("dotenv").config();

const pool = require("../config/database");

const printUsage = () => {
  console.log(`Usage:
  node backend/scripts/checkUnitDeleteSafety.js --unit MJ-MJG2B
  node backend/scripts/checkUnitDeleteSafety.js --unit MJ-MJG2B --unit MJG2B

Options:
  --unit <value>   Unit code to inspect. Repeat for multiple unit codes.
  --help, -h       Show this help message.
`);
};

const parseArgs = (argv) => {
  const options = {
    unitCodes: [],
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--unit") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --unit");
      }
      options.unitCodes.push(String(value).trim().toUpperCase());
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

const summarizeRows = (rows) =>
  rows.map((row) => {
    const activeAllocations = Number.parseInt(row.active_allocations, 10) || 0;
    const allocationHistory = Number.parseInt(row.allocation_history_count, 10) || 0;
    const paymentCount = Number.parseInt(row.payment_count, 10) || 0;
    const complaintCount = Number.parseInt(row.complaint_count, 10) || 0;
    const hasLinkedHistory =
      allocationHistory > 0 || paymentCount > 0 || complaintCount > 0;

    return {
      unit_code: row.unit_code,
      property_name: row.property_name || "-",
      unit_id: row.unit_id,
      is_active: row.is_active,
      is_occupied: row.is_occupied,
      active_allocations: activeAllocations,
      allocation_history_count: allocationHistory,
      payment_count: paymentCount,
      complaint_count: complaintCount,
      latest_active_tenants: row.active_tenants || "-",
      safe_to_hard_delete:
        row.is_active === true &&
        row.is_occupied === false &&
        !hasLinkedHistory,
      recommended_action: hasLinkedHistory
        ? "archive_or_deactivate_only"
        : activeAllocations > 0
          ? "delete_allocations_first"
          : "hard_delete_possible",
    };
  });

const inspectUnits = async (unitCodes) => {
  const result = await pool.query(
    `
      WITH target_units AS (
        SELECT pu.id AS unit_id, pu.unit_code, pu.property_id, pu.is_active, pu.is_occupied
        FROM property_units pu
        WHERE UPPER(pu.unit_code) = ANY($1::text[])
      ),
      allocation_counts AS (
        SELECT
          ta.unit_id,
          COUNT(*) AS allocation_history_count,
          COUNT(*) FILTER (WHERE ta.is_active = true) AS active_allocations
        FROM tenant_allocations ta
        INNER JOIN target_units tu ON tu.unit_id = ta.unit_id
        GROUP BY ta.unit_id
      ),
      payment_counts AS (
        SELECT
          rp.unit_id,
          COUNT(*) AS payment_count
        FROM rent_payments rp
        INNER JOIN target_units tu ON tu.unit_id = rp.unit_id
        GROUP BY rp.unit_id
      ),
      complaint_counts AS (
        SELECT
          c.unit_id,
          COUNT(*) AS complaint_count
        FROM complaints c
        INNER JOIN target_units tu ON tu.unit_id = c.unit_id
        GROUP BY c.unit_id
      ),
      active_tenants AS (
        SELECT
          ta.unit_id,
          STRING_AGG(
            CONCAT(COALESCE(t.first_name, ''), ' ', COALESCE(t.last_name, '')),
            ', ' ORDER BY t.first_name, t.last_name
          ) AS active_tenants
        FROM tenant_allocations ta
        LEFT JOIN tenants t ON t.id = ta.tenant_id
        INNER JOIN target_units tu ON tu.unit_id = ta.unit_id
        WHERE ta.is_active = true
        GROUP BY ta.unit_id
      )
      SELECT
        tu.unit_id,
        tu.unit_code,
        tu.is_active,
        tu.is_occupied,
        p.name AS property_name,
        COALESCE(ac.active_allocations, 0) AS active_allocations,
        COALESCE(ac.allocation_history_count, 0) AS allocation_history_count,
        COALESCE(pc.payment_count, 0) AS payment_count,
        COALESCE(cc.complaint_count, 0) AS complaint_count,
        at.active_tenants
      FROM target_units tu
      LEFT JOIN properties p ON p.id = tu.property_id
      LEFT JOIN allocation_counts ac ON ac.unit_id = tu.unit_id
      LEFT JOIN payment_counts pc ON pc.unit_id = tu.unit_id
      LEFT JOIN complaint_counts cc ON cc.unit_id = tu.unit_id
      LEFT JOIN active_tenants at ON at.unit_id = tu.unit_id
      ORDER BY tu.unit_code
    `,
    [unitCodes],
  );

  const foundCodes = new Set(result.rows.map((row) => String(row.unit_code).toUpperCase()));
  const missingCodes = unitCodes.filter((code) => !foundCodes.has(code));

  if (missingCodes.length > 0) {
    console.log("Units not found:");
    console.table(missingCodes.map((unit_code) => ({ unit_code })));
  }

  if (result.rows.length === 0) {
    console.log("No matching units found.");
    return;
  }

  console.table(summarizeRows(result.rows));
};

const main = async () => {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      printUsage();
      return;
    }

    if (options.unitCodes.length === 0) {
      printUsage();
      throw new Error("At least one --unit value is required");
    }

    await inspectUnits(options.unitCodes);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
};

main();
