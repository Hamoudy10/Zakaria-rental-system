-- Add delete audit fields for chat message undo/redo support.

ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_deleted_at
  ON chat_messages(deleted_at DESC);
