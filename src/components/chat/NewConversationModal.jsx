import React, { useState, useEffect } from 'react';
import { useChat } from '../../context/chatcontext';
import { useAuth } from '../../context/AuthContext';

const NewConversationModal = ({ onClose }) => {
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [conversationTitle, setConversationTitle] = useState('');
    const [conversationType, setConversationType] = useState('direct');
    const [messageText, setMessageText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState(1); // 1: Select users, 2: Write message
    
    const { availableUsers, createConversation, sendMessage, setActiveConversation, loadAvailableUsers } = useChat();
    const { user: currentUser } = useAuth();

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                setLoading(true);
                setError('');
                await loadAvailableUsers();
            } catch (err) {
                console.error('Failed to load users:', err);
                setError('Failed to load users. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, [loadAvailableUsers]);

    // Filter out current user from available users
    const filteredUsers = availableUsers.filter(user => user.id !== currentUser?.id);

    const handleUserToggle = (userId) => {
        setSelectedUsers(prev => {
            if (prev.includes(userId)) {
                return prev.filter(id => id !== userId);
            } else {
                // For direct messages, only allow one user
                if (conversationType === 'direct') {
                    return [userId];
                }
                return [...prev, userId];
            }
        });
    };

    const handleNextStep = () => {
        if (selectedUsers.length === 0) {
            setError('Please select at least one participant');
            return;
        }
        setStep(2);
        setError('');
    };

    const handleBackStep = () => {
        setStep(1);
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (selectedUsers.length === 0) {
            setError('Please select at least one participant');
            return;
        }

        if (step === 1) {
            handleNextStep();
            return;
        }

        // Step 2: Create conversation and send message
        try {
            setLoading(true);
            setError('');

            // Create the conversation
            const conversationId = await createConversation(selectedUsers, conversationTitle, conversationType);
            
            if (messageText.trim()) {
                // Send the initial message
                await sendMessage(conversationId, messageText.trim());
            }

            // Find the created conversation to set as active
            // This would typically be handled by the context, but we'll trigger a reload
            setTimeout(() => {
                setActiveConversation(null); // Trigger reload
            }, 100);

            onClose();
        } catch (error) {
            console.error('Failed to create conversation:', error);
            setError(error.message || 'Failed to create conversation. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const isDirectConversation = conversationType === 'direct' && selectedUsers.length === 1;
    const showTitleInput = conversationType === 'group' || selectedUsers.length > 1;

    // Auto-generate title if not provided for group chats
    useEffect(() => {
        if (showTitleInput && !conversationTitle && selectedUsers.length > 0) {
            const selectedUserNames = selectedUsers.map(userId => {
                const user = filteredUsers.find(u => u.id === userId);
                return user ? `${user.first_name} ${user.last_name}` : '';
            }).filter(name => name);
            
            if (selectedUserNames.length > 0) {
                setConversationTitle(`${selectedUserNames.join(', ')} - Group`);
            }
        }
    }, [selectedUsers, conversationTitle, showTitleInput, filteredUsers]);

    // Reset selected users when conversation type changes
    useEffect(() => {
        if (conversationType === 'direct' && selectedUsers.length > 1) {
            setSelectedUsers(prev => prev.slice(0, 1));
        }
    }, [conversationType, selectedUsers.length]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex-shrink-0 flex justify-between items-center p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold">
                        {step === 1 ? 'New Conversation' : 'Write First Message'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-2xl font-semibold"
                    >
                        ×
                    </button>
                </div>

                {/* Content Area - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6">
                    <form onSubmit={handleSubmit}>
                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
                                {error}
                            </div>
                        )}

                        {/* Step 1: Conversation Setup */}
                        {step === 1 && (
                            <div className="space-y-4">
                                {/* Conversation Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Conversation Type
                                    </label>
                                    <select
                                        value={conversationType}
                                        onChange={(e) => setConversationType(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                    >
                                        <option value="direct">Direct Message</option>
                                        <option value="group">Group Chat</option>
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {conversationType === 'direct' 
                                            ? 'Chat with one person' 
                                            : 'Chat with multiple people'
                                        }
                                    </p>
                                </div>

                                {/* Participants */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Select Participants {conversationType === 'direct' ? '(Select one)' : '(Select one or more)'}
                                    </label>
                                    <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto bg-gray-50">
                                        {loading ? (
                                            <div className="p-4 text-center text-gray-500">
                                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                                                Loading users...
                                            </div>
                                        ) : filteredUsers.length === 0 ? (
                                            <div className="p-4 text-center text-gray-500">
                                                No users available to chat with
                                            </div>
                                        ) : (
                                            filteredUsers.map(user => (
                                                <div
                                                    key={user.id}
                                                    className={`flex items-center p-3 border-b border-gray-200 last:border-b-0 transition-colors ${
                                                        selectedUsers.includes(user.id) 
                                                            ? 'bg-blue-50 border-blue-200' 
                                                            : 'hover:bg-white'
                                                    }`}
                                                >
                                                    <input
                                                        type={conversationType === 'direct' ? 'radio' : 'checkbox'}
                                                        name="participants"
                                                        id={`user-${user.id}`}
                                                        checked={selectedUsers.includes(user.id)}
                                                        onChange={() => handleUserToggle(user.id)}
                                                        className={`mr-3 ${
                                                            conversationType === 'direct' 
                                                                ? 'text-blue-600 focus:ring-blue-500' 
                                                                : 'text-blue-600 focus:ring-blue-500 rounded'
                                                        }`}
                                                    />
                                                    <label htmlFor={`user-${user.id}`} className="flex-1 cursor-pointer flex items-center">
                                                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm mr-3">
                                                            {user.first_name?.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-900">
                                                                {user.first_name} {user.last_name}
                                                            </div>
                                                            <div className="text-sm text-gray-500 capitalize flex items-center">
                                                                <span>{user.role}</span>
                                                                {user.is_active === false && (
                                                                    <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-800 text-xs rounded">Inactive</span>
                                                                )}
                                                            </div>
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
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                )}

                                {/* Selected Users Preview */}
                                {selectedUsers.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Selected Participants ({selectedUsers.length})
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedUsers.map(userId => {
                                                const user = filteredUsers.find(u => u.id === userId);
                                                return user ? (
                                                    <span
                                                        key={user.id}
                                                        className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full text-sm font-medium flex items-center"
                                                    >
                                                        {user.first_name} {user.last_name}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUserToggle(user.id)}
                                                            className="ml-2 text-blue-600 hover:text-blue-800"
                                                        >
                                                            ×
                                                        </button>
                                                    </span>
                                                ) : null;
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 2: Message Input */}
                        {step === 2 && (
                            <div className="space-y-4">
                                {/* Selected Users Summary */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <h3 className="font-semibold text-blue-800 mb-2">Starting conversation with:</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedUsers.map(userId => {
                                            const user = filteredUsers.find(u => u.id === userId);
                                            return user ? (
                                                <span
                                                    key={user.id}
                                                    className="bg-white text-blue-700 px-3 py-1 rounded-full text-sm font-medium border border-blue-300"
                                                >
                                                    {user.first_name} {user.last_name}
                                                </span>
                                            ) : null;
                                        })}
                                    </div>
                                    {conversationTitle && (
                                        <p className="text-blue-700 text-sm mt-2">
                                            <strong>Group:</strong> {conversationTitle}
                                        </p>
                                    )}
                                </div>

                                {/* Message Input */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Your Message (Optional)
                                    </label>
                                    <textarea
                                        value={messageText}
                                        onChange={(e) => setMessageText(e.target.value)}
                                        placeholder="Type your first message here... (You can also send it later)"
                                        rows="4"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Start the conversation with a message, or send it empty and type later.
                                    </p>
                                </div>
                            </div>
                        )}
                    </form>
                </div>

                {/* Footer - Fixed at bottom */}
                <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 p-6">
                    {step === 1 ? (
                        <div className="flex justify-between space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleNextStep}
                                disabled={selectedUsers.length === 0 || loading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                                Next
                            </button>
                        </div>
                    ) : (
                        <div className="flex justify-between space-x-3">
                            <button
                                type="button"
                                onClick={handleBackStep}
                                disabled={loading}
                                className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                                Back
                            </button>
                            <div className="flex space-x-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={loading}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                                >
                                    {loading ? (
                                        <div className="flex items-center">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                            Creating...
                                        </div>
                                    ) : (
                                        'Create Conversation'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NewConversationModal;