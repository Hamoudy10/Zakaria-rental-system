import React from 'react';

const TypingIndicator = ({ users }) => {
    if (!users || users.length === 0) return null;

    return (
        <div className="flex items-center space-x-2 text-gray-500 text-sm italic py-2">
            <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span>
                {users.length === 1 
                    ? `${users[0].userName} is typing...`
                    : `${users.length} people are typing...`
                }
            </span>
        </div>
    );
};

export default TypingIndicator;