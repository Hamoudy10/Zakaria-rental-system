// src/components/chat/NewConversationModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';

const NewConversationModal = ({ onClose }) => {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [conversationTitle, setConversationTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const { 
    loadConversations, 
    setActiveConversation, 
    createConversation, 
    availableUsers, 
    loadAvailableUsers,
    isUserOnline,
    loading
  } = useChat();
  
  const { user: currentUser } = useAuth();

  // Load users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        await loadAvailableUsers?.();
      } catch (err) {
        console.error('Failed to load users:', err);
        setError('Failed to load users');
      }
    };
    fetchUsers();
  }, [loadAvailableUsers]);

  // Filter out current user and apply search
  const filteredUsers = useMemo(() => {
    return (availableUsers || [])
      .filter(u => u.id !== currentUser?.id)
      .filter(u => {
        if (!searchQuery) return true;
        const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
        return fullName.includes(searchQuery.toLowerCase()) ||
               u.email?.toLowerCase().includes(searchQuery.toLowerCase());
      });
  }, [availableUsers, currentUser?.id, searchQuery]);

  // Handle user selection
  const handleUserToggle = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      }
      return [...prev, userId];
    });
  };

  // Get user by ID
  const getUserById = (userId) => {
    return filteredUsers.find(u => u.id === userId);
  };

  // Handle conversation creation
  const handleSubmit = async () => {
    if (selectedUsers.length === 0) {
      setError('Please select at least one user');
      return;
    }

    try {
      setError('');
      setIsCreating(true);

      const type = selectedUsers.length > 1 ? 'group' : 'direct';
      const title = type === 'group' ? (conversationTitle || generateGroupTitle()) : null;

      const conversation = await createConversation(selectedUsers, title, type);
      
      setActiveConversation(conversation);
      await loadConversations();
      onClose();
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError(err.message || 'Failed to create conversation');
    } finally {
      setIsCreating(false);
    }
  };

  // Generate default group title
  const generateGroupTitle = () => {
    const names = selectedUsers
      .slice(0, 3)
      .map(id => {
        const user = getUserById(id);
        return user?.first_name || 'User';
      })
      .join(', ');
    
    if (selectedUsers.length > 3) {
      return `${names} +${selectedUsers.length - 3}`;
    }
    return names;
  };

  // Get avatar color
  const getAvatarColor = (userId) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 
      'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
      'bg-orange-500', 'bg-cyan-500', 'bg-rose-500'
    ];
    const hash = userId?.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
    return colors[hash % colors.length];
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50">
          <h2 className="text-lg font-semibold text-gray-900">New Chat</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b">
          <div className="relative">
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
            />
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Selected Users Pills */}
        {selectedUsers.length > 0 && (
          <div className="px-4 py-2 border-b flex flex-wrap gap-2 bg-gray-50">
            {selectedUsers.map(userId => {
              const user = getUserById(userId);
              if (!user) return null;
              
              return (
                <div 
                  key={userId}
                  className="flex items-center gap-1 bg-green-100 text-green-800 pl-1 pr-2 py-1 rounded-full text-sm"
                >
                  {user.profile_image ? (
                    <img 
                      src={user.profile_image} 
                      alt={user.first_name}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-5 h-5 rounded-full ${getAvatarColor(userId)} flex items-center justify-center text-white text-xs font-semibold`}>
                      {user.first_name?.charAt(0)}
                    </div>
                  )}
                  <span>{user.first_name}</span>
                  <button 
                    onClick={() => handleUserToggle(userId)}
                    className="hover:text-green-900 ml-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Group Title Input (shown when multiple users selected) */}
        {selectedUsers.length > 1 && (
          <div className="px-4 py-3 border-b bg-blue-50">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Group Name</label>
            <input
              type="text"
              placeholder="Enter group name (optional)"
              value={conversationTitle}
              onChange={(e) => setConversationTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Users List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'No users found' : 'No users available'}
            </div>
          ) : (
            filteredUsers.map(user => {
              const isSelected = selectedUsers.includes(user.id);
              const isOnline = isUserOnline(user.id);
              
              return (
                <div
                  key={user.id}
                  onClick={() => handleUserToggle(user.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-green-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {user.profile_image ? (
                      <img 
                        src={user.profile_image} 
                        alt={user.first_name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-full ${getAvatarColor(user.id)} flex items-center justify-center text-white font-semibold`}>
                        {user.first_name?.charAt(0)}{user.last_name?.charAt(0)}
                      </div>
                    )}
                    {/* Online indicator */}
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                    )}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900">
                      {user.first_name} {user.last_name}
                    </h3>
                    <p className="text-sm text-gray-500 truncate capitalize">
                      {user.role || 'User'}
                    </p>
                  </div>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={handleSubmit}
            disabled={selectedUsers.length === 0 || isCreating}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Creating...</span>
              </>
            ) : (
              <>
                <span>
                  {selectedUsers.length > 1 
                    ? `Create Group (${selectedUsers.length} members)` 
                    : 'Start Conversation'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewConversationModal;