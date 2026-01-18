// backend/services/chatService.js
const db = require('../config/database');

class ChatService {
  constructor(io) {
    this.io = io;
    console.log('💬 ChatService initialized');
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', async (socket) => {
      const userId = socket.userId;
      const userName = socket.userName;

      console.log('========================================');
      console.log('💬 NEW CHAT CONNECTION');
      console.log(`User ID: ${userId}`);
      console.log(`User Name: ${userName}`);
      console.log(`Socket ID: ${socket.id}`);
      console.log('========================================');

      try {
        // 1. Join user to their personal room
        socket.join(`user_${userId}`);
        console.log(`✅ User ${userId} joined personal room: user_${userId}`);

        // 2. Auto-join user to ALL their active conversations
        const conversationsResult = await db.query(
          `
          SELECT DISTINCT c.id
          FROM chat_conversations c
          JOIN chat_participants cp ON c.id = cp.conversation_id
          WHERE cp.user_id = $1 AND cp.is_active = true
          `,
          [userId]
        );

        console.log(`📊 Found ${conversationsResult.rows.length} conversations for user ${userId}`);

        conversationsResult.rows.forEach(row => {
          socket.join(`conversation_${row.id}`);
          console.log(`✅ User ${userId} auto-joined conversation_${row.id}`);
        });

        // 3. Emit connection success to user
        socket.emit('chat_connected', {
          success: true,
          userId: userId,
          conversationCount: conversationsResult.rows.length
        });

        console.log(`🎉 User ${userId} successfully connected to ${conversationsResult.rows.length} conversations`);

      } catch (error) {
        console.error('❌ Error during socket connection setup:', error);
        socket.emit('chat_error', {
          message: 'Failed to initialize chat connection'
        });
      }

      // ==================== EVENT HANDLERS ====================

      // Handle explicit join_conversation
      socket.on('join_conversation', async (conversationId) => {
        try {
          console.log(`🔗 User ${userId} requesting to join conversation: ${conversationId}`);

          // Verify user is a participant
          const participantCheck = await db.query(
            `
            SELECT 1 FROM chat_participants
            WHERE conversation_id = $1 AND user_id = $2 AND is_active = true
            `,
            [conversationId, userId]
          );

          if (participantCheck.rows.length === 0) {
            console.warn(`⚠️ User ${userId} is NOT a participant of conversation ${conversationId}`);
            return;
          }

          socket.join(`conversation_${conversationId}`);
          console.log(`✅ User ${userId} joined conversation_${conversationId}`);

          // Confirm to client
          socket.emit('conversation_joined', {
            conversationId: conversationId
          });

        } catch (error) {
          console.error('❌ Error joining conversation:', error);
        }
      });

      // Handle leave_conversation
      socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
        console.log(`👋 User ${userId} left conversation_${conversationId}`);
      });

      // Handle typing indicators
      socket.on('typing_start', ({ conversationId }) => {
        socket.to(`conversation_${conversationId}`).emit('user_typing', {
          userId: userId,
          userName: userName,
          conversationId: conversationId
        });
        console.log(`⌨️ User ${userId} started typing in conversation ${conversationId}`);
      });

      socket.on('typing_stop', ({ conversationId }) => {
        socket.to(`conversation_${conversationId}`).emit('user_stopped_typing', {
          userId: userId,
          conversationId: conversationId
        });
        console.log(`⌨️ User ${userId} stopped typing in conversation ${conversationId}`);
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log('========================================');
        console.log('💬 CHAT DISCONNECTION');
        console.log(`User ID: ${userId}`);
        console.log(`Reason: ${reason}`);
        console.log('========================================');
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`❌ Socket error for user ${userId}:`, error);
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
    console.log(`📡 Broadcasted message ${message.id} to conversation_${conversationId}`);
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

  // Helper method to check if user is in room
  async isUserInRoom(userId, roomName) {
    const sockets = await this.io.in(roomName).fetchSockets();
    return sockets.some(socket => socket.userId === userId);
  }
}

module.exports = ChatService;