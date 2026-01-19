// src/services/ChatService.js
import api from './api';

const ChatService = {
  // ---------- USERS ----------
  getAvailableUsers: async () => {
    const res = await api.get('/chat/available-users');
    return res.data?.data || [];
  },

  // ---------- CONVERSATIONS ----------
  getConversations: async () => {
    const res = await api.get('/chat/conversations');
    return res.data?.data || [];
  },

  // ✅ FIXED: Correct endpoint for recent chats
  getRecentChats: async (limit = 50, offset = 0) => {
    const res = await api.get('/chat/recent-chats', {
      params: { limit, offset },
    });
    return res.data?.data || [];
  },

  createConversation: async (participantIds, title = null, type = 'direct') => {
    const res = await api.post('/chat/conversations', {
      participantIds,
      title,
      conversationType: type,
    });
    return res.data?.data;
  },

  // ---------- MESSAGES ----------
  // ✅ FIXED: Correct endpoint for getting messages
  getMessages: async (conversationId, page = 1) => {
    const res = await api.get(`/chat/conversations/${conversationId}/messages`, {
      params: { page },
    });
    return res.data?.data || [];
  },

  sendMessage: async (conversationId, messageText) => {
    const res = await api.post('/chat/messages/send', {
      conversationId,
      messageText,
    });
    return res.data?.data;
  },

  // ---------- OPTIONAL FEATURES ----------
  searchMessages: async (query, conversationId = null) => {
    const res = await api.get('/chat/search', {
      params: { q: query, conversationId },
    });
    return res.data?.data || [];
  },

  markAsRead: async (messageIds) => {
    await api.post('/chat/messages/mark-read', { messageIds });
  },

  startTyping: async (conversationId) => {
    await api.post(`/chat/conversations/${conversationId}/typing/start`);
  },

  stopTyping: async (conversationId) => {
    await api.post(`/chat/conversations/${conversationId}/typing/stop`);
  },

  getUnreadCount: async () => {
    const res = await api.get('/chat/unread-count');
    return res.data?.data || 0;
  },
};

// ✅ FIX: Add default export
export default ChatService;