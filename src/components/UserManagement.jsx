import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '../context/UserContext';

const UserManagement = () => {
  const { 
    users, 
    loading, 
    error, 
    fetchUsers, 
    createUser, 
    updateUser, 
    deleteUser 
  } = useUser();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // SAFE CHECK: Ensure users is always an array
  const safeUsers = Array.isArray(users) ? users : [];

  const handleCreateUser = async (userData) => {
    try {
      await createUser(userData);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating user:', err);
    }
  };

  const handleEditUser = async (userData) => {
    try {
      await updateUser(selectedUser.id, userData);
      setShowEditModal(false);
      setSelectedUser(null);
    } catch (err) {
      console.error('Error updating user:', err);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to deactivate this user?')) {
      try {
        await deleteUser(userId);
      } catch (err) {
        console.error('Error deleting user:', err);
      }
    }
  };

  // Reset form when modal closes
  const handleCloseModal = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setSelectedUser(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading users...</div>
      </div>
    );
  }

  // Separate Modal Component with its own form state
  const CompactUserModal = React.memo(({ isOpen, onClose, onSubmit, title, isEdit = false, initialData }) => {
    const [formData, setFormData] = useState({
      national_id: '',
      first_name: '',
      last_name: '',
      email: '',
      phone_number: '',
      password: '',
      role: 'tenant'
    });

    // Initialize form data when modal opens or initialData changes
    useEffect(() => {
      if (isOpen) {
        setFormData(initialData || {
          national_id: '',
          first_name: '',
          last_name: '',
          email: '',
          phone_number: '',
          password: '',
          role: 'tenant'
        });
      }
    }, [isOpen, initialData]);

    const handleInputChange = (field, value) => {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    };

    const handleFormSubmit = (e) => {
      e.preventDefault();
      onSubmit(formData);
    };

    const handleLocalSubmit = () => {
      onSubmit(formData);
    };

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
          {/* Header - Fixed */}
          <div className="flex items-center justify-between p-3 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              type="button"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <form id="user-form" className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  National ID *
                </label>
                <input
                  type="text"
                  placeholder="National ID"
                  value={formData.national_id}
                  onChange={(e) => handleInputChange('national_id', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    placeholder="First name"
                    value={formData.first_name}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Last name"
                    value={formData.last_name}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  placeholder="Email address"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Phone Number *
                </label>
                <input
                  type="text"
                  placeholder="Phone number"
                  value={formData.phone_number}
                  onChange={(e) => handleInputChange('phone_number', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {!isEdit && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Role *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="tenant">Tenant</option>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </form>
          </div>

          {/* Fixed Footer with Buttons */}
          <div className="flex justify-end space-x-2 p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 border border-transparent rounded hover:bg-red-700 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLocalSubmit}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    );
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          Add New User
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {safeUsers.length > 0 ? (
                safeUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                          {(user.first_name?.[0] || 'T')}{(user.last_name?.[0] || 'U')}
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {user.first_name} {user.last_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            ID: {user.national_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{user.email}</div>
                      <div className="text-xs text-gray-500">{user.phone_number}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full 
                        ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 
                          user.role === 'agent' ? 'bg-blue-100 text-blue-800' : 
                          'bg-green-100 text-green-800'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full 
                        ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowEditModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500 text-sm">
                    <div className="flex flex-col items-center">
                      <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                      No users found
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      <CompactUserModal
        isOpen={showCreateModal}
        onClose={handleCloseModal}
        onSubmit={handleCreateUser}
        title="Create New User"
        isEdit={false}
        initialData={{
          national_id: '',
          first_name: '',
          last_name: '',
          email: '',
          phone_number: '',
          password: '',
          role: 'tenant'
        }}
      />

      {/* Edit User Modal */}
      <CompactUserModal
        isOpen={showEditModal}
        onClose={handleCloseModal}
        onSubmit={handleEditUser}
        title="Edit User"
        isEdit={true}
        initialData={selectedUser ? {
          national_id: selectedUser.national_id || '',
          first_name: selectedUser.first_name || '',
          last_name: selectedUser.last_name || '',
          email: selectedUser.email || '',
          phone_number: selectedUser.phone_number || '',
          password: '', // Don't show password in edit
          role: selectedUser.role || 'tenant'
        } : null}
      />
    </div>
  );
};

export default UserManagement;