import React, { useState, useEffect } from 'react'
import { useAllocation } from '../context/TenantAllocationContext'
import { useProperty } from '../context/PropertyContext'
import { useAuth } from '../context/AuthContext'

const TenantAllocation = () => {
  const { users } = useAuth()
  const { properties, updateUnit } = useProperty()
  const { allocations, allocateTenant, deallocateTenant, getActiveAllocations } = useAllocation()
  
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

  // Get available tenants (users with role 'tenant' and not currently allocated)
  const availableTenants = users.filter(user => 
    user.role === 'tenant' && 
    !getActiveAllocations().some(allocation => allocation.tenant_id === user.id)
  )

  // Get available units (units that are not occupied)
  const availableUnits = properties.flatMap(property => 
    property.units.filter(unit => !unit.is_occupied)
  )

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
          monthly_rent: unit.rent_amount,
          security_deposit: unit.deposit_amount
        }))
      }
    }
  }, [selectedUnit, availableUnits])

  const handleAllocateTenant = async (e) => {
    e.preventDefault()
    try {
      const tenant = availableTenants.find(t => t.id === selectedTenant)
      const unit = availableUnits.find(u => u.id === selectedUnit)

      if (!tenant || !unit) {
        alert('Please select both tenant and unit')
        return
      }

      // Create allocation
      await allocateTenant({
        tenant_id: selectedTenant,
        unit_id: selectedUnit,
        ...leaseData,
        monthly_rent: parseFloat(leaseData.monthly_rent),
        security_deposit: parseFloat(leaseData.security_deposit)
      })

      // Update unit occupancy status
      const property = properties.find(p => p.units.some(u => u.id === selectedUnit))
      if (property) {
        updateUnit(property.id, selectedUnit, { is_occupied: true })
      }

      alert('Tenant allocated successfully!')
      setShowAllocationModal(false)
    } catch (error) {
      console.error('Error allocating tenant:', error)
      alert('Error allocating tenant. Please try again.')
    }
  }

  const handleDeallocate = async (allocationId, unitId) => {
    if (window.confirm('Are you sure you want to deallocate this tenant? This will end their lease.')) {
      try {
        deallocateTenant(allocationId)
        
        // Update unit occupancy status
        const property = properties.find(p => p.units.some(u => u.id === unitId))
        if (property) {
          updateUnit(property.id, unitId, { is_occupied: false })
        }
        
        alert('Tenant deallocated successfully!')
      } catch (error) {
        console.error('Error deallocating tenant:', error)
        alert('Error deallocating tenant. Please try again.')
      }
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE')
  }

  const activeAllocations = getActiveAllocations()

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tenant Allocation</h2>
          <p className="text-gray-600">Assign tenants to units and manage lease agreements</p>
        </div>
        <button
          onClick={() => setShowAllocationModal(true)}
          className="btn-primary"
          disabled={availableTenants.length === 0 || availableUnits.length === 0}
        >
          Allocate Tenant
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{activeAllocations.length}</div>
            <div className="text-sm text-gray-600">Active Allocations</div>
          </div>
        </div>
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{availableTenants.length}</div>
            <div className="text-sm text-gray-600">Available Tenants</div>
          </div>
        </div>
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{availableUnits.length}</div>
            <div className="text-sm text-gray-600">Available Units</div>
          </div>
        </div>
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {properties.reduce((total, property) => total + property.units.length, 0)}
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
                  className="input-primary"
                  required
                >
                  <option value="">Choose a tenant</option>
                  {availableTenants.map(tenant => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.first_name} {tenant.last_name} - {tenant.email}
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
                  className="input-primary"
                  required
                >
                  <option value="">Choose a unit</option>
                  {availableUnits.map(unit => {
                    const property = properties.find(p => p.id === unit.property_id)
                    return (
                      <option key={unit.id} value={unit.id}>
                        {property?.name} - {unit.unit_code} ({unit.unit_type}) - {formatCurrency(unit.rent_amount)}/month
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
                    className="input-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Lease End Date *</label>
                  <input
                    type="date"
                    value={leaseData.lease_end_date}
                    onChange={(e) => setLeaseData({...leaseData, lease_end_date: e.target.value})}
                    className="input-primary"
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
                    className="input-primary"
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
                    className="input-primary"
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
                    onChange={(e) => setLeaseData({...leaseData, rent_due_day: parseInt(e.target.value)})}
                    className="input-primary"
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
                    onChange={(e) => setLeaseData({...leaseData, grace_period_days: parseInt(e.target.value)})}
                    className="input-primary"
                    required
                  />
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  Allocate Tenant
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllocationModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active Allocations List */}
      <div className="card">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lease Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                          {allocation.tenant.first_name[0]}{allocation.tenant.last_name[0]}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {allocation.tenant.first_name} {allocation.tenant.last_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {allocation.tenant.phone_number}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {allocation.unit.unit_code}
                      </div>
                      <div className="text-sm text-gray-500">
                        {allocation.unit.property.name}
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
                        className="text-red-600 hover:text-red-900"
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
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Available Tenants ({availableTenants.length})</h3>
          {availableTenants.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No available tenants</p>
          ) : (
            <div className="space-y-3">
              {availableTenants.map(tenant => (
                <div key={tenant.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">
                      {tenant.first_name} {tenant.last_name}
                    </div>
                    <div className="text-sm text-gray-500">{tenant.email}</div>
                  </div>
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    Available
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Units */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Available Units ({availableUnits.length})</h3>
          {availableUnits.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No available units</p>
          ) : (
            <div className="space-y-3">
              {availableUnits.map(unit => {
                const property = properties.find(p => p.id === unit.property_id)
                return (
                  <div key={unit.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">
                        {unit.unit_code} - {unit.unit_type}
                      </div>
                      <div className="text-sm text-gray-500">
                        {property?.name} • {formatCurrency(unit.rent_amount)}/month
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
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