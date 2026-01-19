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
};

const chatReducer = (state, action) => {
  switch (action.type) {
    case 'SET_CONVERSATIONS':
      // Remove duplicates by ID
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
      // Add or update a single conversation
      const existingIndex = state.conversations.findIndex(c => c.id === action.payload.id);
      if (existingIndex >= 0) {
        // Update existing
        const updatedConvs = [...state.conversations];
        updatedConvs[existingIndex] = { ...updatedConvs[existingIndex], ...action.payload };
        return { ...state, conversations: updatedConvs };
      } else {
        // Add new
        return { ...state, conversations: [action.payload, ...state.conversations] };
      }
    
    case 'SET_MESSAGES':
      // Store messages by conversation ID to prevent mixing
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
      
      // Check if message already exists
      const messageExists = existingMessages.some(m => m.id === message.id);
      if (messageExists) {
        console.log('⏭️ Message already exists, skipping:', message.id);
        return state;
      }
      
      return {
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: [...existingMessages, message]
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

  /* -------------------- SHOW NOTIFICATION -------------------- */
  const showNotification = useCallback((message, conversation) => {
    if (!("Notification" in window)) {
      console.log("This browser does not support desktop notifications");
      return;
    }

    if (Notification.permission === "granted") {
      const notification = new Notification(
        `New message in ${conversation.title || 'Conversation'}`, 
        {
          body: `${message.first_name || 'Someone'}: ${message.message_text}`,
          icon: '/favicon.ico',
          tag: `chat-${conversation.id}`
        }
      );

      setTimeout(() => notification.close(), 5000);
      
      notification.onclick = function() {
        window.focus();
        console.log('Notification clicked, conversation:', conversation.id);
      };
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          showNotification(message, conversation);
        }
      });
    }
  }, []);

  /* -------------------- LOAD CONVERSATIONS -------------------- */
  const loadConversations = useCallback(async (force = false) => {
    if (!user) return;

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      console.log('🔄 Loading conversations...', force ? '(forced)' : '');
      
      const convs = await ChatService.getRecentChats(50);
      console.log('📨 Received conversations:', convs.length, 'items');

      const uniqueConvs = [];
      const seenIds = new Set();
      
      convs.forEach(conv => {
        if (conv && conv.id && !seenIds.has(conv.id)) {
          seenIds.add(conv.id);
          uniqueConvs.push(conv);
        }
      });

      console.log('✅ Filtered conversations:', uniqueConvs.length, 'unique items');
      
      dispatch({ type: 'SET_CONVERSATIONS', payload: uniqueConvs });
      convsRef.current = uniqueConvs;

      const unread = {};
      uniqueConvs.forEach(c => {
        unread[c.id] = c.unread_count || 0;
      });
      unreadCountsRef.current = unread;
      dispatch({ type: 'SET_UNREAD_COUNTS', payload: unread });
      
    } catch (err) {
      console.error('❌ Error loading conversations:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [user]);

  /* -------------------- CREATE CONVERSATION -------------------- */
  const createConversation = useCallback(async (participantIds, title = null, type = 'direct') => {
    if (!user || !participantIds || participantIds.length === 0) {
      throw new Error('Cannot create conversation: No participants selected');
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      console.log('🔄 Creating conversation with participants:', participantIds);
      
      const conversation = await ChatService.createConversation(
        participantIds,
        title,
        type
      );
      
      console.log('✅ Conversation created:', conversation.id);
      
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
      console.error('❌ Error creating conversation:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [user]);

  /* -------------------- INIT AFTER AUTH -------------------- */
  useEffect(() => {
    if (authLoading || !user || initializedRef.current) return;
    
    initializedRef.current = true;
    console.log('🚀 Initializing chat for user:', user.id);
    loadConversations();
  }, [authLoading, user, loadConversations]);

  /* -------------------- LOAD MESSAGES -------------------- */
  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId || state.loading) {
      console.log('⏭️ Skipping load - already loading or no conversation ID');
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      console.log('🔄 Loading messages for conversation:', conversationId);
      
      const msgs = await ChatService.getMessages(conversationId);
      console.log('✅ Loaded', msgs.length, 'messages from server');
      
      if (msgs.length > 0) {
        const uniqueMsgs = [];
        const seenIds = new Set();
        
        msgs.forEach(msg => {
          if (msg && msg.id && !seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            uniqueMsgs.push(msg);
          }
        });
        
        dispatch({ 
          type: 'SET_MESSAGES', 
          payload: { 
            conversationId, 
            messages: uniqueMsgs 
          } 
        });
        
        messagesByConvRef.current[conversationId] = uniqueMsgs;
        console.log('✅ Stored', uniqueMsgs.length, 'unique messages for conversation:', conversationId);
      } else {
        dispatch({ 
          type: 'SET_MESSAGES', 
          payload: { 
            conversationId, 
            messages: [] 
          } 
        });
        messagesByConvRef.current[conversationId] = [];
        console.log('📭 No messages for conversation:', conversationId);
      }

      unreadCountsRef.current[conversationId] = 0;
      dispatch({
        type: 'SET_UNREAD_COUNTS',
        payload: { ...unreadCountsRef.current }
      });
      
      try {
        const messageIds = msgs.map(msg => msg.id).filter(id => id);
        if (messageIds.length > 0) {
          await ChatService.markAsRead(messageIds);
        }
      } catch (readError) {
        console.error('⚠️ Failed to mark messages as read:', readError);
      }
      
    } catch (err) {
      console.error('❌ Error loading messages:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message });
      throw err;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.loading]);

  /* -------------------- SEND MESSAGE -------------------- */
  const sendMessage = useCallback(async (conversationId, messageText) => {
    if (!conversationId || !messageText?.trim()) return;

    try {
      console.log('📤 Sending message to conversation:', conversationId);
      const message = await ChatService.sendMessage(
        conversationId,
        messageText.trim()
      );

      console.log('✅ Message sent, ID:', message.id);

      dispatch({ 
        type: 'ADD_MESSAGE', 
        payload: { conversationId, message } 
      });
      
      if (!messagesByConvRef.current[conversationId]) {
        messagesByConvRef.current[conversationId] = [];
      }
      
      const existsInRef = messagesByConvRef.current[conversationId].some(m => m.id === message.id);
      if (!existsInRef) {
        messagesByConvRef.current[conversationId].push(message);
      }

      const existingConvIndex = convsRef.current.findIndex(c => c.id === conversationId);
      
      if (existingConvIndex >= 0) {
        const updatedConv = {
          ...convsRef.current[existingConvIndex],
          last_message: message.message_text,
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

      console.log('📡 Message displayed instantly, socket will notify other participants');

      return message;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
      throw error;
    }
  }, []);

  /* -------------------- ACTIVE CONVERSATION (FIXED) -------------------- */
  const setActiveConversation = useCallback((conv) => {
    // ✅ FIX: Removed the 'if (!conv) return' guard. We now allow null to close the chat.
    
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conv });

    if (conv) {
      console.log('🎯 Setting active conversation:', conv.id);
      activeConvRef.current = conv;
      processingMessagesRef.current.clear();
      
      if (socketRef.current?.connected) {
        socketRef.current.emit('join_conversation', conv.id);
      }
    } else {
      console.log('🚫 Clearing active conversation');
      activeConvRef.current = null;
    }
  }, []);

  /* -------------------- AVAILABLE USERS -------------------- */
  const loadAvailableUsers = useCallback(async () => {
    if (!user) return [];
    const users = await ChatService.getAvailableUsers();
    setAvailableUsers(users);
    return users;
  }, [user]);

  /* -------------------- SOCKET SETUP -------------------- */
  const setupSocket = useCallback(() => {
    if (socketSetupInProgressRef.current || !user) {
      console.log('⚠️ Socket setup already in progress or no user');
      return;
    }

    if (socketRef.current?.connected) {
      console.log('⚠️ Socket already connected');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.error('❌ No token available for socket connection');
      return;
    }

    socketSetupInProgressRef.current = true;
    console.log('🔌 Setting up socket connection...');
    
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    const socket = io(import.meta.env.VITE_SOCKET_URL, {
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
      console.log('🟢 Socket connected, ID:', socket.id);
      dispatch({ type: 'SET_SOCKET_CONNECTED', payload: true });
      reconnectAttemptsRef.current = 0;
      socketSetupInProgressRef.current = false;
      
      if (activeConvRef.current?.id) {
        socket.emit('join_conversation', activeConvRef.current.id);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('🔴 Socket disconnected. Reason:', reason);
      dispatch({ type: 'SET_SOCKET_CONNECTED', payload: false });
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
      reconnectAttemptsRef.current += 1;
      
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ Max reconnection attempts reached');
        socketSetupInProgressRef.current = false;
        socket.disconnect();
      }
    });

    socket.on('new_message', ({ message, conversationId }) => {
      console.log('📨 Socket received message:', message.id, 'for conversation:', conversationId);
      
      if (processingMessagesRef.current.has(message.id)) {
        console.log('⏭️ Message already being processed, skipping:', message.id);
        return;
      }
      
      processingMessagesRef.current.add(message.id);
      
      const conversation = convsRef.current.find(c => c.id === conversationId);
      
      if (activeConvRef.current?.id !== conversationId && conversation && message.sender_id !== user.id) {
        showNotification(message, conversation);
      }
      
      const currentMessages = messagesByConvRef.current[conversationId] || [];
      const messageExists = currentMessages.some(m => m.id === message.id);
      
      if (messageExists) {
        console.log('⏭️ Message already exists in state, skipping socket duplicate');
        processingMessagesRef.current.delete(message.id);
        return;
      }
      
      if (activeConvRef.current?.id === conversationId) {
        console.log('💬 Adding message from socket to active conversation');
        dispatch({ 
          type: 'ADD_MESSAGE', 
          payload: { conversationId, message } 
        });
        
        if (!messagesByConvRef.current[conversationId]) {
          messagesByConvRef.current[conversationId] = [];
        }
        messagesByConvRef.current[conversationId].push(message);
      } else if (message.sender_id !== user.id) {
        unreadCountsRef.current[conversationId] = 
          (unreadCountsRef.current[conversationId] || 0) + 1;
        
        console.log('🔔 Incrementing unread count for conversation:', conversationId);
        dispatch({
          type: 'SET_UNREAD_COUNTS',
          payload: { ...unreadCountsRef.current }
        });
      }

      const existingConvIndex = convsRef.current.findIndex(c => c.id === conversationId);
      
      if (existingConvIndex >= 0) {
        const updatedConv = {
          ...convsRef.current[existingConvIndex],
          last_message: message.message_text,
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
        console.log('🔄 Updated conversation list');
      }
      
      processingMessagesRef.current.delete(message.id);
    });

    socket.on('chat_notification', (notification) => {
      console.log('🔔 Socket notification received:', notification);
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    return () => {
      console.log('🧹 Cleaning up socket listeners');
      socket.removeAllListeners();
    };
  }, [user, showNotification]);

  /* -------------------- SOCKET LIFECYCLE -------------------- */
  useEffect(() => {
    if (!user) return;
    
    setupSocket();
    
    return () => {
      console.log('🧹 Disconnecting socket on unmount');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        socketSetupInProgressRef.current = false;
      }
    };
  }, [user, setupSocket]);

  /* -------------------- SYNC REFS -------------------- */
  useEffect(() => {
    unreadCountsRef.current = state.unreadCounts;
    convsRef.current = state.conversations;
    activeConvRef.current = state.activeConversation;
    
    Object.keys(state.messages).forEach(convId => {
      messagesByConvRef.current[convId] = state.messages[convId] || [];
    });
  }, [state]);

  /* -------------------- CLEAR CONVERSATION MESSAGES -------------------- */
  const clearConversationMessages = useCallback((conversationId) => {
    dispatch({ type: 'CLEAR_MESSAGES', payload: conversationId });
    delete messagesByConvRef.current[conversationId];
  }, []);

  /* -------------------- HELPERS -------------------- */
  const getUnreadCount = (id) => state.unreadCounts[id] || 0;
  const getTotalUnreadCount = () =>
    Object.values(state.unreadCounts).reduce((a, b) => a + b, 0);
  
  const getMessagesForConversation = useCallback((conversationId) => {
    return state.messages[conversationId] || [];
  }, [state.messages]);

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
      loadAvailableUsers,
      loadConversations,
      createConversation,
      loadMessages,
      sendMessage,
      setActiveConversation,
      clearConversationMessages,
      getUnreadCount,
      getTotalUnreadCount,
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