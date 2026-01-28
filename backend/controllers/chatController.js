const db = require('../config/database');
let ioInstance = null;

// Set io instance from service
const setIOInstance = (io) => {
  ioInstance = io;
  console.log('✅ Chat controller received io instance');
};

/**
 * Helper to safely select user columns that might not exist yet
 */
const getUserColumns = async () => {
  try {
    // Check if is_online column exists
    const check = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_online'
    `);
    const hasOnline = check.rows.length > 0;
    
    // Check if last_seen column exists
    const checkSeen = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'last_seen'
    `);
    const hasLastSeen = checkSeen.rows.length > 0;

    return {
      is_online: hasOnline ? 'is_online' : 'false as is_online',
      last_seen: hasLastSeen ? 'last_seen' : 'NULL as last_seen'
    };
  } catch (e) {
    return { is_online: 'false as is_online', last_seen: 'NULL as last_seen' };
  }
};

/**
 * GET /chat/available-users
 * Returns all users except the authenticated user
 */
exports.getAvailableUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const cols = await getUserColumns();

    // NOTE: Removed role filtering so everyone can chat with everyone
    const query = `
      SELECT 
        id, 
        first_name, 
        last_name, 
        email, 
        role,
        profile_image,
        ${cols.is_online},
        ${cols.last_seen}
      FROM users
      WHERE id != $1 AND is_active = true
      ORDER BY first_name ASC
    `;

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
        SELECT c.id, c.conversation_type, c.title, c.created_at
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
        // Fetch full details and return
        const conversation = existing.rows[0];
        
        // Fetch participants
        const cols = await getUserColumns();
        const parts = await client.query(`
          SELECT 
            u.id, u.first_name, u.last_name, u.profile_image,
            ${cols.is_online}, ${cols.last_seen}
          FROM chat_participants cp
          JOIN users u ON u.id = cp.user_id
          WHERE cp.conversation_id = $1 AND cp.is_active = true
        `, [conversation.id]);

        return res.json({
          success: true,
          data: { ...conversation, participants: parts.rows }
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

    // Bulk insert participants
    for (const pid of allParticipants) {
      await client.query(
        `INSERT INTO chat_participants (conversation_id, user_id) VALUES ($1, $2)`,
        [conversation.id, pid]
      );
    }

    // Get participants with details
    const cols = await getUserColumns();
    const participantsResult = await client.query(
      `
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.profile_image,
        ${cols.is_online},
        ${cols.last_seen}
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
 * GET /chat/recent-chats
 */
exports.getRecentChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const cols = await getUserColumns();

    // Check if status column exists in chat_messages
    let hasStatusColumn = true;
    try {
        await db.query("SELECT status FROM chat_messages LIMIT 1");
    } catch (e) {
        hasStatusColumn = false;
    }

    const unreadCondition = hasStatusColumn
      ? `AND (cm.status IS NULL OR cm.status != 'read')`
      : '';

    const query = `
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
              'is_online', ${cols.is_online},
              'last_seen', ${cols.last_seen}
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
    `;

    const result = await db.query(query, [userId, limit, offset]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getRecentChats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load recent chats' });
  }
};

/**
 * GET /chat/conversations (Legacy, kept for compat)
 */
exports.getUserConversations = async (req, res) => {
  exports.getRecentChats(req, res);
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

    // Check columns existence for message query
    let hasFileUrl = true;
    let hasStatus = true;
    try { await db.query("SELECT file_url FROM chat_messages LIMIT 1"); } catch(e) { hasFileUrl = false; }
    try { await db.query("SELECT status FROM chat_messages LIMIT 1"); } catch(e) { hasStatus = false; }

    const fileUrlCol = hasFileUrl ? 'cm.file_url' : 'NULL';
    const statusCol = hasStatus ? 'cm.status' : "'sent'";
    const deliveredAtCol = hasStatus ? 'cm.delivered_at' : 'NULL';
    const readAtCol = hasStatus ? 'cm.read_at' : 'NULL';

    const result = await db.query(
      `
      SELECT
        cm.id,
        cm.message_text,
        cm.sender_id,
        cm.created_at,
        cm.message_type,
        ${fileUrlCol} AS image_url,
        ${statusCol} as status,
        ${deliveredAtCol} as delivered_at,
        ${readAtCol} as read_at,
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

    // Update message status for received messages (if status column exists)
    if (hasStatus) {
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

    // Check columns
    let hasFileUrl = true;
    let hasStatus = true;
    try { await db.query("SELECT file_url FROM chat_messages LIMIT 1"); } catch(e) { hasFileUrl = false; }
    try { await db.query("SELECT status FROM chat_messages LIMIT 1"); } catch(e) { hasStatus = false; }

    // Determine message type
    const messageType = imageUrl ? 'image' : 'text';

    // Build Insert Query Dynamically
    let insertQuery = `INSERT INTO chat_messages (conversation_id, sender_id, message_text, message_type`;
    let values = [conversationId, senderId, messageText || '', messageType];
    let placeholders = ['$1', '$2', '$3', '$4'];
    let valIndex = 5;

    if (hasFileUrl) {
        insertQuery += `, file_url`;
        values.push(imageUrl);
        placeholders.push(`$${valIndex++}`);
    }
    if (hasStatus) {
        insertQuery += `, status`;
        values.push('sent');
        placeholders.push(`$${valIndex++}`);
    }

    insertQuery += `) VALUES (${placeholders.join(', ')}) RETURNING *, 
        (SELECT first_name FROM users WHERE id = $2) as first_name,
        (SELECT last_name FROM users WHERE id = $2) as last_name,
        (SELECT profile_image FROM users WHERE id = $2) as profile_image`;

    // Save message to database
    const result = await db.query(insertQuery, values);

    const message = result.rows[0];
    if (hasFileUrl) message.image_url = message.file_url; // Map for frontend

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

          // Mark as delivered if user is online and status column exists
          if (hasStatus) {
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

    // Update message status if column exists
    let hasStatus = true;
    try { await db.query("SELECT status FROM chat_messages LIMIT 1"); } catch(e) { hasStatus = false; }

    if (hasStatus) {
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
                ioInstance.to(`conversation_${convId}`).emit('messages_read_receipt', {
                messageIds: data.messageIds,
                conversationId: convId,
                readBy: userId
                });
                
                ioInstance.to(`user_${data.senderId}`).emit('messages_read_receipt', {
                messageIds: data.messageIds,
                conversationId: convId,
                readBy: userId
                });
            }
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

    let hasStatus = true;
    try { await db.query("SELECT status FROM chat_messages LIMIT 1"); } catch(e) { hasStatus = false; }

    if (hasStatus) {
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

        if (ioInstance && updateResult.rows.length > 0) {
        updateResult.rows.forEach(row => {
            ioInstance.to(`user_${row.sender_id}`).emit('message_delivered', {
            messageId: row.id,
            conversationId: row.conversation_id
            });
        });
        }
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

    // Check if column exists
    let hasOnline = true;
    try { await db.query("SELECT is_online FROM users LIMIT 1"); } catch(e) { hasOnline = false; }

    if (hasOnline) {
        await db.query(
        `
        UPDATE users 
        SET is_online = $1, last_seen = CASE WHEN $1 = false THEN NOW() ELSE last_seen END
        WHERE id = $2
        `,
        [isOnline, userId]
        );

        if (ioInstance) {
        ioInstance.emit('user_online_status', {
            userId,
            isOnline,
            lastSeen: isOnline ? null : new Date()
        });
        }
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
    let hasOnline = true;
    try { await db.query("SELECT is_online FROM users LIMIT 1"); } catch(e) { hasOnline = false; }
    
    if (hasOnline) {
        const result = await db.query(
        `
        SELECT id, first_name, last_name, profile_image, last_seen
        FROM users
        WHERE is_online = true AND is_active = true
        `
        );
        res.json({ success: true, data: result.rows });
    } else {
        res.json({ success: true, data: [] });
    }
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
    
    // Check status column
    let hasStatus = true;
    try { await db.query("SELECT status FROM chat_messages LIMIT 1"); } catch(e) { hasStatus = false; }

    if (hasStatus) {
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
        res.json({ success: true, data: Number(result.rows[0].unread_count) });
    } else {
        res.json({ success: true, data: 0 });
    }
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

exports.setIOInstance = setIOInstance;