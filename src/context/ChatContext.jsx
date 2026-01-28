// src/context/ChatContext.jsx
import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  useState
} from 'react';
import { useAuth } from './AuthContext';
import ChatService from '../services/ChatService';
import { io } from 'socket.io-client';

const ChatContext = createContext();

const initialState = {
  conversations: [],
  activeConversation: null,
  messages: {},
  loading: false,
  error: null,
  unreadCounts: {},
  socketConnected: false,
  onlineUsers: {},
  typingUsers: {},
};

const chatReducer = (state, action) => {
  switch (action.type) {
    case 'SET_CONVERSATIONS':
      const uniqueConvs = [];
      const seenIds = new Set();
      action.payload.forEach(conv => {
        if (conv && conv.id && !seenIds.has(conv.id)) {
          seenIds.add(conv.id);
          uniqueConvs.push(conv);
        }
      });
      return { ...state, conversations: uniqueConvs };
    
    case 'ADD_OR_UPDATE_CONVERSATION':
      const existingIndex = state.conversations.findIndex(c => c.id === action.payload.id);
      if (existingIndex >= 0) {
        const updatedConvs = [...state.conversations];
        updatedConvs[existingIndex] = { ...updatedConvs[existingIndex], ...action.payload };
        return { ...state, conversations: updatedConvs };
      } else {
        return { ...state, conversations: [action.payload, ...state.conversations] };
      }
    
    case 'SET_MESSAGES':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: action.payload.messages
        }
      };
    
    case 'ADD_MESSAGE':
      const { conversationId, message } = action.payload;
      const existingMessages = state.messages[conversationId] || [];
      const messageExists = existingMessages.some(m => m.id === message.id);
      if (messageExists) return state;
      
      return {
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: [...existingMessages, message]
        }
      };

    case 'UPDATE_MESSAGE_STATUS':
      const { messageId, status, conversationId: convId } = action.payload;
      const msgs = state.messages[convId] || [];
      const updatedMsgs = msgs.map(m => 
        m.id === messageId ? { ...m, status } : m
      );
      return {
        ...state,
        messages: {
          ...state.messages,
          [convId]: updatedMsgs
        }
      };

    case 'BULK_UPDATE_MESSAGE_STATUS':
      const { messageIds, status: newStatus, conversationId: cId } = action.payload;
      const currentMsgs = state.messages[cId] || [];
      const bulkUpdatedMsgs = currentMsgs.map(m => 
        messageIds.includes(m.id) ? { ...m, status: newStatus } : m
      );
      return {
        ...state,
        messages: {
          ...state.messages,
          [cId]: bulkUpdatedMsgs
        }
      };
    
    case 'SET_ACTIVE_CONVERSATION':
      return { ...state, activeConversation: action.payload };
    
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'SET_UNREAD_COUNTS':
      return { ...state, unreadCounts: action.payload };
    
    case 'SET_SOCKET_CONNECTED':
      return { ...state, socketConnected: action.payload };

    case 'SET_ONLINE_USERS':
      return { ...state, onlineUsers: action.payload };

    case 'SET_USER_ONLINE':
      return { 
        ...state, 
        onlineUsers: { 
          ...state.onlineUsers, 
          [action.payload.userId]: action.payload.isOnline 
        } 
      };

    case 'SET_TYPING_USER':
      const { oderId: tConvId, userId: typingUserId, isTyping, userName } = action.payload;
      const currentTyping = state.typingUsers[tConvId] || {};
      if (isTyping) {
        return {
          ...state,
          typingUsers: {
            ...state.typingUsers,
            [tConvId]: { ...currentTyping, [typingUserId]: userName }
          }
        };
      } else {
        const { [typingUserId]: removed, ...rest } = currentTyping;
        return {
          ...state,
          typingUsers: {
            ...state.typingUsers,
            [tConvId]: rest
          }
        };
      }
    
    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload]: []
        }
      };
    
    default:
      return state;
  }
};

export const ChatProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const [availableUsers, setAvailableUsers] = useState([]);

  const socketRef = useRef(null);
  const unreadCountsRef = useRef({});
  const convsRef = useRef([]);
  const messagesByConvRef = useRef({});
  const activeConvRef = useRef(null);
  const initializedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const processingMessagesRef = useRef(new Set());
  const socketSetupInProgressRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  // Show notification
  const showNotification = useCallback((message, conversation) => {
    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
      const senderName = message.first_name || 'Someone';
      const convName = conversation.title || conversation.display_name || 'Chat';
      
      const notification = new Notification(senderName, {
        body: message.message_text,
        icon: message.profile_image || '/favicon.ico',
        tag: `chat-${conversation.id}`
      });

      setTimeout(() => notification.close(), 5000);
      notification.onclick = () => window.focus();
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  // Load conversations
  const loadConversations = useCallback(async (force = false) => {
    if (!user) return;

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const convs = await ChatService.getRecentChats(50);

      const uniqueConvs = [];
      const seenIds = new Set();
      convs.forEach(conv => {
        if (conv && conv.id && !seenIds.has(conv.id)) {
          seenIds.add(conv.id);
          uniqueConvs.push(conv);
        }
      });
      
      dispatch({ type: 'SET_CONVERSATIONS', payload: uniqueConvs });
      convsRef.current = uniqueConvs;

      const unread = {};
      uniqueConvs.forEach(c => {
        unread[c.id] = c.unread_count || 0;
      });
      unreadCountsRef.current = unread;
      dispatch({ type: 'SET_UNREAD_COUNTS', payload: unread });
      
    } catch (err) {
      console.error('Error loading conversations:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [user]);

  // Create conversation
  const createConversation = useCallback(async (participantIds, title = null, type = 'direct') => {
    if (!user || !participantIds || participantIds.length === 0) {
      throw new Error('Cannot create conversation: No participants selected');
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const conversation = await ChatService.createConversation(participantIds, title, type);
      dispatch({ type: 'ADD_OR_UPDATE_CONVERSATION', payload: conversation });
      
      const existingIndex = convsRef.current.findIndex(c => c.id === conversation.id);
      if (existingIndex >= 0) {
        convsRef.current[existingIndex] = conversation;
      } else {
        convsRef.current.unshift(conversation);
      }
      
      if (socketRef.current?.connected) {
        socketRef.current.emit('join_conversation', conversation.id);
      }
      
      return conversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [user]);

  // Init after auth
  useEffect(() => {
    if (authLoading || !user || initializedRef.current) return;
    initializedRef.current = true;
    loadConversations();
    
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [authLoading, user, loadConversations]);

  // Load messages
  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId || state.loading) return;

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const msgs = await ChatService.getMessages(conversationId);
      
      const uniqueMsgs = [];
      const seenIds = new Set();
      msgs.forEach(msg => {
        if (msg && msg.id && !seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          uniqueMsgs.push(msg);
        }
      });
      
      dispatch({ type: 'SET_MESSAGES', payload: { conversationId, messages: uniqueMsgs } });
      messagesByConvRef.current[conversationId] = uniqueMsgs;

      unreadCountsRef.current[conversationId] = 0;
      dispatch({ type: 'SET_UNREAD_COUNTS', payload: { ...unreadCountsRef.current } });
      
      // Mark messages as read
      const unreadMessageIds = msgs
        .filter(msg => msg.sender_id !== user?.id && msg.status !== 'read')
        .map(msg => msg.id);
      
      if (unreadMessageIds.length > 0) {
        await ChatService.markAsRead(unreadMessageIds);
        
        // Emit read receipt via socket
        if (socketRef.current?.connected) {
          socketRef.current.emit('messages_read', {
            conversationId,
            messageIds: unreadMessageIds,
            readBy: user.id
          });
        }
      }
      
    } catch (err) {
      console.error('Error loading messages:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message });
      throw err;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.loading, user]);

  // Send message
  const sendMessage = useCallback(async (conversationId, messageText, imageUrl = null) => {
    if (!conversationId || (!messageText?.trim() && !imageUrl)) return;

    try {
      const message = await ChatService.sendMessage(conversationId, messageText?.trim() || '', imageUrl);

      dispatch({ type: 'ADD_MESSAGE', payload: { conversationId, message } });
      
      if (!messagesByConvRef.current[conversationId]) {
        messagesByConvRef.current[conversationId] = [];
      }
      
      const existsInRef = messagesByConvRef.current[conversationId].some(m => m.id === message.id);
      if (!existsInRef) {
        messagesByConvRef.current[conversationId].push(message);
      }

      // Update conversation list
      const existingConvIndex = convsRef.current.findIndex(c => c.id === conversationId);
      if (existingConvIndex >= 0) {
        const updatedConv = {
          ...convsRef.current[existingConvIndex],
          last_message: message.message_text || '📷 Image',
          last_message_at: message.created_at
        };
        
        convsRef.current.splice(existingConvIndex, 1);
        convsRef.current.unshift(updatedConv);
        
        const uniqueConvs = [];
        const seenIds = new Set();
        convsRef.current.forEach(conv => {
          if (conv && conv.id && !seenIds.has(conv.id)) {
            seenIds.add(conv.id);
            uniqueConvs.push(conv);
          }
        });
        
        convsRef.current = uniqueConvs;
        dispatch({ type: 'SET_CONVERSATIONS', payload: uniqueConvs });
      }

      return message;
    } catch (error) {
      console.error('Error sending message:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
      throw error;
    }
  }, []);

  // Set active conversation
  const setActiveConversation = useCallback((conv) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conv });

    if (conv) {
      activeConvRef.current = conv;
      processingMessagesRef.current.clear();
      
      if (socketRef.current?.connected) {
        socketRef.current.emit('join_conversation', conv.id);
      }
    } else {
      activeConvRef.current = null;
    }
  }, []);

  // Load available users
  const loadAvailableUsers = useCallback(async () => {
    if (!user) return [];
    const users = await ChatService.getAvailableUsers();
    setAvailableUsers(users);
    return users;
  }, [user]);

  // Typing indicator
  const sendTypingStart = useCallback((conversationId) => {
    if (!socketRef.current?.connected || !conversationId) return;
    
    socketRef.current.emit('typing_start', { conversationId });
    
    // Auto-stop typing after 3 seconds
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStop(conversationId);
    }, 3000);
  }, []);

  const sendTypingStop = useCallback((conversationId) => {
    if (!socketRef.current?.connected || !conversationId) return;
    
    socketRef.current.emit('typing_stop', { conversationId });
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  // Get typing users for a conversation
  const getTypingUsers = useCallback((conversationId) => {
    const typing = state.typingUsers[conversationId] || {};
    return Object.values(typing).filter(Boolean);
  }, [state.typingUsers]);

  // Check if user is online
  const isUserOnline = useCallback((userId) => {
    return state.onlineUsers[userId] === true;
  }, [state.onlineUsers]);

  // Socket setup
  const setupSocket = useCallback(() => {
    if (socketSetupInProgressRef.current || !user) return;
    if (socketRef.current?.connected) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    socketSetupInProgressRef.current = true;
    
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🟢 Chat socket connected');
      dispatch({ type: 'SET_SOCKET_CONNECTED', payload: true });
      reconnectAttemptsRef.current = 0;
      socketSetupInProgressRef.current = false;
      
      // Update online status
      socket.emit('user_online');
      
      if (activeConvRef.current?.id) {
        socket.emit('join_conversation', activeConvRef.current.id);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('🔴 Chat socket disconnected:', reason);
      dispatch({ type: 'SET_SOCKET_CONNECTED', payload: false });
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      reconnectAttemptsRef.current += 1;
      
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        socketSetupInProgressRef.current = false;
        socket.disconnect();
      }
    });

    // New message
    socket.on('new_message', ({ message, conversationId }) => {
      if (processingMessagesRef.current.has(message.id)) return;
      processingMessagesRef.current.add(message.id);
      
      const conversation = convsRef.current.find(c => c.id === conversationId);
      
      // Show notification if not active conversation
      if (activeConvRef.current?.id !== conversationId && conversation && message.sender_id !== user.id) {
        showNotification(message, conversation);
      }
      
      const currentMessages = messagesByConvRef.current[conversationId] || [];
      const messageExists = currentMessages.some(m => m.id === message.id);
      
      if (!messageExists) {
        if (activeConvRef.current?.id === conversationId) {
          dispatch({ type: 'ADD_MESSAGE', payload: { conversationId, message } });
          
          if (!messagesByConvRef.current[conversationId]) {
            messagesByConvRef.current[conversationId] = [];
          }
          messagesByConvRef.current[conversationId].push(message);

          // Mark as read immediately if we're viewing this conversation
          if (message.sender_id !== user.id) {
            ChatService.markAsRead([message.id]);
            socket.emit('messages_read', {
              conversationId,
              messageIds: [message.id],
              readBy: user.id
            });
          }
        } else if (message.sender_id !== user.id) {
          unreadCountsRef.current[conversationId] = 
            (unreadCountsRef.current[conversationId] || 0) + 1;
          dispatch({ type: 'SET_UNREAD_COUNTS', payload: { ...unreadCountsRef.current } });
        }
      }

      // Update conversation list
      const existingConvIndex = convsRef.current.findIndex(c => c.id === conversationId);
      if (existingConvIndex >= 0) {
        const updatedConv = {
          ...convsRef.current[existingConvIndex],
          last_message: message.message_text || '📷 Image',
          last_message_at: message.created_at
        };
        
        convsRef.current.splice(existingConvIndex, 1);
        convsRef.current.unshift(updatedConv);
        
        const uniqueConvs = [];
        const seenIds = new Set();
        convsRef.current.forEach(conv => {
          if (conv && conv.id && !seenIds.has(conv.id)) {
            seenIds.add(conv.id);
            uniqueConvs.push(conv);
          }
        });
        
        convsRef.current = uniqueConvs;
        dispatch({ type: 'SET_CONVERSATIONS', payload: uniqueConvs });
      }
      
      processingMessagesRef.current.delete(message.id);
    });

    // Message status updates
    socket.on('message_delivered', ({ messageId, conversationId }) => {
      dispatch({ 
        type: 'UPDATE_MESSAGE_STATUS', 
        payload: { messageId, status: 'delivered', conversationId } 
      });
    });

    socket.on('messages_read_receipt', ({ messageIds, conversationId, readBy }) => {
      if (readBy !== user.id) {
        dispatch({ 
          type: 'BULK_UPDATE_MESSAGE_STATUS', 
          payload: { messageIds, status: 'read', conversationId } 
        });
      }
    });

    // Online status
    socket.on('user_online_status', ({ userId, isOnline, lastSeen }) => {
      dispatch({ 
        type: 'SET_USER_ONLINE', 
        payload: { userId, isOnline } 
      });
    });

    socket.on('online_users_list', (users) => {
      const onlineMap = {};
      users.forEach(u => {
        onlineMap[u.id] = true;
      });
      dispatch({ type: 'SET_ONLINE_USERS', payload: onlineMap });
    });

    // Typing indicators
    socket.on('user_typing', ({ userId, userName, conversationId }) => {
      if (userId !== user.id) {
        dispatch({ 
          type: 'SET_TYPING_USER', 
          payload: { oderId: conversationId, userId, isTyping: true, userName } 
        });
      }
    });

    socket.on('user_stopped_typing', ({ userId, conversationId }) => {
      dispatch({ 
        type: 'SET_TYPING_USER', 
        payload: { oderId: conversationId, userId, isTyping: false } 
      });
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return () => {
      socket.removeAllListeners();
    };
  }, [user, showNotification]);

  // Socket lifecycle
  useEffect(() => {
    if (!user) return;
    setupSocket();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.emit('user_offline');
        socketRef.current.disconnect();
        socketRef.current = null;
        socketSetupInProgressRef.current = false;
      }
    };
  }, [user, setupSocket]);

  // Sync refs
  useEffect(() => {
    unreadCountsRef.current = state.unreadCounts;
    convsRef.current = state.conversations;
    activeConvRef.current = state.activeConversation;
    
    Object.keys(state.messages).forEach(convId => {
      messagesByConvRef.current[convId] = state.messages[convId] || [];
    });
  }, [state]);

  // Clear conversation messages
  const clearConversationMessages = useCallback((conversationId) => {
    dispatch({ type: 'CLEAR_MESSAGES', payload: conversationId });
    delete messagesByConvRef.current[conversationId];
  }, []);

  // Helpers
  const getUnreadCount = (id) => state.unreadCounts[id] || 0;
  const getTotalUnreadCount = () =>
    Object.values(state.unreadCounts).reduce((a, b) => a + b, 0);
  
  const getMessagesForConversation = useCallback((conversationId) => {
    return state.messages[conversationId] || [];
  }, [state.messages]);

  // Upload image
  const uploadImage = useCallback(async (file) => {
    try {
      const imageUrl = await ChatService.uploadChatImage(file);
      return imageUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }, []);

  return (
    <ChatContext.Provider value={{
      conversations: state.conversations,
      activeConversation: state.activeConversation,
      messages: state.messages,
      getMessagesForConversation,
      loading: state.loading,
      error: state.error,
      socketConnected: state.socketConnected,
      availableUsers,
      onlineUsers: state.onlineUsers,
      typingUsers: state.typingUsers,
      loadAvailableUsers,
      loadConversations,
      createConversation,
      loadMessages,
      sendMessage,
      setActiveConversation,
      clearConversationMessages,
      getUnreadCount,
      getTotalUnreadCount,
      sendTypingStart,
      sendTypingStop,
      getTypingUsers,
      isUserOnline,
      uploadImage,
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
};