-- Archive deleted records for undo/redo across critical modules.

CREATE TABLE IF NOT EXISTS deleted_records_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  record_data JSONB NOT NULL,
  deleted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  delete_reason TEXT NULL,
  metadata JSONB NULL,
  deleted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  restored_at TIMESTAMP NULL,
  restored_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  redone_at TIMESTAMP NULL,
  redone_by UUID NULL REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_deleted_records_archive_table_record
  ON deleted_records_archive(table_name, record_id, deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_deleted_records_archive_state
  ON deleted_records_archive(restored_at, redone_at, deleted_at DESC);
