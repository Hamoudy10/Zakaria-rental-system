const db = require('../config/database');
let ioInstance = null;

const setIOInstance = (io) => {
  ioInstance = io;
  console.log('✅ Chat controller received io instance');
};

exports.getAvailableUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const result = await db.query(
      `SELECT id, first_name, last_name, email FROM users WHERE id != $1 ORDER BY first_name ASC`,
      [currentUserId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load users' });
  }
};

exports.createConversation = async (req, res) => {
  const client = await db.connect();
  try {
    const { conversationType, title, participantIds } = req.body;
    const creatorId = req.user.id;
    if (!conversationType || !Array.isArray(participantIds)) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }
    if (conversationType === 'direct') {
      const otherUserId = participantIds[0];
      const existing = await client.query(
        `SELECT c.id FROM chat_conversations c 
         JOIN chat_participants p1 ON c.id = p1.conversation_id 
         JOIN chat_participants p2 ON c.id = p2.conversation_id 
         WHERE c.conversation_type = 'direct' AND p1.user_id = $1 AND p2.user_id = $2`,
        [creatorId, otherUserId]
      );
      if (existing.rows.length > 0) return res.json({ success: true, data: existing.rows[0] });
    }
    await client.query('BEGIN');
    const conversationResult = await client.query(
      `INSERT INTO chat_conversations (conversation_type, title, created_by) VALUES ($1, $2, $3) RETURNING *`,
      [conversationType, conversationType === 'group' ? title || 'Group Chat' : null, creatorId]
    );
    const conversation = conversationResult.rows[0];
    const allParticipants = [creatorId, ...participantIds];
    await client.query(
      `INSERT INTO chat_participants (conversation_id, user_id) SELECT $1, unnest($2::uuid[])`,
      [conversation.id, allParticipants]
    );
    await client.query('COMMIT');
    res.json({ success: true, data: conversation });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Failed to create conversation' });
  } finally {
    client.release();
  }
};

exports.getRecentChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await db.query(
      `SELECT c.id, c.conversation_type, c.title, c.created_at,
        (SELECT cm.message_text FROM chat_messages cm WHERE cm.conversation_id = c.id AND cm.is_deleted = false ORDER BY cm.created_at DESC LIMIT 1) AS last_message,
        (SELECT cm.created_at FROM chat_messages cm WHERE cm.conversation_id = c.id AND cm.is_deleted = false ORDER BY cm.created_at DESC LIMIT 1) AS last_message_at,
        (SELECT COUNT(*) FROM chat_messages cm WHERE cm.conversation_id = c.id AND cm.is_deleted = false AND cm.sender_id != $1
         AND NOT EXISTS (SELECT 1 FROM chat_message_reads mr WHERE mr.message_id = cm.id AND mr.user_id = $1)) AS unread_count,
        (SELECT json_agg(json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name))
         FROM chat_participants cp2 JOIN users u ON u.id = cp2.user_id WHERE cp2.conversation_id = c.id AND cp2.user_id != $1 AND cp2.is_active = true) AS participants
      FROM chat_conversations c WHERE EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = $1 AND cp.is_active = true)
      ORDER BY last_message_at DESC NULLS LAST LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load recent chats' });
  }
};

exports.getConversationMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const result = await db.query(
      `SELECT cm.id, cm.message_text, cm.sender_id, cm.created_at, u.first_name, u.last_name,
        EXISTS (SELECT 1 FROM chat_message_reads r WHERE r.message_id = cm.id AND r.user_id = $1) AS is_read
      FROM chat_messages cm JOIN users u ON u.id = cm.sender_id
      WHERE cm.conversation_id = $2 AND cm.is_deleted = false ORDER BY cm.created_at ASC`,
      [userId, conversationId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
};

exports.sendMessage = async (req, res) => {
  const client = await db.connect();
  try {
    const senderId = req.user.id;
    const { conversationId, messageText } = req.body;

    if (!conversationId || !messageText) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, message_text)
       VALUES ($1, $2, $3)
       RETURNING *, 
       (SELECT first_name FROM users WHERE id = $2) as first_name,
       (SELECT last_name FROM users WHERE id = $2) as last_name`,
      [conversationId, senderId, messageText]
    );

    const message = result.rows[0];

    // Get recipients
    const participants = await client.query(
      `SELECT user_id FROM chat_participants WHERE conversation_id = $1 AND user_id != $2 AND is_active = true`,
      [conversationId, senderId]
    );

    // ✅ INTEGRATION: Create system notifications for each recipient
    const notificationPromises = participants.rows.map(p => {
      return client.query(
        `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          p.user_id, 
          `New Message from ${message.first_name}`, 
          messageText.substring(0, 50) + (messageText.length > 50 ? '...' : ''),
          'chat',
          'chat_conversation',
          conversationId
        ]
      );
    });

    await Promise.all(notificationPromises);
    await client.query('COMMIT');

    // ✅ SOCKET: Emit only to the room (Prevent Double Counting)
    if (ioInstance) {
      ioInstance.to(`conversation_${conversationId}`).emit('new_message', {
        message: message,
        conversationId: conversationId
      });
    }

    res.json({ success: true, data: message });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ sendMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  } finally {
    client.release();
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageIds } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) return res.json({ success: true });
    await db.query(
      `INSERT INTO chat_message_reads (message_id, user_id)
       SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING`,
      [messageIds, userId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
  }
};

exports.getUnreadChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      `SELECT COUNT(*) AS unread_count FROM chat_messages cm
       JOIN chat_participants cp ON cm.conversation_id = cp.conversation_id
       WHERE cp.user_id = $1 AND cm.sender_id != $1 AND cm.is_deleted = false
       AND NOT EXISTS (SELECT 1 FROM chat_message_reads r WHERE r.message_id = cm.id AND r.user_id = $1)`,
      [userId]
    );
    res.json({ success: true, data: Number(result.rows[0].unread_count) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
};

exports.setIOInstance = setIOInstance;