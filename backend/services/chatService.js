const db = require('../config/database');

class ChatService {
    constructor(io) {
        this.io = io;
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('User connected to chat:', socket.userId);

            // Join user to their personal room
            if (socket.userId) {
                socket.join(`user_${socket.userId}`);
            }

            // Join conversation room
            socket.on('join_conversation', (conversationId) => {
                socket.join(`conversation_${conversationId}`);
                console.log(`User ${socket.userId} joined conversation ${conversationId}`);
            });

            // Leave conversation room
            socket.on('leave_conversation', (conversationId) => {
                socket.leave(`conversation_${conversationId}`);
            });

            // Send message
            socket.on('send_message', async (data) => {
                try {
                    const { conversationId, messageText, parentMessageId } = data;
                    
                    // Verify user is participant
                    const participantCheck = await db.query(
                        'SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND user_id = $2 AND is_active = true',
                        [conversationId, socket.userId]
                    );

                    if (participantCheck.rows.length === 0) {
                        socket.emit('error', { message: 'Access denied to this conversation' });
                        return;
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
                        socket.userId, 
                        messageText, 
                        parentMessageId || null
                    ]);

                    // Update conversation
                    await db.query(
                        'UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                        [conversationId]
                    );

                    const message = messageResult.rows[0];

                    // Get participants for notification
                    const participantsResult = await db.query(
                        'SELECT user_id FROM chat_participants WHERE conversation_id = $1 AND is_active = true',
                        [conversationId]
                    );

                    // Emit to conversation room
                    this.io.to(`conversation_${conversationId}`).emit('new_message', {
                        message: message,
                        conversationId: conversationId
                    });

                    // Send notifications to participants
                    participantsResult.rows.forEach(participant => {
                        if (participant.user_id !== socket.userId) {
                            this.io.to(`user_${participant.user_id}`).emit('chat_notification', {
                                type: 'new_message',
                                conversationId: conversationId,
                                message: message,
                                unreadCount: 1
                            });
                        }
                    });

                } catch (error) {
                    console.error('Socket send message error:', error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Typing indicator
            socket.on('typing_start', (data) => {
                const { conversationId } = data;
                socket.to(`conversation_${conversationId}`).emit('user_typing', {
                    userId: socket.userId,
                    userName: socket.userName,
                    conversationId: conversationId
                });
            });

            socket.on('typing_stop', (data) => {
                const { conversationId } = data;
                socket.to(`conversation_${conversationId}`).emit('user_stop_typing', {
                    userId: socket.userId,
                    conversationId: conversationId
                });
            });

            socket.on('disconnect', () => {
                console.log('User disconnected from chat:', socket.userId);
            });
        });
    }

    // Method to notify users about new chat features
    async notifyNewChatFeature(userId, feature) {
        this.io.to(`user_${userId}`).emit('chat_feature_notification', {
            type: 'feature_update',
            feature: feature,
            message: `New chat feature: ${feature}`
        });
    }
}

module.exports = ChatService;