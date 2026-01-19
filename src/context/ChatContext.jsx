import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import ChatService from '../services/ChatService';
import { io } from 'socket.io-client';

const ChatContext = createContext();

const initialState = {
  conversations: [],
  activeConversation: null,
  messages: {},
  loading: false,
  unreadCounts: {},
  socketConnected: false,
};

const chatReducer = (state, action) => {
  switch (action.type) {
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.payload };
    case 'SET_ACTIVE_CONVERSATION':
      return { ...state, activeConversation: action.payload };
    case 'ADD_MESSAGE':
      const { conversationId, message } = action.payload;
      const prevMsgs = state.messages[conversationId] || [];
      if (prevMsgs.find(m => m.id === message.id)) return state;
      return {
        ...state,
        messages: { ...state.messages, [conversationId]: [...prevMsgs, message] }
      };
    case 'SET_MESSAGES':
      return { ...state, messages: { ...state.messages, [action.payload.conversationId]: action.payload.messages }};
    case 'SET_SOCKET_CONNECTED':
      return { ...state, socketConnected: action.payload };
    default:
      return state;
  }
};

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const socketRef = useRef(null);
  const processedMessageIds = useRef(new Set()); // Deduplication

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const convs = await ChatService.getRecentChats();
    dispatch({ type: 'SET_CONVERSATIONS', payload: convs });
  }, [user]);

  const loadMessages = useCallback(async (conversationId) => {
    const msgs = await ChatService.getMessages(conversationId);
    dispatch({ type: 'SET_MESSAGES', payload: { conversationId, messages: msgs } });
  }, []);

  const setActiveConversation = useCallback((conv) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conv });
  }, []);

  const sendMessage = useCallback(async (conversationId, text) => {
    const msg = await ChatService.sendMessage(conversationId, text);
    dispatch({ type: 'ADD_MESSAGE', payload: { conversationId, message: msg } });
  }, []);

  useEffect(() => {
    if (!user) return;
    loadConversations();

    const socket = io(import.meta.env.VITE_SOCKET_URL, {
      auth: { token: localStorage.getItem('token') }
    });
    socketRef.current = socket;

    socket.on('connect', () => dispatch({ type: 'SET_SOCKET_CONNECTED', payload: true }));
    
    socket.on('new_message', ({ message, conversationId }) => {
      if (processedMessageIds.current.has(message.id)) return;
      processedMessageIds.current.add(message.id);

      dispatch({ type: 'ADD_MESSAGE', payload: { conversationId, message } });
      
      // Update conversation list order
      loadConversations();
    });

    return () => socket.disconnect();
  }, [user, loadConversations]);

  return (
    <ChatContext.Provider value={{
      ...state,
      loadMessages,
      setActiveConversation,
      sendMessage,
      loadConversations
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);