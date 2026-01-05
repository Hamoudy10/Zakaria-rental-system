const db = require('../config/db');

/**
 * GET /chat/available-users
 * Returns all users except the authenticated user
 */
exports.getAvailableUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const result = await db.query(
      `
      SELECT id, first_name, last_name, email
      FROM users
      WHERE id != $1
      ORDER BY first_name ASC
      `,
      [currentUserId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('getAvailableUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to load users' });
  }
};

/**
 * POST /chat/conversations
 * Creates direct or group conversation
 */
exports.createConversation = async (req, res) => {
  const client = await db.connect();
  try {
    const { conversationType, title, participantIds } = req.body;
    const creatorId = req.user.id;

    if (!conversationType || !Array.isArray(participantIds)) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    // DIRECT CHAT — must be exactly 2 users
    if (conversationType === 'direct') {
      if (participantIds.length !== 1) {
        return res.status(400).json({
          success: false,
          message: 'Direct chat must have exactly one recipient'
        });
      }

      const otherUserId = participantIds[0];

      // Check if conversation already exists
      const existing = await client.query(
        `
        SELECT c.id
        FROM chat_conversations c
        JOIN chat_participants p1 ON c.id = p1.conversation_id
        JOIN chat_participants p2 ON c.id = p2.conversation_id
        WHERE c.conversation_type = 'direct'
          AND p1.user_id = $1
          AND p2.user_id = $2
        `,
        [creatorId, otherUserId]
      );

      if (existing.rows.length > 0) {
        return res.json({
          success: true,
          data: existing.rows[0]
        });
      }
    }

    await client.query('BEGIN');

    const conversationResult = await client.query(
      `
      INSERT INTO chat_conversations (conversation_type, title, created_by)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [
        conversationType,
        conversationType === 'group' ? title || 'Group Chat' : null,
        creatorId
      ]
    );

    const conversation = conversationResult.rows[0];
    const allParticipants = [creatorId, ...participantIds];

    await client.query(
      `
      INSERT INTO chat_participants (conversation_id, user_id)
      SELECT $1, unnest($2::uuid[])
      `,
      [conversation.id, allParticipants]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: conversation
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('createConversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create conversation' });
  } finally {
    client.release();
  }
};

/**
 * GET /chat/conversations
 * Returns all conversations for the user
 */
exports.getUserConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `
      SELECT
        c.id,
        c.conversation_type,
        c.title,
        c.created_at,
        (
          SELECT cm.message_text
          FROM chat_messages cm
          WHERE cm.conversation_id = c.id
            AND cm.is_deleted = false
          ORDER BY cm.created_at DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT cm.created_at
          FROM chat_messages cm
          WHERE cm.conversation_id = c.id
            AND cm.is_deleted = false
          ORDER BY cm.created_at DESC
          LIMIT 1
        ) AS last_message_at
      FROM chat_conversations c
      JOIN chat_participants cp ON c.id = cp.conversation_id
      WHERE cp.user_id = $1
        AND cp.is_active = true
      ORDER BY last_message_at DESC NULLS LAST
      `,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('getUserConversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to load conversations' });
  }
};

/**
 * GET /chat/conversations/:conversationId/messages
 */
exports.getConversationMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    const result = await db.query(
      `
      SELECT
        cm.id,
        cm.message_text,
        cm.sender_id,
        cm.created_at,
        u.first_name,
        u.last_name,
        EXISTS (
          SELECT 1
          FROM chat_message_reads r
          WHERE r.message_id = cm.id
            AND r.user_id = $1
        ) AS is_read
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      WHERE cm.conversation_id = $2
        AND cm.is_deleted = false
      ORDER BY cm.created_at ASC
      `,
      [userId, conversationId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('getConversationMessages error:', error);
    res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
};

/**
 * POST /chat/messages/send
 */
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { conversationId, messageText } = req.body;

    if (!conversationId || !messageText) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const result = await db.query(
      `
      INSERT INTO chat_messages (conversation_id, sender_id, message_text)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [conversationId, senderId, messageText]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};

/**
 * POST /chat/messages/mark-read
 */
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.json({ success: true });
    }

    await db.query(
      `
      INSERT INTO chat_message_reads (message_id, user_id)
      SELECT unnest($1::uuid[]), $2
      ON CONFLICT DO NOTHING
      `,
      [messageIds, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('markAsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
  }
};

/**
 * GET /chat/unread-count
 */
exports.getUnreadChats = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `
      SELECT COUNT(*) AS unread_count
      FROM chat_messages cm
      JOIN chat_participants cp ON cm.conversation_id = cp.conversation_id
      WHERE cp.user_id = $1
        AND cm.sender_id != $1
        AND cm.is_deleted = false
        AND NOT EXISTS (
          SELECT 1
          FROM chat_message_reads r
          WHERE r.message_id = cm.id
            AND r.user_id = $1
        )
      `,
      [userId]
    );

    res.json({
      success: true,
      data: Number(result.rows[0].unread_count)
    });
  } catch (error) {
    console.error('getUnreadChats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
};

/**
 * GET /chat/search
 */
exports.searchMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { q } = req.query;

    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const result = await db.query(
      `
      SELECT cm.*
      FROM chat_messages cm
      JOIN chat_participants cp ON cm.conversation_id = cp.conversation_id
      WHERE cp.user_id = $1
        AND cm.message_text ILIKE '%' || $2 || '%'
      ORDER BY cm.created_at DESC
      `,
      [userId, q]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('searchMessages error:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};
