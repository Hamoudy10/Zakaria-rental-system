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
  getMessages: async (conversationId, page = 1) => {
    const res = await api.get(`/chat/conversations/${conversationId}/messages`, {
      params: { page },
    });
    return res.data?.data || [];
  },

  sendMessage: async (conversationId, messageText, imageUrl = null) => {
    const res = await api.post('/chat/messages/send', {
      conversationId,
      messageText,
      imageUrl,
    });
    return res.data?.data;
  },

  // ---------- READ RECEIPTS ----------
  markAsRead: async (messageIds) => {
    await api.post('/chat/messages/mark-read', { messageIds });
  },

  markAsDelivered: async (messageIds) => {
    await api.post('/chat/messages/mark-delivered', { messageIds });
  },

  // ---------- TYPING INDICATORS ----------
  startTyping: async (conversationId) => {
    await api.post(`/chat/conversations/${conversationId}/typing/start`);
  },

  stopTyping: async (conversationId) => {
    await api.post(`/chat/conversations/${conversationId}/typing/stop`);
  },

  // ---------- ONLINE STATUS ----------
  updateOnlineStatus: async (isOnline) => {
    await api.post('/chat/status/online', { isOnline });
  },

  getOnlineUsers: async () => {
    const res = await api.get('/chat/status/online-users');
    return res.data?.data || [];
  },

  // ---------- SEARCH ----------
  searchMessages: async (query, conversationId = null) => {
    const res = await api.get('/chat/search', {
      params: { q: query, conversationId },
    });
    return res.data?.data || [];
  },

  getUnreadCount: async () => {
    const res = await api.get('/chat/unread-count');
    return res.data?.data || 0;
  },

  // ---------- IMAGE UPLOAD ----------
  uploadChatImage: async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await api.post('/chat/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data?.url;
  },
};

export default ChatService;