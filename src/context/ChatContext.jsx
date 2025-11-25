import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import chatService from '../services/ChatService';

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
        case 'SET_SEARCH_RESULTS':
            return { ...state, searchResults: action.payload };
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
        case 'SET_AVAILABLE_USERS':
            return { ...state, availableUsers: action.payload };
        default:
            return state;
    }
};

const initialState = {
    conversations: [],
    activeConversation: null,
    messages: [],
    loading: false,
    searchResults: [],
    typingUsers: {},
    unreadCounts: {},
    availableUsers: [],
};

export const ChatProvider = ({ children }) => {
    const [state, dispatch] = useReducer(chatReducer, initialState);
    const { user } = useAuth();
    const initializedRef = useRef(false);

    // Memoized functions to prevent infinite re-renders
    const loadConversations = useCallback(async () => {
        if (!user) return;
        
        try {
            dispatch({ type: 'SET_LOADING', payload: true });
            const response = await chatService.getConversations();
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
            console.error('Failed to load conversations:', error);
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [user]);

    const loadMessages = useCallback(async (conversationId, page = 1) => {
        try {
            const response = await chatService.getMessages(conversationId, page);
            if (response.success) {
                if (page === 1) {
                    dispatch({ type: 'SET_MESSAGES', payload: response.messages });
                } else {
                    dispatch({ type: 'SET_MESSAGES', payload: [...response.messages, ...state.messages] });
                }
                return response.pagination;
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
            throw error;
        }
    }, [state.messages]);

    const sendMessage = useCallback(async (conversationId, messageText, parentMessageId = null) => {
        try {
            const response = await chatService.sendMessage(conversationId, messageText, parentMessageId);
            if (response.success) {
                dispatch({ type: 'ADD_MESSAGE', payload: response.message });
                return response.message;
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }, []);

    const createConversation = useCallback(async (participantIds, title = null, conversationType = 'direct') => {
        try {
            const response = await chatService.createConversation(participantIds, title, conversationType);
            if (response.conversation) {
                dispatch({ type: 'ADD_CONVERSATION', payload: response.conversation });
            }
            return response.conversationId || response.conversation?.id;
        } catch (error) {
            console.error('Failed to create conversation:', error);
            throw error;
        }
    }, []);

    const searchMessages = useCallback(async (query, conversationId = null) => {
        try {
            const response = await chatService.searchMessages(query, conversationId);
            if (response.success) {
                dispatch({ type: 'SET_SEARCH_RESULTS', payload: response.results });
                return response.results;
            }
        } catch (error) {
            console.error('Failed to search messages:', error);
            throw error;
        }
    }, []);

    const markAsRead = useCallback(async (messageIds) => {
        try {
            await chatService.markAsRead(messageIds);
        } catch (error) {
            console.error('Failed to mark messages as read:', error);
        }
    }, []);

    const loadAvailableUsers = useCallback(async () => {
        try {
            const response = await chatService.getAvailableUsers();
            if (response.success) {
                dispatch({ type: 'SET_AVAILABLE_USERS', payload: response.users });
            }
        } catch (error) {
            console.error('Failed to load available users:', error);
        }
    }, []);

    const startTyping = useCallback((conversationId) => {
        chatService.emit('typing_start', { conversationId });
    }, []);

    const stopTyping = useCallback((conversationId) => {
        chatService.emit('typing_stop', { conversationId });
    }, []);

    const joinConversation = useCallback((conversationId) => {
        chatService.joinConversation(conversationId);
    }, []);

    const leaveConversation = useCallback((conversationId) => {
        chatService.leaveConversation(conversationId);
    }, []);

    // Event handlers
    const handleNewMessage = useCallback((data) => {
        if (data.conversationId === state.activeConversation?.id) {
            dispatch({ type: 'ADD_MESSAGE', payload: data.message });
            // Mark as read immediately if in active conversation
            markAsRead([data.message.id]);
        }
        
        // Update unread counts
        const newUnreadCounts = { ...state.unreadCounts };
        newUnreadCounts[data.conversationId] = (newUnreadCounts[data.conversationId] || 0) + 1;
        dispatch({ type: 'SET_UNREAD_COUNTS', payload: newUnreadCounts });
    }, [state.activeConversation, state.unreadCounts, markAsRead]);

    const handleUserTyping = useCallback((data) => {
        const currentTypers = state.typingUsers[data.conversationId] || [];
        if (!currentTypers.find(user => user.userId === data.userId)) {
            const updatedTypers = [...currentTypers, { userId: data.userId, userName: data.userName }];
            dispatch({
                type: 'SET_TYPING_USERS',
                payload: { conversationId: data.conversationId, users: updatedTypers }
            });
        }
    }, [state.typingUsers]);

    const handleUserStopTyping = useCallback((data) => {
        const currentTypers = state.typingUsers[data.conversationId] || [];
        const updatedTypers = currentTypers.filter(user => user.userId !== data.userId);
        dispatch({
            type: 'SET_TYPING_USERS',
            payload: { conversationId: data.conversationId, users: updatedTypers }
        });
    }, [state.typingUsers]);

    const handleChatNotification = useCallback((data) => {
        console.log('Chat notification:', data);
    }, []);

    // Initialize chat service only once
    useEffect(() => {
        if (user && user.token) {
            console.log('Initializing chat service with token');
            
            // Initialize chat service
            chatService.init(user.token);
            
            // Set up event listeners
            chatService.on('new_message', handleNewMessage);
            chatService.on('user_typing', handleUserTyping);
            chatService.on('user_stop_typing', handleUserStopTyping);
            chatService.on('chat_notification', handleChatNotification);

            // Load initial data
            loadConversations();
            loadAvailableUsers();

            return () => {
                chatService.disconnect();
                initializedRef.current = false;
            };
        }else{
             console.log('No user token available for chat service');
        }
    }, [user, handleNewMessage, handleUserTyping, handleUserStopTyping, handleChatNotification, loadConversations, loadAvailableUsers]);

    const getUnreadCount = useCallback((conversationId) => {
        return state.unreadCounts[conversationId] || 0;
    }, [state.unreadCounts]);

    const getTotalUnreadCount = useCallback(() => {
        return Object.values(state.unreadCounts).reduce((total, count) => total + count, 0);
    }, [state.unreadCounts]);

    const value = {
        ...state,
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
        setActiveConversation: (conversation) => dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conversation }),
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