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
  const { user: authUser, token: authToken } = useAuth() // Added authToken

  // Check authentication status using AuthContext
  const isAuthenticated = useCallback(() => {
    return !!authUser && !!authToken; // Added check for authToken
  }, [authUser, authToken]) // Added authToken dependency

  // Clear error function
  const clearError = useCallback(() => setError(null), [])

  // Calculate accurate property stats based on actual units
  const calculatePropertyStats = useCallback((property, units = []) => {
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
    // Check authentication before making API call
    if (!isAuthenticated()) {
      console.log('🛑 PropertyContext: User not authenticated, skipping property fetch')
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
      console.log('👤 User role:', authUser?.role)
      console.log('🔑 Token present:', !!authToken)
      
      // Note: The backend now automatically handles agent vs admin in the same endpoint
      // So we don't need different endpoints anymore
      const response = await propertyAPI.getProperties()
      
      // Log response for debugging
      console.log('📦 API Response:', response)
      
      // Handle different response formats
      const propertiesData = response.data?.data || response.data?.properties || response.data || []
      
      if (Array.isArray(propertiesData)) {
        console.log(`✅ Received ${propertiesData.length} properties from API`)
        
        // IMPORTANT: We're NOT fetching units for each property individually anymore
        // This was causing too many API calls and potential errors
        // Instead, rely on the data returned by the API
        
        const processedProperties = propertiesData.map(property => {
          // Use the counts provided by the API (they come from the query)
          const total_units = property.unit_count || property.total_units || 0
          const occupied_units = property.occupied_units || 0
          const available_units = property.available_units_count || property.available_units || 0
          const occupancy_rate = total_units > 0 ? (occupied_units / total_units) * 100 : 0
          
          return {
            ...property,
            units: [], // Empty array for now, will fetch units only when needed
            total_units: parseInt(total_units),
            available_units: parseInt(available_units),
            occupied_units: parseInt(occupied_units),
            occupancy_rate: Math.round(occupancy_rate * 100) / 100
          }
        })
        
        setProperties(processedProperties)
        console.log(`✅ Successfully processed ${processedProperties.length} properties`)
      } else {
        console.warn('⚠️ Properties data is not an array:', propertiesData)
        setProperties([])
      }
    } catch (err) {
      console.error('❌ Error fetching properties:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        config: err.config
      })
      
      // Check if it's a 404 error
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
  }, [isAuthenticated, properties.length, authUser?.role, authToken]) // Added dependencies

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
      const stats = calculatePropertyStats(null, units)

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
      console.error('❌ Error fetching property units:', err)
      
      // If it's a 403 error, agent doesn't have access to this property
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
        const stats = calculatePropertyStats(propertyData, units)
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
      console.error('❌ Error fetching property:', err)
      
      // If it's a 403 error, agent doesn't have access to this property
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
        // Initialize with empty units and calculate stats
        const stats = calculatePropertyStats(newProperty, [])
        setProperties(prev => [...prev, { 
          ...newProperty, 
          units: [],
          total_units: stats.total_units,
          available_units: stats.available_units,
          occupied_units: stats.occupied_units,
          occupancy_rate: stats.occupancy_rate
        }])
        console.log(`✅ Successfully added property: ${newProperty.name} with unit type: ${newProperty.unit_type}`)
        return newProperty
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (err) {
      console.error('❌ Error adding property:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to create property'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, authUser?.role, calculatePropertyStats])

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
      const stats = calculatePropertyStats(updatedProperty, currentUnits)
      
      const propertyWithStats = {
        ...updatedProperty,
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
      
      console.log(`✅ Successfully updated property: ${updatedProperty.name} with unit type: ${updatedProperty.unit_type}`)
      return updatedProperty
    } catch (err) {
      console.error('❌ Error updating property:', err)
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
      console.error('❌ Error deleting property:', err)
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
      console.log(`🔄 Adding unit to property ${propertyId}...`)
      const response = await propertyAPI.addUnit(propertyId, unitData)
      const newUnit = response.data?.data || response.data
      
      if (!newUnit) {
        throw new Error('Invalid response from server')
      }

      // Refresh the units for this property to ensure we have the latest data
      await fetchPropertyUnits(propertyId)

      console.log(`✅ Successfully added unit: ${newUnit.unit_number}`)
      return newUnit
    } catch (err) {
      console.error('❌ Error adding unit:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to add unit'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, fetchPropertyUnits])

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

      // Refresh units to get accurate counts
      await fetchPropertyUnits(propertyId)

      console.log(`✅ Successfully updated unit: ${updatedUnit.unit_number}`)
      return updatedUnit
    } catch (err) {
      console.error('❌ Error updating unit:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to update unit'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, fetchPropertyUnits])

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
      
      // Refresh units to get accurate counts
      await fetchPropertyUnits(propertyId)

      console.log(`✅ Successfully deleted unit ${unitId}`)
      return { success: true, message: 'Unit deleted successfully' }
    } catch (err) {
      console.error('❌ Error deleting unit:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to delete unit'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, fetchPropertyUnits])

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
      
      // Refresh units to get accurate counts
      await fetchPropertyUnits(propertyId)

      console.log(`✅ Successfully updated occupancy for unit ${unitId} to ${isOccupied ? 'occupied' : 'vacant'}`)
      return updatedUnit
    } catch (err) {
      console.error('❌ Error updating unit occupancy:', err)
      const errorMessage = err.message || err.response?.data?.message || 'Failed to update unit occupancy'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, fetchPropertyUnits])

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
      console.error('❌ Error fetching property stats:', err)
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
      console.error('❌ Error searching properties:', err)
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

  // Refresh properties data
  const refreshProperties = useCallback(() => {
    fetchProperties(true)
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
  }, [authUser, authToken, isAuthenticated]) // Added authToken dependency

  const value = React.useMemo(() => ({
    // State
    properties,
    selectedProperty,
    loading,
    error,
    isAuthenticated: isAuthenticated(),
    authUser, // Expose authUser for role checking in components
    
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