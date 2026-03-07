-- System-wide activity log for auditing write operations and critical actions.

CREATE TABLE IF NOT EXISTS system_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  module VARCHAR(64) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(64) NULL,
  entity_id UUID NULL,
  request_method VARCHAR(10) NULL,
  request_path TEXT NULL,
  response_status INTEGER NULL,
  ip_address VARCHAR(64) NULL,
  user_agent TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_activity_logs_created_at
  ON system_activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_activity_logs_actor
  ON system_activity_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_activity_logs_module_action
  ON system_activity_logs(module, action, created_at DESC);
