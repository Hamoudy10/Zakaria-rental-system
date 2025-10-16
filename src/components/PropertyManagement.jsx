import React, { useState } from 'react'
import { useProperty } from '../context/PropertyContext'
import UnitManagement from './UnitManagement'

const PropertyManagement = () => {
  const { properties, addProperty, updateProperty, deleteProperty, setSelectedProperty } = useProperty()
  const [showPropertyModal, setShowPropertyModal] = useState(false)
  const [editingProperty, setEditingProperty] = useState(null)
  const [showUnits, setShowUnits] = useState(null)
  const [newProperty, setNewProperty] = useState({
    property_code: '',
    name: '',
    address: '',
    county: '',
    town: '',
    description: '',
    total_units: 0
  })

  const handleAddProperty = async (e) => {
    e.preventDefault()
    try {
      addProperty(newProperty)
      setNewProperty({
        property_code: '',
        name: '',
        address: '',
        county: '',
        town: '',
        description: '',
        total_units: 0
      })
      setShowPropertyModal(false)
    } catch (error) {
      console.error('Error adding property:', error)
    }
  }

  const handleEditProperty = (property) => {
    setEditingProperty(property)
    setNewProperty({
      property_code: property.property_code,
      name: property.name,
      address: property.address,
      county: property.county,
      town: property.town,
      description: property.description,
      total_units: property.total_units
    })
    setShowPropertyModal(true)
  }

  const handleUpdateProperty = async (e) => {
    e.preventDefault()
    try {
      updateProperty(editingProperty.id, newProperty)
      setEditingProperty(null)
      setShowPropertyModal(false)
      setNewProperty({
        property_code: '',
        name: '',
        address: '',
        county: '',
        town: '',
        description: '',
        total_units: 0
      })
    } catch (error) {
      console.error('Error updating property:', error)
    }
  }

  const handleDeleteProperty = (propertyId) => {
    if (window.confirm('Are you sure you want to delete this property? This will also delete all associated units.')) {
      deleteProperty(propertyId)
    }
  }

  const getOccupancyRate = (property) => {
    if (property.total_units === 0) return 0
    return Math.round(((property.total_units - property.available_units) / property.total_units) * 100)
  }

  const getOccupancyColor = (rate) => {
    if (rate >= 90) return 'text-green-600'
    if (rate >= 70) return 'text-yellow-600'
    return 'text-red-600'
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
          className="btn-primary"
        >
          Add New Property
        </button>
      </div>

      {/* Add/Edit Property Modal */}
      {showPropertyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingProperty ? 'Edit Property' : 'Add New Property'}
            </h3>
            <form onSubmit={editingProperty ? handleUpdateProperty : handleAddProperty} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Property Code *</label>
                  <input
                    type="text"
                    value={newProperty.property_code}
                    onChange={(e) => setNewProperty({...newProperty, property_code: e.target.value})}
                    className="input-primary"
                    placeholder="e.g., WL001"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Property Name *</label>
                  <input
                    type="text"
                    value={newProperty.name}
                    onChange={(e) => setNewProperty({...newProperty, name: e.target.value})}
                    className="input-primary"
                    placeholder="e.g., Westlands Apartments"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Address *</label>
                <textarea
                  value={newProperty.address}
                  onChange={(e) => setNewProperty({...newProperty, address: e.target.value})}
                  className="input-primary"
                  rows="2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">County *</label>
                  <input
                    type="text"
                    value={newProperty.county}
                    onChange={(e) => setNewProperty({...newProperty, county: e.target.value})}
                    className="input-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Town *</label>
                  <input
                    type="text"
                    value={newProperty.town}
                    onChange={(e) => setNewProperty({...newProperty, town: e.target.value})}
                    className="input-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={newProperty.description}
                  onChange={(e) => setNewProperty({...newProperty, description: e.target.value})}
                  className="input-primary"
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Total Units *</label>
                <input
                  type="number"
                  min="1"
                  value={newProperty.total_units}
                  onChange={(e) => setNewProperty({...newProperty, total_units: parseInt(e.target.value)})}
                  className="input-primary"
                  required
                />
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingProperty ? 'Update Property' : 'Create Property'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPropertyModal(false)
                    setEditingProperty(null)
                    setNewProperty({
                      property_code: '',
                      name: '',
                      address: '',
                      county: '',
                      town: '',
                      description: '',
                      total_units: 0
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

      {/* Properties Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map((property) => (
          <div key={property.id} className="card hover:shadow-lg transition-shadow duration-200">
            <div className="flex justify-between items-start mb-4">
              <div>
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
                className="btn-primary flex-1 text-sm"
              >
                {showUnits === property.id ? 'Hide Units' : 'Manage Units'}
              </button>
              <button
                onClick={() => handleEditProperty(property)}
                className="btn-secondary text-sm px-3"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteProperty(property.id)}
                className="btn-secondary text-sm px-3 bg-red-600 hover:bg-red-700 text-white"
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
        <div className="card text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🏠</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Properties Yet</h3>
          <p className="text-gray-600 mb-4">Get started by adding your first property</p>
          <button
            onClick={() => setShowPropertyModal(true)}
            className="btn-primary"
          >
            Add Your First Property
          </button>
        </div>
      )}
    </div>
  )
}

export default PropertyManagement