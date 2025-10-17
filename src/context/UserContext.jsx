import React, { createContext, useState, useContext, useCallback } from 'react';
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

  // Fetch all users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await userAPI.getUsers();
      setUsers(response.data.users || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to fetch users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new user
  const createUser = useCallback(async (userData) => {
    setLoading(true);
    setError(null);
    try {
      // Simulate API call until backend is implemented
      const newUser = {
        id: Math.random().toString(36).substr(2, 9),
        ...userData,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      setUsers(prev => [...prev, newUser]);
      return newUser;
    } catch (err) {
      console.error('Error creating user:', err);
      setError('Failed to create user');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update user
  const updateUser = useCallback(async (userId, updates) => {
    setLoading(true);
    setError(null);
    try {
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, ...updates, updated_at: new Date().toISOString() } : user
      ));
      
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser(prev => ({ ...prev, ...updates }));
      }
    } catch (err) {
      console.error('Error updating user:', err);
      setError('Failed to update user');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedUser]);

  // Delete user (soft delete)
  const deleteUser = useCallback(async (userId) => {
    setLoading(true);
    setError(null);
    try {
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, is_active: false } : user
      ));
    } catch (err) {
      console.error('Error deleting user:', err);
      setError('Failed to delete user');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = React.useMemo(() => ({
    users,
    loading,
    error,
    selectedUser,
    setSelectedUser,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    clearError: () => setError(null)
  }), [
    users,
    loading,
    error,
    selectedUser,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser
  ]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};