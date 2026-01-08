import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';

/**
 * =====================================================
 * Shared Helpers
 * =====================================================
 */
const getDisplayName = (conv) => {
  if (!conv) return 'Conversation';
  if (typeof conv.display_name === 'string' && conv.display_name.trim()) return conv.display_name;
  if (typeof conv.title === 'string' && conv.title.trim()) return conv.title;
  return 'Conversation';
};

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
      <h2 className="text-2xl font-bold text-gray-800 mb-2">No conversation selected</h2>
      <p className="text-gray-600 mb-6">
        Choose a conversation from the sidebar or start a new chat.
      </p>
      <button
        onClick={onNewChat}
        className="bg-gradient-to-br from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold"
      >
        Start New Conversation
      </button>
    </div>
  </div>
);

// Conversation Item (unchanged)
const ConversationItem = ({ conversation, isActive, onSelect, unreadCount }) => {
  const displayName = getDisplayName(conversation);

  return (
    <div
      onClick={() => onSelect(conversation)}
      className={`flex items-center p-4 border-b border-gray-100 cursor-pointer ${
        isActive ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex-1 min-w-0 ml-2">
        <h3 className="font-semibold truncate text-sm">{displayName}</h3>
        <p className="text-xs text-gray-500 truncate">
          {conversation.last_message || 'No messages yet'}
        </p>
      </div>

      {unreadCount > 0 && (
        <span className="ml-2 bg-green-500 text-white text-xs rounded-full px-2">
          {unreadCount}
        </span>
      )}
    </div>
  );
};

// Chat Header
const ChatHeader = ({ conversation, onBack }) => {
  if (!conversation) return null;

  const displayName = getDisplayName(conversation);

  return (
    <div className="shrink-0 bg-white border-b border-gray-200 p-4">
      <div className="flex items-center">
        <button
          onClick={onBack}
          className="md:hidden mr-3 p-2 rounded hover:bg-gray-100"
        >
          ←
        </button>
        <h2 className="font-semibold text-gray-900 text-lg truncate">
          {displayName}
        </h2>
      </div>
    </div>
  );
};

// =====================================================
// MAIN CHAT MODULE
// =====================================================
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
    loadAvailableUsers
  } = useChat();

  const { user } = useAuth();
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesContainerRef = useRef(null);

  // Auto-scroll messages ONLY
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, activeConversation?.id]);

  // Load messages on conversation change
  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation.id);
    }
  }, [activeConversation, loadMessages]);

  const handleSendMessage = async (text) => {
    if (!activeConversation?.id || !text?.trim()) return;
    await sendMessage(activeConversation.id, text.trim());
  };

  const openNewConversationModal = async () => {
    await loadAvailableUsers?.();
    setShowNewConversation(true);
  };

  const filteredConversations = conversations.filter(conv =>
    getDisplayName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className="
        fixed inset-x-0 bottom-0
        top-[3.5rem]
        bg-white
        flex
      "
    >
      {/* Sidebar */}
      <div className="hidden md:flex w-1/3 lg:w-1/4 flex-col border-r bg-white">
        <div className="p-4 border-b">
          <div className="flex justify-between items-center mb-3">
            <h1 className="font-bold text-lg">
              Messages
              {getTotalUnreadCount() > 0 && (
                <span className="ml-2 text-xs bg-red-600 text-white px-2 rounded-full">
                  {getTotalUnreadCount()}
                </span>
              )}
            </h1>
            <button
              onClick={openNewConversationModal}
              className="bg-blue-600 text-white rounded-full w-8 h-8"
            >
              +
            </button>
          </div>

          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full p-2 bg-gray-100 rounded"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map(conv => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={activeConversation?.id === conv.id}
              onSelect={setActiveConversation}
              unreadCount={getUnreadCount(conv.id)}
            />
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeConversation ? (
          <>
            <ChatHeader
              conversation={activeConversation}
              onBack={() => setActiveConversation(null)}
            />

            {/* Messages (ONLY scrollable area) */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 overscroll-contain"
            >
              <React.Suspense fallback={<LoadingFallback />}>
                <MessageList messages={messages} />
              </React.Suspense>
            </div>

            {/* Input (fixed in layout, not scrolling) */}
            <div className="shrink-0 border-t bg-white">
              <React.Suspense fallback={null}>
                <MessageInput onSendMessage={handleSendMessage} />
              </React.Suspense>
            </div>
          </>
        ) : (
          <EmptyChatState onNewChat={openNewConversationModal} />
        )}
      </div>

      {showNewConversation && (
        <React.Suspense fallback={null}>
          <NewConversationModal onClose={() => setShowNewConversation(false)} />
        </React.Suspense>
      )}
    </div>
  );
};

export default ChatModule;
