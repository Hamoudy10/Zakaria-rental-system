import React, { useState, useEffect, useCallback } from 'react'
import { useProperty } from '../context/PropertyContext'
import { propertyAPI } from '../services/api'
import UnitManagement from './UnitManagement'

const PropertyManagement = () => {
  const { properties, addProperty, updateProperty, deleteProperty, setSelectedProperty } = useProperty()
  const [showPropertyModal, setShowPropertyModal] = useState(false)
  const [editingProperty, setEditingProperty] = useState(null)
  const [showUnits, setShowUnits] = useState(null)
  
  // Image Gallery State
  const [showImageGallery, setShowImageGallery] = useState(false)
  const [selectedPropertyForImages, setSelectedPropertyForImages] = useState(null)
  const [propertyImages, setPropertyImages] = useState([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)

  // Use accurate occupancy calculation based on actual units
  const getOccupancyRate = (property) => {
    if (property.total_units === 0) return 0
    const occupiedUnits = property.occupied_units || (property.total_units - property.available_units)
    return Math.round((occupiedUnits / property.total_units) * 100)
  }

  // Fetch property images
  const fetchPropertyImages = useCallback(async (propertyId) => {
    setIsLoadingImages(true)
    setUploadError(null)
    try {
      const response = await propertyAPI.getPropertyImages(propertyId)
      if (response.data.success) {
        setPropertyImages(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching property images:', error)
      setUploadError('Failed to load images')
    } finally {
      setIsLoadingImages(false)
    }
  }, [])

  // Handle opening image gallery
  const handleOpenImageGallery = (property) => {
    setSelectedPropertyForImages(property)
    setShowImageGallery(true)
    setCurrentImageIndex(0)
    fetchPropertyImages(property.id)
  }

  // Handle file upload
  const handleImageUpload = async (files) => {
    if (!files || files.length === 0 || !selectedPropertyForImages) return

    setIsUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      Array.from(files).forEach(file => {
        formData.append('property_images', file)
      })

      const response = await propertyAPI.uploadPropertyImages(selectedPropertyForImages.id, formData)
      
      if (response.data.success) {
        // Refresh images
        await fetchPropertyImages(selectedPropertyForImages.id)
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
      const response = await propertyAPI.deletePropertyImage(selectedPropertyForImages.id, imageId)
      
      if (response.data.success) {
        // Remove from local state
        setPropertyImages(prev => prev.filter(img => img.id !== imageId))
        // Adjust current index if needed
        if (currentImageIndex >= propertyImages.length - 1) {
          setCurrentImageIndex(Math.max(0, propertyImages.length - 2))
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
    setCurrentImageIndex(prev => (prev === 0 ? propertyImages.length - 1 : prev - 1))
  }

  const goToNextImage = () => {
    setCurrentImageIndex(prev => (prev === propertyImages.length - 1 ? 0 : prev + 1))
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
  }, [showImageGallery, propertyImages.length])

  // Image Gallery Modal Component
  const ImageGalleryModal = () => {
    if (!showImageGallery || !selectedPropertyForImages) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-2">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedPropertyForImages.name} - Gallery
              </h2>
              <p className="text-sm text-gray-500">
                {propertyImages.length} image{propertyImages.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setShowImageGallery(false)}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {isLoadingImages ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : propertyImages.length > 0 ? (
              <>
                {/* Main Image Display */}
                <div className="relative flex-1 bg-gray-900 flex items-center justify-center min-h-[300px]">
                  <img
                    src={propertyImages[currentImageIndex]?.image_url}
                    alt={propertyImages[currentImageIndex]?.caption || `Property image ${currentImageIndex + 1}`}
                    className="max-h-[50vh] max-w-full object-contain"
                  />
                  
                  {/* Navigation Arrows */}
                  {propertyImages.length > 1 && (
                    <>
                      <button
                        onClick={goToPreviousImage}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full p-2 shadow-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={goToNextImage}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full p-2 shadow-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </>
                  )}

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteImage(propertyImages[currentImageIndex]?.id)}
                    className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-2 shadow-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Delete this image"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  {/* Image Counter */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black bg-opacity-60 text-white px-3 py-1 rounded-full text-sm">
                    {currentImageIndex + 1} / {propertyImages.length}
                  </div>
                </div>

                {/* Thumbnail Strip */}
                <div className="bg-gray-100 p-3 overflow-x-auto">
                  <div className="flex space-x-2">
                    {propertyImages.map((image, index) => (
                      <button
                        key={image.id}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                          index === currentImageIndex 
                            ? 'border-blue-600 ring-2 ring-blue-300' 
                            : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        <img
                          src={image.image_url}
                          alt={image.caption || `Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="text-6xl mb-4">📷</div>
                  <p>No images uploaded yet</p>
                </div>
              </div>
            )}

            {/* Upload Section */}
            <div 
              className={`p-4 border-t border-gray-200 ${isDragging ? 'bg-blue-50' : 'bg-gray-50'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {uploadError && (
                <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">
                  {uploadError}
                </div>
              )}
              
              <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragging ? 'border-blue-500 bg-blue-100' : 'border-gray-300'
              }`}>
                {isUploading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                    <span>Uploading...</span>
                  </div>
                ) : (
                  <>
                    <div className="text-gray-500 mb-2">
                      <svg className="w-10 h-10 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Drag & drop images here or
                    </div>
                    <label className="cursor-pointer">
                      <span className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors inline-block">
                        Browse Files
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e.target.files)}
                      />
                    </label>
                    <p className="text-xs text-gray-400 mt-2">
                      JPEG, PNG, WebP • Max 10MB per image
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Separate Modal Component for Property Form - REMOVED unit_type field
  const PropertyModal = React.memo(({ isOpen, onClose, onSubmit, title, isEdit = false, initialData }) => {
    const [formData, setFormData] = useState({
      property_code: '',
      name: '',
      address: '',
      county: '',
      town: '',
      description: '',
      total_units: 0
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
          total_units: 0
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-2 md:p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] md:max-h-[85vh] flex flex-col mx-2">
          {/* Compact Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-base md:text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
              type="button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Expanded Form Content Area */}
          <div className="flex-1 overflow-y-auto p-3 md:p-4">
            <div className="space-y-3 md:space-y-4">
              {/* Property Code and Name */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-gray-600 mb-1">
                    Property Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., WL001"
                    value={formData.property_code}
                    onChange={(e) => handleInputChange('property_code', e.target.value)}
                    className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] touch-manipulation"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs md:text-sm font-medium text-gray-600 mb-1">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Westlands Apartments"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] touch-manipulation"
                    required
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs md:text-sm font-medium text-gray-600 mb-1">
                  Address *
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical touch-manipulation"
                  rows="2"
                  placeholder="Full property address"
                  required
                />
              </div>

              {/* County and Town */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-gray-600 mb-1">
                    County *
                  </label>
                  <input
                    type="text"
                    value={formData.county}
                    onChange={(e) => handleInputChange('county', e.target.value)}
                    className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] touch-manipulation"
                    placeholder="e.g., Nairobi"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs md:text-sm font-medium text-gray-600 mb-1">
                    Town/Area *
                  </label>
                  <input
                    type="text"
                    value={formData.town}
                    onChange={(e) => handleInputChange('town', e.target.value)}
                    className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] touch-manipulation"
                    placeholder="e.g., Westlands"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs md:text-sm font-medium text-gray-600 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical touch-manipulation"
                  rows="3"
                  placeholder="Property features and amenities..."
                />
              </div>

              {/* Total Units */}
              <div>
                <label className="block text-xs md:text-sm font-medium text-gray-600 mb-1">
                  Initial Total Units *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.total_units}
                  onChange={(e) => handleInputChange('total_units', parseInt(e.target.value) || 0)}
                  className="w-full md:max-w-xs px-3 py-3 text-sm md:text-base border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] touch-manipulation"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Note: Actual unit counts will be calculated based on the units you add. Unit types are configured per individual unit.
                </p>
              </div>
            </div>
          </div>

          {/* Compact Footer with Buttons */}
          <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2 p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 text-sm md:text-base font-medium text-white bg-red-600 border border-transparent rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] touch-manipulation transition-colors w-full sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLocalSubmit}
              className="px-4 py-3 text-sm md:text-base font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation transition-colors w-full sm:w-auto"
            >
              {isEdit ? 'Update Property' : 'Create Property'}
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
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">Property Management</h2>
          <p className="text-sm md:text-base text-gray-600">Manage properties and their rental units</p>
        </div>
        <button
          onClick={() => {
            setEditingProperty(null)
            setShowPropertyModal(true)
          }}
          className="bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 text-sm md:text-base font-medium min-h-[44px] touch-manipulation transition-colors w-full sm:w-auto"
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
          total_units: editingProperty.total_units || 0
        } : null}
      />

      {/* Image Gallery Modal */}
      <ImageGalleryModal />

      {/* Properties Grid - Mobile Responsive */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {properties.map((property) => {
          const occupancyRate = getOccupancyRate(property)
          const occupiedUnits = property.occupied_units || (property.total_units - property.available_units)
          
          return (
            <div key={property.id} className="bg-white rounded-lg shadow-md border border-gray-200 p-3 md:p-4 hover:shadow-lg transition-shadow duration-200">
              <div className="flex justify-between items-start mb-3 md:mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base md:text-lg font-semibold text-gray-900 truncate">{property.name}</h3>
                  <p className="text-xs md:text-sm text-gray-500 truncate">{property.property_code}</p>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-semibold ml-2 ${
                  occupancyRate >= 90 ? 'bg-green-100 text-green-800' :
                  occupancyRate >= 70 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {occupancyRate}% Occupied
                </div>
              </div>

              <div className="space-y-2 mb-3 md:mb-4">
                <p className="text-xs md:text-sm text-gray-600">
                  <span className="font-medium">Location:</span> {property.town}, {property.county}
                </p>
                <p className="text-xs md:text-sm text-gray-600 line-clamp-2">{property.description}</p>
              </div>

              {/* Stats Grid - Mobile Optimized */}
              <div className="grid grid-cols-3 gap-2 mb-3 md:mb-4">
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-base md:text-lg font-bold text-gray-900">{property.total_units}</div>
                  <div className="text-xs text-gray-500">Total Units</div>
                </div>
                <div className="text-center p-2 bg-green-50 rounded">
                  <div className="text-base md:text-lg font-bold text-green-600">{property.available_units}</div>
                  <div className="text-xs text-gray-500">Available</div>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded">
                  <div className="text-base md:text-lg font-bold text-blue-600">{occupiedUnits}</div>
                  <div className="text-xs text-gray-500">Occupied</div>
                </div>
              </div>

              {/* Action Buttons - Mobile Responsive */}
              <div className="space-y-2">
                {/* Primary Actions Row */}
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setSelectedProperty(property)
                      setShowUnits(showUnits === property.id ? null : property.id)
                    }}
                    className="bg-blue-600 text-white px-3 py-3 rounded hover:bg-blue-700 text-sm min-h-[44px] touch-manipulation transition-colors flex-1"
                  >
                    {showUnits === property.id ? 'Hide Units' : 'Manage Units'}
                  </button>
                  <button
                    onClick={() => handleOpenImageGallery(property)}
                    className="bg-purple-600 text-white px-3 py-3 rounded hover:bg-purple-700 text-sm min-h-[44px] touch-manipulation transition-colors flex-1 flex items-center justify-center"
                    title="Manage property images"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Images
                  </button>
                </div>
                
                {/* Secondary Actions Row */}
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEditProperty(property)}
                    className="bg-gray-600 text-white px-3 py-3 rounded hover:bg-gray-700 text-sm min-h-[44px] touch-manipulation transition-colors flex-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteProperty(property.id)}
                    className="bg-red-600 text-white px-3 py-3 rounded hover:bg-red-700 text-sm min-h-[44px] touch-manipulation transition-colors flex-1"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Units Section */}
              {showUnits === property.id && (
                <div className="mt-3 md:mt-4 border-t pt-3 md:pt-4">
                  <UnitManagement property={property} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {properties.length === 0 && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 text-center py-8 md:py-12">
          <div className="text-gray-400 text-4xl md:text-6xl mb-3 md:mb-4">🏠</div>
          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2">No Properties Yet</h3>
          <p className="text-sm md:text-base text-gray-600 mb-4">Get started by adding your first property</p>
          <button
            onClick={() => setShowPropertyModal(true)}
            className="bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 text-sm md:text-base font-medium min-h-[44px] touch-manipulation transition-colors"
          >
            Add Your First Property
          </button>
        </div>
      )}
    </div>
  )
}

export default PropertyManagement