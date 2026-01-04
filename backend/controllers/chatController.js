const db = require('../config/database');

// Get all conversations for a user
const getUserConversations = async (req, res) => {
    try {
        const userId = req.user.id;
       const query = `
           SELECT 
                c.*,
                COUNT(DISTINCT cm.id) as message_count,
                MAX(cm.created_at) as last_message_at,
                (
                    SELECT cm2.message_text 
                    FROM chat_messages cm2 
                    WHERE cm2.conversation_id = c.id 
                    ORDER BY cm2.created_at DESC 
                    LIMIT 1
                ) as last_message_text,
                (
                    SELECT u.first_name || ' ' || u.last_name 
                    FROM chat_messages cm3 
                    JOIN users u ON cm3.sender_id = u.id 
                    WHERE cm3.conversation_id = c.id 
                    ORDER BY cm3.created_at DESC 
                    LIMIT 1
                ) as last_message_sender,
                COUNT(DISTINCT cmr.message_id) FILTER (WHERE cmr.user_id = $1 AND cmr.read_at IS NULL) as unread_count,
                ARRAY_AGG(DISTINCT jsonb_build_object(
                    'id', u2.id,
                    'first_name', u2.first_name,
                   'last_name', u2.last_name,
                    'email', u2.email,
                    'role', u2.role
                )) as participants
            FROM chat_conversations c
            -- Ensure the current user is a participant (cp_user),
            -- but aggregate participants (cp/u2) for the whole conversation
            JOIN chat_participants cp_user 
              ON c.id = cp_user.conversation_id 
              AND cp_user.user_id = $1 
              AND cp_user.is_active = true
            LEFT JOIN chat_participants cp ON c.id = cp.conversation_id AND cp.is_active = true
            LEFT JOIN users u2 ON cp.user_id = u2.id
            LEFT JOIN chat_messages cm ON c.id = cm.conversation_id
            LEFT JOIN chat_message_reads cmr ON cm.id = cmr.message_id
            GROUP BY c.id
            ORDER BY last_message_at DESC NULLS LAST
        `;
        
        const result = await db.query(query, [userId]);
        
        res.json({
            success: true,
            conversations: result.rows
        });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversations'
        });
    }
};

// Get unread chat messages summary for NotificationBell
const getUnreadChats = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT 
        c.id as "chatId",
        c.title as conversationTitle,
        cm.message_text as lastMessage,
        u.first_name || ' ' || u.last_name as senderName,
        cm.created_at as "createdAt"
      FROM chat_conversations c
      JOIN chat_participants cp ON c.id = cp.conversation_id
      JOIN chat_messages cm ON c.id = cm.conversation_id
      JOIN users u ON cm.sender_id = u.id
      LEFT JOIN chat_message_reads cmr 
        ON cm.id = cmr.message_id AND cmr.user_id = $1
      WHERE cp.user_id = $1 
        AND cp.is_active = true
        AND cm.sender_id != $1
        AND cm.is_deleted = false
        AND cmr.read_at IS NULL
      GROUP BY c.id, cm.id, u.first_name, u.last_name
      HAVING COUNT(cmr.message_id) >= 1
      ORDER BY cm.created_at DESC
    `;

    const result = await db.query(query, [userId]);

    res.json({
      success: true,
      data: {
        unreadChats: result.rows
      }
    });
  } catch (error) {
    console.error('Get unread chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread chat messages'
    });
  }
};


// Get messages for a conversation
const getConversationMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.id;
        const { page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        // Verify user is participant
        const participantCheck = await db.query(
            'SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND user_id = $2 AND is_active = true',
            [conversationId, userId]
        );

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this conversation'
            });
        }

        // Get messages
        const messagesQuery = `
            SELECT 
                cm.*,
                u.first_name,
                u.last_name,
                u.role,
                EXISTS(
                    SELECT 1 FROM chat_message_reads 
                    WHERE message_id = cm.id AND user_id = $1
                ) as is_read,
                parent_msg.message_text as parent_message_text,
                parent_sender.first_name as parent_sender_first_name,
                parent_sender.last_name as parent_sender_last_name
            FROM chat_messages cm
            JOIN users u ON cm.sender_id = u.id
            LEFT JOIN chat_messages parent_msg ON cm.parent_message_id = parent_msg.id
            LEFT JOIN users parent_sender ON parent_msg.sender_id = parent_sender.id
            WHERE cm.conversation_id = $2 AND cm.is_deleted = false
            ORDER BY cm.created_at DESC
            LIMIT $3 OFFSET $4
        `;

        const messagesResult = await db.query(messagesQuery, [userId, conversationId, limit, offset]);

        // Mark messages as read
        await db.query(`
            INSERT INTO chat_message_reads (message_id, user_id, read_at)
            SELECT cm.id, $1, CURRENT_TIMESTAMP
            FROM chat_messages cm
            WHERE cm.conversation_id = $2 
            AND cm.is_deleted = false
            AND cm.sender_id != $1
            AND NOT EXISTS (
                SELECT 1 FROM chat_message_reads 
                WHERE message_id = cm.id AND user_id = $1
            )
            ON CONFLICT (message_id, user_id) DO NOTHING
        `, [userId, conversationId]);

        res.json({
            success: true,
            messages: messagesResult.rows.reverse(),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: messagesResult.rows.length === parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages'
        });
    }
};

// Send a message
const sendMessage = async (req, res) => {
    try {
        const { conversationId, messageText, parentMessageId } = req.body;
        const userId = req.user.id;

        // Verify user is participant
        const participantCheck = await db.query(
            'SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND user_id = $2 AND is_active = true',
            [conversationId, userId]
        );

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this conversation'
            });
        }

        // Validate parent message if provided
        if (parentMessageId) {
            const parentCheck = await db.query(
                'SELECT 1 FROM chat_messages WHERE id = $1 AND conversation_id = $2',
                [parentMessageId, conversationId]
            );
            if (parentCheck.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid parent message'
                });
            }
        }

        // Insert message
        const messageQuery = `
            INSERT INTO chat_messages (conversation_id, sender_id, message_text, parent_message_id)
            VALUES ($1, $2, $3, $4)
            RETURNING *, 
            (SELECT first_name FROM users WHERE id = $2) as first_name,
            (SELECT last_name FROM users WHERE id = $2) as last_name,
            (SELECT role FROM users WHERE id = $2) as role
        `;

        const messageResult = await db.query(messageQuery, [
            conversationId, 
            userId, 
            messageText, 
            parentMessageId || null
        ]);

        // Update conversation updated_at
        await db.query(
            'UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [conversationId]
        );

        // Get conversation participants for notification
        const participantsResult = await db.query(
            'SELECT user_id FROM chat_participants WHERE conversation_id = $1 AND user_id != $2 AND is_active = true',
            [conversationId, userId]
        );

        const message = messageResult.rows[0];
        const participants = participantsResult.rows.map(row => row.user_id);

        res.json({
            success: true,
            message: message,
            participants: participants
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
};

// Create a new conversation
const createConversation = async (req, res) => {
    try {
        const { participantIds, title, conversationType = 'direct' } = req.body;
        const userId = req.user.id;

        if (!participantIds || !Array.isArray(participantIds)) {
            return res.status(400).json({
                success: false,
                message: 'Participant IDs are required'
            });
        }

        // Validate participants exist and are active
        const participantsQuery = `
            SELECT id FROM users 
            WHERE id = ANY($1) AND is_active = true AND role IN ('admin', 'agent')
        `;
        const participantsResult = await db.query(participantsQuery, [participantIds]);
        
        if (participantsResult.rows.length !== participantIds.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more participants not found or inactive'
            });
        }

        // Check if direct conversation already exists
        if (conversationType === 'direct' && participantIds.length === 1) {
            const existingConvQuery = `
                SELECT c.id 
                FROM chat_conversations c
                JOIN chat_participants cp1 ON c.id = cp1.conversation_id
                JOIN chat_participants cp2 ON c.id = cp2.conversation_id
                WHERE c.conversation_type = 'direct'
                AND cp1.user_id = $1 AND cp2.user_id = $2
                AND cp1.is_active = true AND cp2.is_active = true
            `;
            const existingConv = await db.query(existingConvQuery, [userId, participantIds[0]]);
            
            if (existingConv.rows.length > 0) {
                return res.json({
                    success: true,
                    conversationId: existingConv.rows[0].id,
                    message: 'Existing conversation found'
                });
            }
        }

        // Create conversation
        const conversationQuery = `
            INSERT INTO chat_conversations (title, conversation_type, created_by)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        const conversationResult = await db.query(conversationQuery, [
            title || null,
            conversationType,
            userId
        ]);

        const conversation = conversationResult.rows[0];

        // Add participants (including creator)
        const allParticipants = [userId, ...participantIds];
        const participantValues = allParticipants.map(pid => 
            `('${conversation.id}', '${pid}')`
        ).join(',');

        await db.query(`
            INSERT INTO chat_participants (conversation_id, user_id)
            VALUES ${participantValues}
        `);

        res.json({
            success: true,
            conversation: conversation
        });
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create conversation'
        });
    }
};

// Search messages
const searchMessages = async (req, res) => {
    try {
        const { query, conversationId } = req.query;
        const userId = req.user.id;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        let searchQuery = `
             SELECT 
                cm.*,
                u.first_name,
                u.last_name,
                u.role,
                c.title as conversation_title,
                -- Whether the current user has read this message
                EXISTS(
                    SELECT 1 FROM chat_message_reads r 
                    WHERE r.message_id = cm.id AND r.user_id = $1
            ) AS is_read
            FROM chat_messages cm
            JOIN users u ON cm.sender_id = u.id
            JOIN chat_conversations c ON cm.conversation_id = c.id
            JOIN chat_participants cp ON c.id = cp.conversation_id
            WHERE cp.user_id = $1 
            AND cp.is_active = true
            AND cm.is_deleted = false
            AND to_tsvector('english', cm.message_text) @@ plainto_tsquery('english', $2)
        `;

        const queryParams = [userId, query];

        if (conversationId) {
            searchQuery += ' AND cm.conversation_id = $3';
            queryParams.push(conversationId);
        }

        searchQuery += ' ORDER BY cm.created_at DESC LIMIT 100';

        const result = await db.query(searchQuery, queryParams);

        res.json({
            success: true,
            results: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Search messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search messages'
        });
    }
};

// Mark messages as read
const markAsRead = async (req, res) => {
    try {
        const { messageIds } = req.body;
        const userId = req.user.id;

        if (!Array.isArray(messageIds)) {
            return res.status(400).json({
                success: false,
                message: 'Message IDs array is required'
            });
        }

        await db.query(`
            INSERT INTO chat_message_reads (message_id, user_id, read_at)
            SELECT unnest($1::uuid[]), $2, CURRENT_TIMESTAMP
            ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP
        `, [messageIds, userId]);

        res.json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark messages as read'
        });
    }
};

// Get available users for new conversation (admin and agents only)
const getAvailableUsers = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const usersQuery = `
            SELECT 
                id, 
                first_name, 
                last_name, 
                email, 
                role, 
                phone_number,
                is_active,
                profile_image
            FROM users 
            WHERE is_active = true 
            AND role IN ('admin', 'agent')
            AND id != $1
            ORDER BY first_name, last_name
        `;

        const result = await db.query(usersQuery, [userId]);

        res.json({
            success: true,
            data: result.rows  // Changed from 'users' to 'data' to match frontend expectation
        });
    } catch (error) {
        console.error('Get available users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available users'
        });
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