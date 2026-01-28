// backend/controllers/chatController.js
const db = require('../config/database');
let ioInstance = null;

// Set io instance from service
const setIOInstance = (io) => {
  ioInstance = io;
  console.log('✅ Chat controller received io instance');
};

/**
 * GET /chat/available-users
 * Returns all users except the authenticated user with online status
 */
exports.getAvailableUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // First check if is_online column exists
    const columnCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_online'
    `);

    const hasOnlineColumn = columnCheck.rows.length > 0;

    let query;
    if (hasOnlineColumn) {
      query = `
        SELECT 
          id, 
          first_name, 
          last_name, 
          email, 
          role,
          profile_image,
          COALESCE(is_online, false) as is_online,
          last_seen
        FROM users
        WHERE id != $1 AND is_active = true
        ORDER BY 
          is_online DESC NULLS LAST,
          first_name ASC
      `;
    } else {
      query = `
        SELECT 
          id, 
          first_name, 
          last_name, 
          email, 
          role,
          profile_image,
          false as is_online,
          NULL as last_seen
        FROM users
        WHERE id != $1 AND is_active = true
        ORDER BY first_name ASC
      `;
    }

    const result = await db.query(query, [currentUserId]);

    console.log(`📋 getAvailableUsers: Found ${result.rows.length} users for user ${currentUserId}`);

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

    // DIRECT CHAT — check for existing
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
        SELECT c.id, c.conversation_type, c.title, c.created_at,
          (
            SELECT json_agg(
              json_build_object(
                'id', u.id,
                'first_name', u.first_name,
                'last_name', u.last_name,
                'profile_image', u.profile_image,
                'is_online', u.is_online,
                'last_seen', u.last_seen
              )
            )
            FROM chat_participants cp2
            JOIN users u ON u.id = cp2.user_id
            WHERE cp2.conversation_id = c.id
              AND cp2.is_active = true
          ) AS participants
        FROM chat_conversations c
        JOIN chat_participants p1 ON c.id = p1.conversation_id AND p1.is_active = true
        JOIN chat_participants p2 ON c.id = p2.conversation_id AND p2.is_active = true
        WHERE c.conversation_type = 'direct'
          AND p1.user_id = $1
          AND p2.user_id = $2
        LIMIT 1
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

    // Get participants with details
    const participantsResult = await client.query(
      `
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.profile_image,
        u.is_online,
        u.last_seen
      FROM chat_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = $1 AND cp.is_active = true
      `,
      [conversation.id]
    );

    await client.query('COMMIT');

    const result = {
      ...conversation,
      participants: participantsResult.rows
    };

    res.json({
      success: true,
      data: result
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

    // Check if is_online column exists
    const columnCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_online'
    `);
    const hasOnlineColumn = columnCheck.rows.length > 0;

    // Check if status column exists in chat_messages
    const statusCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'chat_messages' AND column_name = 'status'
    `);
    const hasStatusColumn = statusCheck.rows.length > 0;

    const participantFields = hasOnlineColumn 
      ? `'is_online', COALESCE(u.is_online, false), 'last_seen', u.last_seen`
      : `'is_online', false, 'last_seen', NULL`;

    const unreadCondition = hasStatusColumn
      ? `AND (cm.status IS NULL OR cm.status != 'read')`
      : '';

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
          SELECT COUNT(*)::int
          FROM chat_messages cm
          WHERE cm.conversation_id = c.id
            AND cm.is_deleted = false
            AND cm.sender_id != $1
            ${unreadCondition}
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
              'last_name', u.last_name,
              'profile_image', u.profile_image,
              ${participantFields}
            )
          )
          FROM chat_participants cp2
          JOIN users u ON u.id = cp2.user_id
          WHERE cp2.conversation_id = c.id
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
      ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    );

    console.log(`📋 getRecentChats: Found ${result.rows.length} conversations for user ${userId}`);

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
          SELECT json_agg(
            json_build_object(
              'id', u.id,
              'first_name', u.first_name,
              'last_name', u.last_name,
              'profile_image', u.profile_image,
              'is_online', u.is_online
            )
          )
          FROM chat_participants cp2
          JOIN users u ON u.id = cp2.user_id
          WHERE cp2.conversation_id = c.id
            AND cp2.is_active = true
        ) AS participants
      FROM chat_conversations c
      JOIN chat_participants cp_self
        ON c.id = cp_self.conversation_id
       AND cp_self.user_id = $1
       AND cp_self.is_active = true
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    // Verify user is participant
    const participantCheck = await db.query(
      `SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND user_id = $2 AND is_active = true`,
      [conversationId, userId]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Not a participant' });
    }

    const result = await db.query(
      `
      SELECT
        cm.id,
        cm.message_text,
        cm.sender_id,
        cm.created_at,
        cm.message_type,
        cm.file_url AS image_url,
        cm.status,
        cm.delivered_at,
        cm.read_at,
        u.first_name,
        u.last_name,
        u.profile_image,
        EXISTS (
          SELECT 1
          FROM chat_message_reads r
          WHERE r.message_id = cm.id
            AND r.user_id != cm.sender_id
        ) AS is_read
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      WHERE cm.conversation_id = $1
        AND cm.is_deleted = false
      ORDER BY cm.created_at ASC
      LIMIT $2 OFFSET $3
      `,
      [conversationId, limit, offset]
    );

    // Update message status for received messages
    const unreadMessageIds = result.rows
      .filter(m => m.sender_id !== userId && m.status !== 'read')
      .map(m => m.id);

    if (unreadMessageIds.length > 0) {
      // Mark as delivered if not already
      await db.query(
        `
        UPDATE chat_messages 
        SET status = CASE 
          WHEN status = 'sent' THEN 'delivered' 
          ELSE status 
        END,
        delivered_at = COALESCE(delivered_at, NOW())
        WHERE id = ANY($1::uuid[]) AND sender_id != $2
        `,
        [unreadMessageIds, userId]
      );
    }

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
    const { conversationId, messageText, imageUrl } = req.body;

    if (!conversationId || (!messageText && !imageUrl)) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    // Verify sender is participant
    const participantCheck = await db.query(
      `SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND user_id = $2 AND is_active = true`,
      [conversationId, senderId]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Not a participant' });
    }

    // Determine message type
    const messageType = imageUrl ? 'image' : 'text';

    // Save message to database
    const result = await db.query(
      `
      INSERT INTO chat_messages (
        conversation_id, 
        sender_id, 
        message_text, 
        message_type,
        file_url,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'sent')
      RETURNING *,
      (SELECT first_name FROM users WHERE id = $2) as first_name,
      (SELECT last_name FROM users WHERE id = $2) as last_name,
      (SELECT profile_image FROM users WHERE id = $2) as profile_image
      `,
      [conversationId, senderId, messageText || '', messageType, imageUrl]
    );

    const message = result.rows[0];
    message.image_url = message.file_url; // Map for frontend

    // Get all participants
    const participantsResult = await db.query(
      'SELECT user_id FROM chat_participants WHERE conversation_id = $1 AND is_active = true',
      [conversationId]
    );

    // Emit via Socket.IO
    if (ioInstance) {
      const roomName = `conversation_${conversationId}`;
      ioInstance.to(roomName).emit('new_message', {
        message: message,
        conversationId: conversationId
      });

      // Send notifications to other participants
      for (const participant of participantsResult.rows) {
        if (participant.user_id !== senderId) {
          const userRoom = `user_${participant.user_id}`;
          ioInstance.to(userRoom).emit('chat_notification', {
            type: 'new_message',
            conversationId: conversationId,
            message: message
          });

          // Mark as delivered if user is online
          const socketsInRoom = await ioInstance.in(userRoom).fetchSockets();
          if (socketsInRoom.length > 0) {
            await db.query(
              `UPDATE chat_messages SET status = 'delivered', delivered_at = NOW() WHERE id = $1`,
              [message.id]
            );

            // Notify sender of delivery
            ioInstance.to(`user_${senderId}`).emit('message_delivered', {
              messageId: message.id,
              conversationId: conversationId
            });
          }
        }
      }
    }

    res.json({
      success: true,
      data: message
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

    // Insert read receipts
    await db.query(
      `
      INSERT INTO chat_message_reads (message_id, user_id)
      SELECT unnest($1::uuid[]), $2
      ON CONFLICT DO NOTHING
      `,
      [messageIds, userId]
    );

    // Update message status
    const updateResult = await db.query(
      `
      UPDATE chat_messages 
      SET status = 'read', read_at = NOW()
      WHERE id = ANY($1::uuid[]) 
        AND sender_id != $2
        AND status != 'read'
      RETURNING id, conversation_id, sender_id
      `,
      [messageIds, userId]
    );

    // Notify senders via socket
    if (ioInstance && updateResult.rows.length > 0) {
      // Group by sender and conversation
      const byConversation = {};
      updateResult.rows.forEach(row => {
        if (!byConversation[row.conversation_id]) {
          byConversation[row.conversation_id] = {
            senderId: row.sender_id,
            messageIds: []
          };
        }
        byConversation[row.conversation_id].messageIds.push(row.id);
      });

      for (const [convId, data] of Object.entries(byConversation)) {
        // Emit to conversation room
        ioInstance.to(`conversation_${convId}`).emit('messages_read_receipt', {
          messageIds: data.messageIds,
          conversationId: convId,
          readBy: userId
        });

        // Emit to sender's personal room
        ioInstance.to(`user_${data.senderId}`).emit('messages_read_receipt', {
          messageIds: data.messageIds,
          conversationId: convId,
          readBy: userId
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('markAsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
  }
};

/**
 * POST /chat/messages/mark-delivered
 */
exports.markAsDelivered = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.json({ success: true });
    }

    const updateResult = await db.query(
      `
      UPDATE chat_messages 
      SET status = 'delivered', delivered_at = NOW()
      WHERE id = ANY($1::uuid[]) 
        AND sender_id != $2
        AND status = 'sent'
      RETURNING id, conversation_id, sender_id
      `,
      [messageIds, userId]
    );

    // Notify senders via socket
    if (ioInstance && updateResult.rows.length > 0) {
      updateResult.rows.forEach(row => {
        ioInstance.to(`user_${row.sender_id}`).emit('message_delivered', {
          messageId: row.id,
          conversationId: row.conversation_id
        });
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('markAsDelivered error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as delivered' });
  }
};

/**
 * POST /chat/status/online
 * Update user online status
 */
exports.updateOnlineStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isOnline } = req.body;

    await db.query(
      `
      UPDATE users 
      SET is_online = $1, last_seen = CASE WHEN $1 = false THEN NOW() ELSE last_seen END
      WHERE id = $2
      `,
      [isOnline, userId]
    );

    // Broadcast to all users
    if (ioInstance) {
      ioInstance.emit('user_online_status', {
        userId,
        isOnline,
        lastSeen: isOnline ? null : new Date()
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('updateOnlineStatus error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

/**
 * GET /chat/status/online-users
 * Get list of online users
 */
exports.getOnlineUsers = async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT id, first_name, last_name, profile_image, last_seen
      FROM users
      WHERE is_online = true AND is_active = true
      `
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getOnlineUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get online users' });
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
      SELECT COUNT(*)::int AS unread_count
      FROM chat_messages cm
      JOIN chat_participants cp ON cm.conversation_id = cp.conversation_id
      WHERE cp.user_id = $1
        AND cp.is_active = true
        AND cm.sender_id != $1
        AND cm.is_deleted = false
        AND (cm.status IS NULL OR cm.status != 'read')
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
    const { q, conversationId } = req.query;

    if (!q) {
      return res.json({ success: true, data: [] });
    }

    let query = `
      SELECT 
        cm.*,
        u.first_name,
        u.last_name,
        c.title as conversation_title
      FROM chat_messages cm
      JOIN chat_participants cp ON cm.conversation_id = cp.conversation_id
      JOIN users u ON cm.sender_id = u.id
      JOIN chat_conversations c ON cm.conversation_id = c.id
      WHERE cp.user_id = $1
        AND cp.is_active = true
        AND cm.is_deleted = false
        AND cm.message_text ILIKE '%' || $2 || '%'
    `;

    const params = [userId, q];

    if (conversationId) {
      query += ` AND cm.conversation_id = $3`;
      params.push(conversationId);
    }

    query += ` ORDER BY cm.created_at DESC LIMIT 50`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('searchMessages error:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};

/**
 * POST /chat/upload-image
 * Upload chat image to Cloudinary
 */
exports.uploadChatImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image provided' });
    }

    // The file.path contains the Cloudinary URL when using multer-storage-cloudinary
    const imageUrl = req.file.path;

    res.json({
      success: true,
      data: { url: imageUrl }
    });
  } catch (error) {
    console.error('uploadChatImage error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image' });
  }
};

// Export functions
exports.setIOInstance = setIOInstance;