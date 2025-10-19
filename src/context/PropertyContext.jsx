import React, { createContext, useState, useContext, useCallback } from 'react'
import { propertyAPI } from '../services/api'

const PropertyContext = createContext(undefined)

export const useProperty = () => {
  const context = useContext(PropertyContext)
  if (context === undefined) {
    throw new Error('useProperty must be used within a PropertyProvider')
  }
  return context
}

export const PropertyProvider = ({ children }) => {
  const [properties, setProperties] = useState([])
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Clear error function
  const clearError = useCallback(() => setError(null), [])

  // Fetch all properties from API
  const fetchProperties = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.getProperties()
      // Handle different response formats
      const propertiesData = response.data?.data || response.data?.properties || response.data || []
      setProperties(Array.isArray(propertiesData) ? propertiesData : [])
    } catch (err) {
      console.error('Error fetching properties:', err)
      const errorMessage = err.response?.data?.message || 'Failed to fetch properties'
      setError(errorMessage)
      setProperties([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch single property with units and details
  const fetchProperty = useCallback(async (propertyId) => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.getProperty(propertyId)
      const propertyData = response.data?.data || response.data
      
      if (propertyData) {
        setSelectedProperty(propertyData)
        // Also update the property in the properties list
        setProperties(prev => prev.map(p => 
          p.id === propertyId ? { ...p, ...propertyData } : p
        ))
        return propertyData
      } else {
        throw new Error('Property not found')
      }
    } catch (err) {
      console.error('Error fetching property:', err)
      const errorMessage = err.response?.data?.message || 'Failed to fetch property details'
      setError(errorMessage)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // Add new property via API
  const addProperty = useCallback(async (propertyData) => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.createProperty(propertyData)
      const newProperty = response.data?.data || response.data
      
      if (newProperty) {
        setProperties(prev => [...prev, { ...newProperty, units: [] }])
        return newProperty
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (err) {
      console.error('Error adding property:', err)
      const errorMessage = err.response?.data?.message || 'Failed to create property'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // Update property via API
  const updateProperty = useCallback(async (propertyId, updates) => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.updateProperty(propertyId, updates)
      const updatedProperty = response.data?.data || response.data
      
      setProperties(prev => prev.map(property => 
        property.id === propertyId ? { ...property, ...updatedProperty } : property
      ))
      
      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(prev => ({ ...prev, ...updatedProperty }))
      }
      
      return updatedProperty
    } catch (err) {
      console.error('Error updating property:', err)
      const errorMessage = err.response?.data?.message || 'Failed to update property'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [selectedProperty])

  // Delete property via API
  const deleteProperty = useCallback(async (propertyId) => {
    setLoading(true)
    setError(null)
    try {
      await propertyAPI.deleteProperty(propertyId)
      
      setProperties(prev => prev.filter(property => property.id !== propertyId))
      
      // Clear selected property if it's the one being deleted
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(null)
      }
      
      return { success: true, message: 'Property deleted successfully' }
    } catch (err) {
      console.error('Error deleting property:', err)
      const errorMessage = err.response?.data?.message || 'Failed to delete property'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [selectedProperty])

  // Add unit to property via API
  const addUnit = useCallback(async (propertyId, unitData) => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.addUnit(propertyId, unitData)
      const newUnit = response.data?.data || response.data
      
      if (!newUnit) {
        throw new Error('Invalid response from server')
      }

      // Update the properties state to include the new unit
      setProperties(prev => prev.map(property => {
        if (property.id === propertyId) {
          const currentUnits = property.units || []
          const updatedUnits = [...currentUnits, newUnit]
          return {
            ...property,
            units: updatedUnits,
            // Update available units count
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        }
        return property
      }))

      // If selected property is the one we're adding to, update it too
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(prev => {
          const currentUnits = prev.units || []
          const updatedUnits = [...currentUnits, newUnit]
          return {
            ...prev,
            units: updatedUnits,
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        })
      }

      return newUnit
    } catch (err) {
      console.error('Error adding unit:', err)
      const errorMessage = err.response?.data?.message || 'Failed to add unit'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [selectedProperty])

  // Update unit via API
  const updateUnit = useCallback(async (propertyId, unitId, updates) => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.updateUnit(propertyId, unitId, updates)
      const updatedUnit = response.data?.data || response.data
      
      if (!updatedUnit) {
        throw new Error('Invalid response from server')
      }

      setProperties(prev => prev.map(property => {
        if (property.id === propertyId) {
          const updatedUnits = (property.units || []).map(unit => 
            unit.id === unitId ? { ...unit, ...updatedUnit } : unit
          )
          return {
            ...property,
            units: updatedUnits,
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        }
        return property
      }))

      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(prev => {
          const updatedUnits = (prev.units || []).map(unit => 
            unit.id === unitId ? { ...unit, ...updatedUnit } : unit
          )
          return {
            ...prev,
            units: updatedUnits,
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        })
      }

      return updatedUnit
    } catch (err) {
      console.error('Error updating unit:', err)
      const errorMessage = err.response?.data?.message || 'Failed to update unit'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [selectedProperty])

  // Delete unit via API
  const deleteUnit = useCallback(async (propertyId, unitId) => {
    setLoading(true)
    setError(null)
    try {
      await propertyAPI.deleteUnit(propertyId, unitId)
      
      setProperties(prev => prev.map(property => {
        if (property.id === propertyId) {
          const updatedUnits = (property.units || []).filter(unit => unit.id !== unitId)
          return {
            ...property,
            units: updatedUnits,
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        }
        return property
      }))

      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(prev => {
          const updatedUnits = (prev.units || []).filter(unit => unit.id !== unitId)
          return {
            ...prev,
            units: updatedUnits,
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        })
      }

      return { success: true, message: 'Unit deleted successfully' }
    } catch (err) {
      console.error('Error deleting unit:', err)
      const errorMessage = err.response?.data?.message || 'Failed to delete unit'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [selectedProperty])

  // Update unit occupancy status
  const updateUnitOccupancy = useCallback(async (propertyId, unitId, isOccupied) => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.updateUnitOccupancy(propertyId, unitId, { is_occupied: isOccupied })
      const updatedUnit = response.data?.data || response.data
      
      setProperties(prev => prev.map(property => {
        if (property.id === propertyId) {
          const updatedUnits = (property.units || []).map(unit => {
            if (unit.id === unitId) {
              return { ...unit, is_occupied: isOccupied }
            }
            return unit
          })
          return {
            ...property,
            units: updatedUnits,
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        }
        return property
      }))

      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(prev => {
          const updatedUnits = (prev.units || []).map(unit => {
            if (unit.id === unitId) {
              return { ...unit, is_occupied: isOccupied }
            }
            return unit
          })
          return {
            ...prev,
            units: updatedUnits,
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        })
      }

      return updatedUnit
    } catch (err) {
      console.error('Error updating unit occupancy:', err)
      const errorMessage = err.response?.data?.message || 'Failed to update unit occupancy'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [selectedProperty])

  // Get property statistics
  const getPropertyStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.getPropertyStats()
      return response.data?.data || response.data || {}
    } catch (err) {
      console.error('Error fetching property stats:', err)
      const errorMessage = err.response?.data?.message || 'Failed to fetch property statistics'
      setError(errorMessage)
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  // Search properties
  const searchProperties = useCallback(async (searchTerm) => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.searchProperties(searchTerm)
      const searchResults = response.data?.data || response.data?.properties || response.data || []
      return Array.isArray(searchResults) ? searchResults : []
    } catch (err) {
      console.error('Error searching properties:', err)
      const errorMessage = err.response?.data?.message || 'Failed to search properties'
      setError(errorMessage)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // Get units by property
  const getUnitsByProperty = useCallback((propertyId) => {
    const property = properties.find(p => p.id === propertyId)
    return property?.units || []
  }, [properties])

  // Get available units
  const getAvailableUnits = useCallback((propertyId = null) => {
    if (propertyId) {
      const property = properties.find(p => p.id === propertyId)
      return property?.units?.filter(unit => !unit.is_occupied) || []
    }
    
    // Return all available units across all properties
    return properties.flatMap(property => 
      property.units?.filter(unit => !unit.is_occupied) || []
    )
  }, [properties])

  // Get occupied units
  const getOccupiedUnits = useCallback((propertyId = null) => {
    if (propertyId) {
      const property = properties.find(p => p.id === propertyId)
      return property?.units?.filter(unit => unit.is_occupied) || []
    }
    
    // Return all occupied units across all properties
    return properties.flatMap(property => 
      property.units?.filter(unit => unit.is_occupied) || []
    )
  }, [properties])

  // Calculate property statistics locally
  const calculatePropertyStats = useCallback(() => {
    const totalProperties = properties.length
    const totalUnits = properties.reduce((sum, property) => 
      sum + (property.units?.length || 0), 0
    )
    const occupiedUnits = properties.reduce((sum, property) => 
      sum + (property.units?.filter(unit => unit.is_occupied).length || 0), 0
    )
    const availableUnits = totalUnits - occupiedUnits
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0

    return {
      totalProperties,
      totalUnits,
      occupiedUnits,
      availableUnits,
      occupancyRate: Math.round(occupancyRate * 100) / 100
    }
  }, [properties])

  // Load properties on mount
  React.useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  const value = React.useMemo(() => ({
    // State
    properties,
    selectedProperty,
    loading,
    error,
    
    // Setters
    setSelectedProperty,
    
    // Property operations
    fetchProperties,
    fetchProperty,
    addProperty,
    updateProperty,
    deleteProperty,
    
    // Unit operations
    addUnit,
    updateUnit,
    deleteUnit,
    updateUnitOccupancy,
    
    // Utility functions
    getPropertyStats,
    searchProperties,
    getUnitsByProperty,
    getAvailableUnits,
    getOccupiedUnits,
    calculatePropertyStats,
    clearError
  }), [
    properties,
    selectedProperty,
    loading,
    error,
    fetchProperties,
    fetchProperty,
    addProperty,
    updateProperty,
    deleteProperty,
    addUnit,
    updateUnit,
    deleteUnit,
    updateUnitOccupancy,
    getPropertyStats,
    searchProperties,
    getUnitsByProperty,
    getAvailableUnits,
    getOccupiedUnits,
    calculatePropertyStats,
    clearError
  ])

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
}