import React, { createContext, useState, useContext, useCallback } from 'react';
import { tenantAllocationAPI } from '../services/api';

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
      const response = await tenantAllocationAPI.getAllocations();
      setAllocations(response.data.allocations || []);
    } catch (err) {
      console.error('Error fetching allocations:', err);
      setError('Failed to fetch allocations');
      setAllocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new allocation
  const allocateTenant = useCallback(async (allocationData) => {
    setLoading(true);
    setError(null);
    try {
      // Simulate API call until backend is implemented
      const newAllocation = {
        id: Math.random().toString(36).substr(2, 9),
        ...allocationData,
        is_active: true,
        allocation_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        tenant: {
          id: allocationData.tenant_id,
          first_name: 'Tenant',
          last_name: 'User',
          phone_number: '254700000000'
        },
        unit: {
          id: allocationData.unit_id,
          unit_code: 'UNIT001',
          property: {
            name: 'Sample Property'
          }
        }
      };
      
      setAllocations(prev => [...prev, newAllocation]);
      return newAllocation;
    } catch (err) {
      console.error('Error creating allocation:', err);
      setError('Failed to create allocation');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Deallocate tenant (soft delete)
  const deallocateTenant = useCallback(async (allocationId) => {
    setLoading(true);
    setError(null);
    try {
      setAllocations(prev => prev.map(allocation => 
        allocation.id === allocationId 
          ? { ...allocation, is_active: false, lease_end_date: new Date().toISOString() }
          : allocation
      ));
    } catch (err) {
      console.error('Error deallocating tenant:', err);
      setError('Failed to deallocate tenant');
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
      setAllocations(prev => prev.map(allocation => 
        allocation.id === allocationId ? { ...allocation, ...updates } : allocation
      ));
    } catch (err) {
      console.error('Error updating allocation:', err);
      setError('Failed to update allocation');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = React.useMemo(() => ({
    allocations,
    loading,
    error,
    selectedAllocation,
    setSelectedAllocation,
    fetchAllocations,
    allocateTenant,
    deallocateTenant,
    getActiveAllocations,
    updateAllocation,
    clearError: () => setError(null)
  }), [
    allocations,
    loading,
    error,
    selectedAllocation,
    fetchAllocations,
    allocateTenant,
    deallocateTenant,
    getActiveAllocations,
    updateAllocation
  ]);

  return (
    <TenantAllocationContext.Provider value={value}>
      {children}
    </TenantAllocationContext.Provider>
  );
};