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
    const res = await api.get('/chat/conversations', {
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

  sendMessage: async (conversationId, messageText) => {
    const res = await api.post('/chat/messages/send', {
      conversationId,
      messageText,
    });
    return res.data?.data;
  },

  // ---------- OPTIONAL FEATURES ----------
  searchMessages: async (query, conversationId = null) => {
    const res = await api.get('/chat/messages/search', {
      params: { query, conversationId },
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
};

export default ChatService;
