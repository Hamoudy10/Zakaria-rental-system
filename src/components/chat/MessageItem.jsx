import React from 'react';
import { useAuth } from '../../context/AuthContext';

const MessageItem = ({ message }) => {
    const { user } = useAuth();
    const isOwnMessage = message.sender_id === user.id;

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };

    return (
        <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md rounded-lg px-4 py-2 ${
                isOwnMessage 
                    ? 'bg-blue-600 text-white rounded-br-none' 
                    : 'bg-gray-200 text-gray-900 rounded-bl-none'
            }`}>
                {!isOwnMessage && (
                    <div className="font-semibold text-sm mb-1">
                        {message.first_name} {message.last_name}
                    </div>
                )}
                <div className="break-words">{message.message_text}</div>
                <div className={`text-xs mt-1 ${
                    isOwnMessage ? 'text-blue-100' : 'text-gray-500'
                }`}>
                    {formatTime(message.created_at)}
                    {message.is_read && isOwnMessage && (
                        <span className="ml-2">✓ Read</span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MessageItem;