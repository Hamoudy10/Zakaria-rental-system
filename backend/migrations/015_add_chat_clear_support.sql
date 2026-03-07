-- Add per-user conversation clear support for chat module.
-- This allows each participant to clear their own view of a conversation
-- without deleting messages for other participants.

ALTER TABLE chat_participants
ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_chat_participants_cleared_at
  ON chat_participants (user_id, conversation_id, cleared_at);
