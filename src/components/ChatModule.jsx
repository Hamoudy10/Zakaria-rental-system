// src/components/ChatModule.jsx
import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';

// Lazy-loaded components
const MessageList = React.lazy(() => import('./chat/MessageList'));
const MessageInput = React.lazy(() => import('./chat/MessageInput'));
const NewConversationModal = React.lazy(() => import('./chat/NewConversationModal'));

// Loading fallback
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-32">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
  </div>
);

// Get display name for conversation
const getDisplayName = (conv, currentUserId) => {
  if (!conv) return 'Conversation';
  
  // Group chat - use title
  if (conv.conversation_type === 'group' && conv.title) {
    return conv.title;
  }
  
  // Direct chat - use other participant's name
  if (conv.participants && conv.participants.length > 0) {
    const otherParticipant = conv.participants.find(p => p.id !== currentUserId) || conv.participants[0];
    if (otherParticipant) {
      return `${otherParticipant.first_name} ${otherParticipant.last_name}`;
    }
  }
  
  // Fallbacks
  if (conv.display_name) return conv.display_name;
  if (conv.title) return conv.title;
  
  return 'Conversation';
};

// Get avatar for conversation
const getConversationAvatar = (conv, currentUserId) => {
  if (!conv) return { initials: '?', image: null, color: 'bg-gray-500' };
  
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 
    'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
    'bg-orange-500', 'bg-cyan-500', 'bg-rose-500'
  ];
  
  if (conv.conversation_type === 'group') {
    return {
      initials: (conv.title || 'G').slice(0, 2).toUpperCase(),
      image: null,
      color: 'bg-indigo-500'
    };
  }
  
  if (conv.participants && conv.participants.length > 0) {
    const other = conv.participants.find(p => p.id !== currentUserId) || conv.participants[0];
    if (other) {
      const hash = other.id?.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
      return {
        initials: `${other.first_name?.charAt(0) || ''}${other.last_name?.charAt(0) || ''}`.toUpperCase(),
        image: other.profile_image,
        color: colors[hash % colors.length],
        id: other.id
      };
    }
  }
  
  return { initials: '?', image: null, color: 'bg-gray-500' };
};

// Format timestamp for conversation list
const formatConversationTime = (timestamp) => {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
};

// Empty state component
const EmptyChatState = ({ onNewChat }) => (
  <div className="flex-1 flex flex-col items-center justify-center bg-slate-50">
    <div className="text-center max-w-md p-8">
      <div className="w-64 h-48 mx-auto mb-6 text-slate-200">
        <svg viewBox="0 0 303 172" fill="currentColor" className="w-full h-full">
          <path d="M229.565 160.229c-1.224.238-2.462.335-3.707.29-10.283-.373-20.014-4.652-27.109-11.934l-1.158-1.185c-2.087-2.138-3.97-4.476-5.624-6.983-5.443-8.249-8.045-18.021-7.37-27.733l.205-2.948c.12-1.721.37-3.432.748-5.119.249-1.108 1.322-1.801 2.431-1.569 1.11.234 1.823 1.318 1.574 2.426-.34 1.519-.562 3.062-.665 4.611l-.205 2.948c-.607 8.721 1.733 17.492 6.621 24.892 1.487 2.25 3.177 4.345 5.049 6.265l1.158 1.185c6.371 6.535 15.106 10.38 24.35 10.715 1.06.039 2.116-.044 3.158-.248 1.117-.218 2.193.509 2.403 1.626.209 1.116-.516 2.192-1.634 2.412-.075.015-.15.027-.225.039z"/>
          <path d="M150.5 85c27.614 0 50-22.386 50-50s-22.386-50-50-50-50 22.386-50 50 22.386 50 50 50zm0-10c-22.091 0-40-17.909-40-40s17.909-40 40-40 40 17.909 40 40-17.909 40-40 40z"/>
        </svg>
      </div>
      <h2 className="text-2xl font-light text-slate-700 mb-2">Zakaria Rental Chat</h2>
      <p className="text-slate-500 text-center mb-6">
        Send and receive messages with your team.<br />
        Select a conversation or start a new one.
      </p>
      <button
        onClick={onNewChat}
        className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
      >
        Start New Conversation
      </button>
    </div>
  </div>
);

// Conversation list item
const ConversationItem = ({ 
  conversation, 
  isActive, 
  onSelect, 
  unreadCount, 
  currentUserId,
  isOnline,
  isTyping
}) => {
  const displayName = getDisplayName(conversation, currentUserId);
  const avatar = getConversationAvatar(conversation, currentUserId);

  return (
    <div
      onClick={() => onSelect(conversation)}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${
        isActive 
          ? 'bg-slate-100' 
          : 'hover:bg-slate-50'
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {avatar.image ? (
          <img 
            src={avatar.image} 
            alt={displayName}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className={`w-12 h-12 rounded-full ${avatar.color} flex items-center justify-center text-white font-semibold`}>
            {avatar.initials}
          </div>
        )}
        {/* Online status for direct chats */}
        {conversation.conversation_type !== 'group' && isOnline && (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900 truncate">{displayName}</h3>
          <span className={`text-xs flex-shrink-0 ml-2 ${unreadCount > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
            {formatConversationTime(conversation.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-sm text-gray-500 truncate">
            {isTyping ? (
              <span className="text-green-600 italic">typing...</span>
            ) : (
              conversation.last_message || 'No messages yet'
            )}
          </p>
          {unreadCount > 0 && (
            <span className="ml-2 bg-green-500 text-white text-xs rounded-full px-2 py-0.5 font-medium flex-shrink-0">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// Chat header component
const ChatHeader = ({ 
  conversation, 
  onBack, 
  onClose, 
  currentUserId, 
  isOnline,
  lastSeen,
  typingUsers
}) => {
  if (!conversation) return null;

  const displayName = getDisplayName(conversation, currentUserId);
  const avatar = getConversationAvatar(conversation, currentUserId);
  const isGroup = conversation.conversation_type === 'group';
  const participantCount = conversation.participants?.length || 0;

  // Format last seen
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMins = Math.floor((now - date) / (1000 * 60));
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString();
  };

  // Status text
  const getStatusText = () => {
    if (typingUsers && typingUsers.length > 0) {
      if (typingUsers.length === 1) {
        return <span className="text-green-600">{typingUsers[0]} is typing...</span>;
      }
      return <span className="text-green-600">{typingUsers.length} people typing...</span>;
    }
    
    if (isGroup) {
      return `${participantCount} participants`;
    }
    
    if (isOnline) {
      return <span className="text-green-600">online</span>;
    }
    
    if (lastSeen) {
      return `last seen ${formatLastSeen(lastSeen)}`;
    }
    
    return 'offline';
  };

  return (
    <div className="h-16 bg-slate-100 flex items-center justify-between px-4 shrink-0 border-b border-gray-200">
      <div className="flex items-center gap-3 min-w-0">
        {/* Back button (mobile) */}
        <button 
          onClick={onBack}
          className="md:hidden w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center flex-shrink-0"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {avatar.image ? (
            <img 
              src={avatar.image} 
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className={`w-10 h-10 rounded-full ${avatar.color} flex items-center justify-center text-white font-semibold text-sm`}>
              {avatar.initials}
            </div>
          )}
          {!isGroup && isOnline && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-100" />
          )}
        </div>

        {/* Name and status */}
        <div className="min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{displayName}</h3>
          <p className="text-xs text-gray-500 truncate">{getStatusText()}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center">
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button 
          onClick={onClose}
          className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// Main ChatModule component
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
    clearConversationMessages,
    isUserOnline,
    getTypingUsers,
    onlineUsers
  } = useChat();

  const { user } = useAuth();

  const [showNewConversation, setShowNewConversation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesContainerRef = useRef(null);
  const prevActiveConvIdRef = useRef(null);
  const isLoadingRef = useRef(false);

  const activeMessages = activeConversation 
    ? getMessagesForConversation(activeConversation.id) 
    : [];

  const typingUsers = activeConversation 
    ? getTypingUsers(activeConversation.id)
    : [];

  // Check if other participant is online (for direct chats)
  const getOtherParticipantOnlineStatus = (conv) => {
    if (!conv || conv.conversation_type === 'group') return false;
    const other = conv.participants?.find(p => p.id !== user?.id);
    return other ? isUserOnline(other.id) : false;
  };

  // Check if someone is typing in a conversation
  const getConversationTypingStatus = (conv) => {
    const typing = getTypingUsers(conv.id);
    return typing && typing.length > 0;
  };

  // Close active chat
  const handleCloseChat = useCallback(() => {
    if (activeConversation?.id) {
      clearConversationMessages(activeConversation.id);
    }
    setActiveConversation(null);
    prevActiveConvIdRef.current = null;
  }, [setActiveConversation, clearConversationMessages, activeConversation]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || !activeConversation) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [activeMessages.length, activeConversation?.id]);

  // Load messages when conversation changes
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

  // Send message handler
  const handleSendMessage = useCallback(async (text, imageUrl = null) => {
    if (!activeConversation?.id) return;
    if (!text?.trim() && !imageUrl) return;
    await sendMessage(activeConversation.id, text?.trim() || '', imageUrl);
  }, [activeConversation, sendMessage]);

  // Open new conversation modal
  const openNewConversationModal = useCallback(async () => {
    await loadAvailableUsers?.();
    setShowNewConversation(true);
  }, [loadAvailableUsers]);

  // Select conversation handler
  const handleSelectConversation = useCallback((conversation) => {
    setActiveConversation(conversation);
  }, [setActiveConversation]);

  // Filter conversations by search
  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    const name = getDisplayName(conv, user?.id).toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 bg-white flex">
      
      {/* Sidebar - Conversations List */}
      <div className={`
        ${activeConversation ? 'hidden md:flex' : 'flex'} 
        w-full md:w-96 lg:w-[420px] flex-col border-r border-gray-200 bg-white shrink-0
      `}>
        {/* Sidebar Header */}
        <div className="h-16 bg-slate-100 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            {user?.profile_image ? (
              <img 
                src={user.profile_image} 
                alt="Profile"
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                {user?.first_name?.charAt(0)}{user?.last_name?.charAt(0)}
              </div>
            )}
            <span className="font-semibold text-gray-800">Chats</span>
            {getTotalUnreadCount() > 0 && (
              <span className="bg-green-500 text-white text-xs rounded-full px-2 py-0.5 font-medium">
                {getTotalUnreadCount()}
              </span>
            )}
          </div>
          <button
            onClick={openNewConversationModal}
            className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors"
            title="New chat"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 bg-white">
          <div className="relative">
            <input
              type="text"
              placeholder="Search or start new chat"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-12 pr-4 bg-slate-100 rounded-lg text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-500 transition-all"
            />
            <svg className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">
                {searchQuery ? 'No conversations found' : 'No conversations yet'}
              </p>
              {!searchQuery && (
                <button
                  onClick={openNewConversationModal}
                  className="mt-3 text-green-600 hover:text-green-700 text-sm font-medium"
                >
                  Start a new chat
                </button>
              )}
            </div>
          ) : (
            filteredConversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeConversation?.id === conv.id}
                onSelect={handleSelectConversation}
                unreadCount={getUnreadCount(conv.id)}
                currentUserId={user?.id}
                isOnline={getOtherParticipantOnlineStatus(conv)}
                isTyping={getConversationTypingStatus(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`
        ${activeConversation ? 'flex' : 'hidden md:flex'} 
        flex-1 flex-col min-w-0
      `}>
        {activeConversation ? (
          <>
            {/* Chat Header */}
            <ChatHeader
              conversation={activeConversation}
              onBack={handleCloseChat}
              onClose={handleCloseChat}
              currentUserId={user?.id}
              isOnline={getOtherParticipantOnlineStatus(activeConversation)}
              typingUsers={typingUsers}
            />

            {/* Messages Area - WhatsApp style background */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-4 py-2"
              style={{
                backgroundColor: '#efeae2',
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
              }}
            >
              <Suspense fallback={<LoadingSpinner />}>
                <MessageList 
                  messages={activeMessages} 
                  typingUsers={typingUsers}
                  conversationId={activeConversation.id}
                />
              </Suspense>
            </div>

            {/* Message Input */}
            <Suspense fallback={null}>
              <MessageInput 
                onSendMessage={handleSendMessage}
                conversationId={activeConversation.id}
                disabled={false}
              />
            </Suspense>
          </>
        ) : (
          <EmptyChatState onNewChat={openNewConversationModal} />
        )}
      </div>

      {/* New Conversation Modal */}
      {showNewConversation && (
        <Suspense fallback={null}>
          <NewConversationModal onClose={() => setShowNewConversation(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default ChatModule;
