import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from 'react';
import { API, handleApiError } from '../services/api';
import { useAuth } from './AuthContext';

const UserContext = createContext(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
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

  const isAuthenticated = useCallback(() => !!authUser, [authUser]);

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Safe fetch with retries
  const safeFetch = async (fetchFn, defaultData = [], retries = 3, delay = 2000) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (!fetchFn) return defaultData;

        console.group("🧪 User Management Debug");
        console.log("Auth user:", authUser);
        console.log("Auth role:", authUser?.role);
        console.log(
          "Auth token present:",
          !!authUser?.accessToken );
        console.groupEnd();

        const response = await fetchFn();
        if (!response || !response.data) return defaultData;
        return response.data?.users || response.data?.data || response.data || defaultData;
      } catch (err) {
        const status = err.response?.status;
        if (status === 429 && attempt < retries) {
          console.warn(`⚠️ Rate limited. Retrying in ${delay}ms...`);
          await wait(delay);
          delay *= 2;
        } else {
          console.error('❌ API/Network error:', err);
          return defaultData;
        }
      }
    }
    return defaultData;
  };

  // Fetch users/agents/tenants
  const fetchUsers = useCallback(async () => {
    if (!isAuthenticated()) {
      console.warn('🚫 fetchUsers blocked: no authenticated user');
      return setUsers([]);
    }
    if (authUser.role !== 'admin') {
      console.warn('🚫 fetchUsers blocked: role is', authUser.role);
      return setUsers([]);
    }

    setLoading(true); setError(null);
    const data = await safeFetch(() => API.users.getUsers());
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [authUser, isAuthenticated]);

  const fetchAgents = useCallback(async () => {
    if (!isAuthenticated()) {
      console.warn('🚫 fetchAgents blocked: no authenticated user');
      return setAgents([]);
    }
    if (authUser.role !== 'admin') {
      console.warn('🚫 fetchAgents blocked: role is', authUser.role);
      return setAgents([]);
    }

    setLoading(true); setError(null);
    const data = await safeFetch(() => API.users.getAgents());
    setAgents(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [authUser, isAuthenticated]);

  const fetchTenantsForAgent = useCallback(async () => {
    if (!isAuthenticated()) {
      console.warn('🚫 fetchTenantsForAgent blocked: no authenticated user');
      return setTenants([]);
    }
    if (authUser.role !== 'agent') {
      console.warn('🚫 fetchTenantsForAgent blocked: role is', authUser.role);
      return setTenants([]);
    }

    setLoading(true); setError(null);

    const fetchFn = API.users.getTenantsForAgent || API.users.getTenants || null;
    const data = await safeFetch(fetchFn);
    setTenants(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [authUser, isAuthenticated]);

  // Fetch allocations robustly
  const fetchTenantAllocations = useCallback(async (retries = 3, delay = 2000) => {
    if (!isAuthenticated()) return setAllocations([]);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await API.allocations.getAllocations();
        const data = response.data?.allocations || response.data?.data || response.data || [];
        setAllocations(Array.isArray(data) ? data : []);
        return;
      } catch (err) {
        const status = err.response?.status;
        if (status === 429 && attempt < retries) {
          console.warn(`⚠️ Rate limited on allocations. Retrying in ${delay}ms...`);
          await wait(delay);
          delay *= 2;
        } else {
          console.error('❌ Failed to fetch allocations:', handleApiError(err).message);
          setAllocations([]);
          return;
        }
      }
    }
  }, [isAuthenticated]);

  // CRUD operations
  const createUser = useCallback(async (userData) => {
    if (!isAuthenticated() || authUser.role !== 'admin') throw new Error('Not authorized');
    setLoading(true); setError(null);
    try {
      const response = await API.users.createUser(userData);
      const newUser = response.data?.user || response.data?.data || response.data;
      setUsers(prev => [...prev, newUser]);
      return newUser;
    } catch (err) {
      setError(handleApiError(err).message);
      throw err;
    } finally { setLoading(false); }
  }, [authUser, isAuthenticated]);

  const updateUser = useCallback(async (userId, updates) => {
    if (!isAuthenticated() || authUser.role !== 'admin') throw new Error('Not authorized');
    setLoading(true); setError(null);
    try {
      const response = await API.users.updateUser(userId, updates);
      const updatedUser = response.data?.user || response.data?.data || response.data;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updatedUser } : u));
      if (selectedUser?.id === userId) setSelectedUser(prev => ({ ...prev, ...updatedUser }));
      return updatedUser;
    } catch (err) {
      setError(handleApiError(err).message);
      throw err;
    } finally { setLoading(false); }
  }, [authUser, isAuthenticated, selectedUser]);

  const deleteUser = useCallback(async (userId) => {
    if (!isAuthenticated() || authUser.role !== 'admin') throw new Error('Not authorized');
    setLoading(true); setError(null);
    try {
      await API.users.deleteUser(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: false } : u));
    } catch (err) {
      setError(handleApiError(err).message);
      throw err;
    } finally { setLoading(false); }
  }, [authUser, isAuthenticated]);

  // Derived data
  const availableTenants = useMemo(() => {
    const allTenants = users.filter(u => u.role === 'tenant' && u.is_active !== false);
    if (!allocations.length) return allTenants;
    const allocatedIds = allocations.filter(a => a.is_active).map(a => a.tenant_id);
    return allTenants.filter(t => !allocatedIds.includes(t.id));
  }, [users, allocations]);

  const getUserById = useCallback((id) => users.find(u => u.id === id), [users]);
  const clearError = useCallback(() => setError(null), []);
  const refreshAllocations = useCallback(() => fetchTenantAllocations(), [fetchTenantAllocations]);
  const refreshUsers = useCallback(() => fetchUsers(), [fetchUsers]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    if (authUser.role === 'admin') { fetchUsers(); fetchAgents(); }
    else if (authUser.role === 'agent') { fetchTenantsForAgent(); }
    fetchTenantAllocations();
  }, [authUser, isAuthenticated, fetchUsers, fetchAgents, fetchTenantsForAgent, fetchTenantAllocations]);

  useEffect(() => {
    if (!isAuthenticated()) {
      setUsers([]); setAgents([]); setTenants([]); setAllocations([]); setSelectedUser(null);
    }
  }, [authUser, isAuthenticated]);

  const value = useMemo(() => ({
    users, agents, tenants, allocations, loading, error, selectedUser, availableTenants,
    setSelectedUser, fetchUsers, fetchAgents, fetchTenantsForAgent,
    createUser, updateUser, deleteUser, getUserById, clearError,
    refreshAllocations, refreshUsers
  }), [
    users, agents, tenants, allocations, loading, error, selectedUser, availableTenants,
    fetchUsers, fetchAgents, fetchTenantsForAgent,
    createUser, updateUser, deleteUser, getUserById, clearError,
    refreshAllocations, refreshUsers
  ]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
