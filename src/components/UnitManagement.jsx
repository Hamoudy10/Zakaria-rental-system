import React, { useState } from 'react'
import { useProperty } from '../context/PropertyContext'

const UnitManagement = ({ property }) => {
  const { addUnit, updateUnit, deleteUnit } = useProperty()
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [editingUnit, setEditingUnit] = useState(null)
  const [newUnit, setNewUnit] = useState({
    unit_code: '',
    unit_type: 'bedsitter',
    unit_number: '',
    rent_amount: '',
    deposit_amount: '',
    description: '',
    features: []
  })

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

  const handleAddUnit = async (e) => {
    e.preventDefault()
    try {
      addUnit(property.id, {
        ...newUnit,
        rent_amount: parseFloat(newUnit.rent_amount),
        deposit_amount: parseFloat(newUnit.deposit_amount)
      })
      setNewUnit({
        unit_code: '',
        unit_type: 'bedsitter',
        unit_number: '',
        rent_amount: '',
        deposit_amount: '',
        description: '',
        features: []
      })
      setShowUnitModal(false)
    } catch (error) {
      console.error('Error adding unit:', error)
    }
  }

  const handleEditUnit = (unit) => {
    setEditingUnit(unit)
    setNewUnit({
      unit_code: unit.unit_code,
      unit_type: unit.unit_type,
      unit_number: unit.unit_number,
      rent_amount: unit.rent_amount,
      deposit_amount: unit.deposit_amount,
      description: unit.description,
      features: unit.features || []
    })
    setShowUnitModal(true)
  }

  const handleUpdateUnit = async (e) => {
    e.preventDefault()
    try {
      updateUnit(property.id, editingUnit.id, {
        ...newUnit,
        rent_amount: parseFloat(newUnit.rent_amount),
        deposit_amount: parseFloat(newUnit.deposit_amount)
      })
      setEditingUnit(null)
      setShowUnitModal(false)
      setNewUnit({
        unit_code: '',
        unit_type: 'bedsitter',
        unit_number: '',
        rent_amount: '',
        deposit_amount: '',
        description: '',
        features: []
      })
    } catch (error) {
      console.error('Error updating unit:', error)
    }
  }

  const handleDeleteUnit = (unitId) => {
    if (window.confirm('Are you sure you want to delete this unit?')) {
      deleteUnit(property.id, unitId)
    }
  }

  const toggleFeature = (feature) => {
    setNewUnit(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature]
    }))
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount)
  }

  
  return (

    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold text-gray-900">Units in {property.name}</h4>
        <button
          onClick={() => {
            setEditingUnit(null)
            setShowUnitModal(true)
          }}
          className="btn-primary text-sm"
        >
          Add Unit
        </button>
      </div>

      {/* Add/Edit Unit Modal */}
      {showUnitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingUnit ? 'Edit Unit' : 'Add New Unit'} - {property.name}
            </h3>
            <form onSubmit={editingUnit ? handleUpdateUnit : handleAddUnit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unit Code *</label>
                  <input
                    type="text"
                    value={newUnit.unit_code}
                    onChange={(e) => setNewUnit({...newUnit, unit_code: e.target.value})}
                    className="input-primary"
                    placeholder="e.g., WL001-101"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unit Number *</label>
                  <input
                    type="text"
                    value={newUnit.unit_number}
                    onChange={(e) => setNewUnit({...newUnit, unit_number: e.target.value})}
                    className="input-primary"
                    placeholder="e.g., 101"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unit Type *</label>
                  <select
                    value={newUnit.unit_type}
                    onChange={(e) => setNewUnit({...newUnit, unit_type: e.target.value})}
                    className="input-primary"
                    required
                  >
                    {Object.entries(unitTypes).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rent Amount (KES) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={newUnit.rent_amount}
                    onChange={(e) => setNewUnit({...newUnit, rent_amount: e.target.value})}
                    className="input-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Deposit Amount (KES) *</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={newUnit.deposit_amount}
                  onChange={(e) => setNewUnit({...newUnit, deposit_amount: e.target.value})}
                  className="input-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={newUnit.description}
                  onChange={(e) => setNewUnit({...newUnit, description: e.target.value})}
                  className="input-primary"
                  rows="3"
                  placeholder="Describe the unit features, size, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Features</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {availableFeatures.map((feature) => (
                    <label key={feature} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={newUnit.features.includes(feature)}
                        onChange={() => toggleFeature(feature)}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingUnit ? 'Update Unit' : 'Create Unit'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnitModal(false)
                    setEditingUnit(null)
                    setNewUnit({
                      unit_code: '',
                      unit_type: 'bedsitter',
                      unit_number: '',
                      rent_amount: '',
                      deposit_amount: '',
                      description: '',
                      features: []
                    })
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Units List */}
      <div className="space-y-3">
        {property.units && property.units.map((unit) => (
          <div key={unit.id} className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h5 className="font-semibold text-gray-900">{unit.unit_code}</h5>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    unit.is_occupied 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {unit.is_occupied ? 'Occupied' : 'Available'}
                  </span>
                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                    {unitTypes[unit.unit_type]}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>
                    <span className="font-medium">Rent:</span> {formatCurrency(unit.rent_amount)}
                  </div>
                  <div>
                    <span className="font-medium">Deposit:</span> {formatCurrency(unit.deposit_amount)}
                  </div>
                </div>

                {unit.description && (
                  <p className="text-sm text-gray-600 mb-2">{unit.description}</p>
                )}

                {unit.features && unit.features.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {unit.features.map((feature, index) => (
                      <span key={index} className="px-2 py-1 bg-primary-100 text-primary-800 rounded text-xs">
                        {feature}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex space-x-2 ml-4">
                <button
                  onClick={() => handleEditUnit(unit)}
                  className="btn-secondary text-sm px-3"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteUnit(unit.id)}
                  className="btn-secondary text-sm px-3 bg-red-600 hover:bg-red-700 text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}

        {(!property.units || property.units.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🏢</div>
            <p>No units added yet</p>
            <p className="text-sm">Add your first unit to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default UnitManagement