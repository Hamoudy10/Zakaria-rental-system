// src/components/chat/MessageItem.jsx
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const MessageItem = ({ message, showAvatar = true }) => {
  const { user } = useAuth();
  const isOwnMessage = message.sender_id === user?.id;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Get sender initials for avatar
  const getInitials = () => {
    const first = message.first_name?.charAt(0) || '';
    const last = message.last_name?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  };

  // Generate avatar color based on sender_id
  const getAvatarColor = () => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 
      'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
      'bg-orange-500', 'bg-cyan-500', 'bg-rose-500'
    ];
    const hash = message.sender_id?.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
    return colors[hash % colors.length];
  };

  // Read receipt icon
  const ReadReceipt = () => {
    if (!isOwnMessage) return null;
    
    const status = message.status || 'sent';
    
    // Single gray check for sent
    if (status === 'sent') {
      return (
        <svg className="w-4 h-4 text-gray-400 inline-block ml-1" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 8l4 4L14 4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    
    // Double gray check for delivered
    if (status === 'delivered') {
      return (
        <svg className="w-4 h-4 text-gray-400 inline-block ml-1" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 8l3 3L12 4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 8l3 3L16 4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    
    // Double blue check for read
    if (status === 'read') {
      return (
        <svg className="w-4 h-4 text-blue-500 inline-block ml-1" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 8l3 3L12 4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 8l3 3L16 4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    
    return null;
  };

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-1 group`}>
      {/* Avatar for other users */}
      {!isOwnMessage && showAvatar && (
        <div className="flex-shrink-0 mr-2 self-end mb-1">
          {message.profile_image ? (
            <img 
              src={message.profile_image} 
              alt={message.first_name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className={`w-8 h-8 rounded-full ${getAvatarColor()} flex items-center justify-center text-white text-xs font-semibold`}>
              {getInitials()}
            </div>
          )}
        </div>
      )}

      {/* Message Bubble */}
      <div className={`relative max-w-[75%] ${isOwnMessage ? 'order-1' : 'order-2'}`}>
        {/* WhatsApp-style bubble tail */}
        <div 
          className={`absolute top-0 w-3 h-3 ${
            isOwnMessage 
              ? 'right-[-6px] bg-[#dcf8c6]' 
              : 'left-[-6px] bg-white'
          }`}
          style={{
            clipPath: isOwnMessage 
              ? 'polygon(0 0, 100% 0, 0 100%)' 
              : 'polygon(100% 0, 0 0, 100% 100%)'
          }}
        />

        <div 
          className={`relative rounded-lg px-3 py-2 shadow-sm ${
            isOwnMessage 
              ? 'bg-[#dcf8c6] rounded-tr-none' 
              : 'bg-white rounded-tl-none'
          }`}
        >
          {/* Sender name for group chats */}
          {!isOwnMessage && message.first_name && (
            <p className="text-xs font-semibold text-green-700 mb-1">
              {message.first_name} {message.last_name}
            </p>
          )}

          {/* Image message */}
          {message.image_url && (
            <div className="mb-2">
              {!imageLoaded && !imageError && (
                <div className="w-48 h-48 bg-gray-200 rounded-lg animate-pulse flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              {imageError ? (
                <div className="w-48 h-24 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                  Failed to load image
                </div>
              ) : (
                <img 
                  src={message.image_url} 
                  alt="Shared image"
                  className={`max-w-[200px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity ${imageLoaded ? '' : 'hidden'}`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                  onClick={() => window.open(message.image_url, '_blank')}
                />
              )}
            </div>
          )}

          {/* Text message */}
          {message.message_text && (
            <p className="text-sm text-gray-800 leading-relaxed break-words whitespace-pre-wrap">
              {message.message_text}
            </p>
          )}

          {/* Time and read receipt */}
          <div className={`flex items-center justify-end gap-1 mt-1 ${isOwnMessage ? 'text-gray-500' : 'text-gray-400'}`}>
            <span className="text-[11px]">{formatTime(message.created_at)}</span>
            <ReadReceipt />
          </div>
        </div>
      </div>

      {/* Spacer for own messages to push avatar area */}
      {isOwnMessage && showAvatar && (
        <div className="w-10 flex-shrink-0" />
      )}
    </div>
  );
};

export default MessageItem;