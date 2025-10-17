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

  // Fetch all properties from API
  const fetchProperties = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await propertyAPI.getProperties()
      setProperties(response.data.properties || [])
    } catch (err) {
      console.error('Error fetching properties:', err)
      setError('Failed to fetch properties')
      setProperties([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch single property with units
  const fetchProperty = useCallback(async (propertyId) => {
    setLoading(true)
    setError(null)
    try {
      // For now, we'll simulate this since our backend doesn't have this endpoint yet
      // In a real app, you'd call: propertyAPI.getProperty(propertyId)
      const property = properties.find(p => p.id === propertyId)
      if (property) {
        setSelectedProperty(property)
      }
      return property
    } catch (err) {
      console.error('Error fetching property:', err)
      setError('Failed to fetch property')
      return null
    } finally {
      setLoading(false)
    }
  }, [properties])

  // Add new property via API
  const addProperty = useCallback(async (propertyData) => {
    setLoading(true)
    setError(null)
    try {
      // For now, we'll simulate API call until backend is fully implemented
      // const response = await propertyAPI.createProperty(propertyData)
      
      // Simulate API response
      const newProperty = {
        id: Math.random().toString(36).substr(2, 9),
        ...propertyData,
        available_units: propertyData.total_units,
        created_at: new Date().toISOString(),
        units: []
      }
      
      setProperties(prev => [...prev, newProperty])
      return newProperty
    } catch (err) {
      console.error('Error adding property:', err)
      setError('Failed to add property')
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
      // For now, we'll simulate API call
      // await propertyAPI.updateProperty(propertyId, updates)
      
      setProperties(prev => prev.map(property => 
        property.id === propertyId ? { ...property, ...updates } : property
      ))
      
      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(prev => ({ ...prev, ...updates }))
      }
    } catch (err) {
      console.error('Error updating property:', err)
      setError('Failed to update property')
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
      // For now, we'll simulate API call
      // await propertyAPI.deleteProperty(propertyId)
      
      setProperties(prev => prev.filter(property => property.id !== propertyId))
      
      // Clear selected property if it's the one being deleted
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(null)
      }
    } catch (err) {
      console.error('Error deleting property:', err)
      setError('Failed to delete property')
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
      // For now, we'll simulate API call
      const newUnit = {
        id: `${propertyId}-${Math.random().toString(36).substr(2, 9)}`,
        property_id: propertyId,
        ...unitData,
        is_occupied: false,
        is_active: true
      }
      
      setProperties(prev => prev.map(property => {
        if (property.id === propertyId) {
          const updatedUnits = [...(property.units || []), newUnit]
          return {
            ...property,
            units: updatedUnits,
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        }
        return property
      }))
      
      return newUnit
    } catch (err) {
      console.error('Error adding unit:', err)
      setError('Failed to add unit')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // Update unit via API
  const updateUnit = useCallback(async (propertyId, unitId, updates) => {
    setLoading(true)
    setError(null)
    try {
      // For now, we'll simulate API call
      setProperties(prev => prev.map(property => {
        if (property.id === propertyId) {
          const updatedUnits = (property.units || []).map(unit => 
            unit.id === unitId ? { ...unit, ...updates } : unit
          )
          return {
            ...property,
            units: updatedUnits,
            available_units: updatedUnits.filter(unit => !unit.is_occupied).length
          }
        }
        return property
      }))
    } catch (err) {
      console.error('Error updating unit:', err)
      setError('Failed to update unit')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // Delete unit via API
  const deleteUnit = useCallback(async (propertyId, unitId) => {
    setLoading(true)
    setError(null)
    try {
      // For now, we'll simulate API call
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
    } catch (err) {
      console.error('Error deleting unit:', err)
      setError('Failed to delete unit')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // Update unit occupancy status
  const updateUnitOccupancy = useCallback(async (unitId, isOccupied) => {
    setLoading(true)
    setError(null)
    try {
      // For now, we'll simulate API call
      setProperties(prev => prev.map(property => {
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
      }))
    } catch (err) {
      console.error('Error updating unit occupancy:', err)
      setError('Failed to update unit occupancy')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // Load properties on mount
  React.useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  const value = React.useMemo(() => ({
    properties,
    selectedProperty,
    setSelectedProperty,
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
    clearError: () => setError(null)
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
    updateUnitOccupancy
  ])

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
}