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
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  // Fetch all users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔄 Fetching users from API...');
      const response = await userAPI.getUsers();
      
      const usersData = response.data?.users || response.data?.data || response.data || [];
      setUsers(Array.isArray(usersData) ? usersData : []);
      console.log(`✅ Successfully fetched ${usersData.length} users`);
    } catch (err) {
      console.error('❌ Error fetching users:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch users';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch tenant allocations to check who's already allocated
  const fetchTenantAllocations = useCallback(async () => {
    try {
      console.log('🔄 Fetching tenant allocations...');
      // Using the same API endpoint that TenantAllocationContext uses
      const response = await fetch('/api/tenant-allocations', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const allocationsData = data.data || data.allocations || [];
        setAllocations(Array.isArray(allocationsData) ? allocationsData : []);
        console.log(`✅ Successfully fetched ${allocationsData.length} allocations`);
      } else {
        console.warn('⚠️ Could not fetch allocations, proceeding without allocation data');
        setAllocations([]);
      }
    } catch (err) {
      console.error('❌ Error fetching allocations:', err);
      // Don't set error state for allocations - we can still function without them
      setAllocations([]);
    }
  }, []);

  // Create new user
  const createUser = useCallback(async (userData) => {
    setLoading(true);
    setError(null);
    try {
      console.log('📝 Creating user:', userData);
      
      const apiData = {
        national_id: userData.national_id,
        first_name: userData.first_name,
        last_name: userData.last_name,
        email: userData.email,
        phone_number: userData.phone_number,
        password: userData.password,
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

  // Update user
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

  // Delete user (soft delete)
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
    // Get all tenant users who are active
    const allTenants = users.filter(user => 
      user.role === 'tenant' && 
      user.is_active !== false
    );
    
    // If we don't have allocation data, return all tenants
    if (!allocations.length) {
      console.log('📊 No allocation data available, showing all tenants');
      return allTenants;
    }
    
    // Get IDs of tenants who already have active allocations
    const allocatedTenantIds = allocations
      .filter(allocation => allocation.is_active === true)
      .map(allocation => allocation.tenant_id);
    
    // Filter out tenants who have active allocations
    const availableTenants = allTenants.filter(tenant => 
      !allocatedTenantIds.includes(tenant.id)
    );
    
    console.log(`📊 Available tenants: ${availableTenants.length} out of ${allTenants.length} total tenants`);
    console.log(`📊 Allocated tenant IDs:`, allocatedTenantIds);
    
    return availableTenants;
  }, [users, allocations]);

  // Get user by ID
  const getUserById = useCallback((userId) => {
    return users.find(user => user.id === userId);
  }, [users]);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  // Refresh allocations manually
  const refreshAllocations = useCallback(async () => {
    await fetchTenantAllocations();
  }, [fetchTenantAllocations]);

  // Refresh users manually
  const refreshUsers = useCallback(async () => {
    await fetchUsers();
  }, [fetchUsers]);

  // Fetch users and allocations on component mount
  useEffect(() => {
    fetchUsers();
    fetchTenantAllocations();
  }, [fetchUsers, fetchTenantAllocations]);

  const value = React.useMemo(() => ({
    // State
    users,
    allocations,
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
    clearError,
    refreshAllocations,
    refreshUsers
  }), [
    users,
    allocations,
    loading,
    error,
    selectedUser,
    getAvailableTenants,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    getUserById,
    clearError,
    refreshAllocations,
    refreshUsers
  ]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};