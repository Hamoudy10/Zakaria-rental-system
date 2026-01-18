// backend/services/chatService.js
const db = require('../config/database');

class ChatService {
  constructor(io) {
    this.io = io;
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', async (socket) => {
      console.log('💬 User connected to chat:', socket.userId, socket.userName);

      try {
        // Join user to their personal room
        socket.join(`user_${socket.userId}`);
        console.log(`✅ User ${socket.userId} joined personal room: user_${socket.userId}`);

        // Auto-join user to all their active conversations
        const conversationsResult = await db.query(
          `
          SELECT DISTINCT c.id
          FROM chat_conversations c
          JOIN chat_participants cp ON c.id = cp.conversation_id
          WHERE cp.user_id = $1 AND cp.is_active = true
          `,
          [socket.userId]
        );

        conversationsResult.rows.forEach(row => {
          socket.join(`conversation_${row.id}`);
          console.log(`✅ User ${socket.userId} auto-joined conversation: ${row.id}`);
        });

        console.log(`📊 User ${socket.userId} joined ${conversationsResult.rows.length} conversation rooms`);

      } catch (error) {
        console.error('❌ Error auto-joining conversations:', error);
      }

      // Handle explicit join_conversation events
      socket.on('join_conversation', async (conversationId) => {
        try {
          console.log(`🔗 User ${socket.userId} joining conversation: ${conversationId}`);

          // Verify user is a participant
          const participantCheck = await db.query(
            `
            SELECT 1 FROM chat_participants
            WHERE conversation_id = $1 AND user_id = $2 AND is_active = true
            `,
            [conversationId, socket.userId]
          );

          if (participantCheck.rows.length === 0) {
            console.warn(`⚠️ User ${socket.userId} not a participant of conversation ${conversationId}`);
            return;
          }

          socket.join(`conversation_${conversationId}`);
          console.log(`✅ User ${socket.userId} joined conversation room: conversation_${conversationId}`);

        } catch (error) {
          console.error('❌ Error joining conversation:', error);
        }
      });

      // Handle leave_conversation events
      socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
        console.log(`👋 User ${socket.userId} left conversation: ${conversationId}`);
      });

      // Handle send_message events (optional - your REST API already handles this)
      socket.on('send_message', async ({ conversationId, messageText, parentMessageId }) => {
        try {
          console.log(`📤 Socket send_message from user ${socket.userId} to conversation ${conversationId}`);
          
          // This is redundant if you're using REST API
          // But keeping it for backward compatibility
          console.log('⚠️ Message should be sent via REST API, not socket');
          
        } catch (error) {
          console.error('❌ Socket send_message error:', error);
        }
      });

      // Handle typing indicators (optional feature)
      socket.on('typing_start', ({ conversationId }) => {
        socket.to(`conversation_${conversationId}`).emit('user_typing', {
          userId: socket.userId,
          userName: socket.userName,
          conversationId
        });
      });

      socket.on('typing_stop', ({ conversationId }) => {
        socket.to(`conversation_${conversationId}`).emit('user_stopped_typing', {
          userId: socket.userId,
          conversationId
        });
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`💬 User disconnected from chat: ${socket.userId}, reason: ${reason}`);
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`❌ Socket error for user ${socket.userId}:`, error);
      });
    });
  }

  // Helper method to broadcast a message to a conversation
  broadcastMessage(conversationId, message) {
    this.io.to(`conversation_${conversationId}`).emit('new_message', {
      message,
      conversationId
    });
    console.log(`📡 Broadcasted message ${message.id} to conversation ${conversationId}`);
  }

  // Helper method to notify a specific user
  notifyUser(userId, notification) {
    this.io.to(`user_${userId}`).emit('chat_notification', notification);
    console.log(`🔔 Sent notification to user ${userId}`);
  }

  // Helper method to get online users in a conversation
  async getOnlineUsers(conversationId) {
    const sockets = await this.io.in(`conversation_${conversationId}`).fetchSockets();
    return sockets.map(socket => socket.userId);
  }
}

module.exports = ChatService;