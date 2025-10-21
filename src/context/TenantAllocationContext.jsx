import React, { createContext, useState, useContext, useCallback } from 'react';
import { allocationAPI } from '../services/api';

const TenantAllocationContext = createContext(undefined);

export const useAllocation = () => {
  const context = useContext(TenantAllocationContext);
  if (context === undefined) {
    throw new Error('useAllocation must be used within an AllocationProvider');
  }
  return context;
};

export const AllocationProvider = ({ children }) => {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAllocation, setSelectedAllocation] = useState(null);

  // Fetch all allocations
  const fetchAllocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔄 Fetching allocations...');
      const response = await allocationAPI.getAllocations();
      
      // Handle different response formats
      const allocationsData = response.data?.data || response.data?.allocations || response.data || [];
      setAllocations(Array.isArray(allocationsData) ? allocationsData : []);
      console.log(`✅ Successfully fetched ${allocationsData.length} allocations`);
    } catch (err) {
      console.error('❌ Error fetching allocations:', err);
      setError('Failed to fetch allocations');
      setAllocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new allocation - FIXED: Using allocationAPI instead of api
  const allocateTenant = useCallback(async (allocationData) => {
    setLoading(true);
    setError(null);
    try {
      console.log('🏠 Creating allocation with data:', allocationData);
      const response = await allocationAPI.createAllocation(allocationData);
      
      // Refetch allocations to update UI
      await fetchAllocations();
      console.log('✅ Successfully allocated tenant');
      return response.data;
    } catch (error) {
      console.error('❌ Error allocating tenant:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to allocate tenant';
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [fetchAllocations]);

  // Deallocate tenant (soft delete)
  const deallocateTenant = useCallback(async (allocationId) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Deallocating tenant from allocation: ${allocationId}`);
      await allocationAPI.deallocateTenant(allocationId);
      
      // Update local state to mark as inactive
      setAllocations(prev => prev.map(allocation => 
        allocation.id === allocationId 
          ? { ...allocation, is_active: false, lease_end_date: new Date().toISOString() }
          : allocation
      ));
      console.log('✅ Successfully deallocated tenant');
    } catch (err) {
      console.error('❌ Error deallocating tenant:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to deallocate tenant';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get active allocations
  const getActiveAllocations = useCallback(() => {
    return allocations.filter(allocation => allocation.is_active);
  }, [allocations]);

  // Update allocation
  const updateAllocation = useCallback(async (allocationId, updates) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Updating allocation: ${allocationId}`, updates);
      const response = await allocationAPI.updateAllocation(allocationId, updates);
      const updatedAllocation = response.data?.data || response.data;
      
      setAllocations(prev => prev.map(allocation => 
        allocation.id === allocationId ? { ...allocation, ...updatedAllocation } : allocation
      ));
      console.log('✅ Successfully updated allocation');
      return updatedAllocation;
    } catch (err) {
      console.error('❌ Error updating allocation:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to update allocation';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get allocation by ID
  const getAllocation = useCallback(async (allocationId) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Fetching allocation: ${allocationId}`);
      const response = await allocationAPI.getAllocation(allocationId);
      const allocation = response.data?.data || response.data;
      
      if (allocation) {
        setSelectedAllocation(allocation);
        console.log('✅ Successfully fetched allocation');
        return allocation;
      } else {
        throw new Error('Allocation not found');
      }
    } catch (err) {
      console.error('❌ Error fetching allocation:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch allocation';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get allocations by tenant ID - ENHANCED: Better error handling and logging
  const getTenantAllocations = useCallback(async (tenantId) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Fetching allocations for tenant: ${tenantId}`);
      const response = await allocationAPI.getAllocationsByTenantId(tenantId);
      
      // Handle different response formats
      const tenantAllocations = response.data?.data || response.data?.allocations || response.data || [];
      
      console.log(`✅ Found ${tenantAllocations.length} allocations for tenant:`, tenantAllocations);
      
      return Array.isArray(tenantAllocations) ? tenantAllocations : [];
    } catch (err) {
      console.error('❌ Error fetching tenant allocations:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch tenant allocations';
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Get allocation statistics
  const getAllocationStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔄 Fetching allocation statistics...');
      const response = await allocationAPI.getAllocationStats();
      const stats = response.data?.data || response.data || {};
      console.log('✅ Successfully fetched allocation statistics');
      return stats;
    } catch (err) {
      console.error('❌ Error fetching allocation statistics:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch allocation statistics';
      setError(errorMessage);
      return {};
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  const value = React.useMemo(() => ({
    // State
    allocations,
    loading,
    error,
    selectedAllocation,
    
    // Setters
    setSelectedAllocation,
    
    // Actions
    fetchAllocations,
    allocateTenant,
    deallocateTenant,
    getActiveAllocations,
    updateAllocation,
    getAllocation,
    getTenantAllocations,
    getAllocationStats,
    clearError
  }), [
    allocations,
    loading,
    error,
    selectedAllocation,
    fetchAllocations,
    allocateTenant,
    deallocateTenant,
    getActiveAllocations,
    updateAllocation,
    getAllocation,
    getTenantAllocations,
    getAllocationStats,
    clearError
  ]);

  return (
    <TenantAllocationContext.Provider value={value}>
      {children}
    </TenantAllocationContext.Provider>
  );
};