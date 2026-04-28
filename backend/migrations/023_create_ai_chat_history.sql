-- 023_create_ai_chat_history.sql
-- Purpose: Persist AI assistant chat history separately from normal user-to-user chat.

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  message_text TEXT NOT NULL,
  ai_mode VARCHAR(30) NOT NULL DEFAULT 'read_only',
  tool_used VARCHAR(120),
  blocked BOOLEAN NOT NULL DEFAULT false,
  fallback BOOLEAN NOT NULL DEFAULT false,
  records_count INTEGER,
  usage_prompt_tokens INTEGER,
  usage_completion_tokens INTEGER,
  usage_total_tokens INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user_id
  ON ai_chat_history(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_chat_history_conversation_created
  ON ai_chat_history(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_chat_history_created_at
  ON ai_chat_history(created_at DESC);

