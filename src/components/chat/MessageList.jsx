// src/components/chat/MessageList.jsx
import React, { useEffect, useRef } from 'react';
import MessageItem from './MessageItem';

const TypingIndicator = ({ typingUsers }) => {
  if (!typingUsers || typingUsers.length === 0) return null;

  const text = typingUsers.length === 1 
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length === 2
    ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
    : `${typingUsers[0]} and ${typingUsers.length - 1} others are typing...`;

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="bg-white rounded-lg px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-gray-500 italic">{text}</span>
        </div>
      </div>
    </div>
  );
};

const DateDivider = ({ date }) => {
  const formatDate = (dateStr) => {
    const messageDate = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return messageDate.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  };

  return (
    <div className="flex items-center justify-center my-4">
      <div className="bg-white/80 backdrop-blur-sm text-gray-600 text-xs px-3 py-1 rounded-lg shadow-sm">
        {formatDate(date)}
      </div>
    </div>
  );
};

const MessageList = ({ messages, typingUsers = [], conversationId }) => {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  // Group messages by date
  const groupMessagesByDate = (messages) => {
    const groups = [];
    let currentDate = null;

    messages.forEach((message, index) => {
      const messageDate = new Date(message.created_at).toDateString();
      
      if (messageDate !== currentDate) {
        currentDate = messageDate;
        groups.push({ type: 'date', date: message.created_at, key: `date-${index}` });
      }
      
      // Determine if we should show avatar (first message or different sender)
      const prevMessage = index > 0 ? messages[index - 1] : null;
      const showAvatar = !prevMessage || 
        prevMessage.sender_id !== message.sender_id ||
        new Date(message.created_at).toDateString() !== new Date(prevMessage.created_at).toDateString();
      
      groups.push({ 
        type: 'message', 
        message, 
        showAvatar,
        key: message.id 
      });
    });

    return groups;
  };

  const groupedItems = groupMessagesByDate(messages);

  return (
    <div ref={containerRef} className="flex flex-col min-h-full">
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">No messages yet</p>
            <p className="text-gray-400 text-xs mt-1">Start the conversation!</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-1 py-2">
          {groupedItems.map((item) => {
            if (item.type === 'date') {
              return <DateDivider key={item.key} date={item.date} />;
            }
            return (
              <MessageItem 
                key={item.key} 
                message={item.message} 
                showAvatar={item.showAvatar}
              />
            );
          })}
          
          {/* Typing indicator */}
          <TypingIndicator typingUsers={typingUsers} />
        </div>
      )}
      
      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;