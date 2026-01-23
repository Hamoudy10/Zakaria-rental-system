import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAllocation } from '../context/TenantAllocationContext'
import { useProperty } from '../context/PropertyContext'
import { tenantAPI } from '../services/api'
import api from '../services/api'

// NOTE: updateUnit is not used for allocation - backend handles unit occupancy automatically

const TenantAllocation = () => {
  const { properties, loading: propertiesLoading } = useProperty()
  const { 
    allocations, 
    loading: allocationsLoading, 
    error, 
    allocateTenant, 
    deallocateTenant, 
    fetchAllocations,
    clearError 
  } = useAllocation()
  
  // NEW: Fetch all tenants
  const [tenants, setTenants] = useState([])
  const [tenantsLoading, setTenantsLoading] = useState(true)
  
  // Tab state: 'all', 'allocated', 'unallocated'
  const [activeTab, setActiveTab] = useState('all')
  
  const [showAllocationModal, setShowAllocationModal] = useState(false)
  const [selectedTenantForAllocation, setSelectedTenantForAllocation] = useState(null)
  const [selectedUnit, setSelectedUnit] = useState('')
  const [allocationError, setAllocationError] = useState('')
  const [leaseData, setLeaseData] = useState({
    lease_start_date: '',
    lease_end_date: '',
    monthly_rent: '',
    security_deposit: '',
    rent_due_day: 5,
    grace_period_days: 7
  })

  // SAFE CHECK: Ensure data is always arrays
  const safeProperties = useMemo(() => Array.isArray(properties) ? properties : [], [properties])
  const safeAllocations = useMemo(() => Array.isArray(allocations) ? allocations : [], [allocations])
  const safeTenants = useMemo(() => Array.isArray(tenants) ? tenants : [], [tenants])

  // Get available units (units that are not occupied)
  const availableUnits = useMemo(() => {
    return safeProperties.flatMap(property => {
      const propertyUnits = Array.isArray(property.units) ? property.units : []
      return propertyUnits.filter(unit => !unit.is_occupied)
    })
  }, [safeProperties])

  // Fetch all tenants
  const fetchTenants = useCallback(async () => {
    try {
      setTenantsLoading(true)
      const response = await api.get('/tenants')
      const tenantsData = response.data?.data?.tenants || response.data?.data || []
      setTenants(Array.isArray(tenantsData) ? tenantsData : [])
    } catch (err) {
      console.error('Error fetching tenants:', err)
      setTenants([])
    } finally {
      setTenantsLoading(false)
    }
  }, [])

  // Load data on mount
  useEffect(() => {
    console.log('🔄 TenantAllocation: Loading data...')
    fetchTenants()
    fetchAllocations()
  }, [fetchTenants, fetchAllocations])

  // Merge tenants with allocation data
  const tenantsWithAllocationStatus = useMemo(() => {
    return safeTenants.map(tenant => {
      // Find active allocation for this tenant
      const activeAllocation = safeAllocations.find(
        alloc => alloc.tenant_id === tenant.id && alloc.is_active
      )
      
      return {
        ...tenant,
        allocation: activeAllocation || null,
        isAllocated: !!activeAllocation,
        allocation_id: activeAllocation?.id || null
      }
    })
  }, [safeTenants, safeAllocations])

  // Filter tenants based on active tab
  const filteredTenants = useMemo(() => {
    switch (activeTab) {
      case 'allocated':
        return tenantsWithAllocationStatus.filter(t => t.isAllocated)
      case 'unallocated':
        return tenantsWithAllocationStatus.filter(t => !t.isAllocated)
      case 'all':
      default:
        return tenantsWithAllocationStatus
    }
  }, [tenantsWithAllocationStatus, activeTab])

  // Stats
  const stats = useMemo(() => ({
    total: tenantsWithAllocationStatus.length,
    allocated: tenantsWithAllocationStatus.filter(t => t.isAllocated).length,
    unallocated: tenantsWithAllocationStatus.filter(t => !t.isAllocated).length,
    availableUnits: availableUnits.length
  }), [tenantsWithAllocationStatus, availableUnits])

  // When unit is selected, auto-fill rent and deposit
  useEffect(() => {
    if (selectedUnit) {
      const unit = availableUnits.find(u => u.id === selectedUnit)
      if (unit) {
        setLeaseData(prev => ({
          ...prev,
          monthly_rent: unit.rent_amount || '',
          security_deposit: unit.deposit_amount || ''
        }))
      }
    }
  }, [selectedUnit, availableUnits])

  // Reset form when modal closes
  useEffect(() => {
    if (!showAllocationModal) {
      setSelectedTenantForAllocation(null)
      setSelectedUnit('')
      setAllocationError('')
      clearError()
      setLeaseData({
        lease_start_date: '',
        lease_end_date: '',
        monthly_rent: '',
        security_deposit: '',
        rent_due_day: 5,
        grace_period_days: 7
      })
    }
  }, [showAllocationModal, clearError])

  // Open allocation modal for a specific tenant
  const openAllocationModal = (tenant) => {
    setSelectedTenantForAllocation(tenant)
    setShowAllocationModal(true)
  }

  // Handle allocation
  const handleAllocateTenant = async (e) => {
    e.preventDefault()
    clearError()
    setAllocationError('')
    
    try {
      if (!selectedTenantForAllocation || !selectedUnit) {
        setAllocationError('Please select both tenant and unit')
        return
      }

      const unit = availableUnits.find(u => u.id === selectedUnit)
      if (!unit) {
        setAllocationError('Selected unit not found')
        return
      }

      console.log('📝 Allocating tenant:', {
        tenant_id: selectedTenantForAllocation.id,
        unit_id: selectedUnit,
        leaseData
      })

      // Create allocation - backend automatically sets unit as occupied
      await allocateTenant({
        tenant_id: selectedTenantForAllocation.id,
        unit_id: selectedUnit,
        ...leaseData,
        monthly_rent: parseFloat(leaseData.monthly_rent) || 0,
        security_deposit: parseFloat(leaseData.security_deposit) || 0
      })

      // NOTE: No need to call updateUnit here - the backend allocation route 
      // already handles setting is_occupied = true and updating available_units count

      // Close modal and refresh data
      setShowAllocationModal(false)
      await fetchAllocations()
      await fetchTenants()
      
      alert('Tenant allocated successfully!')
    } catch (error) {
      console.error('Error allocating tenant:', error)
      
      if (error.response?.data?.message?.includes('already has an active allocation')) {
        setAllocationError('This tenant already has an active allocation.')
      } else if (error.response?.data?.message?.includes('already occupied')) {
        setAllocationError('This unit is already occupied.')
      } else if (error.response?.data?.message) {
        setAllocationError(error.response.data.message)
      } else {
        setAllocationError('Failed to allocate tenant. Please try again.')
      }
    }
  }

  // Handle deallocation - ONLY sets allocation to inactive, does NOT delete tenant
  const handleDeallocate = async (tenant) => {
    const allocationId = tenant.allocation_id
    
    if (!allocationId) {
      alert('No active allocation found for this tenant.')
      return
    }

    if (window.confirm(
      `Are you sure you want to deallocate ${tenant.first_name} ${tenant.last_name}?\n\n` +
      `This will end their lease and free up the unit.\n` +
      `The tenant will NOT be deleted from the system.`
    )) {
      try {
        console.log(`🔄 Deallocating tenant: ${tenant.first_name} ${tenant.last_name} (Allocation ID: ${allocationId})`)
        
        // This only sets is_active = false on the allocation
        await deallocateTenant(allocationId)
        
        // Refresh data
        await fetchAllocations()
        await fetchTenants()
        
        alert(`${tenant.first_name} ${tenant.last_name} has been deallocated successfully.\nThe tenant remains in the system.`)
      } catch (error) {
        console.error('Error deallocating tenant:', error)
        setAllocationError('Failed to deallocate tenant. Please try again.')
      }
    }
  }

  // Handle delete tenant - ADMIN ONLY, permanently removes unallocated tenant
  const handleDeleteTenant = async (tenant) => {
    // Double-check tenant is not allocated
    if (tenant.isAllocated) {
      alert('Cannot delete an allocated tenant. Please deallocate first.')
      return
    }

    if (window.confirm(
      `⚠️ PERMANENT DELETE ⚠️\n\n` +
      `Are you sure you want to permanently delete ${tenant.first_name} ${tenant.last_name}?\n\n` +
      `This action CANNOT be undone!\n` +
      `All tenant data including payment history will be removed.`
    )) {
      // Second confirmation for safety
      if (window.confirm(
        `FINAL CONFIRMATION\n\n` +
        `Type of action: PERMANENT DELETE\n` +
        `Tenant: ${tenant.first_name} ${tenant.last_name}\n` +
        `National ID: ${tenant.national_id}\n\n` +
        `Click OK to permanently delete this tenant.`
      )) {
        try {
          console.log(`🗑️ Deleting tenant: ${tenant.first_name} ${tenant.last_name} (ID: ${tenant.id})`)
          
          const response = await tenantAPI.deleteTenant(tenant.id)
          
          if (response.data.success) {
            // Refresh data
            await fetchTenants()
            await fetchAllocations()
            
            alert(`${tenant.first_name} ${tenant.last_name} has been permanently deleted.`)
          } else {
            setAllocationError(response.data.message || 'Failed to delete tenant.')
          }
        } catch (error) {
          console.error('Error deleting tenant:', error)
          const errorMessage = error.response?.data?.message || 'Failed to delete tenant. Please try again.'
          setAllocationError(errorMessage)
        }
      }
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-KE')
    } catch {
      return 'Invalid Date'
    }
  }

  const formatPhone = (phone) => {
    if (!phone) return 'N/A'
    return phone.replace(/^254/, '0')
  }

  // Combined loading state
  const isLoading = tenantsLoading || propertiesLoading || allocationsLoading

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading tenant allocations...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4 md:mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">Tenant Allocation</h2>
          <p className="text-sm md:text-base text-gray-600">Manage tenant-unit allocations and lease agreements</p>
        </div>
      </div>

      {/* Error Display */}
      {(error || allocationError) && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
          {error || allocationError}
          <button 
            onClick={() => { clearError(); setAllocationError(''); }}
            className="float-right text-red-800 font-bold text-lg"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-lg md:text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-xs md:text-sm text-gray-600">Total Tenants</div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-lg md:text-2xl font-bold text-green-600">{stats.allocated}</div>
            <div className="text-xs md:text-sm text-gray-600">Allocated</div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-lg md:text-2xl font-bold text-orange-600">{stats.unallocated}</div>
            <div className="text-xs md:text-sm text-gray-600">Unallocated</div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-lg md:text-2xl font-bold text-purple-600">{stats.availableUnits}</div>
            <div className="text-xs md:text-sm text-gray-600">Available Units</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-3 px-4 md:px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'all'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setActiveTab('allocated')}
              className={`py-3 px-4 md:px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'allocated'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Allocated ({stats.allocated})
            </button>
            <button
              onClick={() => setActiveTab('unallocated')}
              className={`py-3 px-4 md:px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'unallocated'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Unallocated ({stats.unallocated})
            </button>
          </nav>
        </div>

        {/* Tenants List */}
        <div className="p-4 md:p-6">
          {filteredTenants.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-3xl md:text-4xl mb-2">
                {activeTab === 'allocated' ? '🏠' : activeTab === 'unallocated' ? '👤' : '📋'}
              </div>
              <p className="text-sm md:text-base">
                {activeTab === 'allocated' 
                  ? 'No allocated tenants' 
                  : activeTab === 'unallocated'
                  ? 'No unallocated tenants'
                  : 'No tenants found'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {filteredTenants.map((tenant) => (
                  <div key={tenant.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                          tenant.isAllocated ? 'bg-green-500' : 'bg-orange-500'
                        }`}>
                          {tenant.first_name?.[0]}{tenant.last_name?.[0]}
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {tenant.first_name} {tenant.last_name}
                          </div>
                          <div className="text-xs text-gray-500">{formatPhone(tenant.phone_number)}</div>
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        tenant.isAllocated 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {tenant.isAllocated ? 'Allocated' : 'Unallocated'}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-gray-600">National ID:</span>
                        <span className="font-medium">{tenant.national_id}</span>
                      </div>
                      {tenant.isAllocated && tenant.allocation && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Unit:</span>
                            <span className="font-medium">{tenant.unit_code || tenant.allocation.unit_code || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Property:</span>
                            <span className="font-medium">{tenant.property_name || tenant.allocation.property_name || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Rent:</span>
                            <span className="font-medium">{formatCurrency(tenant.monthly_rent || tenant.allocation.monthly_rent)}/month</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Lease End:</span>
                            <span className="font-medium">{formatDate(tenant.lease_end_date || tenant.allocation.lease_end_date)}</span>
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="pt-3 border-t border-gray-200 space-y-2">
                      {tenant.isAllocated ? (
                        <button
                          onClick={() => handleDeallocate(tenant)}
                          className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 text-sm font-medium min-h-[44px] touch-manipulation transition-colors"
                        >
                          Deallocate Tenant
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => openAllocationModal(tenant)}
                            disabled={availableUnits.length === 0}
                            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-sm font-medium min-h-[44px] touch-manipulation transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {availableUnits.length === 0 ? 'No Units Available' : 'Allocate to Unit'}
                          </button>
                          <button
                            onClick={() => handleDeleteTenant(tenant)}
                            className="w-full bg-gray-100 text-red-600 py-2 px-4 rounded-md hover:bg-red-50 border border-red-200 text-sm font-medium min-h-[44px] touch-manipulation transition-colors"
                          >
                            Delete Tenant
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tenant
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unit / Property
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Lease Details
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rent
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredTenants.map((tenant) => (
                      <tr key={tenant.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold ${
                              tenant.isAllocated ? 'bg-green-500' : 'bg-orange-500'
                            }`}>
                              {tenant.first_name?.[0]}{tenant.last_name?.[0]}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {tenant.first_name} {tenant.last_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {formatPhone(tenant.phone_number)} • ID: {tenant.national_id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            tenant.isAllocated 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {tenant.isAllocated ? 'Allocated' : 'Unallocated'}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {tenant.isAllocated ? (
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {tenant.unit_code || tenant.allocation?.unit_code || 'N/A'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {tenant.property_name || tenant.allocation?.property_name || 'N/A'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 italic">Not assigned</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {tenant.isAllocated ? (
                            <div>
                              <div>Start: {formatDate(tenant.lease_start_date || tenant.allocation?.lease_start_date)}</div>
                              <div>End: {formatDate(tenant.lease_end_date || tenant.allocation?.lease_end_date)}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {tenant.isAllocated 
                            ? `${formatCurrency(tenant.monthly_rent || tenant.allocation?.monthly_rent)}/month`
                            : <span className="text-gray-400 italic">-</span>
                          }
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {tenant.isAllocated ? (
                              <button
                                onClick={() => handleDeallocate(tenant)}
                                className="text-red-600 hover:text-red-900 px-3 py-1 rounded hover:bg-red-50 transition-colors"
                              >
                                Deallocate
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => openAllocationModal(tenant)}
                                  disabled={availableUnits.length === 0}
                                  className="text-blue-600 hover:text-blue-900 px-3 py-1 rounded hover:bg-blue-50 transition-colors disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                >
                                  {availableUnits.length === 0 ? 'No Units' : 'Allocate'}
                                </button>
                                <button
                                  onClick={() => handleDeleteTenant(tenant)}
                                  className="text-red-600 hover:text-red-900 px-3 py-1 rounded hover:bg-red-50 transition-colors"
                                  title="Permanently delete tenant"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Available Units Summary */}
      <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold mb-4">Available Units ({availableUnits.length})</h3>
        {availableUnits.length === 0 ? (
          <p className="text-gray-500 text-center py-4 text-sm md:text-base">No available units</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {availableUnits.slice(0, 6).map(unit => {
              const property = safeProperties.find(p => p.id === unit.property_id)
              return (
                <div key={unit.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">
                      {unit.unit_code} - {unit.unit_type}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {property?.name || 'Unknown'} • {formatCurrency(unit.rent_amount)}/mo
                    </div>
                  </div>
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 ml-2">
                    Available
                  </span>
                </div>
              )
            })}
            {availableUnits.length > 6 && (
              <div className="flex items-center justify-center p-3 border border-dashed border-gray-300 rounded-lg text-gray-500 text-sm">
                +{availableUnits.length - 6} more units
              </div>
            )}
          </div>
        )}
      </div>

      {/* Allocation Modal */}
      {showAllocationModal && selectedTenantForAllocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-50">
          <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-2">
            <h3 className="text-lg md:text-xl font-bold mb-4">
              Allocate Tenant to Unit
            </h3>
            
            {/* Selected Tenant Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center">
                <div className="flex-shrink-0 h-12 w-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                  {selectedTenantForAllocation.first_name?.[0]}{selectedTenantForAllocation.last_name?.[0]}
                </div>
                <div className="ml-4">
                  <div className="text-lg font-medium text-gray-900">
                    {selectedTenantForAllocation.first_name} {selectedTenantForAllocation.last_name}
                  </div>
                  <div className="text-sm text-gray-600">
                    {formatPhone(selectedTenantForAllocation.phone_number)} • ID: {selectedTenantForAllocation.national_id}
                  </div>
                </div>
              </div>
            </div>
            
            {allocationError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
                {allocationError}
                <button 
                  onClick={() => setAllocationError('')}
                  className="float-right text-red-800 font-bold text-lg"
                >
                  ×
                </button>
              </div>
            )}
            
            <form onSubmit={handleAllocateTenant} className="space-y-4">
              {/* Unit Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Unit *</label>
                <select
                  value={selectedUnit}
                  onChange={(e) => {
                    setSelectedUnit(e.target.value)
                    setAllocationError('')
                  }}
                  className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  required
                >
                  <option value="">Choose a unit</option>
                  {availableUnits.map(unit => {
                    const property = safeProperties.find(p => p.id === unit.property_id)
                    return (
                      <option key={unit.id} value={unit.id}>
                        {property?.name || 'Unknown'} - {unit.unit_code} ({unit.unit_type}) - {formatCurrency(unit.rent_amount)}
                      </option>
                    )
                  })}
                </select>
                {availableUnits.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">No available units. Please add units first.</p>
                )}
              </div>

              {/* Lease Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Lease Start Date *</label>
                  <input
                    type="date"
                    value={leaseData.lease_start_date}
                    onChange={(e) => setLeaseData({...leaseData, lease_start_date: e.target.value})}
                    className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Lease End Date *</label>
                  <input
                    type="date"
                    value={leaseData.lease_end_date}
                    onChange={(e) => setLeaseData({...leaseData, lease_end_date: e.target.value})}
                    className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Monthly Rent (KES) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={leaseData.monthly_rent}
                    onChange={(e) => setLeaseData({...leaseData, monthly_rent: e.target.value})}
                    className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Security Deposit (KES) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={leaseData.security_deposit}
                    onChange={(e) => setLeaseData({...leaseData, security_deposit: e.target.value})}
                    className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rent Due Day *</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={leaseData.rent_due_day}
                    onChange={(e) => setLeaseData({...leaseData, rent_due_day: parseInt(e.target.value) || 5})}
                    className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Grace Period (Days) *</label>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    value={leaseData.grace_period_days}
                    onChange={(e) => setLeaseData({...leaseData, grace_period_days: parseInt(e.target.value) || 7})}
                    className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 pt-4">
                <button 
                  type="submit" 
                  className="bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 flex-1 text-sm md:text-base min-h-[44px] transition-colors"
                >
                  Allocate Tenant
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllocationModal(false)}
                  className="bg-gray-500 text-white px-4 py-3 rounded-md hover:bg-gray-600 flex-1 text-sm md:text-base min-h-[44px] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TenantAllocation