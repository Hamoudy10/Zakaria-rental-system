import React, { createContext, useState, useContext, useCallback } from 'react'

const AllocationContext = createContext(undefined)

export const useAllocation = () => {
  const context = useContext(AllocationContext)
  if (context === undefined) {
    throw new Error('useAllocation must be used within an AllocationProvider')
  }
  return context
}

export const AllocationProvider = ({ children }) => {
  const [allocations, setAllocations] = useState([])
  const [loading, setLoading] = useState(false)

  // Mock data - in real app, this would come from API
  const mockAllocations = [
    {
      id: '1',
      tenant_id: '3', // Mary Wanjiku
      unit_id: '1-2', // WL001-102 (two_bedroom)
      lease_start_date: '2024-01-01',
      lease_end_date: '2024-12-31',
      monthly_rent: 65000,
      security_deposit: 130000,
      rent_due_day: 5,
      grace_period_days: 7,
      allocated_by: '1', // Admin user
      allocation_date: new Date('2024-01-01').toISOString(),
      is_active: true,
      tenant: {
        id: '3',
        first_name: 'Mary',
        last_name: 'Wanjiku',
        email: 'tenant@abdallah.co.ke',
        phone_number: '254722222222'
      },
      unit: {
        id: '1-2',
        unit_code: 'WL001-102',
        unit_type: 'two_bedroom',
        unit_number: '102',
        property: {
          id: '1',
          name: 'Westlands Apartments',
          address: '123 Westlands Road, Nairobi'
        }
      }
    }
  ]

  // Initialize with mock data
  React.useEffect(() => {
    setAllocations(mockAllocations)
  }, [])

  const allocateTenant = useCallback((allocationData) => {
    const newAllocation = {
      id: Math.random().toString(36).substr(2, 9),
      ...allocationData,
      allocation_date: new Date().toISOString(),
      is_active: true
    }
    setAllocations(prev => [...prev, newAllocation])
    return newAllocation
  }, [])

  const updateAllocation = useCallback((allocationId, updates) => {
    setAllocations(prev => prev.map(allocation => 
      allocation.id === allocationId ? { ...allocation, ...updates } : allocation
    ))
  }, [])

  const deallocateTenant = useCallback((allocationId) => {
    updateAllocation(allocationId, { is_active: false })
  }, [updateAllocation])

  const getActiveAllocations = useCallback(() => {
    return allocations.filter(allocation => allocation.is_active)
  }, [allocations])

  const getAllocationByUnitId = useCallback((unitId) => {
    return allocations.find(allocation => allocation.unit_id === unitId && allocation.is_active)
  }, [allocations])

  const getAllocationByTenantId = useCallback((tenantId) => {
    return allocations.find(allocation => allocation.tenant_id === tenantId && allocation.is_active)
  }, [allocations])

  const value = React.useMemo(() => ({
    allocations,
    loading,
    allocateTenant,
    updateAllocation,
    deallocateTenant,
    getActiveAllocations,
    getAllocationByUnitId,
    getAllocationByTenantId
  }), [
    allocations,
    loading,
    allocateTenant,
    updateAllocation,
    deallocateTenant,
    getActiveAllocations,
    getAllocationByUnitId,
    getAllocationByTenantId
  ])

  return <AllocationContext.Provider value={value}>{children}</AllocationContext.Provider>
}