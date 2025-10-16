import React, { createContext, useState, useContext, useCallback } from 'react'

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

  // Mock data - in real app, this would come from API
  const mockProperties = [
    {
      id: '1',
      property_code: 'WL001',
      name: 'Westlands Apartments',
      address: '123 Westlands Road, Nairobi',
      county: 'Nairobi',
      town: 'Westlands',
      description: 'Luxury apartments in Westlands with modern amenities',
      total_units: 24,
      available_units: 8,
      created_at: new Date().toISOString(),
      units: [
        {
          id: '1-1',
          property_id: '1',
          unit_code: 'WL001-101',
          unit_type: 'one_bedroom',
          unit_number: '101',
          rent_amount: 45000,
          deposit_amount: 90000,
          description: 'Spacious one bedroom apartment',
          features: ['Parking', 'Balcony', 'Security', 'Water Backup'],
          is_occupied: false,
          is_active: true
        },
        {
          id: '1-2',
          property_id: '1',
          unit_code: 'WL001-102',
          unit_type: 'two_bedroom',
          unit_number: '102',
          rent_amount: 65000,
          deposit_amount: 130000,
          description: 'Modern two bedroom apartment',
          features: ['Parking', 'Balcony', 'Security', 'Water Backup', 'Gym Access'],
          is_occupied: true,
          is_active: true
        }
      ]
    },
    {
      id: '2',
      property_code: 'KL002',
      name: 'Kilimani Towers',
      address: '456 Kilimani Road, Nairobi',
      county: 'Nairobi',
      town: 'Kilimani',
      description: 'High-end residential towers in Kilimani',
      total_units: 36,
      available_units: 12,
      created_at: new Date().toISOString(),
      units: [
        {
          id: '2-1',
          property_id: '2',
          unit_code: 'KL002-201',
          unit_type: 'studio',
          unit_number: '201',
          rent_amount: 35000,
          deposit_amount: 70000,
          description: 'Compact studio apartment',
          features: ['Parking', 'Security', 'Water Backup'],
          is_occupied: false,
          is_active: true
        }
      ]
    }
  ]

  // Initialize with mock data
  React.useEffect(() => {
    setProperties(mockProperties)
  }, [])

  const addProperty = useCallback((propertyData) => {
    const newProperty = {
      id: Math.random().toString(36).substr(2, 9),
      ...propertyData,
      available_units: propertyData.total_units,
      created_at: new Date().toISOString(),
      units: []
    }
    setProperties(prev => [...prev, newProperty])
    return newProperty
  }, [])

  const updateProperty = useCallback((propertyId, updates) => {
    setProperties(prev => prev.map(property => 
      property.id === propertyId ? { ...property, ...updates } : property
    ))
  }, [])

  const deleteProperty = useCallback((propertyId) => {
    setProperties(prev => prev.filter(property => property.id !== propertyId))
  }, [])

  const addUnit = useCallback((propertyId, unitData) => {
    const newUnit = {
      id: `${propertyId}-${Math.random().toString(36).substr(2, 9)}`,
      property_id: propertyId,
      ...unitData,
      is_occupied: false,
      is_active: true
    }
    
    setProperties(prev => prev.map(property => {
      if (property.id === propertyId) {
        const updatedUnits = [...property.units, newUnit]
        return {
          ...property,
          units: updatedUnits,
          available_units: updatedUnits.filter(unit => !unit.is_occupied).length
        }
      }
      return property
    }))
    
    return newUnit
  }, [])

  const updateUnit = useCallback((propertyId, unitId, updates) => {
    setProperties(prev => prev.map(property => {
      if (property.id === propertyId) {
        const updatedUnits = property.units.map(unit => 
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
  }, [])

  const deleteUnit = useCallback((propertyId, unitId) => {
    setProperties(prev => prev.map(property => {
      if (property.id === propertyId) {
        const updatedUnits = property.units.filter(unit => unit.id !== unitId)
        return {
          ...property,
          units: updatedUnits,
          available_units: updatedUnits.filter(unit => !unit.is_occupied).length
        }
      }
      return property
    }))
  }, [])

  // Add this function to the existing PropertyContext
const updateUnitOccupancy = useCallback((unitId, isOccupied) => {
  setProperties(prev => prev.map(property => {
    const updatedUnits = property.units.map(unit => {
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
}, [])

  const value = React.useMemo(() => ({
    properties,
    selectedProperty,
    setSelectedProperty,
    loading,
    addProperty,
    updateProperty,
    deleteProperty,
    addUnit,
    updateUnit,
    deleteUnit,
    updateUnitOccupancy 
  }), [
    properties, 
    selectedProperty, 
    loading, 
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