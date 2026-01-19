const db = require('../config/database');
let ioInstance = null;

// ✅ Function to set io instance from service
const setIOInstance = (io) => {
  ioInstance = io;
  console.log('✅ Chat controller received io instance');
};

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
 * GET /chat/recent-chats?limit=50&offset=0
 * Returns recent conversations for the user with last message info
 */
exports.getRecentChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

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
        ) AS last_message_at,
        (
          SELECT COUNT(*)
          FROM chat_messages cm
          WHERE cm.conversation_id = c.id
            AND cm.is_deleted = false
            AND cm.sender_id != $1
            AND NOT EXISTS (
              SELECT 1
              FROM chat_message_reads mr
              WHERE mr.message_id = cm.id
                AND mr.user_id = $1
            )
        ) AS unread_count,
        (
          SELECT json_agg(
            json_build_object(
              'id', u.id,
              'first_name', u.first_name,
              'last_name', u.last_name
            )
          )
          FROM chat_participants cp2
          JOIN users u ON u.id = cp2.user_id
          WHERE cp2.conversation_id = c.id
            AND cp2.user_id != $1
            AND cp2.is_active = true
        ) AS participants
      FROM chat_conversations c
      WHERE EXISTS (
        SELECT 1
        FROM chat_participants cp
        WHERE cp.conversation_id = c.id
          AND cp.user_id = $1
          AND cp.is_active = true
      )
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getRecentChats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load recent chats' });
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
        CASE
          WHEN c.conversation_type = 'group' THEN c.title
          ELSE CONCAT(u.first_name, ' ', u.last_name)
        END AS display_name,
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
      JOIN chat_participants cp_self
        ON c.id = cp_self.conversation_id
       AND cp_self.user_id = $1
       AND cp_self.is_active = true
      LEFT JOIN chat_participants cp_other
        ON c.id = cp_other.conversation_id
       AND cp_other.user_id != $1
      LEFT JOIN users u
        ON u.id = cp_other.user_id
      ORDER BY last_message_at DESC NULLS LAST
      `,
      [userId]
    );

    res.json({ success: true, data: result.rows });
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
 * Send a new message with proper socket emission
 */
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { conversationId, messageText } = req.body;

    console.log('========================================');
    console.log('📤 SEND MESSAGE REQUEST');
    console.log(`Sender ID: ${senderId}`);
    console.log(`Conversation ID: ${conversationId}`);
    console.log(`Message: ${messageText}`);
    console.log('========================================');

    if (!conversationId || !messageText) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    // Save message to database
    const result = await db.query(
      `
      INSERT INTO chat_messages (conversation_id, sender_id, message_text)
      VALUES ($1, $2, $3)
      RETURNING *,
      (SELECT first_name FROM users WHERE id = $2) as first_name,
      (SELECT last_name FROM users WHERE id = $2) as last_name,
      (SELECT role FROM users WHERE id = $2) as role
      `,
      [conversationId, senderId, messageText]
    );

    const message = result.rows[0];
    console.log(`✅ Message saved to database, ID: ${message.id}`);

    // Get all participants for logging
    const participantsResult = await db.query(
      'SELECT user_id FROM chat_participants WHERE conversation_id = $1 AND is_active = true',
      [conversationId]
    );

    console.log(`👥 Conversation has ${participantsResult.rows.length} participants:`,
      participantsResult.rows.map(p => p.user_id));

    // ✅ Emit via Socket.IO if instance is available
    if (ioInstance) {
      console.log('📡 Socket.IO instance available, emitting messages...');

      // ✅ SINGLE EMISSION: Broadcast to conversation room ONLY
      const roomName = `conversation_${conversationId}`;
      ioInstance.to(roomName).emit('new_message', {
        message: message,
        conversationId: conversationId
      });
      console.log(`📡 Emitted to room: ${roomName}`);

      // Get sockets in the room for verification
      const socketsInRoom = await ioInstance.in(roomName).fetchSockets();
      console.log(`🔍 Sockets in room ${roomName}: ${socketsInRoom.length}`);
      socketsInRoom.forEach(s => {
        console.log(`  - Socket ${s.id}, User ${s.userId}`);
      });

      // ✅ Keep notification emission for user rooms (optional)
      for (const participant of participantsResult.rows) {
        const userRoom = `user_${participant.user_id}`;

        // Send notification only to OTHER participants (not the sender)
        if (participant.user_id !== senderId) {
          ioInstance.to(userRoom).emit('chat_notification', {
            type: 'new_message',
            conversationId: conversationId,
            message: message,
            unreadCount: 1
          });
          console.log(`🔔 Sent notification to ${userRoom}`);
        }

        // Verify socket in user room
        const userSockets = await ioInstance.in(userRoom).fetchSockets();
        console.log(`🔍 Sockets in ${userRoom}: ${userSockets.length}`);
      }

      console.log('✅ All socket emissions complete');
    } else {
      console.error('❌ Socket.IO instance NOT available!');
    }

    console.log('========================================');
    console.log('✅ SEND MESSAGE COMPLETE');
    console.log('========================================');

    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('❌ sendMessage error:', error);
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

// ✅ Export the setIOInstance function
exports.setIOInstance = setIOInstance;