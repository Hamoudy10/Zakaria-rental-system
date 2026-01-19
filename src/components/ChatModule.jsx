import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';

/**
 * Shared Helpers
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

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-32">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
);

// Empty Chat State (The Initial View)
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

// Chat Header with X Button
const ChatHeader = ({ conversation, onBack, onClose }) => {
  if (!conversation) return null;
  const displayName = getDisplayName(conversation);

  return (
    <div className="shrink-0 bg-white border-b border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0">
          {/* Back button for mobile */}
          <button onClick={onBack} className="md:hidden mr-3 p-2 rounded hover:bg-gray-100">
            ←
          </button>
          <h2 className="font-semibold text-gray-900 text-lg truncate">
            {displayName}
          </h2>
        </div>
        
        {/* The X Button: Calls the onClose handler passed from parent */}
        <button 
          type="button"
          onClick={onClose} 
          className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
          aria-label="Close message panel"
          title="Close message panel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
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

  const [showNewConversation, setShowNewConversation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesContainerRef = useRef(null);
  const prevActiveConvIdRef = useRef(null);
  const isLoadingRef = useRef(false);

  const activeMessages = activeConversation 
    ? getMessagesForConversation(activeConversation.id) 
    : [];

  // Function to close the chat view and return to Empty State
  const handleCloseChat = useCallback(() => {
    console.log('👋 Closing active conversation panel.');
    // 1. Clear the active conversation state (This now works because we fixed ChatContext)
    setActiveConversation(null); 
    // 2. Reset the ref to ensure subsequent clicks re-trigger message loading
    prevActiveConvIdRef.current = null; 
    // 3. Clear messages from memory if they exist (using ID captured in closure)
    if (activeConversation?.id) {
      clearConversationMessages(activeConversation.id);
    }
  }, [setActiveConversation, clearConversationMessages, activeConversation]);

  // --- Effects and Handlers ---

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || !activeConversation) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [activeMessages.length, activeConversation?.id]);

  useEffect(() => {
    if (!activeConversation) return;
    
    const currentConvId = activeConversation.id;
    if (isLoadingRef.current || prevActiveConvIdRef.current === currentConvId) return;

    if (prevActiveConvIdRef.current && prevActiveConvIdRef.current !== currentConvId) {
      clearConversationMessages(prevActiveConvIdRef.current);
    }
    
    isLoadingRef.current = true;
    loadMessages(currentConvId).finally(() => {
      setTimeout(() => { isLoadingRef.current = false; }, 100);
    });
    prevActiveConvIdRef.current = currentConvId;
  }, [activeConversation, loadMessages, clearConversationMessages]);

  const handleSendMessage = useCallback(async (text) => {
    if (!activeConversation?.id || !text?.trim()) return;
    await sendMessage(activeConversation.id, text.trim());
  }, [activeConversation, sendMessage]);

  const openNewConversationModal = useCallback(async () => {
    await loadAvailableUsers?.();
    setShowNewConversation(true);
  }, [loadAvailableUsers]);

  const handleSelectConversation = useCallback((conversation) => {
    setActiveConversation(conversation);
  }, [setActiveConversation]);

  const filteredConversations = conversations.filter(conv =>
    getDisplayName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-x-0 bottom-0 top-[3.5rem] bg-white flex">
      
      {/* Sidebar (Left Panel) - Always visible on desktop, hidden on mobile if chat is open */}
      <div className={`
        ${activeConversation ? 'hidden md:flex' : 'flex'} 
        w-1/3 lg:w-1/4 flex-col border-r bg-white shrink-0
      `}>
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
            >
              +
            </button>
          </div>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full p-2 bg-gray-100 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* Chat Area (Right Panel) - Shows Chat or Empty State */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConversation ? (
          <>
            <ChatHeader
              conversation={activeConversation}
              onBack={handleCloseChat}
              onClose={handleCloseChat} 
            />
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 bg-gray-50"
              style={{ minHeight: 0 }}
            >
              <React.Suspense fallback={<LoadingFallback />}>
                <MessageList messages={activeMessages} conversationId={activeConversation.id} />
              </React.Suspense>
            </div>
            <div className="shrink-0 border-t bg-white p-2">
              <React.Suspense fallback={null}>
                <MessageInput onSendMessage={handleSendMessage} disabled={!activeConversation} />
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