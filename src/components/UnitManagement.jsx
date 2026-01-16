import React, { useState, useEffect } from 'react'
import { useProperty } from '../context/PropertyContext'

const UnitManagement = () => {
  const { properties, addUnit, updateUnit, deleteUnit, fetchProperties, refreshProperties } = useProperty()
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [editingUnit, setEditingUnit] = useState(null)
  const [selectedProperty, setSelectedProperty] = useState('')
  const [newUnit, setNewUnit] = useState({
    unit_number: '',
    unit_type: 'bedsitter',
    rent_amount: '',
    deposit_amount: '',
    description: '',
    features: {}
  })
  const [filterProperty, setFilterProperty] = useState('')

  const unitTypes = {
    bedsitter: 'Bedsitter',
    studio: 'Studio',
    one_bedroom: 'One Bedroom',
    two_bedroom: 'Two Bedroom',
    three_bedroom: 'Three Bedroom'
  }

  const availableFeatures = [
    'Parking', 'Balcony', 'Security', 'Water Backup', 'Gym Access',
    'Swimming Pool', 'Internet', 'Cable TV', 'Air Conditioning', 'Furnished'
  ]

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  // Get all units from all properties, properly associated
  const allUnits = properties.flatMap(property => 
    (property.units || []).map(unit => ({
      ...unit,
      property_name: property.name,
      property_code: property.property_code,
      property_id: property.id
    }))
  )

  // Filter units by selected property
  const filteredUnits = filterProperty 
    ? allUnits.filter(unit => unit.property_id === filterProperty)
    : allUnits

  const handleAddUnit = async (e) => {
    e.preventDefault()
    if (!selectedProperty) {
      alert('Please select a property')
      return
    }
    
    try {
      // Prepare data for backend
      const unitData = {
        unit_number: newUnit.unit_number,
        unit_type: newUnit.unit_type,
        rent_amount: parseFloat(newUnit.rent_amount),
        deposit_amount: parseFloat(newUnit.deposit_amount),
        description: newUnit.description || '',
        features: newUnit.features
      };
      
      console.log('Sending unit data:', unitData)
      
      await addUnit(selectedProperty, unitData)
      
      // Reset form
      setNewUnit({
        unit_number: '',
        unit_type: 'bedsitter',
        rent_amount: '',
        deposit_amount: '',
        description: '',
        features: {}
      })
      setSelectedProperty('')
      setShowUnitModal(false)
      
      // Refresh properties to get updated data
      refreshProperties()
      
    } catch (error) {
      console.error('Error adding unit:', error)
      alert('Failed to add unit: ' + (error.response?.data?.message || error.message || 'Unknown error'))
    }
  }

  const handleEditUnit = (unit) => {
    setEditingUnit(unit)
    setSelectedProperty(unit.property_id)
    setNewUnit({
      unit_number: unit.unit_number,
      unit_type: unit.unit_type,
      rent_amount: unit.rent_amount,
      deposit_amount: unit.deposit_amount,
      description: unit.description || '',
      features: unit.features || {}
    })
    setShowUnitModal(true)
  }

  const handleUpdateUnit = async (e) => {
    e.preventDefault()
    if (!selectedProperty || !editingUnit) {
      alert('Please select a property and unit to edit')
      return
    }

    try {
      const unitData = {
        unit_number: newUnit.unit_number,
        unit_type: newUnit.unit_type,
        rent_amount: parseFloat(newUnit.rent_amount),
        deposit_amount: parseFloat(newUnit.deposit_amount),
        description: newUnit.description || '',
        features: newUnit.features
      }
      
      await updateUnit(selectedProperty, editingUnit.id, unitData)
      
      // Reset form
      setEditingUnit(null)
      setShowUnitModal(false)
      setNewUnit({
        unit_number: '',
        unit_type: 'bedsitter',
        rent_amount: '',
        deposit_amount: '',
        description: '',
        features: {}
      })
      setSelectedProperty('')
      
      // Refresh properties to get updated data
      refreshProperties()
    } catch (error) {
      console.error('Error updating unit:', error)
      alert('Failed to update unit: ' + (error.response?.data?.message || error.message || 'Unknown error'))
    }
  }

  const handleDeleteUnit = async (propertyId, unitId) => {
    if (window.confirm('Are you sure you want to delete this unit? This action cannot be undone.')) {
      try {
        await deleteUnit(propertyId, unitId)
        // Refresh properties to get updated data
        refreshProperties()
      } catch (error) {
        console.error('Error deleting unit:', error)
        alert('Failed to delete unit: ' + (error.response?.data?.message || error.message || 'Unknown error'))
      }
    }
  }

  const toggleFeature = (feature) => {
    setNewUnit(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [feature]: !prev.features[feature]
      }
    }))
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  // Calculate statistics
  const totalUnits = allUnits.length
  const occupiedUnits = allUnits.filter(unit => unit.is_occupied).length
  const availableUnits = allUnits.filter(unit => !unit.is_occupied).length
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  // Debug: Log current data
  useEffect(() => {
    console.log('📊 Properties:', properties)
    console.log('📊 All Units:', allUnits)
    console.log('📊 Filtered Units:', filteredUnits)
  }, [properties, allUnits, filteredUnits])

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col xs:flex-row justify-between items-start xs:items-center gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Unit Management</h2>
          <p className="text-xs text-gray-600 mt-1">Manage property units and their relationships to properties</p>
        </div>
        <button
          onClick={() => {
            setEditingUnit(null)
            setSelectedProperty('')
            setNewUnit({
              unit_number: '',
              unit_type: 'bedsitter',
              rent_amount: '',
              deposit_amount: '',
              description: '',
              features: {}
            })
            setShowUnitModal(true)
          }}
          className="bg-purple-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-medium transition-colors touch-target w-full xs:w-auto"
          disabled={properties.length === 0}
        >
          Add New Unit
        </button>
      </div>

      {properties.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-yellow-400 text-base">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                No Properties Found
              </h3>
              <div className="mt-1 text-xs text-yellow-700">
                <p>
                  You need to create properties first before adding units. 
                  Units must be associated with existing properties.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200">
          <div className="text-center">
            <div className="text-lg sm:text-xl font-bold text-purple-600">{totalUnits}</div>
            <div className="text-xs text-gray-600">Total Units</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200">
          <div className="text-center">
            <div className="text-lg sm:text-xl font-bold text-green-600">{occupiedUnits}</div>
            <div className="text-xs text-gray-600">Occupied Units</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200">
          <div className="text-center">
            <div className="text-lg sm:text-xl font-bold text-blue-600">{availableUnits}</div>
            <div className="text-xs text-gray-600">Available Units</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200">
          <div className="text-center">
            <div className="text-lg sm:text-xl font-bold text-orange-600">{occupancyRate}%</div>
            <div className="text-xs text-gray-600">Occupancy Rate</div>
          </div>
        </div>
      </div>

      {/* Add/Edit Unit Modal */}
      {showUnitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base sm:text-lg font-bold mb-4">
              {editingUnit ? 'Edit Unit' : 'Add New Unit'}
            </h3>
            
            {properties.length === 0 ? (
              <div className="text-center py-6 sm:py-8">
                <div className="text-3xl sm:text-4xl mb-2">🏠</div>
                <p className="text-sm text-gray-600">No properties available</p>
                <p className="text-xs text-gray-500">Create properties first to add units</p>
              </div>
            ) : (
              <form onSubmit={editingUnit ? handleUpdateUnit : handleAddUnit} className="space-y-3 sm:space-y-4">
                {/* Property Selection */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700">Select Property *</label>
                  <select
                    value={selectedProperty}
                    onChange={(e) => setSelectedProperty(e.target.value)}
                    className="w-full p-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 touch-target"
                    required
                    disabled={!!editingUnit}
                  >
                    <option value="">Choose a property</option>
                    {properties.map(property => (
                      <option key={property.id} value={property.id}>
                        {property.name} ({property.property_code})
                      </option>
                    ))}
                  </select>
                  {selectedProperty && (
                    <p className="text-xs text-gray-500 mt-1">
                      Selected: {properties.find(p => p.id === selectedProperty)?.name}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700">Unit Number *</label>
                    <input
                      type="text"
                      value={newUnit.unit_number}
                      onChange={(e) => setNewUnit({...newUnit, unit_number: e.target.value})}
                      className="w-full p-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 touch-target"
                      placeholder="e.g., 101"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700">Unit Type *</label>
                    <select
                      value={newUnit.unit_type}
                      onChange={(e) => setNewUnit({...newUnit, unit_type: e.target.value})}
                      className="w-full p-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 touch-target"
                      required
                    >
                      {Object.entries(unitTypes).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700">Rent Amount (KES) *</label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={newUnit.rent_amount}
                      onChange={(e) => setNewUnit({...newUnit, rent_amount: e.target.value})}
                      className="w-full p-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 touch-target"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700">Deposit Amount (KES) *</label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={newUnit.deposit_amount}
                      onChange={(e) => setNewUnit({...newUnit, deposit_amount: e.target.value})}
                      className="w-full p-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 touch-target"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={newUnit.description}
                    onChange={(e) => setNewUnit({...newUnit, description: e.target.value})}
                    className="w-full p-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 touch-target"
                    rows="2"
                    placeholder="Describe the unit features, size, amenities, etc."
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Features</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableFeatures.map((feature) => (
                      <label key={feature} className="flex items-center space-x-2 touch-target">
                        <input
                          type="checkbox"
                          checked={!!newUnit.features[feature]}
                          onChange={() => toggleFeature(feature)}
                          className="h-3 w-3 sm:h-4 sm:w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                        />
                        <span className="text-xs text-gray-700">{feature}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col xs:flex-row space-y-2 xs:space-y-0 xs:space-x-3 pt-3 sm:pt-4">
                  <button 
                    type="submit" 
                    className="bg-purple-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-medium transition-colors touch-target flex-1"
                    disabled={!selectedProperty}
                  >
                    {editingUnit ? 'Update Unit' : 'Create Unit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUnitModal(false)
                      setEditingUnit(null)
                      setNewUnit({
                        unit_number: '',
                        unit_type: 'bedsitter',
                        rent_amount: '',
                        deposit_amount: '',
                        description: '',
                        features: {}
                      })
                      setSelectedProperty('')
                    }}
                    className="bg-gray-500 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-gray-600 text-xs sm:text-sm font-medium transition-colors touch-target flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Units List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-base sm:text-lg font-semibold">
            All Units ({filteredUnits.length})
            {filterProperty && ` in ${properties.find(p => p.id === filterProperty)?.name}`}
          </h3>
          
          <div className="flex flex-col xs:flex-row gap-2 w-full sm:w-auto">
            <select
              value={filterProperty}
              onChange={(e) => setFilterProperty(e.target.value)}
              className="w-full sm:w-48 p-2 border border-gray-300 rounded-md text-xs sm:text-sm touch-target"
            >
              <option value="">All Properties</option>
              {properties.map(property => (
                <option key={property.id} value={property.id}>
                  {property.name} ({property.property_code})
                </option>
              ))}
            </select>
            
            {filterProperty && (
              <button
                onClick={() => setFilterProperty('')}
                className="w-full xs:w-auto bg-gray-500 text-white px-3 py-2 rounded-md text-xs sm:text-sm hover:bg-gray-600 whitespace-nowrap transition-colors touch-target"
              >
                Clear Filter
              </button>
            )}
          </div>
        </div>
        
        {filteredUnits.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-gray-500">
            <div className="text-3xl sm:text-4xl mb-2">🏢</div>
            <p className="text-sm">No units found</p>
            <p className="text-xs mt-1">
              {filterProperty 
                ? 'No units in this property. Add units to get started.' 
                : 'No units created yet. Add your first unit to get started.'}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Unit Details
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">
                    Property
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Financial Info
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden xs:table-cell">
                    Status
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUnits.map((unit) => (
                  <tr key={unit.id} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-6 py-4">
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-900">{unit.unit_code}</div>
                        <div className="text-xs text-gray-500">
                          {unitTypes[unit.unit_type]} • Unit {unit.unit_number}
                        </div>
                        <div className="text-xs text-gray-500 sm:hidden mt-1">
                          {unit.property_name}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-xs sm:text-sm font-medium text-gray-900">{unit.property_name}</div>
                      <div className="text-xs text-gray-500">{unit.property_code}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-sm font-medium text-gray-900">
                        {formatCurrency(unit.rent_amount)}
                      </div>
                      <div className="text-xs text-gray-500">
                        Deposit: {formatCurrency(unit.deposit_amount)}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden xs:table-cell">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${unit.is_occupied 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'}`}>
                        {unit.is_occupied ? 'Occupied' : 'Available'}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col xs:flex-row gap-1 xs:gap-2">
                        <button
                          onClick={() => handleEditUnit(unit)}
                          className="text-blue-600 hover:text-blue-900 text-xs transition-colors touch-target px-2 py-1 rounded hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUnit(unit.property_id, unit.id)}
                          className="text-red-600 hover:text-red-900 text-xs transition-colors touch-target px-2 py-1 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default UnitManagement