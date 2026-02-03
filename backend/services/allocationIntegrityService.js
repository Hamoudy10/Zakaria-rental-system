const pool = require('../config/database');

const SAMPLE_LIMIT = 10;

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

const diagnosticsQueries = {
  duplicateActiveAllocations: `
    SELECT 
      ta.tenant_id,
      COUNT(*) AS active_allocations,
      MIN(t.first_name) AS first_name,
      MIN(t.last_name) AS last_name
    FROM tenant_allocations ta
    LEFT JOIN tenants t ON t.id = ta.tenant_id
    WHERE ta.is_active = true
    GROUP BY ta.tenant_id
    HAVING COUNT(*) > 1
    ORDER BY active_allocations DESC
  `,
  activeAllocationsOnVacantUnits: `
    SELECT 
      ta.id AS allocation_id,
      ta.tenant_id,
      t.first_name,
      t.last_name,
      pu.id AS unit_id,
      pu.unit_code,
      pu.is_occupied,
      p.name AS property_name
    FROM tenant_allocations ta
    JOIN property_units pu ON pu.id = ta.unit_id
    LEFT JOIN tenants t ON t.id = ta.tenant_id
    LEFT JOIN properties p ON p.id = pu.property_id
    WHERE ta.is_active = true
      AND (pu.is_occupied = false OR pu.is_active = false)
    ORDER BY ta.updated_at DESC NULLS LAST, ta.allocation_date DESC NULLS LAST
  `,
  occupiedUnitsWithoutAllocation: `
    SELECT 
      pu.id AS unit_id,
      pu.unit_code,
      p.name AS property_name
    FROM property_units pu
    LEFT JOIN properties p ON p.id = pu.property_id
    WHERE pu.is_occupied = true
      AND NOT EXISTS (
        SELECT 1 
        FROM tenant_allocations ta 
        WHERE ta.unit_id = pu.id 
          AND ta.is_active = true
      )
    ORDER BY pu.updated_at DESC NULLS LAST
  `,
  activeAllocationsPastLeaseEnd: `
    SELECT 
      ta.id AS allocation_id,
      ta.tenant_id,
      t.first_name,
      t.last_name,
      ta.lease_end_date
    FROM tenant_allocations ta
    LEFT JOIN tenants t ON t.id = ta.tenant_id
    WHERE ta.is_active = true
      AND ta.lease_end_date IS NOT NULL
      AND ta.lease_end_date < CURRENT_DATE
    ORDER BY ta.lease_end_date DESC
  `,
};

async function getDiagnostics(clientOverride) {
  return withClient(clientOverride, async (client) => {
    const [
      duplicates,
      activeOnVacant,
      occupiedWithoutAlloc,
      pastLease,
    ] = await Promise.all([
      client.query(diagnosticsQueries.duplicateActiveAllocations),
      client.query(diagnosticsQueries.activeAllocationsOnVacantUnits),
      client.query(diagnosticsQueries.occupiedUnitsWithoutAllocation),
      client.query(diagnosticsQueries.activeAllocationsPastLeaseEnd),
    ]);

    return {
      summary: {
        tenantsWithDuplicateActiveAllocations: duplicates.rowCount,
        activeAllocationsOnVacantUnits: activeOnVacant.rowCount,
        occupiedUnitsWithoutActiveAllocation: occupiedWithoutAlloc.rowCount,
        activeAllocationsPastLeaseEnd: pastLease.rowCount,
      },
      samples: {
        duplicateActiveAllocations: mapRowsWithLimit(duplicates.rows),
        activeAllocationsOnVacantUnits: mapRowsWithLimit(activeOnVacant.rows),
        occupiedUnitsWithoutActiveAllocation: mapRowsWithLimit(occupiedWithoutAlloc.rows),
        activeAllocationsPastLeaseEnd: mapRowsWithLimit(pastLease.rows),
      },
    };
  });
}

async function autoResolveTenantConflicts(client, tenantId) {
  if (!tenantId) return { deactivatedCount: 0, allocationIds: [] };

  const staleAllocations = await client.query(
    `
      SELECT ta.id
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
    return { deactivatedCount: 0, allocationIds: [] };
  }

  const ids = staleAllocations.rows.map((row) => row.id);

  const updateResult = await client.query(
    `
      UPDATE tenant_allocations
      SET is_active = false,
          updated_at = NOW()
      WHERE id = ANY($1::uuid[])
      RETURNING id
    `,
    [ids],
  );

  return {
    deactivatedCount: updateResult.rowCount,
    allocationIds: updateResult.rows.map((row) => row.id),
  };
}

async function reconcileAllocations(options = {}, clientOverride) {
  const {
    dryRun = false,
    fixDuplicateTenants = true,
    fixVacantUnitAllocations = true,
    syncUnitOccupancy = true,
  } = options;

  return withClient(clientOverride, async (client) => {
    const stats = {
      duplicatesDeactivated: 0,
      staleAllocationsClosed: 0,
      unitsUpdated: 0,
      propertiesUpdated: 0,
    };

    await client.query('BEGIN');

    try {
      if (fixDuplicateTenants) {
        const duplicateResult = await client.query(
          `
            WITH ranked AS (
              SELECT 
                id,
                tenant_id,
                ROW_NUMBER() OVER (
                  PARTITION BY tenant_id 
                  ORDER BY allocation_date DESC NULLS LAST, created_at DESC NULLS LAST
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
            RETURNING ta.id
          `,
        );

        stats.duplicatesDeactivated = duplicateResult.rowCount;
      }

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
            RETURNING ta.id
          `,
        );

        stats.staleAllocationsClosed = staleResult.rowCount;
      }

      if (syncUnitOccupancy) {
        const unitResult = await client.query(
          `
            WITH occupancy AS (
              SELECT 
                pu.id,
                EXISTS (
                  SELECT 1 
                  FROM tenant_allocations ta
                  WHERE ta.unit_id = pu.id
                    AND ta.is_active = true
                ) AS should_be_occupied
              FROM property_units pu
            )
            UPDATE property_units pu
            SET is_occupied = occupancy.should_be_occupied,
                updated_at = NOW()
            FROM occupancy
            WHERE pu.id = occupancy.id
              AND pu.is_occupied IS DISTINCT FROM occupancy.should_be_occupied
            RETURNING pu.id
          `,
        );

        stats.unitsUpdated = unitResult.rowCount;

        const propertyResult = await client.query(
          `
            UPDATE properties p
            SET available_units = sub.available_units,
                updated_at = NOW()
            FROM (
              SELECT 
                property_id,
                COUNT(*) FILTER (WHERE is_active = true AND is_occupied = false) AS available_units
              FROM property_units
              GROUP BY property_id
            ) AS sub
            WHERE p.id = sub.property_id
          `,
        );

        stats.propertiesUpdated = propertyResult.rowCount;
      }

      if (dryRun) {
        await client.query('ROLLBACK');
      } else {
        await client.query('COMMIT');
      }

      return { dryRun, ...stats };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

module.exports = {
  getDiagnostics,
  autoResolveTenantConflicts,
  reconcileAllocations,
};
