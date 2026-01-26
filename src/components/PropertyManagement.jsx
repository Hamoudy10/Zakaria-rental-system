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

  // Inject styles for animations
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
    if (!showImageGallery || !selectedPropertyForImages) return null;

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
                {selectedPropertyForImages.name}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">
                Gallery • {propertyImages.length} photo{propertyImages.length !== 1 ? 's' : ''}
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
              <div className="flex flex-col items-center justify-center text-blue-500">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-current mb-4"></div>
                <span className="text-gray-400 text-sm">Loading gallery...</span>
              </div>
            ) : propertyImages.length > 0 ? (
              <>
                {/* Main Image */}
                <img
                  key={propertyImages[currentImageIndex]?.id} 
                  src={propertyImages[currentImageIndex]?.image_url}
                  alt={propertyImages[currentImageIndex]?.caption || "Property"}
                  className="max-w-full max-h-full object-contain transition-transform duration-500 hover:scale-[1.02]"
                />

                {/* Caption Overlay */}
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <p className="text-center text-white text-lg font-medium">
                    {propertyImages[currentImageIndex]?.caption}
                  </p>
                </div>

                {/* Navigation Buttons */}
                {propertyImages.length > 1 && (
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
                  onClick={(e) => { e.stopPropagation(); handleDeleteImage(propertyImages[currentImageIndex]?.id); }}
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
                <p className="text-sm opacity-60">Upload some photos to showcase this property</p>
              </div>
            )}
          </div>

          {/* Footer / Thumbnails / Upload */}
          <div className="bg-gray-900 border-t border-gray-800 p-4 flex flex-col gap-4">
            
            {/* Thumbnails */}
            {propertyImages.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                {propertyImages.map((img, idx) => (
                  <button
                    key={img.id}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden transition-all duration-200 snap-center ${
                      idx === currentImageIndex 
                        ? 'ring-2 ring-blue-500 scale-105 opacity-100' 
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
                  ? 'border-blue-500 bg-blue-500/10' 
                  : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800 hover:border-gray-600'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isUploading ? (
                <div className="flex items-center justify-center p-6 text-blue-400">
                  <div className="animate-spin mr-3 h-5 w-5 border-2 border-current border-t-transparent rounded-full"></div>
                  <span className="font-medium animate-pulse">Uploading photos...</span>
                </div>
              ) : (
                <label className="flex flex-col sm:flex-row items-center justify-center p-4 cursor-pointer gap-3 text-gray-400 hover:text-white transition-colors">
                  <div className="p-2 rounded-full bg-gray-700/50">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <div className="text-center sm:text-left">
                    <span className="font-medium text-blue-400 hover:text-blue-300 hover:underline">Click to upload</span>
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