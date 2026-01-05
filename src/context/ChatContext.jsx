import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useNotification } from './NotificationContext';
import { chatAPI as ChatService } from '../services/api';
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
    const NOTIF_REFRESH_WINDOW = 2000;

    const scheduleNotificationRefresh = useCallback(() => {
        const now = Date.now();
        const elapsed = now - (notifLastRef.current || 0);
        if (elapsed > NOTIF_REFRESH_WINDOW) {
            notifLastRef.current = now;
            try { refreshNotifications(); } catch (e) { }
        } else {
            clearTimeout(notifRefreshTimerRef.current);
            notifRefreshTimerRef.current = setTimeout(() => {
                notifLastRef.current = Date.now();
                try { refreshNotifications(); } catch (e) { }
            }, NOTIF_REFRESH_WINDOW - elapsed);
        }
    }, [refreshNotifications]);

    useEffect(() => {
        return () => clearTimeout(notifRefreshTimerRef.current);
    }, []);

    const loadAvailableUsers = useCallback(async () => {
        try {
            dispatch({ type: 'SET_LOADING', payload: true });
            dispatch({ type: 'SET_ERROR', payload: null });

            let users = [];
            let attempts = 0;
            while (attempts < 3) {
                attempts++;
                const response = await ChatService.getAvailableUsers();
                users = Array.isArray(response) ? response : response?.data || [];
                if (users.length || !response?.message?.includes('Too many requests')) break;
                await new Promise(r => setTimeout(r, 1500));
            }

            // ✅ Fix: filter out the current user safely
            const filteredUsers = users.filter(u => u.id !== user?.id);
            dispatch({ type: 'SET_AVAILABLE_USERS', payload: filteredUsers });
        } catch (error) {
            console.error('❌ Error loading available users:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
            dispatch({ type: 'SET_AVAILABLE_USERS', payload: [] });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [user]);

    const loadConversations = useCallback(async () => {
        if (!user) return;
        try {
            dispatch({ type: 'SET_LOADING', payload: true });

            let convs = [];
            let attempts = 0;
            while (attempts < 3) {
                attempts++;
                const response = await ChatService.getRecentChats(50, 0);
                convs = Array.isArray(response) ? response : response?.data || [];
                if (convs.length || !response?.message?.includes('Too many requests')) break;
                await new Promise(r => setTimeout(r, 1500));
            }

            const mergedConvs = [...convsRef.current];
            convs.forEach(conv => {
                if (!mergedConvs.some(c => c.id === conv.id)) mergedConvs.push(conv);
            });

            dispatch({ type: 'SET_CONVERSATIONS', payload: mergedConvs });

            const unreadCounts = {};
            mergedConvs.forEach(conv => unreadCounts[conv.id] = conv.unreadCount ?? 0);
            dispatch({ type: 'SET_UNREAD_COUNTS', payload: unreadCounts });
        } catch (error) {
            console.error('❌ Failed to load conversations:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [user]);

    const loadMessages = useCallback(async (conversationId) => {
        try {
            const messages = await ChatService.getMessages(conversationId);
            const msgs = Array.isArray(messages) ? messages : messages?.data || [];
            dispatch({ type: 'SET_MESSAGES', payload: msgs });
            dispatch({ type: 'SET_UNREAD_COUNTS', payload: { ...state.unreadCounts, [conversationId]: 0 } });
        } catch (error) {
            console.error('❌ Failed to load messages:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
        }
    }, [state.unreadCounts]);

    const sendMessage = useCallback(async (conversationId, messageText) => {
        try {
            if (socketRef.current?.connected) {
                const socket = socketRef.current;
                return await new Promise((resolve) => {
                    const onNewMessage = (data) => {
                        if (data.conversationId === conversationId && data.message?.sender_id === user?.id) {
                            socket.off('new_message', onNewMessage);
                            resolve(data.message);
                        }
                    };
                    socket.on('new_message', onNewMessage);
                    socket.emit('send_message', { conversationId, messageText });
                    setTimeout(() => {
                        socket.off('new_message', onNewMessage);
                        resolve(null);
                    }, 5000);
                });
            }

            const message = await ChatService.sendMessage({ conversationId, messageText });
            dispatch({ type: 'ADD_MESSAGE', payload: message });
            scheduleNotificationRefresh();
            return message;
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
        }
    }, [user?.id, scheduleNotificationRefresh]);

    const createConversation = useCallback(async (participantIds, title = null, type = 'direct') => {
        try {
            const conversation = await ChatService.createConversation({ participantIds, title, type });
            dispatch({ type: 'ADD_CONVERSATION', payload: conversation });
            return conversation?.id;
        } catch (error) {
            console.error('❌ Failed to create conversation:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
        }
    }, []);

    const startTyping = useCallback(async (conversationId) => { try { await ChatService.startTyping(conversationId); } catch {} }, []);
    const stopTyping = useCallback(async (conversationId) => { try { await ChatService.stopTyping(conversationId); } catch {} }, []);

    const joinConversation = useCallback((conversationId) => { if (socketRef.current?.connected) socketRef.current.emit('join_conversation', conversationId); }, []);
    const leaveConversation = useCallback((conversationId) => { if (socketRef.current?.connected) socketRef.current.emit('leave_conversation', conversationId); }, []);

    const searchMessages = useCallback(async (query, conversationId = null) => {
        try { return await ChatService.searchMessages(query, conversationId); } catch { return []; }
    }, []);

    const markAsRead = useCallback(async (messageIds) => { try { await ChatService.markAsRead(messageIds); } catch {} }, []);

    const getUnreadCount = useCallback((conversationId) => state.unreadCounts[conversationId] || 0, [state.unreadCounts]);
    const getTotalUnreadCount = useCallback(() => Object.values(state.unreadCounts).reduce((a, b) => a + b, 0), [state.unreadCounts]);
    const setActiveConversation = useCallback((conv) => dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conv }), []);

    useEffect(() => { if (user) { loadConversations(); loadAvailableUsers(); } }, [user, loadConversations, loadAvailableUsers]);
    useEffect(() => { unreadCountsRef.current = state.unreadCounts; convsRef.current = state.conversations; activeConvRef.current = state.activeConversation; }, [state.unreadCounts, state.conversations, state.activeConversation]);

    useEffect(() => {
        if (!user) return;
        const token = localStorage.getItem('token');
        const socket = io(import.meta.env.VITE_SOCKET_URL, { auth: { token }, transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('connect', () => console.log('Socket connected'));
        socket.on('new_message', async ({ message, conversationId }) => {
            if (activeConvRef.current?.id === conversationId) {
                dispatch({ type: 'ADD_MESSAGE', payload: message });
                try { await ChatService.markAsRead([message.id]); } catch {}
                dispatch({ type: 'SET_UNREAD_COUNTS', payload: { ...unreadCountsRef.current, [conversationId]: 0 } });
            } else {
                const prev = unreadCountsRef.current || {};
                const updated = { ...prev, [conversationId]: (prev[conversationId] || 0) + 1 };
                dispatch({ type: 'SET_UNREAD_COUNTS', payload: updated });

                const convs = convsRef.current || [];
                const updatedConv = convs.map(c => c.id === conversationId
                    ? { ...c, last_message_text: message.message_text, last_message_at: message.created_at }
                    : c);
                const top = updatedConv.find(c => c.id === conversationId);
                const reordered = [top, ...updatedConv.filter(c => c.id !== conversationId)];
                dispatch({ type: 'SET_CONVERSATIONS', payload: reordered });
            }
        });

        socket.on('chat_notification', (data) => {
            try {
                const conversationId = data.conversationId;
                const prev = unreadCountsRef.current || {};
                const updated = { ...prev, [conversationId]: (prev[conversationId] || 0) + (data.unreadCount || 1) };
                dispatch({ type: 'SET_UNREAD_COUNTS', payload: updated });

                if (data.message) {
                    const convs = convsRef.current || [];
                    const updatedConv = convs.map(c => c.id === conversationId
                        ? { ...c, last_message_text: data.message.message_text, last_message_at: data.message.created_at }
                        : c);
                    const top = updatedConv.find(c => c.id === conversationId);
                    const reordered = [top, ...updatedConv.filter(c => c.id !== conversationId)];
                    dispatch({ type: 'SET_CONVERSATIONS', payload: reordered });
                }

                scheduleNotificationRefresh();
                window.dispatchEvent(new CustomEvent('incoming_chat_notification', { detail: data }));
            } catch (err) { console.error('❌ Error handling chat_notification:', err); }
        });

        socket.on('disconnect', () => console.log('Socket disconnected'));
        return () => { socket.disconnect(); socketRef.current = null; };
    }, [user, scheduleNotificationRefresh]);

    const value = {
        conversations: state.conversations,
        activeConversation: state.activeConversation,
        messages: state.messages,
        loading: state.loading,
        error: state.error,
        availableUsers: state.availableUsers,
        typingUsers: state.typingUsers,
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

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) throw new Error('useChat must be used within a ChatProvider');
    return context;
};
