import React, { useState, useEffect } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';

const NewConversationModal = ({ onClose }) => {
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [conversationTitle, setConversationTitle] = useState('');
    const [conversationType, setConversationType] = useState('direct');
    const [messageText, setMessageText] = useState('');
    const [localError, setLocalError] = useState('');
    const [step, setStep] = useState(1);

    const { 
        loadConversations, 
        conversations, 
        setActiveConversation, 
        sendMessage, 
        createConversation, 
        availableUsers, 
        loadAvailableUsers,
        loading, // Get loading from context
        error: contextError // Get error from context
    } = useChat();
    
    const { user: currentUser } = useAuth();

    // Load users
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                await loadAvailableUsers?.();
            } catch (err) {
                console.error(err);
                setLocalError('Failed to load users');
            }
        };
        fetchUsers();
    }, [loadAvailableUsers]);

    const filteredUsers = (availableUsers || []).filter(u => u.id !== currentUser?.id);

    /**
     * Handles toggling of a user in the selected users list.
     * If the user is already selected, removes them from the list.
     * If the conversation type is 'direct', sets the selected user to the toggled user.
     * If the conversation type is not 'direct', adds the toggled user to the list of selected users.
     * @param {string} userId - The ID of the user to toggle
     */
    const handleUserToggle = (userId) => {
        setSelectedUsers(prev => {
            if (prev.includes(userId)) return prev.filter(id => id !== userId);
            if (conversationType === 'direct') return [userId];
            return [...prev, userId];
        });
    };

    const handleNextStep = () => {
        if (!selectedUsers.length) {
            setLocalError('Select at least one participant');
            return;
        }
        setLocalError('');
        setStep(2);
    };

    const handleBackStep = () => {
        setLocalError('');
        setStep(1);
    };

    const handleSubmit = async () => {
        if (!selectedUsers.length) {
            setLocalError('Select at least one participant');
            return;
        }

        try {
            setLocalError('');

            // 1️⃣ Create conversation
            const conversation = await createConversation(selectedUsers, conversationTitle || null, conversationType);

            // 2️⃣ Send first message if provided
            if (messageText?.trim()) {
                await sendMessage(conversation.id, messageText.trim());
            }

            // 3️⃣ Set as active and refresh list
            setActiveConversation(conversation);
            await loadConversations();

            // Close modal
            onClose();
        } catch (err) {
            console.error(err);
            setLocalError(err.message || 'Failed to create conversation');
        }
    };

    // Show context error if any
    useEffect(() => {
        if (contextError) {
            setLocalError(contextError);
        }
    }, [contextError]);

    // Auto-generate title for groups
    useEffect(() => {
        if ((conversationType === 'group' || selectedUsers.length > 1) && !conversationTitle) {
            const names = selectedUsers
                .map(id => {
                    const u = filteredUsers.find(f => f.id === id);
                    return u ? `${u.first_name} ${u.last_name}` : '';
                })
                .filter(Boolean);
            if (names.length) setConversationTitle(`${names.join(', ')} - Group`);
        }
    }, [selectedUsers, conversationTitle, conversationType, filteredUsers]);

    // Force single selection for direct chat
    useEffect(() => {
        if (conversationType === 'direct' && selectedUsers.length > 1) {
            setSelectedUsers(prev => prev.slice(0, 1));
        }
    }, [conversationType, selectedUsers.length]);

    // Combine errors
    const errorMessage = localError || contextError;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex-shrink-0 flex justify-between items-center p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold">{step === 1 ? 'New Conversation' : 'Write First Message'}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl font-semibold">×</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {errorMessage && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{errorMessage}</div>}
                    
                    {step === 1 && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Conversation Type</label>
                                <select 
                                    value={conversationType} 
                                    onChange={e => setConversationType(e.target.value)} 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                >
                                    <option value="direct">Direct Message</option>
                                    <option value="group">Group Chat</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Select Participants</label>
                                <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto bg-gray-50">
                                    {filteredUsers.length === 0 ? (
                                        <div className="p-4 text-center text-gray-500">No users available</div>
                                    ) : filteredUsers.map(u => (
                                        <div 
                                            key={u.id} 
                                            className={`flex items-center p-3 border-b border-gray-200 last:border-b-0 transition-colors ${selectedUsers.includes(u.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-white'}`}
                                        >
                                            <input 
                                                type={conversationType === 'direct' ? 'radio' : 'checkbox'} 
                                                checked={selectedUsers.includes(u.id)} 
                                                onChange={() => handleUserToggle(u.id)} 
                                                className="mr-3" 
                                            />
                                            <label className="flex-1 cursor-pointer flex items-center">
                                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm mr-3">
                                                    {u.first_name?.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-medium">{u.first_name} {u.last_name}</div>
                                                    <div className="text-sm text-gray-500">{u.role}</div>
                                                </div>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {(conversationType === 'group' || selectedUsers.length > 1) && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Conversation Title</label>
                                    <input 
                                        type="text" 
                                        value={conversationTitle} 
                                        onChange={e => setConversationTitle(e.target.value)} 
                                        placeholder="Enter title..." 
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Your Message (Optional)</label>
                                <textarea 
                                    value={messageText} 
                                    onChange={e => setMessageText(e.target.value)} 
                                    placeholder="Type your first message..." 
                                    rows="4" 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none" 
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 p-6 flex justify-between space-x-3">
                    {step === 1 ? (
                        <>
                            <button 
                                onClick={onClose} 
                                className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleNextStep} 
                                disabled={selectedUsers.length === 0 || loading} 
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </>
                    ) : (
                        <>
                            <button 
                                onClick={handleBackStep} 
                                disabled={loading} 
                                className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Back
                            </button>
                            <button 
                                onClick={handleSubmit} 
                                disabled={loading} 
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {loading ? 'Creating...' : 'Create Conversation'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NewConversationModal;