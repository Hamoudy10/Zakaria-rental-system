import React, { useState, useEffect, useCallback } from 'react'
import { useProperty } from '../context/PropertyContext'
import { propertyAPI } from '../services/api'

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

  // Image Gallery State
  const [showImageGallery, setShowImageGallery] = useState(false)
  const [selectedUnitForImages, setSelectedUnitForImages] = useState(null)
  const [unitImages, setUnitImages] = useState([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [unitImageCounts, setUnitImageCounts] = useState({})

  const unitTypes = {
    bedsitter: 'Bedsitter',
    studio: 'Studio',
    one_bedroom: 'One Bedroom',
    two_bedroom: 'Two Bedroom',
    three_bedroom: 'Three Bedroom',
    shop: 'Shop',
    hall: 'Hall'
  }

  const availableFeatures = [
    'Parking', 'Balcony', 'Security', 'Water Backup', 'Gym Access',
    'Swimming Pool', 'Internet', 'Cable TV', 'Air Conditioning', 'Furnished'
  ]

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  // Inject styles for animations (shared or unique to UnitManagement)
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      .gallery-modal-enter { animation: fadeIn 0.2s ease-out forwards; }
      .gallery-content-enter { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .scrollbar-hide::-webkit-scrollbar { display: none; }
      .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
    `;
    document.head.appendChild(styleSheet);
    return () => document.head.removeChild(styleSheet);
  }, []);

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

  // Fetch image counts for all units
  useEffect(() => {
    const fetchImageCounts = async () => {
      if (allUnits.length === 0) return
      
      try {
        const unitIds = allUnits.map(u => u.id)
        const response = await propertyAPI.getUnitImageCounts(unitIds)
        if (response.data.success) {
          setUnitImageCounts(response.data.data || {})
        }
      } catch (error) {
        console.log('Could not fetch image counts:', error.message)
      }
    }
    
    fetchImageCounts()
  }, [allUnits.length])

  // Fetch unit images
  const fetchUnitImages = useCallback(async (unitId) => {
    setIsLoadingImages(true)
    setUploadError(null)
    try {
      const response = await propertyAPI.getUnitImages(unitId)
      if (response.data.success) {
        setUnitImages(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching unit images:', error)
      setUploadError('Failed to load images')
    } finally {
      setIsLoadingImages(false)
    }
  }, [])

  // Handle opening image gallery
  const handleOpenImageGallery = (unit) => {
    setSelectedUnitForImages(unit)
    setShowImageGallery(true)
    setCurrentImageIndex(0)
    fetchUnitImages(unit.id)
  }

  // Handle file upload
  const handleImageUpload = async (files) => {
    if (!files || files.length === 0 || !selectedUnitForImages) return

    setIsUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      Array.from(files).forEach(file => {
        formData.append('unit_images', file)
      })

      const response = await propertyAPI.uploadUnitImages(selectedUnitForImages.id, formData)
      
      if (response.data.success) {
        // Refresh images
        await fetchUnitImages(selectedUnitForImages.id)
        // Update image count
        setUnitImageCounts(prev => ({
          ...prev,
          [selectedUnitForImages.id]: (prev[selectedUnitForImages.id] || 0) + files.length
        }))
      } else {
        setUploadError(response.data.message || 'Upload failed')
      }
    } catch (error) {
      console.error('Error uploading images:', error)
      setUploadError(error.response?.data?.message || 'Failed to upload images')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle image deletion
  const handleDeleteImage = async (imageId) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return

    try {
      const response = await propertyAPI.deleteUnitImage(selectedUnitForImages.id, imageId)
      
      if (response.data.success) {
        // Remove from local state
        setUnitImages(prev => prev.filter(img => img.id !== imageId))
        // Update image count
        setUnitImageCounts(prev => ({
          ...prev,
          [selectedUnitForImages.id]: Math.max(0, (prev[selectedUnitForImages.id] || 1) - 1)
        }))
        // Adjust current index if needed
        if (currentImageIndex >= unitImages.length - 1) {
          setCurrentImageIndex(Math.max(0, unitImages.length - 2))
        }
      }
    } catch (error) {
      console.error('Error deleting image:', error)
      setUploadError('Failed to delete image')
    }
  }

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleImageUpload(files)
    }
  }

  // Navigate images
  const goToPreviousImage = () => {
    setCurrentImageIndex(prev => (prev === 0 ? unitImages.length - 1 : prev - 1))
  }

  const goToNextImage = () => {
    setCurrentImageIndex(prev => (prev === unitImages.length - 1 ? 0 : prev + 1))
  }

  // Keyboard navigation for gallery
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showImageGallery) return
      if (e.key === 'ArrowLeft') goToPreviousImage()
      if (e.key === 'ArrowRight') goToNextImage()
      if (e.key === 'Escape') setShowImageGallery(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showImageGallery, unitImages.length])

  // Image Gallery Modal Component
  const ImageGalleryModal = () => {
    if (!showImageGallery || !selectedUnitForImages) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center gallery-modal-enter">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/90 backdrop-blur-md"
          onClick={() => setShowImageGallery(false)}
        />

        {/* Modal Content */}
        <div className="relative w-full max-w-7xl h-[95vh] flex flex-col bg-gray-900 shadow-2xl rounded-xl overflow-hidden gallery-content-enter border border-gray-800 mx-4">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800 z-10">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {selectedUnitForImages.unit_code} - Gallery
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {unitTypes[selectedUnitForImages.unit_type]} • {unitImages.length} image{unitImages.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setShowImageGallery(false)}
              className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Main Stage */}
          <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden group">
            {isLoadingImages ? (
              <div className="flex flex-col items-center justify-center text-purple-500">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-current mb-4"></div>
                <span className="text-gray-400 text-sm">Loading gallery...</span>
              </div>
            ) : unitImages.length > 0 ? (
              <>
                {/* Main Image */}
                <img
                  key={unitImages[currentImageIndex]?.id} 
                  src={unitImages[currentImageIndex]?.image_url}
                  alt={unitImages[currentImageIndex]?.caption || "Unit"}
                  className="max-w-full max-h-full object-contain transition-transform duration-500 hover:scale-[1.02]"
                />

                {/* Caption Overlay */}
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <p className="text-center text-white text-lg font-medium">
                    {unitImages[currentImageIndex]?.caption}
                  </p>
                </div>

                {/* Navigation Buttons */}
                {unitImages.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); goToPreviousImage(); }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 text-white/70 hover:bg-white/20 hover:text-white hover:scale-110 transition-all duration-200 backdrop-blur-sm border border-white/10"
                    >
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); goToNextImage(); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 text-white/70 hover:bg-white/20 hover:text-white hover:scale-110 transition-all duration-200 backdrop-blur-sm border border-white/10"
                    >
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </>
                )}

                {/* Delete Action */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteImage(unitImages[currentImageIndex]?.id); }}
                  className="absolute top-4 right-4 p-2 rounded-full bg-red-500/20 text-red-400 hover:bg-red-600 hover:text-white transition-all duration-200 backdrop-blur-md border border-red-500/30 opacity-0 group-hover:opacity-100"
                  title="Delete Image"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </>
            ) : (
              <div className="text-center text-gray-500">
                <div className="text-6xl mb-4 opacity-20">🖼️</div>
                <p className="text-lg font-medium">No images yet</p>
                <p className="text-sm opacity-60">Upload some photos to showcase this unit</p>
              </div>
            )}
          </div>

          {/* Footer / Thumbnails / Upload */}
          <div className="bg-gray-900 border-t border-gray-800 p-4 flex flex-col gap-4">
            
            {/* Thumbnails */}
            {unitImages.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                {unitImages.map((img, idx) => (
                  <button
                    key={img.id}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden transition-all duration-200 snap-center ${
                      idx === currentImageIndex 
                        ? 'ring-2 ring-purple-500 scale-105 opacity-100' 
                        : 'opacity-50 hover:opacity-80 hover:scale-105'
                    }`}
                  >
                    <img 
                      src={img.image_url} 
                      alt="" 
                      className="w-full h-full object-cover" 
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Upload Zone */}
            <div 
              className={`relative rounded-xl border-2 border-dashed transition-all duration-300 ${
                isDragging 
                  ? 'border-purple-500 bg-purple-500/10' 
                  : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800 hover:border-gray-600'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isUploading ? (
                <div className="flex items-center justify-center p-6 text-purple-400">
                  <div className="animate-spin mr-3 h-5 w-5 border-2 border-current border-t-transparent rounded-full"></div>
                  <span className="font-medium animate-pulse">Uploading photos...</span>
                </div>
              ) : (
                <label className="flex flex-col sm:flex-row items-center justify-center p-4 cursor-pointer gap-3 text-gray-400 hover:text-white transition-colors">
                  <div className="p-2 rounded-full bg-gray-700/50">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <div className="text-center sm:text-left">
                    <span className="font-medium text-purple-400 hover:text-purple-300 hover:underline">Click to upload</span>
                    <span className="mx-1">or drag and drop</span>
                    <span className="text-xs text-gray-500 block sm:inline">(Max 10MB each)</span>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e.target.files)}
                  />
                </label>
              )}
              {uploadError && (
                <div className="absolute top-0 left-0 right-0 -mt-3 text-center">
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg">
                    {uploadError}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

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

      {/* Image Gallery Modal */}
      <ImageGalleryModal />

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
          <div className="table-container overflow-x-auto">
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
                        {/* Images Button with Count */}
                        <button
                          onClick={() => handleOpenImageGallery(unit)}
                          className="text-purple-600 hover:text-purple-900 text-xs transition-colors touch-target px-2 py-1 rounded hover:bg-purple-50 flex items-center gap-1"
                          title="Manage Images"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full text-xs font-medium">
                            {unitImageCounts[unit.id] || 0}
                          </span>
                        </button>
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