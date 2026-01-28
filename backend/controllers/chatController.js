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
 * Returns all users except the authenticated user
 */
const getAvailableUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    console.log('📋 getAvailableUsers called for user:', currentUserId);

    // Simple query that should work with basic users table
    const result = await db.query(
      `
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
      ORDER BY first_name ASC
      `,
      [currentUserId]
    );

    console.log('📋 Found users:', result.rows.length);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ getAvailableUsers error:', error);
    
    // Fallback query without optional columns
    try {
      const result = await db.query(
        `
        SELECT id, first_name, last_name, email, role
        FROM users
        WHERE id != $1 AND is_active = true
        ORDER BY first_name ASC
        `,
        [req.user.id]
      );
      
      res.json({
        success: true,
        data: result.rows.map(u => ({
          ...u,
          is_online: false,
          last_seen: null,
          profile_image: null
        }))
      });
    } catch (fallbackError) {
      console.error('❌ Fallback query also failed:', fallbackError);
      res.status(500).json({ success: false, message: 'Failed to load users' });
    }
  }
};

/**
 * POST /chat/conversations
 * Creates direct or group conversation
 */
const createConversation = async (req, res) => {
  const client = await db.connect();
  try {
    const { conversationType, title, participantIds } = req.body;
    const creatorId = req.user.id;

    console.log('📋 createConversation called:', { conversationType, title, participantIds, creatorId });

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

      // Check if conversation already exists between these two users
      const existing = await client.query(
        `
        SELECT c.id, c.conversation_type, c.title, c.created_at,
          (
            SELECT json_agg(
              json_build_object(
                'id', u.id,
                'first_name', u.first_name,
                'last_name', u.last_name,
                'profile_image', u.profile_image
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
        console.log('📋 Existing conversation found:', existing.rows[0].id);
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
        u.profile_image
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

    console.log('📋 Conversation created:', result.id);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ createConversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create conversation', error: error.message });
  } finally {
    client.release();
  }
};

/**
 * GET /chat/recent-chats?limit=50&offset=0
 * Returns recent conversations for the user with last message info
 */
const getRecentChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    console.log('📋 getRecentChats called for user:', userId);

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
              'profile_image', u.profile_image
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

    console.log('📋 Found conversations:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ getRecentChats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load recent chats', error: error.message });
  }
};

/**
 * GET /chat/conversations
 * Returns all conversations for the user
 */
const getUserConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📋 getUserConversations called for user:', userId);

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
              'profile_image', u.profile_image
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

    console.log('📋 Found conversations:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ getUserConversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to load conversations', error: error.message });
  }
};

/**
 * GET /chat/conversations/:conversationId/messages
 */
const getConversationMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    console.log('📋 getConversationMessages called:', { conversationId, userId, page });

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
        COALESCE(cm.status, 'sent') as status,
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

    console.log('📋 Found messages:', result.rows.length);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ getConversationMessages error:', error);
    res.status(500).json({ success: false, message: 'Failed to load messages', error: error.message });
  }
};

/**
 * POST /chat/messages/send
 * Send a new message
 */
const sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { conversationId, messageText, imageUrl } = req.body;

    console.log('📋 sendMessage called:', { conversationId, senderId, hasText: !!messageText, hasImage: !!imageUrl });

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
        file_url
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *,
      (SELECT first_name FROM users WHERE id = $2) as first_name,
      (SELECT last_name FROM users WHERE id = $2) as last_name,
      (SELECT profile_image FROM users WHERE id = $2) as profile_image
      `,
      [conversationId, senderId, messageText || '', messageType, imageUrl]
    );

    const message = result.rows[0];
    message.image_url = message.file_url;
    message.status = 'sent';

    console.log('📋 Message saved:', message.id);

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
      console.log('📡 Emitted new_message to room:', roomName);

      // Send notifications to other participants
      for (const participant of participantsResult.rows) {
        if (participant.user_id !== senderId) {
          const userRoom = `user_${participant.user_id}`;
          ioInstance.to(userRoom).emit('chat_notification', {
            type: 'new_message',
            conversationId: conversationId,
            message: message
          });
        }
      }
    }

    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('❌ sendMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message', error: error.message });
  }
};

/**
 * POST /chat/messages/mark-read
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.json({ success: true });
    }

    console.log('📋 markAsRead called:', { userId, messageCount: messageIds.length });

    // Insert read receipts
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
    console.error('❌ markAsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
  }
};

/**
 * POST /chat/messages/mark-delivered
 */
const markAsDelivered = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.json({ success: true });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ markAsDelivered error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as delivered' });
  }
};

/**
 * POST /chat/status/online
 */
const updateOnlineStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isOnline } = req.body;

    try {
      await db.query(
        `UPDATE users SET is_online = $1, last_seen = NOW() WHERE id = $2`,
        [isOnline, userId]
      );
    } catch (err) {
      // Column might not exist, ignore
      console.log('Note: is_online/last_seen columns may not exist');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ updateOnlineStatus error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

/**
 * GET /chat/status/online-users
 */
const getOnlineUsers = async (req, res) => {
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
    console.error('❌ getOnlineUsers error:', error);
    // Return empty array if column doesn't exist
    res.json({ success: true, data: [] });
  }
};

/**
 * GET /chat/unread-count
 */
const getUnreadChats = async (req, res) => {
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
    console.error('❌ getUnreadChats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
};

/**
 * GET /chat/search
 */
const searchMessages = async (req, res) => {
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
    console.error('❌ searchMessages error:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};

/**
 * POST /chat/upload-image
 */
const uploadChatImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image provided' });
    }

    const imageUrl = req.file.path;

    res.json({
      success: true,
      data: { url: imageUrl }
    });
  } catch (error) {
    console.error('❌ uploadChatImage error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image' });
  }
};

// Export all functions
module.exports = {
  setIOInstance,
  getAvailableUsers,
  createConversation,
  getRecentChats,
  getUserConversations,
  getConversationMessages,
  sendMessage,
  markAsRead,
  markAsDelivered,
  updateOnlineStatus,
  getOnlineUsers,
  getUnreadChats,
  searchMessages,
  uploadChatImage
};