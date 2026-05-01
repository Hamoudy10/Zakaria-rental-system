-- Add tenant archival support for audit-safe deactivation.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_is_archived
  ON tenants(is_archived, created_at DESC);

