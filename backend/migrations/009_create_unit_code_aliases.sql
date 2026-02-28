-- 009_create_unit_code_aliases.sql
-- Stores historical/alternate unit references for M-Pesa BillRef matching.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS unit_code_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
  alias_code VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_code_aliases_alias_upper_unique
  ON unit_code_aliases (UPPER(alias_code));

CREATE INDEX IF NOT EXISTS idx_unit_code_aliases_unit_id
  ON unit_code_aliases(unit_id);
