import api from './api';

const ChatService = {
  // Get available users for new conversations
  getAvailableUsers: async () => {
    try {
      const response = await api.get('/chat/available-users');
      console.log('✅ Available users response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to get available users:', error);
      // Fallback: try to get users from the users endpoint
      try {
        console.log('🔄 Trying fallback: fetching all users');
        const fallbackResponse = await api.get('/users');
        const filteredUsers = fallbackResponse.data.users.filter(user => 
          user.role === 'admin' || user.role === 'agent'
        );
        return {
          success: true,
          data: filteredUsers
        };
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
        return {
          success: false,
          data: [],
          message: 'Failed to load users'
        };
      }
    }
  },

  // Get conversations
  getConversations: async () => {
    try {
      const response = await api.get('/chat/conversations');
      return response.data;
    } catch (error) {
      console.error('❌ Failed to get conversations:', error);
      return {
        success: false,
        conversations: [],
        message: 'Failed to load conversations'
      };
    }
  },

  // Create conversation
  createConversation: async (participantIds, title, type = 'direct') => {
    try {
      const response = await api.post('/chat/conversations', {
        participantIds,
        title,
        conversationType: type
      });
      return response.data;
    } catch (error) {
      console.error('❌ Failed to create conversation:', error);
      throw error;
    }
  },

  // Get messages
  getMessages: async (conversationId, page = 1) => {
    try {
      const response = await api.get(`/chat/conversations/${conversationId}/messages?page=${page}`);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to get messages:', error);
      return {
        success: false,
        messages: [],
        message: 'Failed to load messages'
      };
    }
  },

  // Send message
  sendMessage: async (conversationId, messageText, parentMessageId = null) => {
    try {
      const response = await api.post('/chat/messages/send', {
        conversationId,
        messageText,
        parentMessageId
      });
      return response.data;
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      throw error;
    }
  },

  // Mark messages as read
  markAsRead: async (messageIds) => {
    try {
      const response = await api.post('/chat/messages/mark-read', {
        messageIds
      });
      return response.data;
    } catch (error) {
      console.error('❌ Failed to mark messages as read:', error);
      throw error;
    }
  },

  // Search messages
  searchMessages: async (query, conversationId = null) => {
    try {
      const params = { query };
      if (conversationId) params.conversationId = conversationId;
      
      const response = await api.get('/chat/search', { params });
      return response.data;
    } catch (error) {
      console.error('❌ Failed to search messages:', error);
      return {
        success: false,
        results: [],
        message: 'Failed to search messages'
      };
    }
  },

  // Typing indicators
  startTyping: async (conversationId) => {
    try {
      // This would typically be a WebSocket event
      console.log(`User started typing in conversation: ${conversationId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to start typing:', error);
      return { success: false };
    }
  },

  stopTyping: async (conversationId) => {
    try {
      // This would typically be a WebSocket event
      console.log(`User stopped typing in conversation: ${conversationId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to stop typing:', error);
      return { success: false };
    }
  },

  // Socket.io methods (placeholder)
  joinConversation: (conversationId) => {
    console.log(`Joining conversation: ${conversationId}`);
  },

  leaveConversation: (conversationId) => {
    console.log(`Leaving conversation: ${conversationId}`);
  }
};

export default ChatService;