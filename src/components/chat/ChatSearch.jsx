import React, { useState } from 'react';
import { useChat } from '../../context/chatcontext';

const ChatSearch = ({ onClose }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const { searchMessages, markAsRead } = useChat();

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        try {
            const searchResults = await searchMessages(query);
            setResults(searchResults);
        } catch (error) {
            console.error('Search failed:', error);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Search Messages</h3>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <form onSubmit={handleSearch} className="flex space-x-2">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for messages..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    type="submit"
                    disabled={!query.trim() || isSearching}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isSearching ? '...' : 'Search'}
                </button>
            </form>

            {results.length > 0 && (
                <div className="border border-gray-200 rounded-lg">
                    <div className="p-3 bg-gray-50 border-b border-gray-200">
                        <h4 className="font-semibold text-sm text-gray-700">
                            Found {results.length} results
                        </h4>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {results.map((result) => {
                           const unread = result.is_read === false;
                            return (
                                <div
                                    key={result.id}
                                    onClick={async () => {
                                        try {
                                            if (unread) {
                                                await markAsRead([result.id]);
                                                // Optimistic UI update:
                                                setResults(prev => prev.map(r => r.id === result.id ? { ...r, is_read: true } : r));
                                            }
                                            // Optionally close search or navigate to conversation
                                            // onClose();
                                        } catch (err) {
                                            console.error('Failed to mark message read:', err);
                                        }
                                    }}
                                    className={`p-3 border-b border-gray-100 last:border-b-0 cursor-pointer transition-colors ${
                                        unread ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`font-semibold text-sm ${unread ? 'text-blue-900' : 'text-gray-900'}`}>
                                            {result.first_name} {result.last_name}
                                        </span>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-xs text-gray-500">{formatTime(result.created_at)}</span>
                                            {unread && (
                                                <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">New</span>
                                            )}
                                        </div>
                                    </div>
                                    <p className={`text-sm ${unread ? 'text-blue-800 font-medium' : 'text-gray-700'}`}>
                                        {result.message_text}
                                    </p>
                                    {result.conversation_title && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            In: {result.conversation_title}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {query && results.length === 0 && !isSearching && (
                <div className="text-center text-gray-500 py-4 border border-gray-200 rounded-lg">
                    No messages found for "{query}"
                </div>
            )}
        </div>
    );
};

export default ChatSearch;