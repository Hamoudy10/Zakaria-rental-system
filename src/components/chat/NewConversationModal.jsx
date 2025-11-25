import React, { useState, useEffect } from 'react';
import { useChat } from '../../context/chatcontext';

const NewConversationModal = ({ onClose }) => {
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [conversationTitle, setConversationTitle] = useState('');
    const [conversationType, setConversationType] = useState('direct');
    const { availableUsers, createConversation, loadAvailableUsers } = useChat();

    useEffect(() => {
        loadAvailableUsers();
    }, [loadAvailableUsers]);

    const handleUserToggle = (userId) => {
        setSelectedUsers(prev => {
            if (prev.includes(userId)) {
                return prev.filter(id => id !== userId);
            } else {
                return [...prev, userId];
            }
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (selectedUsers.length === 0) return;

        try {
            await createConversation(selectedUsers, conversationTitle, conversationType);
            onClose();
        } catch (error) {
            console.error('Failed to create conversation:', error);
        }
    };

    const isDirectConversation = conversationType === 'direct' && selectedUsers.length === 1;
    const showTitleInput = conversationType === 'group' || selectedUsers.length > 1;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold">New Conversation</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-2xl"
                    >
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Conversation Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Conversation Type
                        </label>
                        <select
                            value={conversationType}
                            onChange={(e) => setConversationType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="direct">Direct Message</option>
                            <option value="group">Group Chat</option>
                        </select>
                    </div>

                    {/* Participants */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Participants
                        </label>
                        <div className="border border-gray-300 rounded-lg max-h-40 overflow-y-auto">
                            {availableUsers.length === 0 ? (
                                <div className="p-4 text-center text-gray-500">
                                    No users available
                                </div>
                            ) : (
                                availableUsers.map(user => (
                                    <div
                                        key={user.id}
                                        className="flex items-center p-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50"
                                    >
                                        <input
                                            type="checkbox"
                                            id={`user-${user.id}`}
                                            checked={selectedUsers.includes(user.id)}
                                            onChange={() => handleUserToggle(user.id)}
                                            className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                        />
                                        <label htmlFor={`user-${user.id}`} className="flex-1 cursor-pointer">
                                            <div className="font-medium text-gray-900">
                                                {user.first_name} {user.last_name}
                                            </div>
                                            <div className="text-sm text-gray-500 capitalize">
                                                {user.role}
                                            </div>
                                        </label>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Conversation Title (for groups) */}
                    {showTitleInput && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Conversation Title
                            </label>
                            <input
                                type="text"
                                value={conversationTitle}
                                onChange={(e) => setConversationTitle(e.target.value)}
                                placeholder="Enter conversation title..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}

                    {/* Selected Users Preview */}
                    {selectedUsers.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Selected ({selectedUsers.length})
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {selectedUsers.map(userId => {
                                    const user = availableUsers.find(u => u.id === userId);
                                    return user ? (
                                        <span
                                            key={user.id}
                                            className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"
                                        >
                                            {user.first_name} {user.last_name}
                                        </span>
                                    ) : null;
                                })}
                            </div>
                        </div>
                    )}
                </form>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        onClick={handleSubmit}
                        disabled={selectedUsers.length === 0}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Create Conversation
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewConversationModal;