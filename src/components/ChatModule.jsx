import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../context/chatcontext';
import { useAuth } from '../context/AuthContext';

// Import components
const ConversationList = React.lazy(() => import('./chat/ConversationList'));
const MessageList = React.lazy(() => import('./chat/MessageList'));
const MessageInput = React.lazy(() => import('./chat/MessageInput'));
const NewConversationModal = React.lazy(() => import('./chat/NewConversationModal'));

// Loading fallback
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-32">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
);

// Empty Chat State Component
const EmptyChatState = ({ onNewChat }) => {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md p-8">
        <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">No conversation selected</h2>
        <p className="text-gray-600 mb-6">
          Choose a conversation from the sidebar or start a new chat to begin messaging.
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
};

// Conversation Item Component
const ConversationItem = ({ conversation, isActive, onSelect, unreadCount, currentUserId }) => {
  const getDisplayName = (conv) => {
    if (conv.title) return conv.title;
    const otherParticipants = conv.participants?.filter(p => p.id !== currentUserId);
    return otherParticipants?.map(p => `${p.first_name} ${p.last_name}`).join(', ') || 'Unknown';
  };

  const getLastMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const truncateText = (text, maxLength = 40) => {
    if (!text) return 'No messages yet';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div
      onClick={() => onSelect(conversation)}
      className={`flex items-center p-4 border-b border-gray-100 cursor-pointer transition-all duration-200 ${
        isActive 
          ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-l-blue-500' 
          : 'hover:bg-gray-50'
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
          {truncateText(conversation.last_message_text)}
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

// Chat Header Component
const ChatHeader = ({ conversation, currentUserId, onBack }) => {
  const getHeaderTitle = (conv) => {
    if (conv.title) return conv.title;
    const otherParticipants = conv.participants?.filter(p => p.id !== currentUserId);
    return otherParticipants?.map(p => `${p.first_name} ${p.last_name}`).join(', ') || 'Unknown';
  };

  const getStatusText = (conv) => {
    const participantCount = conv.participants?.length || 0;
    if (participantCount > 2) {
      return `${participantCount} participants`;
    }
    return 'Online';
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
          {getHeaderTitle(conversation).charAt(0).toUpperCase()}
        </div>
        
        <div className="ml-3 flex-1">
          <h2 className="font-semibold text-gray-900 text-lg">{getHeaderTitle(conversation)}</h2>
          <p className="text-sm text-green-600 font-medium">{getStatusText(conversation)}</p>
        </div>

        <div className="flex space-x-2">
          <button className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// Main Chat Module Component
const ChatModule = () => {
  const {
    conversations,
    activeConversation,
    messages,
    loadMessages,
    sendMessage,
    setActiveConversation,
    startTyping,
    stopTyping,
    joinConversation,
    leaveConversation,
    getUnreadCount,
    getTotalUnreadCount,
    loadAvailableUsers
  } = useChat();

  const { user } = useAuth();
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef(null);

  // Filter conversations based on search
  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    const title = conv.title?.toLowerCase() || '';
    const participantNames = conv.participants?.map(p => 
      `${p.first_name} ${p.last_name}`.toLowerCase()
    ).join(' ') || '';
    
    return title.includes(searchLower) || participantNames.includes(searchLower);
  });

  // Responsive breakpoints
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-scroll to latest message when messages change or active conversation changes
  useEffect(() => {
    if (!messagesEndRef.current) return;
    requestAnimationFrame(() => {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [messages.length, activeConversation?.id]);

  useEffect(() => {
    if (activeConversation) {
      joinConversation(activeConversation.id);
      loadMessages(activeConversation.id);
      return () => leaveConversation(activeConversation.id);
    }
  }, [activeConversation, joinConversation, leaveConversation, loadMessages]);

  const handleSendMessage = async (arg1, arg2) => {
    let conversationId = arg1;
    let messageText = arg2;

    if (typeof arg2 === 'undefined') {
      messageText = arg1;
      conversationId = activeConversation?.id;
    }

    if (!conversationId || !messageText?.trim()) return;
    await sendMessage(conversationId, messageText.trim());
  };

  const handleTypingStart = () => {
    if (activeConversation) startTyping(activeConversation.id);
  };

  const handleTypingStop = () => {
    if (activeConversation) stopTyping(activeConversation.id);
  };

  // New: Load users before opening modal
  const openNewConversationModal = async () => {
    try {
      await loadAvailableUsers();
      setUsersLoaded(true);
      setShowNewConversation(true);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Conversation Sidebar */}
      <div className={`${isMobile && activeConversation ? 'hidden' : 'flex'} w-full md:w-1/3 lg:w-1/4 flex-col border-r border-gray-200 bg-white`}>
        {/* Sidebar Header */}
        <div className="p-4 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="flex items-center text-x1 font-bold text-gray-800">Messages
              {getTotalUnreadCount() > 0 && (
                <span className="ml-3 inline-flex items-center justify-center bg-red-600 text-white text-xs font-medium rounded-full px-2 py-0.5">
                  {getTotalUnreadCount()}
                </span>
              )}
            </h1>
            <div className="flex space-x-2">
              <button 
                onClick={openNewConversationModal} // updated
                className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-md"
                title="New Conversation"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all duration-200 border border-transparent focus:border-blue-300 text-sm"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center justify-center">
              <svg 
                className="w-3.5 h-3.5 text-gray-500" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p>No conversations found</p>
            </div>
          ) : (
            filteredConversations.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={activeConversation?.id === conversation.id}
                onSelect={setActiveConversation}
                unreadCount={getUnreadCount(conversation.id)}
                currentUserId={user?.id}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`${isMobile && !activeConversation ? 'hidden' : 'flex'} flex-1 flex-col bg-gray-50`}>
        {activeConversation ? (
          <>
            <ChatHeader 
              conversation={activeConversation} 
              currentUserId={user?.id}
              onBack={() => isMobile && setActiveConversation(null)}
            />
            
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              <React.Suspense fallback={<LoadingFallback />}>
                <MessageList messages={messages} />
              </React.Suspense>
              <div ref={messagesEndRef} />
            </div>

            <React.Suspense fallback={<div className="p-4 border-t bg-white">Loading...</div>}>
              <MessageInput
                onSendMessage={handleSendMessage}
                onTypingStart={handleTypingStart}
                onTypingStop={handleTypingStop}
                conversationId={activeConversation.id}
              />
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
