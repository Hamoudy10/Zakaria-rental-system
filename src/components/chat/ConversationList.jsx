import React from 'react';

const ConversationList = ({ conversations, activeConversation, onConversationSelect, getUnreadCount }) => {
    const formatTime = (timestamp) => {
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

    const truncateText = (text, maxLength = 50) => {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    const getConversationTitle = (conversation) => {
        if (conversation.title) return conversation.title;
        
        // For direct messages, show the other participant's name
        if (conversation.participants && conversation.participants.length > 0) {
            return conversation.participants
                .filter(p => p.id !== conversation.created_by)
                .map(p => `${p.first_name} ${p.last_name}`)
                .join(', ');
        }
        
        return 'Unknown Conversation';
    };

    return (
        <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p>No conversations yet.</p>
                    <p className="text-sm">Start a new conversation!</p>
                </div>
            ) : (
                conversations.map(conversation => {
                    const unreadCount = getUnreadCount(conversation.id);
                    const isActive = activeConversation?.id === conversation.id;
                    
                    return (
                        <div
                            key={conversation.id}
                            onClick={() => onConversationSelect(conversation)}
                            className={`p-4 border-b border-gray-100 cursor-pointer transition-colors ${
                                isActive 
                                    ? 'bg-blue-50 border-blue-200' 
                                    : 'hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 min-w-0">
                                    <h4 className={`font-semibold truncate ${
                                        isActive ? 'text-blue-900' : 'text-gray-900'
                                    }`}>
                                        {getConversationTitle(conversation)}
                                    </h4>
                                    <p className={`text-sm truncate ${
                                        isActive ? 'text-blue-700' : 'text-gray-600'
                                    }`}>
                                        {conversation.last_message_text ? (
                                            <>
                                                <span className="font-medium">
                                                    {conversation.last_message_sender}:
                                                </span>{' '}
                                                {truncateText(conversation.last_message_text)}
                                            </>
                                        ) : (
                                            'No messages yet'
                                        )}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end space-y-1 flex-shrink-0 ml-2">
                                    <span className="text-xs text-gray-500 whitespace-nowrap">
                                        {formatTime(conversation.last_message_at)}
                                    </span>
                                    {unreadCount > 0 && (
                                        <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-1 min-w-5 h-5 flex items-center justify-center">
                                            {unreadCount}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center text-xs text-gray-500">
                                <span>{conversation.message_count || 0} messages</span>
                                <span className="mx-2">•</span>
                                <span>{conversation.participants?.length || 0} participants</span>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default ConversationList;