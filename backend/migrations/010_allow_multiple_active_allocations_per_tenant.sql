-- 010_allow_multiple_active_allocations_per_tenant.sql
-- Allow one tenant to have multiple active unit allocations.
-- Keep safety: only one active allocation per unit and no duplicate active tenant+unit pair.

DO $$
DECLARE
  idx RECORD;
BEGIN
  -- Drop legacy UNIQUE indexes on tenant_id + is_active pattern (if any).
  FOR idx IN
    SELECT schemaname, indexname
    FROM pg_indexes
    WHERE tablename = 'tenant_allocations'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%(tenant_id%'
      AND indexdef ILIKE '%is_active%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', idx.schemaname, idx.indexname);
  END LOOP;
END $$;

DO $$
DECLARE
  con RECORD;
BEGIN
  -- Drop legacy UNIQUE constraints that force one allocation per tenant.
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'tenant_allocations'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%UNIQUE (tenant_id%'
  LOOP
    EXECUTE format(
      'ALTER TABLE tenant_allocations DROP CONSTRAINT IF EXISTS %I',
      con.conname
    );
  END LOOP;
END $$;

-- Ensure one active allocation per unit.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_allocations_active_unit
  ON tenant_allocations(unit_id)
  WHERE is_active = true;

-- Prevent duplicate active rows for the same tenant-unit pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_allocations_active_tenant_unit
  ON tenant_allocations(tenant_id, unit_id)
  WHERE is_active = true;
