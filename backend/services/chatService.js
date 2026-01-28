// backend/services/chatService.js
const db = require('../config/database');
const chatController = require('../controllers/chatController');

class ChatService {
  constructor(io) {
    this.io = io;
    console.log('💬 ChatService initialized');
    
    // Pass io instance to controller
    chatController.setIOInstance(io);
    
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', async (socket) => {
      const userId = socket.userId;
      const userName = socket.userName;

      console.log(`💬 Chat connection: User ${userName} (${userId}) - Socket ${socket.id}`);

      try {
        // Check if columns exist
        let hasOnline = true;
        try { await db.query("SELECT is_online FROM users LIMIT 1"); } catch(e) { hasOnline = false; }

        // 1. Update user online status if column exists
        if (hasOnline) {
            await db.query(
            `UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1`,
            [userId]
            );
        }

        // 2. Join user to their personal room
        socket.join(`user_${userId}`);

        // 3. Auto-join user to ALL their active conversations
        const conversationsResult = await db.query(
          `
          SELECT DISTINCT c.id
          FROM chat_conversations c
          JOIN chat_participants cp ON c.id = cp.conversation_id
          WHERE cp.user_id = $1 AND cp.is_active = true
          `,
          [userId]
        );

        conversationsResult.rows.forEach(row => {
          socket.join(`conversation_${row.id}`);
        });

        // 4. Broadcast online status to all users
        this.io.emit('user_online_status', {
          userId: userId,
          isOnline: true,
          lastSeen: null
        });

        // 5. Send list of online users to the connecting user
        if (hasOnline) {
            const onlineUsersResult = await db.query(
            `SELECT id, first_name, last_name, profile_image FROM users WHERE is_online = true AND is_active = true`
            );
            socket.emit('online_users_list', onlineUsersResult.rows);
        } else {
            socket.emit('online_users_list', []);
        }

        // 6. Emit connection success
        socket.emit('chat_connected', {
          success: true,
          userId: userId,
          conversationCount: conversationsResult.rows.length
        });

        console.log(`✅ User ${userId} connected to ${conversationsResult.rows.length} conversations`);

      } catch (error) {
        console.error('Error during socket connection setup:', error);
        socket.emit('chat_error', {
          message: 'Failed to initialize chat connection'
        });
      }

      // ==================== EVENT HANDLERS ====================

      // Handle user coming online (explicit)
      socket.on('user_online', async () => {
        try {
          let hasOnline = true;
          try { await db.query("SELECT is_online FROM users LIMIT 1"); } catch(e) { hasOnline = false; }
          
          if (hasOnline) {
            await db.query(
                `UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1`,
                [userId]
            );

            this.io.emit('user_online_status', {
                userId: userId,
                isOnline: true,
                lastSeen: null
            });
          }
        } catch (error) {
          console.error('Error updating online status:', error);
        }
      });

      // Handle user going offline (explicit)
      socket.on('user_offline', async () => {
        try {
          let hasOnline = true;
          try { await db.query("SELECT is_online FROM users LIMIT 1"); } catch(e) { hasOnline = false; }
          
          if (hasOnline) {
            await db.query(
                `UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1`,
                [userId]
            );

            this.io.emit('user_online_status', {
                userId: userId,
                isOnline: false,
                lastSeen: new Date()
            });
          }
        } catch (error) {
          console.error('Error updating offline status:', error);
        }
      });

      // Handle explicit join_conversation
      socket.on('join_conversation', async (conversationId) => {
        try {
          // Verify user is a participant
          const participantCheck = await db.query(
            `SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND user_id = $2 AND is_active = true`,
            [conversationId, userId]
          );

          if (participantCheck.rows.length === 0) {
            console.warn(`User ${userId} is NOT a participant of conversation ${conversationId}`);
            return;
          }

          socket.join(`conversation_${conversationId}`);
          
          socket.emit('conversation_joined', {
            conversationId: conversationId
          });

          // Check if status column exists
          let hasStatus = true;
          try { await db.query("SELECT status FROM chat_messages LIMIT 1"); } catch(e) { hasStatus = false; }

          if (hasStatus) {
            // Mark unread messages as delivered
            const unreadMessages = await db.query(
                `
                SELECT id, sender_id FROM chat_messages 
                WHERE conversation_id = $1 AND sender_id != $2 AND status = 'sent'
                `,
                [conversationId, userId]
            );

            if (unreadMessages.rows.length > 0) {
                const messageIds = unreadMessages.rows.map(m => m.id);
                
                await db.query(
                `UPDATE chat_messages SET status = 'delivered', delivered_at = NOW() WHERE id = ANY($1::uuid[])`,
                [messageIds]
                );

                // Notify senders
                const senderIds = [...new Set(unreadMessages.rows.map(m => m.sender_id))];
                senderIds.forEach(senderId => {
                this.io.to(`user_${senderId}`).emit('message_delivered', {
                    messageIds: messageIds.filter(id => 
                    unreadMessages.rows.find(m => m.id === id && m.sender_id === senderId)
                    ),
                    conversationId: conversationId
                });
                });
            }
          }

        } catch (error) {
          console.error('Error joining conversation:', error);
        }
      });

      // Handle leave_conversation
      socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
      });

      // Handle messages read
      socket.on('messages_read', async ({ conversationId, messageIds, readBy }) => {
        try {
          if (!messageIds || messageIds.length === 0) return;

          let hasStatus = true;
          try { await db.query("SELECT status FROM chat_messages LIMIT 1"); } catch(e) { hasStatus = false; }

          if (hasStatus) {
            // Update status in database
            const updateResult = await db.query(
                `
                UPDATE chat_messages 
                SET status = 'read', read_at = NOW()
                WHERE id = ANY($1::uuid[]) AND status != 'read'
                RETURNING id, sender_id
                `,
                [messageIds]
            );

            // Insert read receipts
            await db.query(
                `
                INSERT INTO chat_message_reads (message_id, user_id)
                SELECT unnest($1::uuid[]), $2
                ON CONFLICT DO NOTHING
                `,
                [messageIds, readBy]
            );

            // Notify senders
            if (updateResult.rows.length > 0) {
                const senderIds = [...new Set(updateResult.rows.map(m => m.sender_id))];
                
                senderIds.forEach(senderId => {
                if (senderId !== readBy) {
                    this.io.to(`user_${senderId}`).emit('messages_read_receipt', {
                    messageIds: updateResult.rows
                        .filter(m => m.sender_id === senderId)
                        .map(m => m.id),
                    conversationId: conversationId,
                    readBy: readBy
                    });
                }
                });

                // Also broadcast to conversation room
                socket.to(`conversation_${conversationId}`).emit('messages_read_receipt', {
                messageIds: messageIds,
                conversationId: conversationId,
                readBy: readBy
                });
            }
          }

        } catch (error) {
          console.error('Error handling messages_read:', error);
        }
      });

      // Handle typing indicators
      socket.on('typing_start', async ({ conversationId }) => {
        try {
          // Get user name
          const userResult = await db.query(
            `SELECT first_name FROM users WHERE id = $1`,
            [userId]
          );
          const firstName = userResult.rows[0]?.first_name || 'Someone';

          socket.to(`conversation_${conversationId}`).emit('user_typing', {
            userId: userId,
            userName: firstName,
            conversationId: conversationId
          });
        } catch (error) {
          console.error('Error in typing_start:', error);
        }
      });

      socket.on('typing_stop', ({ conversationId }) => {
        socket.to(`conversation_${conversationId}`).emit('user_stopped_typing', {
          userId: userId,
          conversationId: conversationId
        });
      });

      // Handle disconnect
      socket.on('disconnect', async (reason) => {
        console.log(`💬 Chat disconnection: User ${userId} - Reason: ${reason}`);

        try {
          // Check if user has other active sockets
          const userRoom = `user_${userId}`;
          const socketsInRoom = await this.io.in(userRoom).fetchSockets();

          // Only mark offline if no other sockets
          if (socketsInRoom.length === 0) {
            let hasOnline = true;
            try { await db.query("SELECT is_online FROM users LIMIT 1"); } catch(e) { hasOnline = false; }
            
            if (hasOnline) {
                await db.query(
                `UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1`,
                [userId]
                );

                // Broadcast offline status
                this.io.emit('user_online_status', {
                userId: userId,
                isOnline: false,
                lastSeen: new Date()
                });
            }
          }
        } catch (error) {
          console.error('Error handling disconnect:', error);
        }
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`Socket error for user ${userId}:`, error);
      });
    });

    console.log('✅ Socket handlers setup complete');
  }

  // Helper method to broadcast a message to a conversation
  broadcastMessage(conversationId, message) {
    this.io.to(`conversation_${conversationId}`).emit('new_message', {
      message,
      conversationId
    });
  }

  // Helper method to notify a specific user
  notifyUser(userId, notification) {
    this.io.to(`user_${userId}`).emit('chat_notification', notification);
  }

  // Helper method to get online users in a conversation
  async getOnlineUsers(conversationId) {
    const sockets = await this.io.in(`conversation_${conversationId}`).fetchSockets();
    return sockets.map(socket => socket.userId);
  }

  // Helper method to check if user is in room
  async isUserInRoom(userId, roomName) {
    const sockets = await this.io.in(roomName).fetchSockets();
    return sockets.some(socket => socket.userId === userId);
  }

  // Broadcast online status change
  async broadcastOnlineStatus(userId, isOnline) {
    this.io.emit('user_online_status', {
      userId,
      isOnline,
      lastSeen: isOnline ? null : new Date()
    });
  }
}

module.exports = ChatService;