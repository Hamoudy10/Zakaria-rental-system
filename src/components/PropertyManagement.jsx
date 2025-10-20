import React, { useState, useEffect } from 'react'
import { useProperty } from '../context/PropertyContext'
import UnitManagement from './UnitManagement'

const PropertyManagement = () => {
  const { properties, addProperty, updateProperty, deleteProperty, setSelectedProperty } = useProperty()
  const [showPropertyModal, setShowPropertyModal] = useState(false)
  const [editingProperty, setEditingProperty] = useState(null)
  const [showUnits, setShowUnits] = useState(null)

  const getOccupancyRate = (property) => {
    if (property.total_units === 0) return 0
    return Math.round(((property.total_units - property.available_units) / property.total_units) * 100)
  }

  const getOccupancyColor = (rate) => {
    if (rate >= 90) return 'text-green-600'
    if (rate >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  // Separate Modal Component for Property Form
  const PropertyModal = React.memo(({ isOpen, onClose, onSubmit, title, isEdit = false, initialData }) => {
    const [formData, setFormData] = useState({
      property_code: '',
      name: '',
      address: '',
      county: '',
      town: '',
      description: '',
      total_units: 0,
      unit_type: 'bedsitter' // Updated default value
    })

    // Initialize form data when modal opens
    useEffect(() => {
      if (isOpen) {
        setFormData(initialData || {
          property_code: '',
          name: '',
          address: '',
          county: '',
          town: '',
          description: '',
          total_units: 0,
          unit_type: 'bedsitter' // Updated default value
        })
      }
    }, [isOpen, initialData])

    const handleInputChange = (field, value) => {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }

    const handleLocalSubmit = () => {
      onSubmit(formData)
    }

    if (!isOpen) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
          {/* Compact Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              type="button"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Expanded Form Content Area */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {/* Property Code and Name */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Property Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., WL001"
                    value={formData.property_code}
                    onChange={(e) => handleInputChange('property_code', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Westlands Apartments"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Unit Type Field - UPDATED OPTIONS */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Unit Type *
                </label>
                <select
                  value={formData.unit_type}
                  onChange={(e) => handleInputChange('unit_type', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="bedsitter">Bedsitter</option>
                  <option value="studio">Studio</option>
                  <option value="one_bedroom">One Bedroom</option>
                  <option value="two_bedroom">Two Bedroom</option>
                  <option value="three_bedroom">Three Bedroom</option>
                </select>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Address *
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  rows="2"
                  placeholder="Full property address"
                  required
                />
              </div>

              {/* County and Town */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    County *
                  </label>
                  <input
                    type="text"
                    value={formData.county}
                    onChange={(e) => handleInputChange('county', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Nairobi"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Town/Area *
                  </label>
                  <input
                    type="text"
                    value={formData.town}
                    onChange={(e) => handleInputChange('town', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Westlands"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  rows="3"
                  placeholder="Property features and amenities..."
                />
              </div>

              {/* Total Units */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Total Units *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.total_units}
                  onChange={(e) => handleInputChange('total_units', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 max-w-xs"
                  required
                />
              </div>
            </div>
          </div>

          {/* Compact Footer with Buttons */}
          <div className="flex justify-end space-x-2 p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 border border-transparent rounded hover:bg-red-700 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLocalSubmit}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    )
  })

  const handleAddProperty = async (propertyData) => {
    try {
      await addProperty(propertyData)
      setShowPropertyModal(false)
    } catch (error) {
      console.error('Error adding property:', error)
    }
  }

  const handleEditProperty = (property) => {
    setEditingProperty(property)
    setShowPropertyModal(true)
  }

  const handleUpdateProperty = async (propertyData) => {
    try {
      await updateProperty(editingProperty.id, propertyData)
      setEditingProperty(null)
      setShowPropertyModal(false)
    } catch (error) {
      console.error('Error updating property:', error)
    }
  }

  const handleDeleteProperty = (propertyId) => {
    if (window.confirm('Are you sure you want to delete this property? This will also delete all associated units.')) {
      deleteProperty(propertyId)
    }
  }

  const handleCloseModal = () => {
    setShowPropertyModal(false)
    setEditingProperty(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Property Management</h2>
          <p className="text-gray-600">Manage properties and their rental units</p>
        </div>
        <button
          onClick={() => {
            setEditingProperty(null)
            setShowPropertyModal(true)
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          Add New Property
        </button>
      </div>

      {/* Property Modal */}
      <PropertyModal
        isOpen={showPropertyModal}
        onClose={handleCloseModal}
        onSubmit={editingProperty ? handleUpdateProperty : handleAddProperty}
        title={editingProperty ? 'Edit Property' : 'Add New Property'}
        isEdit={!!editingProperty}
        initialData={editingProperty ? {
          property_code: editingProperty.property_code || '',
          name: editingProperty.name || '',
          address: editingProperty.address || '',
          county: editingProperty.county || '',
          town: editingProperty.town || '',
          description: editingProperty.description || '',
          total_units: editingProperty.total_units || 0,
          unit_type: editingProperty.unit_type || 'bedsitter' // Updated default
        } : null}
      />

      {/* Properties Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map((property) => (
          <div key={property.id} className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg transition-shadow duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{property.name}</h3>
                <p className="text-sm text-gray-500">{property.property_code}</p>
              </div>
              <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                getOccupancyRate(property) >= 90 ? 'bg-green-100 text-green-800' :
                getOccupancyRate(property) >= 70 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {getOccupancyRate(property)}% Occupied
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Location:</span> {property.town}, {property.county}
              </p>
              <p className="text-sm text-gray-600 line-clamp-2">{property.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-2 bg-gray-50 rounded">
                <div className="text-lg font-bold text-gray-900">{property.total_units}</div>
                <div className="text-xs text-gray-500">Total Units</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded">
                <div className="text-lg font-bold text-green-600">{property.available_units}</div>
                <div className="text-xs text-gray-500">Available</div>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setSelectedProperty(property)
                  setShowUnits(showUnits === property.id ? null : property.id)
                }}
                className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 text-sm flex-1"
              >
                {showUnits === property.id ? 'Hide Units' : 'Manage Units'}
              </button>
              <button
                onClick={() => handleEditProperty(property)}
                className="bg-gray-600 text-white px-3 py-2 rounded hover:bg-gray-700 text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteProperty(property.id)}
                className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700 text-sm"
              >
                Delete
              </button>
            </div>

            {/* Units Section */}
            {showUnits === property.id && (
              <div className="mt-4 border-t pt-4">
                <UnitManagement property={property} />
              </div>
            )}
          </div>
        ))}
      </div>

      {properties.length === 0 && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🏠</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Properties Yet</h3>
          <p className="text-gray-600 mb-4">Get started by adding your first property</p>
          <button
            onClick={() => setShowPropertyModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Add Your First Property
          </button>
        </div>
      )}
    </div>
  )
}

export default PropertyManagement