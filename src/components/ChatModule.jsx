import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';

// Lazy-loaded components
const MessageList = React.lazy(() => import('./chat/MessageList'));
const MessageInput = React.lazy(() => import('./chat/MessageInput'));
const NewConversationModal = React.lazy(() => import('./chat/NewConversationModal'));

// Loading fallback
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-32">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
);

// Empty Chat State
const EmptyChatState = ({ onNewChat }) => (
  <div className="flex-1 flex items-center justify-center bg-gray-50">
    <div className="text-center max-w-md p-8">
      <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">No conversation selected</h2>
      <p className="text-gray-600 mb-6">
        Choose a conversation from the sidebar or start a new chat.
      </p>
      <button
        onClick={onNewChat}
        className="bg-gradient-to-br from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
      >
        Start New Conversation
      </button>
    </div>
  </div>
);

// Conversation Item
const ConversationItem = ({ conversation, isActive, onSelect, unreadCount, users }) => {
  const getDisplayName = (conv) => {
  if (conv.title && conv.conversation_type === 'group') return conv.title;

  // Direct chat
  if (conv.conversation_type === 'direct' && conv.participants?.length) {
    const otherUser = conv.participants[0];
    return `${otherUser.first_name} ${otherUser.last_name}`;
  }
};


  const getLastMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = (now - date) / (1000 * 60 * 60);
    if (diffHours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffHours < 168) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  const truncateText = (text, max = 40) => text ? (text.length > max ? text.slice(0, max) + '...' : text) : 'No messages yet';

  console.log('Rendering conversation:', conversation, 'Display Name:', getDisplayName(conversation));

  return (
    <div
      onClick={() => onSelect(conversation)}
      className={`flex items-center p-4 border-b border-gray-100 cursor-pointer transition-all duration-200 ${
        isActive ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-lg shadow-md">
        {getDisplayName(conversation).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0 ml-4">
        <div className="flex justify-between items-baseline mb-1">
          <h3 className={`font-semibold truncate text-sm ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
            {getDisplayName(conversation)}
          </h3>
          <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
            {getLastMessageTime(conversation.last_message_at)}
          </span>
        </div>
        <p className={`text-sm truncate ${isActive ? 'text-blue-600' : 'text-gray-600'}`}>
          {truncateText(conversation.last_message)}
        </p>
      </div>
      {unreadCount > 0 && (
        <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white text-xs rounded-full flex items-center justify-center ml-3 shadow-sm">
          {unreadCount}
        </span>
      )}
    </div>
  );
};

// Chat Header
const ChatHeader = ({ conversation, onBack, users }) => {
 if (conv.title && conv.conversation_type === 'group') return conv.title;

  // Direct chat
  if (conv.conversation_type === 'direct' && conv.participants?.length) {
    const otherUser = conv.participants[0];
    return `${otherUser.first_name} ${otherUser.last_name}`;
  };


  return (
    <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
      <div className="flex items-center">
        <button
          onClick={onBack}
          className="md:hidden mr-3 p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold shadow-md">
          {getDisplayName(conversation).charAt(0).toUpperCase()}
        </div>
        <div className="ml-3 flex-1">
          <h2 className="font-semibold text-gray-900 text-lg">{getDisplayName(conversation)}</h2>
          <p className="text-sm text-green-600 font-medium">Active</p>
        </div>
      </div>
    </div>
  );
};

// Main Chat Module
const ChatModule = () => {
  const {
    conversations,
    activeConversation,
    messages,
    loadMessages,
    sendMessage,
    setActiveConversation,
    getUnreadCount,
    getTotalUnreadCount,
    loadAvailableUsers,
    availableUsers
  } = useChat();

  const { user } = useAuth();
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      requestAnimationFrame(() => {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
  }, [messages.length, activeConversation?.id]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversation) {
      console.log('Loading messages for conversation:', activeConversation.id);
      loadMessages(activeConversation.id);
    }
  }, [activeConversation, loadMessages]);

  const handleSendMessage = async (text) => {
    if (!activeConversation?.id || !text?.trim()) return;
    await sendMessage(activeConversation.id, text.trim());
  };

  const openNewConversationModal = async () => {
    try {
      await loadAvailableUsers?.();
      console.log('Available users loaded:', availableUsers);
      setUsersLoaded(true);
      setShowNewConversation(true);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    const title = conv.title?.toLowerCase() || '';
    return title.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className={`${isMobile && activeConversation ? 'hidden' : 'flex'} w-full md:w-1/3 lg:w-1/4 flex-col border-r border-gray-200 bg-white`}>
        <div className="p-4 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="flex items-center text-x1 font-bold text-gray-800">Messages
              {getTotalUnreadCount() > 0 && (
                <span className="ml-3 inline-flex items-center justify-center bg-red-600 text-white text-xs font-medium rounded-full px-2 py-0.5">
                  {getTotalUnreadCount()}
                </span>
              )}
            </h1>
            <button 
              onClick={openNewConversationModal}
              className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-md"
              title="New Conversation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all duration-200 border border-transparent focus:border-blue-300 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No conversations found</div>
          ) : (
            filteredConversations.map(conv => (
             <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={activeConversation?.id === conv.id}
                  onSelect={setActiveConversation}
                  unreadCount={getUnreadCount(conv.id)}
                  users={availableUsers}
                />
              ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`${isMobile && !activeConversation ? 'hidden' : 'flex'} flex-1 flex-col bg-gray-50`}>
        {activeConversation ? (
          <>
            <ChatHeader conversation={activeConversation} onBack={() => isMobile && setActiveConversation(null)} users={availableUsers} />
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              <React.Suspense fallback={<LoadingFallback />}>
                <MessageList messages={messages} />
              </React.Suspense>
              <div ref={messagesEndRef} />
            </div>
            <React.Suspense fallback={<div className="p-4 border-t bg-white">Loading...</div>}>
              <MessageInput onSendMessage={handleSendMessage} />
            </React.Suspense>
          </>
        ) : (
          <EmptyChatState onNewChat={openNewConversationModal} />
        )}
      </div>

      {/* New Conversation Modal */}
      {showNewConversation && usersLoaded && (
        <React.Suspense fallback={null}>
          <NewConversationModal onClose={() => {
            setShowNewConversation(false);
            setUsersLoaded(false);
          }} />
        </React.Suspense>
      )}
    </div>
  );
};

export default ChatModule;
