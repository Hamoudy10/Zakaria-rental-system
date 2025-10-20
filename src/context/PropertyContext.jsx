import React, { createContext, useState, useContext, useCallback, useEffect } from 'react'
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
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Check authentication status
  const checkAuth = useCallback(() => {
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')
    const authenticated = !!(token && user)
    setIsAuthenticated(authenticated)
    return authenticated
  }, [])

  // Clear error function
  const clearError = useCallback(() => setError(null), [])

  // Fetch all properties from API - ONLY WHEN AUTHENTICATED
  const fetchProperties = useCallback(async (forceRefresh = false) => {
    // Check authentication before making API call
    if (!checkAuth()) {
      console.log('🛑 Not fetching properties - user not authenticated')
      setProperties([])
      return
    }

    // Don't refetch if we already have properties and not forcing refresh
    if (properties.length > 0 && !forceRefresh) {
      console.log('✅ Using cached properties')
      return
    }

    setLoading(true)
    setError(null)
    try {
      console.log('🔄 Fetching properties from API...')
      const response = await propertyAPI.getProperties()
      
      // Handle different response formats
      const propertiesData = response.data?.data || response.data?.properties || response.data || []
      setProperties(Array.isArray(propertiesData) ? propertiesData : [])
      console.log(`✅ Successfully fetched ${propertiesData.length} properties`)
    } catch (err) {
      console.error('❌ Error fetching properties:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to fetch properties'
      setError(errorMessage)
      setProperties([])
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
    } finally {
      setLoading(false)
    }
  }, [checkAuth, properties.length])

  // Fetch single property with units and details - ONLY WHEN AUTHENTICATED
  const fetchProperty = useCallback(async (propertyId) => {
    if (!checkAuth()) {
      console.log('🛑 Not fetching property - user not authenticated')
      return null
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Fetching property ${propertyId}...`)
      const response = await propertyAPI.getProperty(propertyId)
      const propertyData = response.data?.data || response.data
      
      if (propertyData) {
        setSelectedProperty(propertyData)
        // Also update the property in the properties list
        setProperties(prev => prev.map(p => 
          p.id === propertyId ? { ...p, ...propertyData } : p
        ))
        console.log(`✅ Successfully fetched property: ${propertyData.name}`)
        return propertyData
      } else {
        throw new Error('Property not found')
      }
    } catch (err) {
      console.error('❌ Error fetching property:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to fetch property details'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [checkAuth])

  // Add new property via API - ONLY WHEN AUTHENTICATED - UPDATED FOR UNIT_TYPE
  const addProperty = useCallback(async (propertyData) => {
    if (!checkAuth()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log('🔄 Adding new property...', propertyData)
      const response = await propertyAPI.createProperty(propertyData)
      const newProperty = response.data?.data || response.data
      
      if (newProperty) {
        setProperties(prev => [...prev, { ...newProperty, units: [] }])
        console.log(`✅ Successfully added property: ${newProperty.name} with unit type: ${newProperty.unit_type}`)
        return newProperty
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (err) {
      console.error('❌ Error adding property:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to create property'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      throw err
    } finally {
      setLoading(false)
    }
  }, [checkAuth])

  // Update property via API - ONLY WHEN AUTHENTICATED - UPDATED FOR UNIT_TYPE
  const updateProperty = useCallback(async (propertyId, updates) => {
    if (!checkAuth()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Updating property ${propertyId}...`, updates)
      const response = await propertyAPI.updateProperty(propertyId, updates)
      const updatedProperty = response.data?.data || response.data
      
      setProperties(prev => prev.map(property => 
        property.id === propertyId ? { ...property, ...updatedProperty } : property
      ))
      
      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(prev => ({ ...prev, ...updatedProperty }))
      }
      
      console.log(`✅ Successfully updated property: ${updatedProperty.name} with unit type: ${updatedProperty.unit_type}`)
      return updatedProperty
    } catch (err) {
      console.error('❌ Error updating property:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to update property'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      throw err
    } finally {
      setLoading(false)
    }
  }, [checkAuth, selectedProperty])

  // Delete property via API - ONLY WHEN AUTHENTICATED
  const deleteProperty = useCallback(async (propertyId) => {
    if (!checkAuth()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Deleting property ${propertyId}...`)
      await propertyAPI.deleteProperty(propertyId)
      
      setProperties(prev => prev.filter(property => property.id !== propertyId))
      
      // Clear selected property if it's the one being deleted
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(null)
      }
      
      console.log(`✅ Successfully deleted property ${propertyId}`)
      return { success: true, message: 'Property deleted successfully' }
    } catch (err) {
      console.error('❌ Error deleting property:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to delete property'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      throw err
    } finally {
      setLoading(false)
    }
  }, [checkAuth, selectedProperty])

  // Add unit to property via API - ONLY WHEN AUTHENTICATED
  const addUnit = useCallback(async (propertyId, unitData) => {
    if (!checkAuth()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Adding unit to property ${propertyId}...`)
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

      console.log(`✅ Successfully added unit: ${newUnit.unit_number}`)
      return newUnit
    } catch (err) {
      console.error('❌ Error adding unit:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to add unit'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      throw err
    } finally {
      setLoading(false)
    }
  }, [checkAuth, selectedProperty])

  // Update unit via API - ONLY WHEN AUTHENTICATED
  const updateUnit = useCallback(async (propertyId, unitId, updates) => {
    if (!checkAuth()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Updating unit ${unitId}...`)
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

      console.log(`✅ Successfully updated unit: ${updatedUnit.unit_number}`)
      return updatedUnit
    } catch (err) {
      console.error('❌ Error updating unit:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to update unit'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      throw err
    } finally {
      setLoading(false)
    }
  }, [checkAuth, selectedProperty])

  // Delete unit via API - ONLY WHEN AUTHENTICATED
  const deleteUnit = useCallback(async (propertyId, unitId) => {
    if (!checkAuth()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Deleting unit ${unitId}...`)
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

      console.log(`✅ Successfully deleted unit ${unitId}`)
      return { success: true, message: 'Unit deleted successfully' }
    } catch (err) {
      console.error('❌ Error deleting unit:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to delete unit'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      throw err
    } finally {
      setLoading(false)
    }
  }, [checkAuth, selectedProperty])

  // Update unit occupancy status - ONLY WHEN AUTHENTICATED
  const updateUnitOccupancy = useCallback(async (propertyId, unitId, isOccupied) => {
    if (!checkAuth()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Updating occupancy for unit ${unitId}...`)
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

      console.log(`✅ Successfully updated occupancy for unit ${unitId} to ${isOccupied ? 'occupied' : 'vacant'}`)
      return updatedUnit
    } catch (err) {
      console.error('❌ Error updating unit occupancy:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to update unit occupancy'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      throw err
    } finally {
      setLoading(false)
    }
  }, [checkAuth, selectedProperty])

  // Get property statistics - ONLY WHEN AUTHENTICATED
  const getPropertyStats = useCallback(async () => {
    if (!checkAuth()) {
      console.log('🛑 Not fetching stats - user not authenticated')
      return {}
    }

    setLoading(true)
    setError(null)
    try {
      console.log('🔄 Fetching property stats...')
      const response = await propertyAPI.getPropertyStats()
      const stats = response.data?.data || response.data || {}
      console.log('✅ Successfully fetched property stats')
      return stats
    } catch (err) {
      console.error('❌ Error fetching property stats:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to fetch property statistics'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      return {}
    } finally {
      setLoading(false)
    }
  }, [checkAuth])

  // Search properties - ONLY WHEN AUTHENTICATED
  const searchProperties = useCallback(async (searchTerm) => {
    if (!checkAuth()) {
      console.log('🛑 Not searching properties - user not authenticated')
      return []
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Searching properties for: ${searchTerm}`)
      const response = await propertyAPI.searchProperties(searchTerm)
      const searchResults = response.data?.data || response.data?.properties || response.data || []
      const results = Array.isArray(searchResults) ? searchResults : []
      console.log(`✅ Found ${results.length} properties matching search`)
      return results
    } catch (err) {
      console.error('❌ Error searching properties:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to search properties'
      setError(errorMessage)
      
      // If it's an authentication error, update auth status
      if (err.response?.status === 401) {
        setIsAuthenticated(false)
      }
      return []
    } finally {
      setLoading(false)
    }
  }, [checkAuth])

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

  // Refresh properties data
  const refreshProperties = useCallback(() => {
    fetchProperties(true)
  }, [fetchProperties])

  // Load properties on mount ONLY IF AUTHENTICATED
  useEffect(() => {
    const authCheck = checkAuth()
    if (authCheck) {
      console.log('🔄 PropertyProvider: User authenticated, fetching properties...')
      fetchProperties()
    } else {
      console.log('🛑 PropertyProvider: User not authenticated, skipping property fetch')
      setProperties([])
    }
  }, [fetchProperties, checkAuth])

  // Listen for authentication changes
  useEffect(() => {
    const handleStorageChange = () => {
      const authCheck = checkAuth()
      if (authCheck && properties.length === 0) {
        console.log('🔄 Authentication detected, fetching properties...')
        fetchProperties()
      } else if (!authCheck) {
        console.log('🛑 User logged out, clearing properties')
        setProperties([])
        setSelectedProperty(null)
      }
    }

    // Listen for storage changes (login/logout)
    window.addEventListener('storage', handleStorageChange)
    
    // Also check auth when the component mounts
    handleStorageChange()

    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [checkAuth, fetchProperties, properties.length])

  const value = React.useMemo(() => ({
    // State
    properties,
    selectedProperty,
    loading,
    error,
    isAuthenticated,
    
    // Setters
    setSelectedProperty,
    
    // Property operations
    fetchProperties,
    fetchProperty,
    addProperty,
    updateProperty,
    deleteProperty,
    refreshProperties,
    
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
    clearError,
    checkAuth
  }), [
    properties,
    selectedProperty,
    loading,
    error,
    isAuthenticated,
    fetchProperties,
    fetchProperty,
    addProperty,
    updateProperty,
    deleteProperty,
    refreshProperties,
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
    clearError,
    checkAuth
  ])

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
}