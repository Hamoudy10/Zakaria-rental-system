import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useNotification } from './NotificationContext';
import ChatService from '../services/ChatService';
import { io } from 'socket.io-client';

const ChatContext = createContext();

const chatReducer = (state, action) => {
    switch (action.type) {
        case 'SET_CONVERSATIONS':
            return { ...state, conversations: action.payload };
        case 'ADD_CONVERSATION':
            return { ...state, conversations: [action.payload, ...state.conversations] };
        case 'SET_ACTIVE_CONVERSATION':
            return { ...state, activeConversation: action.payload };
        case 'SET_MESSAGES':
            return { ...state, messages: action.payload };
        case 'ADD_MESSAGE':
            return { ...state, messages: [...state.messages, action.payload] };
        case 'UPDATE_MESSAGE':
            return {
                ...state,
                messages: state.messages.map(msg =>
                    msg.id === action.payload.id ? action.payload : msg
                )
            };
        case 'SET_LOADING':
            return { ...state, loading: action.payload };
        case 'SET_ERROR':
            return { ...state, error: action.payload };
        case 'SET_AVAILABLE_USERS':
            return { ...state, availableUsers: action.payload };
        case 'SET_TYPING_USERS':
            return {
                ...state,
                typingUsers: {
                    ...state.typingUsers,
                    [action.payload.conversationId]: action.payload.users
                }
            };
        case 'SET_UNREAD_COUNTS':
            return { ...state, unreadCounts: action.payload };
        default:
            return state;
    }
};

const initialState = {
    conversations: [],
    activeConversation: null,
    messages: [],
    loading: false,
    error: null,
    availableUsers: [],
    typingUsers: {},
    unreadCounts: {},
};

export const ChatProvider = ({ children }) => {
    const [state, dispatch] = useReducer(chatReducer, initialState);
    const { user } = useAuth();
    const { refreshNotifications } = useNotification();
    const socketRef = useRef(null);
    const unreadCountsRef = useRef({});
    const convsRef = useRef([]);
    const activeConvRef = useRef(null);
    const notifRefreshTimerRef = useRef(null);
    const notifLastRef = useRef(0);
    const NOTIF_REFRESH_WINDOW = 2000; // ms, match backend

     const scheduleNotificationRefresh = useCallback(() => {
  const now = Date.now();
  const elapsed = now - (notifLastRef.current || 0);

  if (elapsed > NOTIF_REFRESH_WINDOW) {
    notifLastRef.current = now;
    try { refreshNotifications(); } catch (e) { /* ignore */ }
  } else {
    clearTimeout(notifRefreshTimerRef.current);
    notifRefreshTimerRef.current = setTimeout(() => {
      notifLastRef.current = Date.now();
      try { refreshNotifications(); } catch (e) { /* ignore */ }
    }, NOTIF_REFRESH_WINDOW - elapsed);
  }
}, [refreshNotifications]);

useEffect(() => {
  return () => clearTimeout(notifRefreshTimerRef.current);
}, []);

    // Load available users for new conversations
    const loadAvailableUsers = useCallback(async () => {
        try {
            dispatch({ type: 'SET_LOADING', payload: true });
            dispatch({ type: 'SET_ERROR', payload: null });
            
            const response = await ChatService.getAvailableUsers();
            console.log('📞 Load available users response:', response);
            
            if (response.success) {
                // Filter out current user from available users
                const filteredUsers = response.data.filter(availableUser => 
                    availableUser.id !== user?.id
                );
                dispatch({ type: 'SET_AVAILABLE_USERS', payload: filteredUsers });
            } else {
                dispatch({ type: 'SET_ERROR', payload: response.message || 'Failed to load users' });
            }
        } catch (error) {
            console.error('❌ Error loading available users:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
            dispatch({ type: 'SET_AVAILABLE_USERS', payload: [] });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [user]);

    // Load conversations
    const loadConversations = useCallback(async () => {
        if (!user) return;
        
        try {
            dispatch({ type: 'SET_LOADING', payload: true });
            const response = await ChatService.getConversations();
            
            if (response.success) {
                dispatch({ type: 'SET_CONVERSATIONS', payload: response.conversations });
                
                // Calculate unread counts
                const unreadCounts = {};
                response.conversations.forEach(conv => {
                    unreadCounts[conv.id] = conv.unread_count || 0;
                });
                dispatch({ type: 'SET_UNREAD_COUNTS', payload: unreadCounts });
            }
        } catch (error) {
            console.error('❌ Failed to load conversations:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [user]);

    // Load messages for a conversation
    const loadMessages = useCallback(async (conversationId) => {
        try {
            const response = await ChatService.getMessages(conversationId);
            if (response.success) {
                dispatch({ type: 'SET_MESSAGES', payload: response.messages });
                dispatch({
                        type: 'SET_UNREAD_COUNTS',
                        payload: { ...state.unreadCounts, [conversationId]: 0 }
                        });
            }
        } catch (error) {
            console.error('❌ Failed to load messages:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
            throw error;
        }
    }, []);

    // Send message
     const sendMessage = useCallback(async (conversationId, messageText) => {
        try {
            // If socket connected, send via socket and wait for the server 'new_message' emit
            if (socketRef.current && socketRef.current.connected) {
                const socket = socketRef.current;
                return await new Promise((resolve) => {
                    const onNewMessage = (data) => {
                        if (data.conversationId === conversationId && data.message?.sender_id === user?.id) {
                            socket.off('new_message', onNewMessage);
                            resolve(data.message);
                        }
                    };
                    socket.on('new_message', onNewMessage);

                    // Emit send_message (server will insert and broadcast)
                    socket.emit('send_message', { conversationId, messageText });

                    // Fallback timeout (resolve null after 5s)
                    setTimeout(() => {
                        socket.off('new_message', onNewMessage);
                        resolve(null);
                    }, 5000);
                });
            }

            // Fallback: HTTP send (server inserts but REST route doesn't broadcast; we'll still add locally)
            const response = await ChatService.sendMessage(conversationId, messageText);
            if (response.success) {
                dispatch({ type: 'ADD_MESSAGE', payload: response.message });
                // Ask server notifications to be refreshed
                try { scheduleNotificationRefresh(); } catch (e) { /* ignore */ }
                return response.message;
            }
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
            throw error;
        }
    }, [user?.id, scheduleNotificationRefresh]);


    // Create new conversation
    const createConversation = useCallback(async (participantIds, title = null, type = 'direct') => {
        try {
            const response = await ChatService.createConversation(participantIds, title, type);
            if (response.success) {
                if (response.conversation) {
                    dispatch({ type: 'ADD_CONVERSATION', payload: response.conversation });
                }
                // Return the conversation ID for immediate use
                return response.conversationId || response.conversation?.id;
            } else {
                throw new Error(response.message || 'Failed to create conversation');
            }
        } catch (error) {
            console.error('❌ Failed to create conversation:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
            throw error;
        }
    }, []);

    // Typing indicators
    const startTyping = useCallback(async (conversationId) => {
        try {
            await ChatService.startTyping(conversationId);
        } catch (error) {
            console.error('❌ Failed to start typing:', error);
        }
    }, []);

    const stopTyping = useCallback(async (conversationId) => {
        try {
            await ChatService.stopTyping(conversationId);
        } catch (error) {
            console.error('❌ Failed to stop typing:', error);
        }
    }, []);

    // Conversation management
    const joinConversation = useCallback((conversationId) => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('join_conversation', conversationId);
        } else {
            console.warn('Socket not connected; join will occur when socket connects');
       }
    }, []);

    const leaveConversation = useCallback((conversationId) => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('leave_conversation', conversationId);
        }
    }, []);

    // Search messages
    const searchMessages = useCallback(async (query, conversationId = null) => {
        try {
            const response = await ChatService.searchMessages(query, conversationId);
            return response.results || [];
        } catch (error) {
            console.error('❌ Failed to search messages:', error);
            return [];
        }
    }, []);

    // Mark messages as read
    const markAsRead = useCallback(async (messageIds) => {
        try {
            await ChatService.markAsRead(messageIds);
        } catch (error) {
            console.error('❌ Failed to mark messages as read:', error);
        }
    }, []);

    // Get unread count for a conversation
    const getUnreadCount = useCallback((conversationId) => {
        return state.unreadCounts[conversationId] || 0;
    }, [state.unreadCounts]);

    // Get total unread count
    const getTotalUnreadCount = useCallback(() => {
        return Object.values(state.unreadCounts).reduce((total, count) => total + count, 0);
    }, [state.unreadCounts]);

    // Set active conversation
    const setActiveConversation = useCallback((conversation) => {
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conversation });
    }, []);

    // Load initial data when user changes
    useEffect(() => {
        if (user) {
            loadConversations();
            loadAvailableUsers();
        }
    }, [user, loadConversations, loadAvailableUsers]);

    // keep refs updated
useEffect(() => {
  unreadCountsRef.current = state.unreadCounts;
  convsRef.current = state.conversations;
  activeConvRef.current = state.activeConversation;
}, [state.unreadCounts, state.conversations, state.activeConversation]);

useEffect(() => {
  if (!user) return;

  const token = localStorage.getItem('token');
  const socket = io(import.meta.env.VITE_SOCKET_URL, {
  auth: { token },
  transports: ['websocket'],
});

  socketRef.current = socket;

  socket.on('connect', () => console.log('Socket connected'));
  socket.on('new_message', async (data) => {
    const { message, conversationId } = data;

    // If user is viewing the conversation, add message & mark it read
    if (activeConvRef.current?.id === conversationId) {
      dispatch({ type: 'ADD_MESSAGE', payload: message });
      try { await ChatService.markAsRead([message.id]); } catch (e) { /* ignore */ }
      dispatch({
        type: 'SET_UNREAD_COUNTS',
        payload: { ...unreadCountsRef.current, [conversationId]: 0 }
      });
    } else {
      // increment unread count
      const prev = unreadCountsRef.current || {};
      const updated = { ...prev, [conversationId]: (prev[conversationId] || 0) + 1 };
      dispatch({ type: 'SET_UNREAD_COUNTS', payload: updated });

      // update conversation last message and move to top
      const convs = convsRef.current || [];
      const updatedConv = convs.map(c => c.id === conversationId
        ? { ...c, last_message_text: message.message_text, last_message_at: message.created_at }
        : c);
      const top = updatedConv.find(c => c.id === conversationId);
      const reordered = [top, ...updatedConv.filter(c => c.id !== conversationId)];
      dispatch({ type: 'SET_CONVERSATIONS', payload: reordered });
    }
  });

  // Chat notifications (server emits chat_notification to each participant's personal room)
  socket.on('chat_notification', (data) => {
    try {
      // data: { type: 'new_message', conversationId, message, unreadCount }
      const conversationId = data.conversationId;
      const prev = unreadCountsRef.current || {};
      const updated = { ...prev, [conversationId]: (prev[conversationId] || 0) + (data.unreadCount || 1) };
      dispatch({ type: 'SET_UNREAD_COUNTS', payload: updated });

      // Move conversation to top & update last message (if present)
      if (data.message) {
        const convs = convsRef.current || [];
        const updatedConv = convs.map(c => c.id === conversationId
          ? { ...c, last_message_text: data.message.message_text, last_message_at: data.message.created_at }
          : c);
        const top = updatedConv.find(c => c.id === conversationId);
        const reordered = [top, ...updatedConv.filter(c => c.id !== conversationId)];
        dispatch({ type: 'SET_CONVERSATIONS', payload: reordered });
      }

      // Let Notification system refresh and show the message
      try { scheduleNotificationRefresh(); } catch (e) { /* ignore */ }
      // Also notify NotificationProvider via a window event so it can add a local notification quickly
      window.dispatchEvent(new CustomEvent('incoming_chat_notification', { detail: data }));
    } catch (err) {
      console.error('❌ Error handling chat_notification:', err);
    }
  });

  socket.on('disconnect', () => console.log('Socket disconnected'));

  return () => {
    socket.disconnect();
    socketRef.current = null;
  };
}, [user, dispatch, scheduleNotificationRefresh]);

   

    const value = {
        // State
        conversations: state.conversations,
        activeConversation: state.activeConversation,
        messages: state.messages,
        loading: state.loading,
        error: state.error,
        availableUsers: state.availableUsers,
        typingUsers: state.typingUsers,
        
        // Actions
        loadConversations,
        loadMessages,
        sendMessage,
        createConversation,
        searchMessages,
        markAsRead,
        loadAvailableUsers,
        startTyping,
        stopTyping,
        joinConversation,
        leaveConversation,
        setActiveConversation,
        getUnreadCount,
        getTotalUnreadCount
    };

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
};