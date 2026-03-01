const pool = require("../config/database");

const SAMPLE_LIMIT = 10;

/**
 * Helper to use provided client or create new one
 */
const withClient = async (clientOverride, handler) => {
  if (clientOverride) {
    return handler(clientOverride);
  }

  const client = await pool.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
};

const mapRowsWithLimit = (rows) => rows.slice(0, SAMPLE_LIMIT);

/**
 * Diagnostic queries to identify allocation integrity issues
 */
const diagnosticsQueries = {
  // Units with multiple active allocations (should only have 1 active tenant per unit)
  duplicateActiveAllocations: `
    SELECT 
      ta.unit_id,
      COUNT(*) AS active_allocations,
      MIN(pu.unit_code) AS unit_code,
      ARRAY_AGG(CONCAT(t.first_name, ' ', t.last_name)) AS tenant_names
    FROM tenant_allocations ta
    LEFT JOIN tenants t ON t.id = ta.tenant_id
    LEFT JOIN property_units pu ON pu.id = ta.unit_id
    WHERE ta.is_active = true
    GROUP BY ta.unit_id
    HAVING COUNT(*) > 1
    ORDER BY active_allocations DESC
  `,

  // Active allocations pointing to vacant/inactive units (data inconsistency)
  activeAllocationsOnVacantUnits: `
    SELECT 
      ta.id AS allocation_id,
      ta.tenant_id,
      t.first_name,
      t.last_name,
      pu.id AS unit_id,
      pu.unit_code,
      pu.is_occupied,
      pu.is_active AS unit_is_active,
      p.name AS property_name
    FROM tenant_allocations ta
    JOIN property_units pu ON pu.id = ta.unit_id
    LEFT JOIN tenants t ON t.id = ta.tenant_id
    LEFT JOIN properties p ON p.id = pu.property_id
    WHERE ta.is_active = true
      AND (pu.is_occupied = false OR pu.is_active = false)
    ORDER BY ta.updated_at DESC NULLS LAST, ta.allocation_date DESC NULLS LAST
  `,

  // Units marked as occupied but no active allocation exists
  occupiedUnitsWithoutAllocation: `
    SELECT 
      pu.id AS unit_id,
      pu.unit_code,
      p.name AS property_name
    FROM property_units pu
    LEFT JOIN properties p ON p.id = pu.property_id
    WHERE pu.is_occupied = true
      AND pu.is_active = true
      AND NOT EXISTS (
        SELECT 1 
        FROM tenant_allocations ta 
        WHERE ta.unit_id = pu.id 
          AND ta.is_active = true
      )
    ORDER BY pu.unit_code
  `,

  // Active allocations past lease end date
  activeAllocationsPastLeaseEnd: `
    SELECT 
      ta.id AS allocation_id,
      ta.tenant_id,
      t.first_name,
      t.last_name,
      pu.unit_code,
      ta.lease_end_date,
      CURRENT_DATE - ta.lease_end_date AS days_overdue
    FROM tenant_allocations ta
    LEFT JOIN tenants t ON t.id = ta.tenant_id
    LEFT JOIN property_units pu ON pu.id = ta.unit_id
    WHERE ta.is_active = true
      AND ta.lease_end_date IS NOT NULL
      AND ta.lease_end_date < CURRENT_DATE
    ORDER BY ta.lease_end_date ASC
  `,

  // Inactive allocations with unit still marked as occupied (cleanup missed)
  inactiveAllocationsWithOccupiedUnits: `
    SELECT 
      ta.id AS allocation_id,
      ta.tenant_id,
      t.first_name,
      t.last_name,
      pu.id AS unit_id,
      pu.unit_code,
      pu.is_occupied,
      ta.updated_at AS deactivated_at
    FROM tenant_allocations ta
    JOIN property_units pu ON pu.id = ta.unit_id
    LEFT JOIN tenants t ON t.id = ta.tenant_id
    WHERE ta.is_active = false
      AND pu.is_occupied = true
      AND NOT EXISTS (
        SELECT 1 FROM tenant_allocations ta2 
        WHERE ta2.unit_id = pu.id 
          AND ta2.is_active = true
          AND ta2.id != ta.id
      )
    ORDER BY ta.updated_at DESC NULLS LAST
  `,
};

/**
 * Get comprehensive diagnostics report
 */
async function getDiagnostics(clientOverride) {
  return withClient(clientOverride, async (client) => {
    const [
      duplicates,
      activeOnVacant,
      occupiedWithoutAlloc,
      pastLease,
      inactiveWithOccupied,
    ] = await Promise.all([
      client.query(diagnosticsQueries.duplicateActiveAllocations),
      client.query(diagnosticsQueries.activeAllocationsOnVacantUnits),
      client.query(diagnosticsQueries.occupiedUnitsWithoutAllocation),
      client.query(diagnosticsQueries.activeAllocationsPastLeaseEnd),
      client.query(diagnosticsQueries.inactiveAllocationsWithOccupiedUnits),
    ]);

    const hasIssues =
      duplicates.rowCount > 0 ||
      activeOnVacant.rowCount > 0 ||
      occupiedWithoutAlloc.rowCount > 0 ||
      inactiveWithOccupied.rowCount > 0;

    return {
      hasIssues,
      summary: {
        tenantsWithDuplicateActiveAllocations: duplicates.rowCount,
        activeAllocationsOnVacantUnits: activeOnVacant.rowCount,
        occupiedUnitsWithoutActiveAllocation: occupiedWithoutAlloc.rowCount,
        activeAllocationsPastLeaseEnd: pastLease.rowCount,
        inactiveAllocationsWithOccupiedUnits: inactiveWithOccupied.rowCount,
      },
      samples: {
        duplicateActiveAllocations: mapRowsWithLimit(duplicates.rows),
        activeAllocationsOnVacantUnits: mapRowsWithLimit(activeOnVacant.rows),
        occupiedUnitsWithoutActiveAllocation: mapRowsWithLimit(
          occupiedWithoutAlloc.rows,
        ),
        activeAllocationsPastLeaseEnd: mapRowsWithLimit(pastLease.rows),
        inactiveAllocationsWithOccupiedUnits: mapRowsWithLimit(
          inactiveWithOccupied.rows,
        ),
      },
    };
  });
}

/**
 * Auto-resolve stale/conflicting allocations for a specific tenant
 * Called during createAllocation to clean up before checking for conflicts
 *
 * This function is MORE AGGRESSIVE than before:
 * - Deactivates allocations where unit is marked vacant
 * - Deactivates allocations where unit is inactive
 * - Deactivates allocations past lease end date
 * - Also fixes the unit's is_occupied flag if needed
 */
async function autoResolveTenantConflicts(client, tenantId) {
  if (!tenantId)
    return { deactivatedCount: 0, allocationIds: [], unitsFixed: 0 };

  console.log(`🔍 Checking for stale allocations for tenant: ${tenantId}`);

  // Find stale allocations for this tenant
  const staleAllocations = await client.query(
    `
      SELECT ta.id, ta.unit_id, pu.unit_code, pu.is_occupied, pu.is_active as unit_active
      FROM tenant_allocations ta
      LEFT JOIN property_units pu ON pu.id = ta.unit_id
      WHERE ta.tenant_id = $1
        AND ta.is_active = true
        AND (
          pu.is_occupied = false
          OR pu.is_active = false
          OR (ta.lease_end_date IS NOT NULL AND ta.lease_end_date < CURRENT_DATE)
        )
    `,
    [tenantId],
  );

  if (staleAllocations.rowCount === 0) {
    console.log(`✅ No stale allocations found for tenant ${tenantId}`);
    return { deactivatedCount: 0, allocationIds: [], unitsFixed: 0 };
  }

  console.log(
    `🧹 Found ${staleAllocations.rowCount} stale allocations to clean up`,
  );

  const ids = staleAllocations.rows.map((row) => row.id);
  const unitIds = staleAllocations.rows.map((row) => row.unit_id);

  // Deactivate the stale allocations
  const updateResult = await client.query(
    `
      UPDATE tenant_allocations
      SET is_active = false,
          updated_at = NOW()
      WHERE id = ANY($1::uuid[])
      RETURNING id, unit_id
    `,
    [ids],
  );

  // Ensure units are marked as vacant (in case they were incorrectly marked occupied)
  const unitFixResult = await client.query(
    `
      UPDATE property_units
      SET is_occupied = false
      WHERE id = ANY($1::uuid[])
        AND NOT EXISTS (
          SELECT 1 FROM tenant_allocations 
          WHERE unit_id = property_units.id 
            AND is_active = true
        )
      RETURNING id
    `,
    [unitIds],
  );

  console.log(
    `✅ Deactivated ${updateResult.rowCount} allocations, fixed ${unitFixResult.rowCount} units`,
  );

  return {
    deactivatedCount: updateResult.rowCount,
    allocationIds: updateResult.rows.map((row) => row.id),
    unitsFixed: unitFixResult.rowCount,
  };
}

/**
 * Comprehensive reconciliation of all allocation data
 * Can be run as dry-run first, then with dryRun=false to apply fixes
 */
async function reconcileAllocations(options = {}, clientOverride) {
  const {
    dryRun = false,
    fixDuplicateTenants = false,
    fixVacantUnitAllocations = true,
    syncUnitOccupancy = true,
    fixOccupiedUnitsWithoutAllocation = true,
  } = options;

  return withClient(clientOverride, async (client) => {
    const stats = {
      duplicatesDeactivated: 0,
      staleAllocationsClosed: 0,
      unitsMarkedVacant: 0,
      unitsMarkedOccupied: 0,
      propertiesUpdated: 0,
    };

    const details = {
      deactivatedAllocations: [],
      updatedUnits: [],
    };

    await client.query("BEGIN");

    try {
      // Fix 1: Deactivate duplicate active allocations on the same unit (keep newest)
      if (fixDuplicateTenants) {
        const duplicateResult = await client.query(
          `
            WITH ranked AS (
              SELECT 
                id,
                tenant_id,
                unit_id,
                ROW_NUMBER() OVER (
                  PARTITION BY unit_id 
                  ORDER BY allocation_date DESC NULLS LAST, id DESC
                ) AS rn
              FROM tenant_allocations
              WHERE is_active = true
            )
            UPDATE tenant_allocations ta
            SET is_active = false,
                updated_at = NOW()
            FROM ranked r
            WHERE ta.id = r.id
              AND r.rn > 1
            RETURNING ta.id, ta.tenant_id, ta.unit_id
          `,
        );

        stats.duplicatesDeactivated = duplicateResult.rowCount;
        if (duplicateResult.rowCount > 0) {
          details.deactivatedAllocations.push(
            ...duplicateResult.rows.map((r) => ({
              id: r.id,
              reason: "duplicate_tenant_allocation",
            })),
          );
        }
      }

      // Fix 2: Deactivate allocations on vacant/inactive units
      if (fixVacantUnitAllocations) {
        const staleResult = await client.query(
          `
            UPDATE tenant_allocations ta
            SET is_active = false,
                updated_at = NOW()
            FROM property_units pu
            WHERE ta.unit_id = pu.id
              AND ta.is_active = true
              AND (pu.is_occupied = false OR pu.is_active = false)
            RETURNING ta.id, ta.tenant_id, ta.unit_id
          `,
        );

        stats.staleAllocationsClosed = staleResult.rowCount;
        if (staleResult.rowCount > 0) {
          details.deactivatedAllocations.push(
            ...staleResult.rows.map((r) => ({
              id: r.id,
              reason: "unit_vacant_or_inactive",
            })),
          );
        }
      }

      // Fix 3: Sync unit occupancy with active allocations
      if (syncUnitOccupancy) {
        // Mark units as vacant if they have no active allocation
        const markVacantResult = await client.query(
          `
            UPDATE property_units pu
            SET is_occupied = false
            WHERE pu.is_occupied = true
              AND pu.is_active = true
              AND NOT EXISTS (
                SELECT 1 FROM tenant_allocations ta
                WHERE ta.unit_id = pu.id AND ta.is_active = true
              )
            RETURNING pu.id, pu.unit_code
          `,
        );

        stats.unitsMarkedVacant = markVacantResult.rowCount;
        if (markVacantResult.rowCount > 0) {
          details.updatedUnits.push(
            ...markVacantResult.rows.map((r) => ({
              id: r.id,
              unit_code: r.unit_code,
              action: "marked_vacant",
            })),
          );
        }

        // Mark units as occupied if they have an active allocation but are marked vacant
        const markOccupiedResult = await client.query(
          `
            UPDATE property_units pu
            SET is_occupied = true
            WHERE pu.is_occupied = false
              AND pu.is_active = true
              AND EXISTS (
                SELECT 1 FROM tenant_allocations ta
                WHERE ta.unit_id = pu.id AND ta.is_active = true
              )
            RETURNING pu.id, pu.unit_code
          `,
        );

        stats.unitsMarkedOccupied = markOccupiedResult.rowCount;
        if (markOccupiedResult.rowCount > 0) {
          details.updatedUnits.push(
            ...markOccupiedResult.rows.map((r) => ({
              id: r.id,
              unit_code: r.unit_code,
              action: "marked_occupied",
            })),
          );
        }
      }

      // Fix 4: Also handle occupied units that somehow have no active allocation
      if (fixOccupiedUnitsWithoutAllocation) {
        const orphanedOccupiedResult = await client.query(
          `
            UPDATE property_units pu
            SET is_occupied = false
            WHERE pu.is_occupied = true
              AND NOT EXISTS (
                SELECT 1 FROM tenant_allocations ta
                WHERE ta.unit_id = pu.id AND ta.is_active = true
              )
            RETURNING pu.id, pu.unit_code
          `,
        );

        // Add to unitsMarkedVacant if not already counted
        if (orphanedOccupiedResult.rowCount > 0 && !syncUnitOccupancy) {
          stats.unitsMarkedVacant += orphanedOccupiedResult.rowCount;
        }
      }

      // Fix 5: Recalculate available_units for all properties
      const propertyResult = await client.query(
        `
          UPDATE properties p
          SET available_units = sub.available_count
          FROM (
            SELECT 
              property_id,
              COUNT(*) FILTER (WHERE is_active = true AND is_occupied = false) AS available_count
            FROM property_units
            GROUP BY property_id
          ) AS sub
          WHERE p.id = sub.property_id
            AND p.available_units IS DISTINCT FROM sub.available_count
          RETURNING p.id
        `,
      );

      stats.propertiesUpdated = propertyResult.rowCount;

      if (dryRun) {
        await client.query("ROLLBACK");
        console.log("🔍 Dry run complete - no changes applied");
      } else {
        await client.query("COMMIT");
        console.log("✅ Reconciliation complete - changes applied");
      }

      return {
        dryRun,
        ...stats,
        details: dryRun ? details : undefined,
        message: dryRun
          ? "Dry run complete. Review stats and run again with dryRun=false to apply fixes."
          : "Reconciliation complete. All allocation integrity issues have been resolved.",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("❌ Reconciliation error:", error);
      throw error;
    }
  });
}

/**
 * Quick fix for a single allocation - can be called manually
 */
async function forceDeactivateAllocation(allocationId, clientOverride) {
  return withClient(clientOverride, async (client) => {
    await client.query("BEGIN");

    try {
      // Get allocation details
      const allocation = await client.query(
        `SELECT ta.id, ta.unit_id, ta.is_active, pu.property_id
         FROM tenant_allocations ta
         JOIN property_units pu ON pu.id = ta.unit_id
         WHERE ta.id = $1`,
        [allocationId],
      );

      if (allocation.rows.length === 0) {
        throw new Error("Allocation not found");
      }

      const { unit_id, property_id, is_active } = allocation.rows[0];

      if (!is_active) {
        await client.query("ROLLBACK");
        return {
          success: true,
          message: "Allocation was already inactive",
          changed: false,
        };
      }

      // Deactivate allocation
      await client.query(
        `UPDATE tenant_allocations SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [allocationId],
      );

      // Mark unit as vacant
      await client.query(
        `UPDATE property_units SET is_occupied = false WHERE id = $1`,
        [unit_id],
      );

      // Update property available units
      await client.query(
        `UPDATE properties 
         SET available_units = (
           SELECT COUNT(*) FROM property_units 
           WHERE property_id = properties.id AND is_active = true AND is_occupied = false
         )
         WHERE id = $1`,
        [property_id],
      );

      await client.query("COMMIT");

      return {
        success: true,
        message: "Allocation forcefully deactivated",
        changed: true,
        allocationId,
        unitId: unit_id,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

module.exports = {
  getDiagnostics,
  autoResolveTenantConflicts,
  reconcileAllocations,
  forceDeactivateAllocation,
};
