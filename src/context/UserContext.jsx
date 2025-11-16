import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { userAPI } from '../services/api';
import { useAuth } from './AuthContext';

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
  const [agents, setAgents] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const { user: authUser } = useAuth();

  // Check if user is authenticated
  const isAuthenticated = useCallback(() => {
    return !!authUser;
  }, [authUser]);

  // Fetch all users - ONLY WHEN AUTHENTICATED AND ADMIN
  const fetchUsers = useCallback(async () => {
    if (!isAuthenticated() || authUser.role !== 'admin') {
      console.log('🚫 UserContext: User not authenticated or not admin, skipping user fetch');
      setUsers([]);
      return;
    }

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
  }, [isAuthenticated, authUser]);

  // Fetch agents for admin - ONLY WHEN AUTHENTICATED AND ADMIN
  const fetchAgents = useCallback(async () => {
    if (!isAuthenticated() || authUser.role !== 'admin') {
      console.log('🚫 UserContext: User not authenticated or not admin, skipping agents fetch');
      setAgents([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log('🔄 Fetching agents from API...');
      const response = await userAPI.getAgents();
      
      const agentsData = response.data?.data || response.data || [];
      setAgents(Array.isArray(agentsData) ? agentsData : []);
      console.log(`✅ Successfully fetched ${agentsData.length} agents`);
    } catch (err) {
      console.error('❌ Error fetching agents:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch agents';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, authUser]);

  // Fetch tenants for agent - ONLY WHEN AUTHENTICATED AND AGENT
  const fetchTenantsForAgent = useCallback(async () => {
    if (!isAuthenticated() || authUser.role !== 'agent') {
      console.log('🚫 UserContext: User not authenticated or not agent, skipping tenants fetch');
      setTenants([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log('🔄 Fetching tenants for agent...');
      const response = await userAPI.getTenantsForAgent();
      
      const tenantsData = response.data?.data || response.data || [];
      setTenants(Array.isArray(tenantsData) ? tenantsData : []);
      console.log(`✅ Successfully fetched ${tenantsData.length} tenants for agent`);
    } catch (err) {
      console.error('❌ Error fetching tenants for agent:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch tenants';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, authUser]);

  // Fetch tenant allocations to check who's already allocated - ONLY WHEN AUTHENTICATED
  const fetchTenantAllocations = useCallback(async () => {
    if (!isAuthenticated()) {
      console.log('🚫 UserContext: User not authenticated, skipping allocations fetch');
      setAllocations([]);
      return;
    }

    try {
      console.log('🔄 Fetching tenant allocations...');
      const token = localStorage.getItem('token');
      
      if (!token) {
        console.warn('⚠️ No token found, skipping allocations fetch');
        setAllocations([]);
        return;
      }

      const response = await fetch('/api/tenant-allocations', {
        headers: {
          'Authorization': `Bearer ${token}`,
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
      setAllocations([]);
    }
  }, [isAuthenticated]);

  // Create new user - ONLY WHEN AUTHENTICATED AND ADMIN
  const createUser = useCallback(async (userData) => {
    if (!isAuthenticated() || authUser.role !== 'admin') {
      throw new Error('User not authenticated or not admin');
    }

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
  }, [isAuthenticated, authUser]);

  // Update user - ONLY WHEN AUTHENTICATED AND ADMIN
  const updateUser = useCallback(async (userId, updates) => {
    if (!isAuthenticated() || authUser.role !== 'admin') {
      throw new Error('User not authenticated or not admin');
    }

    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Updating user ${userId}:`, updates);
      const response = await userAPI.updateUser(userId, updates);
      const updatedUser = response.data?.user || response.data?.data || response.data;
      
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
  }, [isAuthenticated, authUser, selectedUser]);

  // Delete user (soft delete) - ONLY WHEN AUTHENTICATED AND ADMIN
  const deleteUser = useCallback(async (userId) => {
    if (!isAuthenticated() || authUser.role !== 'admin') {
      throw new Error('User not authenticated or not admin');
    }

    setLoading(true);
    setError(null);
    try {
      console.log(`🗑️ Deleting user ${userId}`);
      await userAPI.deleteUser(userId);
      
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
  }, [isAuthenticated, authUser]);

  // Update agent permissions - ONLY WHEN AUTHENTICATED AND ADMIN
  const updateAgentPermissions = useCallback(async (agentId, permissions) => {
    if (!isAuthenticated() || authUser.role !== 'admin') {
      throw new Error('User not authenticated or not admin');
    }

    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Updating agent permissions for ${agentId}:`, permissions);
      const response = await userAPI.updateAgentPermissions(agentId, permissions);
      
      setAgents(prev => prev.map(agent => 
        agent.id === agentId ? { ...agent, ...permissions } : agent
      ));
      
      console.log('✅ Agent permissions updated successfully');
      return response.data;
    } catch (err) {
      console.error('❌ Error updating agent permissions:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to update agent permissions';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, authUser]);

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

  // Fetch users and allocations on component mount ONLY IF AUTHENTICATED
  useEffect(() => {
    if (isAuthenticated()) {
      console.log('🔄 UserContext: User authenticated, fetching data...');
      if (authUser.role === 'admin') {
        fetchUsers();
        fetchAgents();
      } else if (authUser.role === 'agent') {
        fetchTenantsForAgent();
      }
      fetchTenantAllocations();
    } else {
      console.log('🚫 UserContext: User not authenticated, skipping data fetch');
      setUsers([]);
      setAgents([]);
      setTenants([]);
      setAllocations([]);
    }
  }, [authUser, isAuthenticated, fetchUsers, fetchAgents, fetchTenantsForAgent, fetchTenantAllocations]);

  // Listen for authentication changes
  useEffect(() => {
    if (!isAuthenticated()) {
      console.log('🚫 UserContext: User logged out, clearing data');
      setUsers([]);
      setAgents([]);
      setTenants([]);
      setAllocations([]);
      setSelectedUser(null);
    }
  }, [authUser, isAuthenticated]);

  const value = React.useMemo(() => ({
    // State
    users,
    agents,
    tenants,
    allocations,
    loading,
    error,
    selectedUser,
    
    // Computed values
    availableTenants: getAvailableTenants(),
    
    // Actions
    setSelectedUser,
    fetchUsers,
    fetchAgents,
    fetchTenantsForAgent,
    createUser,
    updateUser,
    deleteUser,
    updateAgentPermissions,
    getUserById,
    clearError,
    refreshAllocations,
    refreshUsers
  }), [
    users,
    agents,
    tenants,
    allocations,
    loading,
    error,
    selectedUser,
    getAvailableTenants,
    fetchUsers,
    fetchAgents,
    fetchTenantsForAgent,
    createUser,
    updateUser,
    deleteUser,
    updateAgentPermissions,
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