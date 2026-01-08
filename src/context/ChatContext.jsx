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
  messages: [],
  loading: false,
  error: null,
  unreadCounts: {},
};

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
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_UNREAD_COUNTS':
      return { ...state, unreadCounts: action.payload };
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
  const activeConvRef = useRef(null);
  const initializedRef = useRef(false);

  /* -------------------- LOAD CONVERSATIONS -------------------- */
  const loadConversations = useCallback(async () => {
    if (!user) return;

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const convs = await ChatService.getRecentChats(50);

      dispatch({ type: 'SET_CONVERSATIONS', payload: convs });
      convsRef.current = convs;

      const unread = {};
      convs.forEach(c => unread[c.id] = c.unreadCount ?? 0);
      dispatch({ type: 'SET_UNREAD_COUNTS', payload: unread });
      unreadCountsRef.current = unread;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [user]);

  /* -------------------- INIT AFTER AUTH -------------------- */
  useEffect(() => {
    if (authLoading || !user || initializedRef.current) return;
    initializedRef.current = true;
    loadConversations();
  }, [authLoading, user, loadConversations]);

  /* -------------------- LOAD MESSAGES -------------------- */
  const loadMessages = useCallback(async (conversationId) => {
    try {
      const msgs = await ChatService.getMessages(conversationId);
      dispatch({ type: 'SET_MESSAGES', payload: msgs });

      unreadCountsRef.current[conversationId] = 0;
      dispatch({
        type: 'SET_UNREAD_COUNTS',
        payload: { ...unreadCountsRef.current }
      });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  /* -------------------- SEND MESSAGE (REST + SOCKET) -------------------- */
  const sendMessage = useCallback(async (conversationId, messageText) => {
    if (!conversationId || !messageText?.trim()) return;

    // Save via REST
    const message = await ChatService.sendMessage(
      conversationId,
      messageText.trim()
    );

    // Optimistic UI update
    dispatch({ type: 'ADD_MESSAGE', payload: message });

    // Emit socket event for instant delivery
    socketRef.current?.emit('send_message', {
      conversationId,
      messageText: message.message_text,
      parentMessageId: message.parent_message_id || null,
    });

    // Update conversation list
    const updatedConvs = convsRef.current.map(c =>
      c.id === conversationId
        ? { ...c, last_message: message.message_text, last_message_at: message.created_at }
        : c
    );

    convsRef.current = updatedConvs;
    dispatch({ type: 'SET_CONVERSATIONS', payload: updatedConvs });

    return message;
  }, []);

  /* -------------------- ACTIVE CONVERSATION -------------------- */
  const setActiveConversation = useCallback((conv) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conv });
    activeConvRef.current = conv;

    // Join socket room for this conversation
    socketRef.current?.emit('join_conversation', conv.id);
  }, []);

  /* -------------------- AVAILABLE USERS -------------------- */
  const loadAvailableUsers = useCallback(async () => {
    if (!user) return [];
    const users = await ChatService.getAvailableUsers();
    setAvailableUsers(users);
    return users;
  }, [user]);

  /* -------------------- SOCKET SETUP -------------------- */
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => console.log('🟢 Socket connected'));
    socket.on('disconnect', () => console.log('🔴 Socket disconnected'));

    socket.on('new_message', ({ message, conversationId }) => {
      // Prevent duplicate messages (sender already added optimistically)
      if (message.sender_id === user.id) return;

      if (activeConvRef.current?.id === conversationId) {
        dispatch({ type: 'ADD_MESSAGE', payload: message });
      } else {
        unreadCountsRef.current[conversationId] =
          (unreadCountsRef.current[conversationId] || 0) + 1;

        dispatch({
          type: 'SET_UNREAD_COUNTS',
          payload: { ...unreadCountsRef.current }
        });
      }

      const updatedConvs = convsRef.current.map(c =>
        c.id === conversationId
          ? { ...c, last_message: message.message_text, last_message_at: message.created_at }
          : c
      );

      convsRef.current = updatedConvs;
      dispatch({ type: 'SET_CONVERSATIONS', payload: updatedConvs });
    });

    return () => socket.disconnect();
  }, [user]);

  /* -------------------- SYNC REFS -------------------- */
  useEffect(() => {
    unreadCountsRef.current = state.unreadCounts;
    convsRef.current = state.conversations;
    activeConvRef.current = state.activeConversation;
  }, [state]);

  /* -------------------- HELPERS -------------------- */
  const getUnreadCount = (id) => state.unreadCounts[id] || 0;
  const getTotalUnreadCount = () =>
    Object.values(state.unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <ChatContext.Provider value={{
      conversations: state.conversations,
      activeConversation: state.activeConversation,
      messages: state.messages,
      loading: state.loading,
      error: state.error,
      availableUsers,
      loadAvailableUsers,
      loadConversations,
      loadMessages,
      sendMessage,
      setActiveConversation,
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
