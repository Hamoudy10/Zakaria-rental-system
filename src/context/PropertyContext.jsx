import React, { createContext, useState, useContext, useCallback, useEffect } from 'react'
import { propertyAPI } from '../services/api'
import { useAuth } from './AuthContext'

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
  const { user: authUser, token: authToken } = useAuth()

  // Check authentication status using AuthContext
  const isAuthenticated = useCallback(() => {
    return !!authUser && !!authToken;
  }, [authUser, authToken])

  // Clear error function
  const clearError = useCallback(() => setError(null), [])

  // Calculate accurate property stats based on actual units
  const calculatePropertyStats = useCallback((units = []) => {
    const totalUnits = units.length
    const occupiedUnits = units.filter(unit => unit.is_occupied).length
    const availableUnits = totalUnits - occupiedUnits
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0

    return {
      total_units: totalUnits,
      available_units: availableUnits,
      occupied_units: occupiedUnits,
      occupancy_rate: Math.round(occupancyRate * 100) / 100
    }
  }, [])

  // Fetch all properties from API - ONLY WHEN AUTHENTICATED
  const fetchProperties = useCallback(async (forceRefresh = false) => {
    if (!isAuthenticated()) {
      console.log('🛑 PropertyContext: User not authenticated, skipping property fetch')
      setProperties([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      console.log('🔄 Fetching properties from API...')
      const response = await propertyAPI.getProperties()
      
      // Handle different response formats
      const propertiesData = response.data?.data || response.data?.properties || response.data || []
      
      if (Array.isArray(propertiesData)) {
        console.log(`✅ Received ${propertiesData.length} properties from API`)
        
        // For each property, fetch its units
        const propertiesWithUnits = await Promise.all(
          propertiesData.map(async (property) => {
            try {
              // Fetch units for this property
              const unitsResponse = await propertyAPI.getPropertyUnits(property.id)
              const units = unitsResponse.data?.data || unitsResponse.data?.units || []
              
              console.log(`📊 Property ${property.name}: fetched ${units.length} units`)
              
              // Calculate stats based on actual units
              const stats = calculatePropertyStats(units)
              
              return {
                ...property,
                units: Array.isArray(units) ? units : [],
                total_units: stats.total_units,
                available_units: stats.available_units,
                occupied_units: stats.occupied_units,
                occupancy_rate: stats.occupancy_rate
              }
            } catch (unitError) {
              console.error(`❌ Error fetching units for property ${property.id}:`, {
                message: unitError.message,
                status: unitError.response?.status,
                data: unitError.response?.data
              })
              // Return property with empty units if fetch fails
              return {
                ...property,
                units: [],
                total_units: 0,
                available_units: 0,
                occupied_units: 0,
                occupancy_rate: 0
              }
            }
          })
        )
        
        setProperties(propertiesWithUnits)
        console.log(`✅ Successfully loaded ${propertiesWithUnits.length} properties with units`)
      } else {
        console.warn('⚠️ Properties data is not an array:', propertiesData)
        setProperties([])
      }
    } catch (err) {
      console.error('❌ Error fetching properties:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      
      if (err.response?.status === 404) {
        setError('Properties endpoint not found. Please check backend configuration.')
      } else {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch properties'
        setError(errorMessage)
      }
      
      setProperties([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, calculatePropertyStats])

  // Fetch units for a specific property - ONLY WHEN AUTHENTICATED
  const fetchPropertyUnits = useCallback(async (propertyId) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated')
    }

    try {
      console.log(`🔄 Fetching units for property ${propertyId}...`)
      const response = await propertyAPI.getPropertyUnits(propertyId)
      const units = response.data?.data || response.data?.units || []
      
      if (!Array.isArray(units)) {
        throw new Error('Invalid units data format')
      }

      // Calculate accurate stats
      const stats = calculatePropertyStats(units)

      // Update the property in the state with new units and accurate counts
      setProperties(prev => prev.map(property => 
        property.id === propertyId 
          ? { 
              ...property, 
              units: units,
              total_units: stats.total_units,
              available_units: stats.available_units,
              occupied_units: stats.occupied_units,
              occupancy_rate: stats.occupancy_rate
            }
          : property
      ))

      // Update selected property if it's the one we're updating
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(prev => ({
          ...prev,
          units: units,
          total_units: stats.total_units,
          available_units: stats.available_units,
          occupied_units: stats.occupied_units,
          occupancy_rate: stats.occupancy_rate
        }))
      }

      console.log(`✅ Successfully fetched ${units.length} units for property ${propertyId}`)
      return units
    } catch (err) {
      console.error('❌ Error fetching property units:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      
      if (err.response?.status === 403) {
        const errorMessage = 'You do not have access to this property. It may not be assigned to you.'
        setError(errorMessage)
        throw new Error(errorMessage)
      }
      
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch property units'
      setError(errorMessage)
      throw err
    }
  }, [isAuthenticated, selectedProperty, calculatePropertyStats])

  // Fetch single property with units and details - ONLY WHEN AUTHENTICATED
  const fetchProperty = useCallback(async (propertyId) => {
    if (!isAuthenticated()) {
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
        // Fetch units for this property
        const units = await fetchPropertyUnits(propertyId)
        const stats = calculatePropertyStats(units)
        const propertyWithUnits = {
          ...propertyData,
          units: units,
          total_units: stats.total_units,
          available_units: stats.available_units,
          occupied_units: stats.occupied_units,
          occupancy_rate: stats.occupancy_rate
        }
        
        setSelectedProperty(propertyWithUnits)
        // Also update the property in the properties list
        setProperties(prev => prev.map(p => 
          p.id === propertyId ? { ...p, ...propertyWithUnits } : p
        ))
        console.log(`✅ Successfully fetched property: ${propertyData.name} with ${units.length} units`)
        return propertyWithUnits
      } else {
        throw new Error('Property not found')
      }
    } catch (err) {
      console.error('❌ Error fetching property:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      
      if (err.response?.status === 403) {
        const errorMessage = 'You do not have access to this property. It may not be assigned to you.'
        setError(errorMessage)
      } else {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch property details'
        setError(errorMessage)
      }
      
      return null
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, fetchPropertyUnits, calculatePropertyStats])

  // Add new property via API - ONLY WHEN AUTHENTICATED
  const addProperty = useCallback(async (propertyData) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated')
    }

    // Only admin can add properties
    if (authUser?.role !== 'admin') {
      throw new Error('Only admin users can add properties')
    }

    setLoading(true)
    setError(null)
    try {
      console.log('🔄 Adding new property...', propertyData)
      const response = await propertyAPI.createProperty(propertyData)
      const newProperty = response.data?.data || response.data
      
      if (newProperty) {
        // Initialize with empty units
        const propertyWithEmptyUnits = {
          ...newProperty,
          units: [],
          total_units: 0,
          available_units: 0,
          occupied_units: 0,
          occupancy_rate: 0
        }
        
        setProperties(prev => [...prev, propertyWithEmptyUnits])
        console.log(`✅ Successfully added property: ${newProperty.name}`)
        return newProperty
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (err) {
      console.error('❌ Error adding property:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.message || err.response?.data?.message || 'Failed to create property'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, authUser?.role])

  // Update property via API - ONLY WHEN AUTHENTICATED
  const updateProperty = useCallback(async (propertyId, updates) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Updating property ${propertyId}...`, updates)
      const response = await propertyAPI.updateProperty(propertyId, updates)
      const updatedProperty = response.data?.data || response.data
      
      // Get current units to recalculate stats
      const currentProperty = properties.find(p => p.id === propertyId)
      const currentUnits = currentProperty?.units || []
      const stats = calculatePropertyStats(currentUnits)
      
      const propertyWithStats = {
        ...updatedProperty,
        units: currentUnits,
        total_units: stats.total_units,
        available_units: stats.available_units,
        occupied_units: stats.occupied_units,
        occupancy_rate: stats.occupancy_rate
      }
      
      setProperties(prev => prev.map(property => 
        property.id === propertyId ? { ...property, ...propertyWithStats } : property
      ))
      
      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(prev => ({ ...prev, ...propertyWithStats }))
      }
      
      console.log(`✅ Successfully updated property: ${updatedProperty.name}`)
      return updatedProperty
    } catch (err) {
      console.error('❌ Error updating property:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.message || err.response?.data?.message || 'Failed to update property'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, selectedProperty, properties, calculatePropertyStats])

  // Delete property via API - ONLY WHEN AUTHENTICATED
  const deleteProperty = useCallback(async (propertyId) => {
    if (!isAuthenticated()) {
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
      console.error('❌ Error deleting property:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.message || err.response?.data?.message || 'Failed to delete property'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, selectedProperty])

  // Add unit to property via API - ONLY WHEN AUTHENTICATED
  const addUnit = useCallback(async (propertyId, unitData) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Adding unit to property ${propertyId}...`, unitData)
      const response = await propertyAPI.addUnit(propertyId, unitData)
      const newUnit = response.data?.data || response.data
      
      if (!newUnit) {
        throw new Error('Invalid response from server')
      }

      console.log('✅ Unit created:', newUnit)

      // Find the property in current state
      const currentProperty = properties.find(p => p.id === propertyId)
      const currentUnits = currentProperty?.units || []
      
      // Add the new unit to the property's units array
      const updatedUnits = [...currentUnits, newUnit]
      const stats = calculatePropertyStats(updatedUnits)
      
      // Create updated property
      const updatedProperty = {
        ...currentProperty,
        units: updatedUnits,
        total_units: stats.total_units,
        available_units: stats.available_units,
        occupied_units: stats.occupied_units,
        occupancy_rate: stats.occupancy_rate
      }

      // Update properties state
      setProperties(prev => prev.map(property => 
        property.id === propertyId ? updatedProperty : property
      ))

      // Update selected property if it's the one we're updating
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(updatedProperty)
      }

      console.log(`✅ Successfully added unit: ${newUnit.unit_number}. Property now has ${updatedUnits.length} units`)
      return newUnit
    } catch (err) {
      console.error('❌ Error adding unit:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.message || err.response?.data?.message || 'Failed to add unit'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, selectedProperty, properties, calculatePropertyStats])

  // Update unit via API - ONLY WHEN AUTHENTICATED
  const updateUnit = useCallback(async (propertyId, unitId, updates) => {
    if (!isAuthenticated()) {
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

      // Update the unit in the property's units array
      setProperties(prev => prev.map(property => {
        if (property.id === propertyId) {
          const updatedUnits = property.units?.map(unit => 
            unit.id === unitId ? { ...unit, ...updatedUnit } : unit
          ) || []
          
          const stats = calculatePropertyStats(updatedUnits)
          
          return {
            ...property,
            units: updatedUnits,
            total_units: stats.total_units,
            available_units: stats.available_units,
            occupied_units: stats.occupied_units,
            occupancy_rate: stats.occupancy_rate
          }
        }
        return property
      }))

      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        const updatedUnits = selectedProperty.units?.map(unit => 
          unit.id === unitId ? { ...unit, ...updatedUnit } : unit
        ) || []
        
        const stats = calculatePropertyStats(updatedUnits)
        
        setSelectedProperty(prev => ({
          ...prev,
          units: updatedUnits,
          total_units: stats.total_units,
          available_units: stats.available_units,
          occupied_units: stats.occupied_units,
          occupancy_rate: stats.occupancy_rate
        }))
      }

      console.log(`✅ Successfully updated unit: ${updatedUnit.unit_number}`)
      return updatedUnit
    } catch (err) {
      console.error('❌ Error updating unit:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.message || err.response?.data?.message || 'Failed to update unit'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, selectedProperty, calculatePropertyStats])

  // Delete unit via API - ONLY WHEN AUTHENTICATED
  const deleteUnit = useCallback(async (propertyId, unitId) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Deleting unit ${unitId}...`)
      await propertyAPI.deleteUnit(propertyId, unitId)
      
      // Update the property by removing the unit
      setProperties(prev => prev.map(property => {
        if (property.id === propertyId) {
          const updatedUnits = property.units?.filter(unit => unit.id !== unitId) || []
          const stats = calculatePropertyStats(updatedUnits)
          
          return {
            ...property,
            units: updatedUnits,
            total_units: stats.total_units,
            available_units: stats.available_units,
            occupied_units: stats.occupied_units,
            occupancy_rate: stats.occupancy_rate
          }
        }
        return property
      }))

      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        const updatedUnits = selectedProperty.units?.filter(unit => unit.id !== unitId) || []
        const stats = calculatePropertyStats(updatedUnits)
        
        setSelectedProperty(prev => ({
          ...prev,
          units: updatedUnits,
          total_units: stats.total_units,
          available_units: stats.available_units,
          occupied_units: stats.occupied_units,
          occupancy_rate: stats.occupancy_rate
        }))
      }

      console.log(`✅ Successfully deleted unit ${unitId}`)
      return { success: true, message: 'Unit deleted successfully' }
    } catch (err) {
      console.error('❌ Error deleting unit:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.message || err.response?.data?.message || 'Failed to delete unit'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, selectedProperty, calculatePropertyStats])

  // Update unit occupancy status - ONLY WHEN AUTHENTICATED
  const updateUnitOccupancy = useCallback(async (propertyId, unitId, isOccupied) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)
    try {
      console.log(`🔄 Updating occupancy for unit ${unitId}...`)
      const response = await propertyAPI.updateUnitOccupancy(propertyId, unitId, { is_occupied: isOccupied })
      const updatedUnit = response.data?.data || response.data
      
      // Update the unit in the property's units array
      setProperties(prev => prev.map(property => {
        if (property.id === propertyId) {
          const updatedUnits = property.units?.map(unit => 
            unit.id === unitId ? { ...unit, is_occupied: isOccupied } : unit
          ) || []
          
          const stats = calculatePropertyStats(updatedUnits)
          
          return {
            ...property,
            units: updatedUnits,
            total_units: stats.total_units,
            available_units: stats.available_units,
            occupied_units: stats.occupied_units,
            occupancy_rate: stats.occupancy_rate
          }
        }
        return property
      }))

      // Update selected property if it's the one being updated
      if (selectedProperty && selectedProperty.id === propertyId) {
        const updatedUnits = selectedProperty.units?.map(unit => 
          unit.id === unitId ? { ...unit, is_occupied: isOccupied } : unit
        ) || []
        
        const stats = calculatePropertyStats(updatedUnits)
        
        setSelectedProperty(prev => ({
          ...prev,
          units: updatedUnits,
          total_units: stats.total_units,
          available_units: stats.available_units,
          occupied_units: stats.occupied_units,
          occupancy_rate: stats.occupancy_rate
        }))
      }

      console.log(`✅ Successfully updated occupancy for unit ${unitId} to ${isOccupied ? 'occupied' : 'vacant'}`)
      return updatedUnit
    } catch (err) {
      console.error('❌ Error updating unit occupancy:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.message || err.response?.data?.message || 'Failed to update unit occupancy'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, selectedProperty, calculatePropertyStats])

  // Get property statistics - ONLY WHEN AUTHENTICATED
  const getPropertyStats = useCallback(async () => {
    if (!isAuthenticated()) {
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
      console.error('❌ Error fetching property stats:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.message || err.response?.data?.message || 'Failed to fetch property statistics'
      setError(errorMessage)
      return {}
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  // Search properties - ONLY WHEN AUTHENTICATED
  const searchProperties = useCallback(async (searchTerm) => {
    if (!isAuthenticated()) {
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
      console.error('❌ Error searching properties:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      })
      const errorMessage = err.message || err.response?.data?.message || 'Failed to search properties'
      setError(errorMessage)
      return []
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

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

  // Calculate overall property statistics locally
  const calculateOverallStats = useCallback(() => {
    const totalProperties = properties.length
    const totalUnits = properties.reduce((sum, property) => 
      sum + (property.total_units || 0), 0
    )
    const occupiedUnits = properties.reduce((sum, property) => 
      sum + (property.occupied_units || 0), 0
    )
    const availableUnits = properties.reduce((sum, property) => 
      sum + (property.available_units || 0), 0
    )
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0

    return {
      totalProperties,
      totalUnits,
      occupiedUnits,
      availableUnits,
      occupancyRate: Math.round(occupancyRate * 100) / 100
    }
  }, [properties])

  // Refresh properties data - ALWAYS fetches fresh data
  const refreshProperties = useCallback(() => {
    console.log('🔄 Forcing refresh of all properties and units...')
    setProperties([]) // Clear to force fresh fetch
    fetchProperties()
  }, [fetchProperties])

  // Load properties on mount ONLY IF AUTHENTICATED
  useEffect(() => {
    if (isAuthenticated()) {
      console.log('🔄 PropertyProvider: User authenticated, fetching properties...')
      fetchProperties()
    } else {
      console.log('🛑 PropertyProvider: User not authenticated, skipping property fetch')
      setProperties([])
    }
  }, [fetchProperties, isAuthenticated])

  // Listen for authentication changes
  useEffect(() => {
    if (!isAuthenticated()) {
      console.log('🛑 PropertyProvider: User logged out, clearing properties')
      setProperties([])
      setSelectedProperty(null)
    }
  }, [authUser, authToken, isAuthenticated])

  const value = React.useMemo(() => ({
    // State
    properties,
    selectedProperty,
    loading,
    error,
    isAuthenticated: isAuthenticated(),
    authUser,
    
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
    fetchPropertyUnits,
    
    // Utility functions
    getPropertyStats,
    searchProperties,
    getUnitsByProperty,
    getAvailableUnits,
    getOccupiedUnits,
    calculatePropertyStats: calculateOverallStats,
    clearError
  }), [
    properties,
    selectedProperty,
    loading,
    error,
    authUser,
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
    fetchPropertyUnits,
    getPropertyStats,
    searchProperties,
    getUnitsByProperty,
    getAvailableUnits,
    getOccupiedUnits,
    calculateOverallStats,
    clearError
  ])

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
}