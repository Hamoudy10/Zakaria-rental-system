import React, { useState, useEffect, useCallback } from 'react'
import { useAllocation } from '../context/TenantAllocationContext'
import { useProperty } from '../context/PropertyContext'
import { useUser } from '../context/UserContext'

const TenantAllocation = () => {
  const { users, loading: usersLoading } = useUser()
  const { properties, updateUnit, loading: propertiesLoading } = useProperty()
  const { 
    allocations, 
    loading: allocationsLoading, 
    error, 
    allocateTenant, 
    deallocateTenant, 
    getActiveAllocations,
    fetchAllocations,
    clearError 
  } = useAllocation()
  
  const [showAllocationModal, setShowAllocationModal] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [leaseData, setLeaseData] = useState({
    lease_start_date: '',
    lease_end_date: '',
    monthly_rent: '',
    security_deposit: '',
    rent_due_day: 5,
    grace_period_days: 7
  })

  // SAFE CHECK: Ensure data is always arrays with useMemo to prevent unnecessary re-renders
  const safeUsers = React.useMemo(() => Array.isArray(users) ? users : [], [users])
  const safeProperties = React.useMemo(() => Array.isArray(properties) ? properties : [], [properties])
  const safeAllocations = React.useMemo(() => Array.isArray(allocations) ? allocations : [], [allocations])

  // Get available tenants (users with role 'tenant' and not currently allocated)
  const availableTenants = React.useMemo(() => {
    return safeUsers.filter(user => {
      const isTenant = user.role === 'tenant'
      const isAllocated = getActiveAllocations().some(allocation => allocation.tenant_id === user.id)
      return isTenant && !isAllocated
    })
  }, [safeUsers, getActiveAllocations])

  // Get available units (units that are not occupied)
  const availableUnits = React.useMemo(() => {
    return safeProperties.flatMap(property => {
      const propertyUnits = Array.isArray(property.units) ? property.units : []
      return propertyUnits.filter(unit => !unit.is_occupied)
    })
  }, [safeProperties])

  // Load allocations on component mount - FIXED: Remove useCallback and use fetchAllocations directly
  useEffect(() => {
    console.log('🔄 TenantAllocation: Loading allocations...')
    fetchAllocations()
  }, []) // Empty dependency array - only run once on mount

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!showAllocationModal) {
      setSelectedTenant('')
      setSelectedUnit('')
      setLeaseData({
        lease_start_date: '',
        lease_end_date: '',
        monthly_rent: '',
        security_deposit: '',
        rent_due_day: 5,
        grace_period_days: 7
      })
    }
  }, [showAllocationModal])

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

  const handleAllocateTenant = async (e) => {
    e.preventDefault()
    clearError()
    
    try {
      const tenant = availableTenants.find(t => t.id === selectedTenant)
      const unit = availableUnits.find(u => u.id === selectedUnit)

      if (!tenant || !unit) {
        alert('Please select both tenant and unit')
        return
      }

      console.log('📝 Allocating tenant:', {
        tenant_id: selectedTenant,
        unit_id: selectedUnit,
        leaseData
      })

      // Create allocation
      await allocateTenant({
        tenant_id: selectedTenant,
        unit_id: selectedUnit,
        ...leaseData,
        monthly_rent: parseFloat(leaseData.monthly_rent) || 0,
        security_deposit: parseFloat(leaseData.security_deposit) || 0
      })

      // Update unit occupancy status
      const property = safeProperties.find(p => p.units?.some(u => u.id === selectedUnit))
      if (property) {
        await updateUnit(property.id, selectedUnit, { is_occupied: true })
      }

      // Close modal and refresh data
      setShowAllocationModal(false)
      await fetchAllocations() // Use fetchAllocations directly instead of loadAllocations
      
      alert('Tenant allocated successfully!')
    } catch (error) {
      console.error('Error allocating tenant:', error)
      // Error is already set in context, no need for additional alert
    }
  }

  const handleDeallocate = async (allocationId, unitId) => {
    if (window.confirm('Are you sure you want to deallocate this tenant? This will end their lease.')) {
      try {
        await deallocateTenant(allocationId)
        
        // Update unit occupancy status
        const property = safeProperties.find(p => p.units?.some(u => u.id === unitId))
        if (property) {
          await updateUnit(property.id, unitId, { is_occupied: false })
        }
        
        // Refresh allocations
        await fetchAllocations() // Use fetchAllocations directly instead of loadAllocations
        alert('Tenant deallocated successfully!')
      } catch (error) {
        console.error('Error deallocating tenant:', error)
        // Error is already set in context
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

  const activeAllocations = React.useMemo(() => getActiveAllocations(), [getActiveAllocations])

  // Combined loading state
  const isLoading = usersLoading || propertiesLoading || allocationsLoading

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading tenant allocations...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tenant Allocation</h2>
          <p className="text-gray-600">Assign tenants to units and manage lease agreements</p>
        </div>
        <button
          onClick={() => setShowAllocationModal(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md"
        >
          Allocate Tenant
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button 
            onClick={clearError}
            className="float-right text-red-800 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{activeAllocations.length}</div>
            <div className="text-sm text-gray-600">Active Allocations</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{availableTenants.length}</div>
            <div className="text-sm text-gray-600">Available Tenants</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{availableUnits.length}</div>
            <div className="text-sm text-gray-600">Available Units</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {safeProperties.reduce((total, property) => total + (property.units?.length || 0), 0)}
            </div>
            <div className="text-sm text-gray-600">Total Units</div>
          </div>
        </div>
      </div>

      {/* Allocation Modal */}
      {showAllocationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Allocate Tenant to Unit</h3>
            <form onSubmit={handleAllocateTenant} className="space-y-4">
              {/* Tenant Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Tenant *</label>
                <select
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Choose a tenant</option>
                  {availableTenants.map(tenant => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.first_name || ''} {tenant.last_name || ''} - {tenant.email || ''}
                    </option>
                  ))}
                </select>
                {availableTenants.length === 0 && (
                  <p className="text-sm text-red-600 mt-1">No available tenants. Please register tenants first.</p>
                )}
              </div>

              {/* Unit Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Unit *</label>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Choose a unit</option>
                  {availableUnits.map(unit => {
                    const property = safeProperties.find(p => p.id === unit.property_id)
                    return (
                      <option key={unit.id} value={unit.id}>
                        {property?.name || 'Unknown Property'} - {unit.unit_code || ''} ({unit.unit_type || ''}) - {formatCurrency(unit.rent_amount)}
                      </option>
                    )
                  })}
                </select>
                {availableUnits.length === 0 && (
                  <p className="text-sm text-red-600 mt-1">No available units. Please add units first.</p>
                )}
              </div>

              {/* Lease Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Lease Start Date *</label>
                  <input
                    type="date"
                    value={leaseData.lease_start_date}
                    onChange={(e) => setLeaseData({...leaseData, lease_start_date: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Lease End Date *</label>
                  <input
                    type="date"
                    value={leaseData.lease_end_date}
                    onChange={(e) => setLeaseData({...leaseData, lease_end_date: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Monthly Rent (KES) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={leaseData.monthly_rent}
                    onChange={(e) => setLeaseData({...leaseData, monthly_rent: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rent Due Day *</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={leaseData.rent_due_day}
                    onChange={(e) => setLeaseData({...leaseData, rent_due_day: parseInt(e.target.value) || 5})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button 
                  type="submit" 
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex-1"
                >
                  Allocate Tenant
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllocationModal(false)}
                  className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active Allocations List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Active Allocations ({activeAllocations.length})</h3>
        
        {activeAllocations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🏠</div>
            <p>No active tenant allocations</p>
            <p className="text-sm">Allocate tenants to units to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Lease Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Rent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activeAllocations.map((allocation) => (
                  <tr key={allocation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
                          {(allocation.tenant?.first_name?.[0] || 'T')}{(allocation.tenant?.last_name?.[0] || 'U')}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
                            {allocation.tenant?.first_name || 'Unknown'} {allocation.tenant?.last_name || 'Tenant'}
                          </div>
                          <div className="text-sm text-gray-500 whitespace-nowrap">
                            {allocation.tenant?.phone_number || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
                        {allocation.unit?.unit_code || 'Unknown Unit'}
                      </div>
                      <div className="text-sm text-gray-500 whitespace-nowrap">
                        {allocation.unit?.property?.name || 'Unknown Property'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{formatDate(allocation.lease_start_date)}</div>
                      <div>to {formatDate(allocation.lease_end_date)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(allocation.monthly_rent)}/month
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleDeallocate(allocation.id, allocation.unit_id)}
                        className="text-red-600 hover:text-red-900 whitespace-nowrap"
                      >
                        Deallocate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Available Resources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Tenants */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Available Tenants ({availableTenants.length})</h3>
          {availableTenants.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No available tenants</p>
          ) : (
            <div className="space-y-3">
              {availableTenants.map(tenant => (
                <div key={tenant.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900 whitespace-nowrap">
                      {tenant.first_name} {tenant.last_name}
                    </div>
                    <div className="text-sm text-gray-500 whitespace-nowrap">{tenant.email}</div>
                  </div>
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">
                    Available
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Units */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Available Units ({availableUnits.length})</h3>
          {availableUnits.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No available units</p>
          ) : (
            <div className="space-y-3">
              {availableUnits.map(unit => {
                const property = safeProperties.find(p => p.id === unit.property_id)
                return (
                  <div key={unit.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900 whitespace-nowrap">
                        {unit.unit_code} - {unit.unit_type}
                      </div>
                      <div className="text-sm text-gray-500 whitespace-nowrap">
                        {property?.name || 'Unknown Property'} • {formatCurrency(unit.rent_amount)}/month
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">
                      Available
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TenantAllocation