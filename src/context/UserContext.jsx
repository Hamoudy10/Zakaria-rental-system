import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { userAPI } from '../services/api';

const UserContext = createContext(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  // Fetch all users - FIXED: Proper error handling and API integration
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔄 Fetching users from API...');
      const response = await userAPI.getUsers();
      
      // Handle different response formats
      const usersData = response.data?.users || response.data?.data || response.data || [];
      setUsers(Array.isArray(usersData) ? usersData : []);
      console.log(`✅ Successfully fetched ${usersData.length} users`);
    } catch (err) {
      console.error('❌ Error fetching users:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch users';
      setError(errorMessage);
      // Don't set users to empty array on error - keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new user - FIXED: Use real API with correct field mapping
  const createUser = useCallback(async (userData) => {
    setLoading(true);
    setError(null);
    try {
      console.log('📝 Creating user:', userData);
      
      // Map the data to match backend expectations
      const apiData = {
        national_id: userData.national_id,
        first_name: userData.first_name,
        last_name: userData.last_name,
        email: userData.email,
        phone_number: userData.phone_number,
        password: userData.password, // Send as 'password' not 'password_hash'
        role: userData.role
      };
      
      const response = await userAPI.createUser(apiData);
      const newUser = response.data?.user || response.data?.data || response.data;
      
      // Add new user to local state
      setUsers(prev => [...prev, newUser]);
      console.log('✅ User created successfully');
      return newUser;
    } catch (err) {
      console.error('❌ Error creating user:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create user';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update user - FIXED: Use real API
  const updateUser = useCallback(async (userId, updates) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Updating user ${userId}:`, updates);
      const response = await userAPI.updateUser(userId, updates);
      const updatedUser = response.data?.user || response.data?.data || response.data;
      
      // Update local state
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, ...updatedUser } : user
      ));
      
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser(prev => ({ ...prev, ...updatedUser }));
      }
      
      console.log('✅ User updated successfully');
      return updatedUser;
    } catch (err) {
      console.error('❌ Error updating user:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to update user';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedUser]);

  // Delete user (soft delete) - FIXED: Use real API
  const deleteUser = useCallback(async (userId) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🗑️ Deleting user ${userId}`);
      await userAPI.deleteUser(userId);
      
      // Update local state to mark as inactive
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, is_active: false } : user
      ));
      
      console.log('✅ User deleted successfully');
    } catch (err) {
      console.error('❌ Error deleting user:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to delete user';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get available tenants (users with role 'tenant' and without active allocations)
  const getAvailableTenants = useCallback(() => {
    return users.filter(user => 
      user.role === 'tenant' && 
      user.is_active === true
    );
  }, [users]);

  // Get user by ID
  const getUserById = useCallback((userId) => {
    return users.find(user => user.id === userId);
  }, [users]);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const value = React.useMemo(() => ({
    // State
    users,
    loading,
    error,
    selectedUser,
    
    // Computed values
    availableTenants: getAvailableTenants(),
    
    // Actions
    setSelectedUser,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    getUserById,
    clearError
  }), [
    users,
    loading,
    error,
    selectedUser,
    getAvailableTenants,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    getUserById,
    clearError
  ]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};