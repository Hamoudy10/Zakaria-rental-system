const db = require('../config/database');

/**
 * GET /chat/conversations
 * Get all conversations for the authenticated user
 */
const getUserConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT
        c.id,
        c.title,
        c.conversation_type,
        c.created_at,
        c.updated_at,

        MAX(cm.created_at) AS last_message_at,

        (
          SELECT cm2.message_text
          FROM chat_messages cm2
          WHERE cm2.conversation_id = c.id
            AND cm2.is_deleted = false
          ORDER BY cm2.created_at DESC
          LIMIT 1
        ) AS last_message_text,

        (
          SELECT u.first_name || ' ' || u.last_name
          FROM chat_messages cm3
          JOIN users u ON u.id = cm3.sender_id
          WHERE cm3.conversation_id = c.id
          ORDER BY cm3.created_at DESC
          LIMIT 1
        ) AS last_message_sender,

        COUNT(cm.id) FILTER (
          WHERE cm.sender_id != $1
          AND NOT EXISTS (
            SELECT 1 FROM chat_message_reads r
            WHERE r.message_id = cm.id AND r.user_id = $1
          )
        ) AS unread_count,

        ARRAY_AGG(
          DISTINCT jsonb_build_object(
            'id', u2.id,
            'first_name', u2.first_name,
            'last_name', u2.last_name,
            'email', u2.email,
            'role', u2.role
          )
        ) FILTER (WHERE u2.id IS NOT NULL) AS participants

      FROM chat_conversations c
      JOIN chat_participants cp_self
        ON c.id = cp_self.conversation_id
       AND cp_self.user_id = $1
       AND cp_self.is_active = true

      LEFT JOIN chat_participants cp ON c.id = cp.conversation_id AND cp.is_active = true
      LEFT JOIN users u2 ON u2.id = cp.user_id
      LEFT JOIN chat_messages cm
        ON cm.conversation_id = c.id
       AND cm.is_deleted = false

      GROUP BY c.id
      ORDER BY last_message_at DESC NULLS LAST
    `;

    const { rows } = await db.query(query, [userId]);

    res.json({ success: true, conversations: rows });
  } catch (error) {
    console.error('getUserConversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
};

/**
 * GET /chat/conversations/:conversationId/messages
 */
const getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const limit = Number(req.query.limit) || 50;
    const page = Number(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const accessCheck = await db.query(
      `SELECT 1 FROM chat_participants
       WHERE conversation_id = $1 AND user_id = $2 AND is_active = true`,
      [conversationId, userId]
    );

    if (accessCheck.rowCount === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const messagesQuery = `
      SELECT
        cm.id,
        cm.message_text,
        cm.sender_id,
        cm.parent_message_id,
        cm.created_at,
        u.first_name,
        u.last_name,
        u.role,

        EXISTS (
          SELECT 1 FROM chat_message_reads r
          WHERE r.message_id = cm.id AND r.user_id = $1
        ) AS is_read,

        pm.message_text AS parent_message_text,
        pu.first_name AS parent_sender_first_name,
        pu.last_name AS parent_sender_last_name

      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      LEFT JOIN chat_messages pm ON pm.id = cm.parent_message_id
      LEFT JOIN users pu ON pu.id = pm.sender_id
      WHERE cm.conversation_id = $2
        AND cm.is_deleted = false
      ORDER BY cm.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const { rows } = await db.query(messagesQuery, [
      userId,
      conversationId,
      limit,
      offset
    ]);

    // Mark messages as read
    await db.query(
      `
      INSERT INTO chat_message_reads (message_id, user_id, read_at)
      SELECT cm.id, $1, CURRENT_TIMESTAMP
      FROM chat_messages cm
      WHERE cm.conversation_id = $2
        AND cm.sender_id != $1
        AND cm.is_deleted = false
      ON CONFLICT (message_id, user_id) DO NOTHING
      `,
      [userId, conversationId]
    );

    res.json({
      success: true,
      messages: rows.reverse(),
      pagination: {
        page,
        limit,
        hasMore: rows.length === limit
      }
    });
  } catch (error) {
    console.error('getConversationMessages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
};

/**
 * POST /chat/messages/send
 */
const sendMessage = async (req, res) => {
  try {
    const { conversationId, messageText, parentMessageId } = req.body;
    const userId = req.user.id;

    const accessCheck = await db.query(
      `SELECT 1 FROM chat_participants
       WHERE conversation_id = $1 AND user_id = $2 AND is_active = true`,
      [conversationId, userId]
    );

    if (accessCheck.rowCount === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const insertQuery = `
      INSERT INTO chat_messages (
        conversation_id,
        sender_id,
        message_text,
        parent_message_id
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const { rows } = await db.query(insertQuery, [
      conversationId,
      userId,
      messageText,
      parentMessageId || null
    ]);

    await db.query(
      `UPDATE chat_conversations
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [conversationId]
    );

    const participants = await db.query(
      `SELECT user_id FROM chat_participants
       WHERE conversation_id = $1 AND user_id != $2 AND is_active = true`,
      [conversationId, userId]
    );

    res.json({
      success: true,
      message: rows[0],
      participants: participants.rows.map(r => r.user_id)
    });
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};

/**
 * POST /chat/conversations
 */
const createConversation = async (req, res) => {
  try {
    const { participantIds, title, conversationType = 'direct' } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Participants required' });
    }

    if (conversationType === 'direct' && participantIds.length !== 1) {
      return res.status(400).json({ success: false, message: 'Direct chat requires exactly one participant' });
    }

    if (conversationType === 'direct') {
      const existing = await db.query(
        `
        SELECT c.id
        FROM chat_conversations c
        JOIN chat_participants a ON a.conversation_id = c.id
        JOIN chat_participants b ON b.conversation_id = c.id
        WHERE c.conversation_type = 'direct'
          AND a.user_id = LEAST($1, $2)
          AND b.user_id = GREATEST($1, $2)
        `,
        [userId, participantIds[0]]
      );

      if (existing.rowCount > 0) {
        return res.json({ success: true, conversationId: existing.rows[0].id });
      }
    }

    const { rows } = await db.query(
      `
      INSERT INTO chat_conversations (title, conversation_type, created_by)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [title || null, conversationType, userId]
    );

    const conversationId = rows[0].id;
    const allUsers = [userId, ...participantIds];

    await db.query(
      `
      INSERT INTO chat_participants (conversation_id, user_id)
      SELECT $1, unnest($2::uuid[])
      `,
      [conversationId, allUsers]
    );

    res.json({ success: true, conversation: rows[0] });
  } catch (error) {
    console.error('createConversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create conversation' });
  }
};

/**
 * GET /chat/search
 */
const searchMessages = async (req, res) => {
  try {
    const { query, conversationId } = req.query;
    const userId = req.user.id;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Query required' });
    }

    let sql = `
      SELECT
        cm.*,
        u.first_name,
        u.last_name,
        c.title AS conversation_title
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      JOIN chat_conversations c ON c.id = cm.conversation_id
      JOIN chat_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1
        AND cp.is_active = true
        AND cm.is_deleted = false
        AND to_tsvector('english', cm.message_text)
            @@ plainto_tsquery('english', $2)
    `;

    const params = [userId, query];

    if (conversationId) {
      sql += ` AND cm.conversation_id = $3`;
      params.push(conversationId);
    }

    sql += ` ORDER BY cm.created_at DESC LIMIT 100`;

    const { rows } = await db.query(sql, params);

    res.json({ success: true, results: rows, count: rows.length });
  } catch (error) {
    console.error('searchMessages error:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};

/**
 * POST /chat/messages/mark-read
 */
const markAsRead = async (req, res) => {
  try {
    const { messageIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(messageIds)) {
      return res.status(400).json({ success: false, message: 'messageIds must be array' });
    }

    await db.query(
      `
      INSERT INTO chat_message_reads (message_id, user_id, read_at)
      SELECT unnest($1::uuid[]), $2, CURRENT_TIMESTAMP
      ON CONFLICT (message_id, user_id)
      DO UPDATE SET read_at = CURRENT_TIMESTAMP
      `,
      [messageIds, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('markAsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark read' });
  }
};

/**
 * GET /chat/available-users
 */
const getAvailableUsers = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await db.query(
      `
      SELECT id, first_name, last_name, email, role, phone_number, profile_image
      FROM users
      WHERE is_active = true
        AND role IN ('admin', 'agent')
        AND id != $1
      ORDER BY first_name, last_name
      `,
      [userId]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('getAvailableUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

/**
 * GET /chat/unread-count
 */
const getUnreadChats = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await db.query(
      `
      SELECT DISTINCT ON (c.id)
        c.id AS "chatId",
        cm.message_text AS "lastMessage",
        cm.created_at AS "createdAt",
        u.first_name || ' ' || u.last_name AS "senderName"
      FROM chat_conversations c
      JOIN chat_participants cp ON cp.conversation_id = c.id
      JOIN chat_messages cm ON cm.conversation_id = c.id
      JOIN users u ON u.id = cm.sender_id
      LEFT JOIN chat_message_reads r
        ON r.message_id = cm.id AND r.user_id = $1
      WHERE cp.user_id = $1
        AND cp.is_active = true
        AND cm.sender_id != $1
        AND cm.is_deleted = false
        AND r.message_id IS NULL
      ORDER BY c.id, cm.created_at DESC
      `,
      [userId]
    );

    res.json({ success: true, data: { unreadChats: rows } });
  } catch (error) {
    console.error('getUnreadChats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unread chats' });
  }
};

module.exports = {
  getUserConversations,
  getConversationMessages,
  sendMessage,
  createConversation,
  searchMessages,
  markAsRead,
  getAvailableUsers,
  getUnreadChats
};
