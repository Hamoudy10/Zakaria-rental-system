// src/services/ChatService.js
import api from './api';

const ChatService = {
  // ---------- USERS ----------
  getAvailableUsers: async () => {
    try {
      console.log('📡 ChatService: Fetching available users...');
      const res = await api.get('/chat/available-users');
      console.log('📡 ChatService: Available users response:', res.data);
      return res.data?.data || [];
    } catch (error) {
      console.error('❌ ChatService: Failed to fetch available users:', error);
      throw error;
    }
  },

  // ---------- CONVERSATIONS ----------
  getConversations: async () => {
    try {
      console.log('📡 ChatService: Fetching conversations...');
      const res = await api.get('/chat/conversations');
      console.log('📡 ChatService: Conversations response:', res.data);
      return res.data?.data || [];
    } catch (error) {
      console.error('❌ ChatService: Failed to fetch conversations:', error);
      throw error;
    }
  },

  getRecentChats: async () => {
    try {
      console.log('📡 ChatService: Fetching recent chats...');
      const res = await api.get('/chat/recent-chats');
      console.log('📡 ChatService: Recent chats response:', res.data);
      return res.data?.data || [];
    } catch (error) {
      console.error('❌ ChatService: Failed to fetch recent chats:', error);
      throw error;
    }
  },

  createConversation: async (participantIds, title = null, type = 'direct') => {
    try {
      console.log('📡 ChatService: Creating conversation...', { participantIds, title, type });
      const res = await api.post('/chat/conversations', {
        participantIds,
        title,
        conversationType: type,
      });
      console.log('📡 ChatService: Create conversation response:', res.data);
      return res.data?.data;
    } catch (error) {
      console.error('❌ ChatService: Failed to create conversation:', error);
      throw error;
    }
  },

  // ---------- MESSAGES ----------
  // NO LIMIT - fetches ALL messages
  getMessages: async (conversationId) => {
    try {
      console.log('📡 ChatService: Fetching ALL messages for conversation:', conversationId);
      const res = await api.get(`/chat/conversations/${conversationId}/messages`);
      console.log('📡 ChatService: Messages response - count:', res.data?.data?.length || 0);
      return res.data?.data || [];
    } catch (error) {
      console.error('❌ ChatService: Failed to fetch messages:', error);
      throw error;
    }
  },

  sendMessage: async (conversationId, messageText, imageUrl = null) => {
    try {
      console.log('📡 ChatService: Sending message...', { conversationId, messageText, imageUrl });
      const res = await api.post('/chat/messages/send', {
        conversationId,
        messageText,
        imageUrl,
      });
      console.log('📡 ChatService: Send message response:', res.data);
      return res.data?.data;
    } catch (error) {
      console.error('❌ ChatService: Failed to send message:', error);
      throw error;
    }
  },

  // ---------- READ RECEIPTS ----------
  markAsRead: async (messageIds) => {
    try {
      console.log('📡 ChatService: Marking messages as read:', messageIds.length);
      await api.post('/chat/messages/mark-read', { messageIds });
    } catch (error) {
      console.error('❌ ChatService: Failed to mark as read:', error);
      throw error;
    }
  },

  markAsDelivered: async (messageIds) => {
    try {
      console.log('📡 ChatService: Marking messages as delivered:', messageIds.length);
      await api.post('/chat/messages/mark-delivered', { messageIds });
    } catch (error) {
      console.error('❌ ChatService: Failed to mark as delivered:', error);
      throw error;
    }
  },

  // ---------- TYPING INDICATORS ----------
  startTyping: async (conversationId) => {
    try {
      await api.post(`/chat/conversations/${conversationId}/typing/start`);
    } catch (error) {
      console.error('❌ ChatService: Failed to start typing:', error);
    }
  },

  stopTyping: async (conversationId) => {
    try {
      await api.post(`/chat/conversations/${conversationId}/typing/stop`);
    } catch (error) {
      console.error('❌ ChatService: Failed to stop typing:', error);
    }
  },

  // ---------- ONLINE STATUS ----------
  updateOnlineStatus: async (isOnline) => {
    try {
      await api.post('/chat/status/online', { isOnline });
    } catch (error) {
      console.error('❌ ChatService: Failed to update online status:', error);
    }
  },

  getOnlineUsers: async () => {
    try {
      const res = await api.get('/chat/status/online-users');
      return res.data?.data || [];
    } catch (error) {
      console.error('❌ ChatService: Failed to get online users:', error);
      return [];
    }
  },

  // ---------- SEARCH ----------
  searchMessages: async (query, conversationId = null) => {
    try {
      const res = await api.get('/chat/search', {
        params: { q: query, conversationId },
      });
      return res.data?.data || [];
    } catch (error) {
      console.error('❌ ChatService: Search failed:', error);
      throw error;
    }
  },

  getUnreadCount: async () => {
    try {
      const res = await api.get('/chat/unread-count');
      return res.data?.data || 0;
    } catch (error) {
      console.error('❌ ChatService: Failed to get unread count:', error);
      return 0;
    }
  },

  // ---------- IMAGE UPLOAD ----------
  uploadChatImage: async (file) => {
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post('/chat/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.data?.url;
    } catch (error) {
      console.error('❌ ChatService: Failed to upload image:', error);
      throw error;
    }
  },
};

export default ChatService;