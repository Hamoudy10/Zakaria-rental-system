-- 024: AI pending actions table for confirmation workflow
-- Stores write operations that require explicit user confirmation before execution.

CREATE TABLE IF NOT EXISTS ai_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(80) NOT NULL,
  action_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmation_message TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'executed', 'failed')),
  error_message TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_conv
  ON ai_pending_actions(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_user_status
  ON ai_pending_actions(user_id, status);
