import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  if (conv.conversation_type === 'direct' && conv.participants && conv.participants.length > 0) {
    const participant = conv.participants[0];
    return `${participant.first_name} ${participant.last_name}`;
  }
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

// Conversation Item
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
    getMessagesForConversation,
    loadMessages,
    sendMessage,
    setActiveConversation,
    getUnreadCount,
    getTotalUnreadCount,
    loadAvailableUsers,
    clearConversationMessages
  } = useChat();

  const { user } = useAuth();
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesContainerRef = useRef(null);
  const prevActiveConvIdRef = useRef(null);
  const isLoadingRef = useRef(false); // Track loading state

  // Get messages for active conversation
  const activeMessages = activeConversation 
    ? getMessagesForConversation(activeConversation.id) 
    : [];

  // Auto-scroll to bottom when new messages are added to active conversation
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || !activeConversation) return;
    
    // Scroll to bottom with smooth behavior
    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth'
    });
  }, [activeMessages.length, activeConversation?.id]);

  // SINGLE useEffect to handle conversation changes
  useEffect(() => {
    // If no active conversation, do nothing
    if (!activeConversation) {
      prevActiveConvIdRef.current = null;
      return;
    }

    const currentConvId = activeConversation.id;
    
    // If we're already loading, skip
    if (isLoadingRef.current) {
      console.log('⏭️ Already loading, skipping');
      return;
    }

    // If this is the same conversation, skip
    if (prevActiveConvIdRef.current === currentConvId) {
      console.log('⏭️ Same conversation, skipping load');
      return;
    }

    console.log('💭 Active conversation changed:', currentConvId);
    
    // Clear messages from previous conversation if it exists and is different
    if (prevActiveConvIdRef.current && prevActiveConvIdRef.current !== currentConvId) {
      console.log('🧹 Clearing messages for previous conversation:', prevActiveConvIdRef.current);
      clearConversationMessages(prevActiveConvIdRef.current);
    }
    
    // Set loading flag
    isLoadingRef.current = true;
    
    // Load messages for new conversation
    loadMessages(currentConvId)
      .catch(err => {
        console.error('❌ Error loading messages:', err);
      })
      .finally(() => {
        // Reset loading flag after a delay to prevent rapid reloading
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 100);
      });
    
    // Update previous conversation ID
    prevActiveConvIdRef.current = currentConvId;
    
    // Cleanup function
    return () => {
      // Nothing to cleanup here
    };
  }, [activeConversation, loadMessages, clearConversationMessages]);

  // Separate useEffect to reset loading flag when component unmounts
  useEffect(() => {
    return () => {
      isLoadingRef.current = false;
      prevActiveConvIdRef.current = null;
    };
  }, []);

  const handleSendMessage = useCallback(async (text) => {
    if (!activeConversation?.id || !text?.trim()) return;
    await sendMessage(activeConversation.id, text.trim());
  }, [activeConversation, sendMessage]);

  const openNewConversationModal = useCallback(async () => {
    await loadAvailableUsers?.();
    setShowNewConversation(true);
  }, [loadAvailableUsers]);

  const handleSelectConversation = useCallback((conversation) => {
    console.log('🎯 Selecting conversation:', conversation.id);
    setActiveConversation(conversation);
  }, [setActiveConversation]);

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
              className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-blue-700"
              aria-label="New conversation"
            >
              +
            </button>
          </div>

          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full p-2 bg-gray-100 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </div>
          ) : (
            filteredConversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeConversation?.id === conv.id}
                onSelect={handleSelectConversation}
                unreadCount={getUnreadCount(conv.id)}
              />
            ))
          )}
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
              style={{ minHeight: 0 }}
            >
              <React.Suspense fallback={<LoadingFallback />}>
                <MessageList 
                  messages={activeMessages} 
                  conversationId={activeConversation.id}
                />
              </React.Suspense>
            </div>

            {/* Input (fixed in layout, not scrolling) */}
            <div className="shrink-0 border-t bg-white">
              <React.Suspense fallback={null}>
                <MessageInput 
                  onSendMessage={handleSendMessage} 
                  disabled={!activeConversation}
                />
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