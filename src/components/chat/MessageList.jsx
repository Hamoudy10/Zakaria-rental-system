import React from 'react';
import { useChat } from '../../context/chatcontext';
import MessageItem from './MessageItem';
import TypingIndicator from './TypingIndicator';

const MessageList = ({ messages, onLoadMore }) => {
    const { typingUsers, activeConversation } = useChat();
    
    const currentTypingUsers = activeConversation ? typingUsers[activeConversation.id] || [] : [];

    return (
        <div className="space-y-4">
            {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                    <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-gray-600">No messages yet. Start the conversation!</p>
                </div>
            ) : (
                <>
                    {messages.map(message => (
                        <MessageItem key={message.id} message={message} />
                    ))}
                    <TypingIndicator users={currentTypingUsers} />
                </>
            )}
        </div>
    );
};

export default MessageList;