import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { propertyAPI } from '../services/api';

// ============================================
// PROPERTY CARD COMPONENT WITH IMAGE SLIDESHOW
// ============================================
const PropertyCard = ({ property, onSelect }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = property.images || [];
  const hasImages = images.length > 0;

  // Auto-rotate images every 3 seconds
  useEffect(() => {
    if (!hasImages || images.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [hasImages, images.length]);

  // Calculate unit statistics
  const totalUnits = property.total_units || 0;
  const availableUnits = property.available_units || 0;
  const occupiedUnits = totalUnits - availableUnits;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  // Get rent range from units if available
  const rentRange = useMemo(() => {
    if (!property.units || property.units.length === 0) {
      return { min: property.min_rent || null, max: property.max_rent || null };
    }
    const rents = property.units.map(u => u.rent_amount).filter(r => r > 0);
    if (rents.length === 0) return { min: null, max: null };
    return {
      min: Math.min(...rents),
      max: Math.max(...rents)
    };
  }, [property.units, property.min_rent, property.max_rent]);

  // Get unit type breakdown
  const unitTypeBreakdown = useMemo(() => {
    if (!property.units || property.units.length === 0) {
      // Try to use unit_types if available from API
      if (property.unit_types) {
        return Object.entries(property.unit_types).map(([type, count]) => ({
          type: type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          count
        })).slice(0, 3);
      }
      return [];
    }
    
    const typeCount = {};
    property.units.forEach(unit => {
      const type = unit.unit_type || 'unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });

    return Object.entries(typeCount).map(([type, count]) => ({
      type: type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      count
    })).slice(0, 3);
  }, [property.units, property.unit_types]);

  // Determine property type based on units
  const propertyType = useMemo(() => {
    if (property.property_type) return property.property_type;
    
    if (!property.units || property.units.length === 0) return 'Mixed';
    
    const types = [...new Set(property.units.map(u => u.unit_type))];
    if (types.length === 1) {
      return types[0].split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    if (types.every(t => ['bedsitter', 'studio', 'one_bedroom', 'two_bedroom', 'three_bedroom'].includes(t))) {
      return 'Residential';
    }
    if (types.every(t => ['shop', 'hall'].includes(t))) {
      return 'Commercial';
    }
    return 'Mixed Use';
  }, [property.units, property.property_type]);

  // Property type colors
  const getPropertyTypeColor = (type) => {
    const colors = {
      'Residential': 'bg-blue-500',
      'Commercial': 'bg-amber-500',
      'Mixed Use': 'bg-purple-500',
      'Mixed': 'bg-slate-500',
      'Bedsitter': 'bg-teal-500',
      'Studio': 'bg-cyan-500',
      'One Bedroom': 'bg-indigo-500',
      'Two Bedroom': 'bg-violet-500',
      'Three Bedroom': 'bg-fuchsia-500',
      'Shop': 'bg-orange-500',
      'Hall': 'bg-rose-500',
    };
    return colors[type] || 'bg-gray-500';
  };

  // Placeholder pattern for properties without images
  const PlaceholderPattern = () => (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900">
      {/* Animated pattern */}
      <div className="absolute inset-0 opacity-20">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id={`pattern-${property.id}`} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M0 20 L20 0 L40 20 L20 40 Z" fill="none" stroke="currentColor" strokeWidth="1" className="text-white"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#pattern-${property.id})`} />
        </svg>
      </div>
      
      {/* Building illustration */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <svg className="w-24 h-24 text-white/20" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/>
          </svg>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 bg-white/10 rounded-full blur-sm"></div>
        </div>
      </div>

      {/* Floating elements */}
      <div className="absolute top-4 left-4 w-2 h-2 bg-blue-400/30 rounded-full animate-pulse"></div>
      <div className="absolute top-8 right-6 w-3 h-3 bg-purple-400/20 rounded-full animate-pulse" style={{animationDelay: '1s'}}></div>
      <div className="absolute bottom-12 left-8 w-2 h-2 bg-teal-400/25 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
    </div>
  );

  // Circular progress ring for occupancy
  const OccupancyRing = ({ percentage }) => {
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke="rgba(0,0,0,0.1)"
            strokeWidth="4"
          />
          {/* Progress circle */}
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke={percentage >= 80 ? '#ef4444' : percentage >= 50 ? '#f59e0b' : '#22c55e'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-gray-700">{percentage}%</span>
        </div>
      </div>
    );
  };

  return (
    <div 
      onClick={() => onSelect(property.id)}
      className="group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer overflow-hidden border border-gray-100 hover:-translate-y-2"
    >
      {/* Image Slideshow Background */}
      <div className="relative h-48 sm:h-56 overflow-hidden">
        {hasImages ? (
          <>
            {images.map((img, idx) => (
              <div
                key={img.id || idx}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  idx === currentImageIndex ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <img 
                  src={img.image_url} 
                  alt={`${property.name} - ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
              </div>
            ))}
            
            {/* Image indicators */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                {images.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === currentImageIndex 
                        ? 'w-6 bg-white' 
                        : 'w-1.5 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <PlaceholderPattern />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

        {/* Property type badge */}
        <div className="absolute top-3 left-3 z-10">
          <span className={`${getPropertyTypeColor(propertyType)} text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm flex items-center gap-1.5`}>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
            </svg>
            {propertyType}
          </span>
        </div>

        {/* Image count badge */}
        {hasImages && (
          <div className="absolute top-3 right-3 z-10">
            <span className="bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {images.length}
            </span>
          </div>
        )}

        {/* Property name on image */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <h3 className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg group-hover:text-blue-200 transition-colors">
            {property.name}
          </h3>
          <div className="flex items-center text-white/90 text-sm mt-1">
            <svg className="w-4 h-4 mr-1.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{property.address}, {property.town}</span>
          </div>
        </div>
      </div>

      {/* Glassmorphism Card Body */}
      <div className="relative bg-white/80 backdrop-blur-xl p-5">
        {/* Rent Range */}
        {(rentRange.min || rentRange.max) && (
          <div className="mb-4 pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Rent Range</p>
                  <p className="text-sm font-bold text-gray-900">
                    KES {rentRange.min?.toLocaleString()}
                    {rentRange.min !== rentRange.max && rentRange.max && (
                      <span className="text-gray-400"> - {rentRange.max?.toLocaleString()}</span>
                    )}
                  </p>
                </div>
              </div>
              <span className="text-xs text-gray-400">/month</span>
            </div>
          </div>
        )}

        {/* Unit Stats with Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              {/* Occupancy Ring */}
              <OccupancyRing percentage={occupancyRate} />
              
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Occupancy</p>
                <p className="text-sm font-bold text-gray-900">{occupiedUnits} of {totalUnits} units</p>
              </div>
            </div>
            
            {/* Available badge */}
            <div className="text-right">
              <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                availableUnits > 0 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${availableUnits > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                {availableUnits} Available
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ease-out ${
                occupancyRate >= 80 ? 'bg-gradient-to-r from-red-400 to-red-500' :
                occupancyRate >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                'bg-gradient-to-r from-green-400 to-green-500'
              }`}
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
        </div>

        {/* Unit Type Breakdown */}
        {unitTypeBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {unitTypeBreakdown.map((item, idx) => (
              <span 
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
                </svg>
                {item.count} {item.type}
              </span>
            ))}
          </div>
        )}

        {/* Quick Stats Icons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex items-center gap-4">
            {/* Total Units */}
            <div className="flex items-center gap-1.5 text-gray-600">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <span className="text-sm font-semibold">{totalUnits}</span>
            </div>

            {/* Available */}
            <div className="flex items-center gap-1.5 text-gray-600">
              <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-sm font-semibold">{availableUnits}</span>
            </div>

            {/* Occupied */}
            <div className="flex items-center gap-1.5 text-gray-600">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <span className="text-sm font-semibold">{occupiedUnits}</span>
            </div>
          </div>

          {/* View Details Arrow */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
            <svg className="w-5 h-5 text-white transform group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
const AgentPropertyShowcase = () => {
  const [viewMode, setViewMode] = useState('search'); // 'search' or 'detail'
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState('all'); // 'all' or 'available'
  
  // Gallery State
  const [showGallery, setShowGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [galleryTitle, setGalleryTitle] = useState('');

  // Fetch property list on mount
  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const response = await propertyAPI.getShowcaseProperties();
      if (response.data.success) {
        setProperties(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProperty = async (propertyId) => {
    setLoading(true);
    try {
      const response = await propertyAPI.getShowcasePropertyDetails(propertyId);
      if (response.data.success) {
        setSelectedProperty(response.data.data);
        setViewMode('detail');
        setUnitFilter('all');
      }
    } catch (error) {
      console.error('Error fetching details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenGallery = (images, startIndex = 0, title = '') => {
    if (!images || images.length === 0) return;
    setGalleryImages(images);
    setCurrentImageIndex(startIndex);
    setGalleryTitle(title);
    setShowGallery(true);
  };

  const filteredUnits = selectedProperty?.units?.filter(unit => {
    if (unitFilter === 'available') return !unit.is_occupied;
    return true;
  }) || [];

  const filteredProperties = properties.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.town.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Gallery Navigation
  const nextImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1));
  }, [galleryImages.length]);

  const prevImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
  }, [galleryImages.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showGallery) return;
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'Escape') setShowGallery(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showGallery, nextImage, prevImage]);

  // Unit Type Formatter
  const formatUnitType = (type) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // --- RENDER: GALLERY MODAL ---
  const GalleryModal = () => {
    if (!showGallery) return null;
    const currentImg = galleryImages[currentImageIndex];

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md transition-opacity duration-300">
        <div className="absolute inset-0" onClick={() => setShowGallery(false)} />
        
        <div className="relative w-full h-full flex flex-col p-4 pointer-events-none">
          {/* Header */}
          <div className="flex justify-between items-center text-white pointer-events-auto z-10 mb-4">
            <div>
              <h3 className="text-lg font-medium">{galleryTitle}</h3>
              <p className="text-sm text-gray-400">{currentImageIndex + 1} of {galleryImages.length}</p>
            </div>
            <button onClick={() => setShowGallery(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Main Image */}
          <div className="flex-1 flex items-center justify-center relative pointer-events-auto">
            {/* Prev Button */}
            <button onClick={prevImage} className="absolute left-0 p-4 text-white/70 hover:text-white hover:scale-110 transition-all z-20">
              <svg className="w-10 h-10 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>

            <img 
              src={currentImg.image_url} 
              alt={currentImg.caption || 'Gallery Image'} 
              className="max-h-[80vh] max-w-full object-contain shadow-2xl rounded-lg transition-transform duration-300"
            />

            {/* Next Button */}
            <button onClick={nextImage} className="absolute right-0 p-4 text-white/70 hover:text-white hover:scale-110 transition-all z-20">
              <svg className="w-10 h-10 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>

            {/* Caption */}
            {currentImg.caption && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 px-4 py-2 rounded-full text-white backdrop-blur-sm">
                {currentImg.caption}
              </div>
            )}
          </div>

          {/* Thumbnails */}
          <div className="h-20 mt-4 flex gap-2 overflow-x-auto justify-center pointer-events-auto pb-2 scrollbar-hide">
            {galleryImages.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentImageIndex(idx)}
                className={`flex-shrink-0 h-full aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  idx === currentImageIndex ? 'border-blue-500 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img src={img.image_url} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // --- RENDER: SEARCH VIEW ---
  if (viewMode === 'search') {
    return (
      <div className="min-h-[80vh] flex flex-col items-center pt-12 md:pt-20 px-4">
        <div className="w-full max-w-3xl text-center mb-10 animate-fade-in-up">
          <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            Find a Property to <span className="text-blue-600">Showcase</span>
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Access details and galleries for all properties to present to potential tenants.
          </p>
          
          <div className="relative max-w-xl mx-auto group">
            <input
              type="text"
              className="block w-full pl-4 pr-12 py-4 text-lg border-2 border-gray-200 rounded-full leading-5 bg-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all shadow-lg hover:shadow-xl"
              placeholder="Search by name, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <svg className="h-6 w-6 text-gray-400 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-fade-in pb-12">
            {filteredProperties.map(property => (
              <PropertyCard 
                key={property.id}
                property={property}
                onSelect={handleSelectProperty}
              />
            ))}
            {filteredProperties.length === 0 && !loading && (
              <div className="col-span-full text-center py-12 text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <p className="text-lg font-medium">No properties found</p>
                <p className="text-sm text-gray-400 mt-1">Try adjusting your search criteria</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- RENDER: DETAIL VIEW ---
  const heroImage = selectedProperty?.images?.[0]?.image_url;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 animate-fade-in">
      <GalleryModal />
      
      {/* Navigation */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex justify-between items-center shadow-sm">
        <button 
          onClick={() => setViewMode('search')}
          className="flex items-center text-gray-600 hover:text-blue-600 transition-colors font-medium"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Search
        </button>
        <div className="text-sm font-semibold text-gray-800">
          Agent Showcase Mode
        </div>
      </div>

      {loading ? (
        <div className="h-[50vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Hero Section */}
          <div className="relative h-[40vh] md:h-[50vh] w-full bg-gray-900 overflow-hidden group">
            {heroImage ? (
              <img 
                src={heroImage} 
                alt={selectedProperty.name} 
                className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-1000"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-gray-500">
                <svg className="w-20 h-20 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-lg opacity-40">No Cover Image</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
            
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 text-white">
              <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl md:text-5xl font-bold mb-2 drop-shadow-lg">{selectedProperty.name}</h1>
                <p className="text-lg md:text-xl text-gray-200 flex items-center mb-4">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {selectedProperty.address}, {selectedProperty.town}
                </p>
                {selectedProperty.images?.length > 0 && (
                  <button 
                    onClick={() => handleOpenGallery(selectedProperty.images, 0, selectedProperty.name)}
                    className="bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/50 text-white px-6 py-2 rounded-full flex items-center transition-all hover:scale-105"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    View All {selectedProperty.images.length} Photos
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Gallery Strip */}
            {selectedProperty.images?.length > 1 && (
              <div className="mb-10">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                  {selectedProperty.images.slice(1).map((img, idx) => (
                    <div 
                      key={img.id}
                      onClick={() => handleOpenGallery(selectedProperty.images, idx + 1, selectedProperty.name)}
                      className="flex-shrink-0 w-64 h-40 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all shadow-md snap-center"
                    >
                      <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats & Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
              <div className="md:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">About the Property</h2>
                  <p className="text-gray-600 leading-relaxed">
                    {selectedProperty.description || "No description available for this property."}
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Property Stats</h3>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-600">Total Units</span>
                    <span className="font-bold text-gray-900">{selectedProperty.total_units}</span>
                  </div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-600">Available</span>
                    <span className="font-bold text-green-600">{selectedProperty.available_units}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Contact</span>
                    <span className="font-bold text-blue-600">{selectedProperty.contact_phone || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Units Section */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Property Units</h2>
                <p className="text-gray-500">{filteredUnits.length} unit{filteredUnits.length !== 1 ? 's' : ''} shown</p>
              </div>
              
              <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                <button
                  onClick={() => setUnitFilter('all')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    unitFilter === 'all' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  All Units
                </button>
                <button
                  onClick={() => setUnitFilter('available')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    unitFilter === 'available' 
                      ? 'bg-green-600 text-white shadow-sm' 
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Available Only
                </button>
              </div>
            </div>

            {/* Unit Grid */}
            {filteredUnits.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredUnits.map(unit => {
                  const isAvailable = !unit.is_occupied;
                  
                  return (
                    <div 
                      key={unit.id}
                      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 group flex flex-col"
                    >
                      <div className="p-5 flex-1">
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="text-lg font-bold text-gray-900">{unit.unit_code}</h3>
                          <span className={`px-2 py-1 text-xs font-bold uppercase rounded-full ${
                            isAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {isAvailable ? 'Available' : 'Occupied'}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-500 mb-4 font-medium uppercase tracking-wide">
                          {formatUnitType(unit.unit_type)}
                        </div>
                        
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Rent</span>
                            <span className="font-semibold text-gray-900">KES {unit.rent_amount?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Deposit</span>
                            <span className="font-semibold text-gray-900">KES {unit.deposit_amount?.toLocaleString()}</span>
                          </div>
                        </div>

                        {unit.description && (
                          <p className="text-sm text-gray-600 line-clamp-2 mb-4">{unit.description}</p>
                        )}
                      </div>

                      <div className="p-4 bg-gray-50 border-t border-gray-100 mt-auto">
                        <button 
                          onClick={async () => {
                            try {
                              const res = await propertyAPI.getUnitImages(unit.id);
                              if (res.data.success && res.data.data.length > 0) {
                                handleOpenGallery(res.data.data, 0, `Unit ${unit.unit_code}`);
                              } else {
                                alert('No images available for this unit.');
                              }
                            } catch (e) {
                              console.error(e);
                              alert('Could not load unit images.');
                            }
                          }}
                          className="w-full flex items-center justify-center py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors shadow-sm"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          View Unit Photos
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl p-12 text-center text-gray-500 border border-dashed border-gray-300">
                <p className="text-lg">No units found matching your filter.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AgentPropertyShowcase;