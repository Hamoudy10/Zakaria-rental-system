// src/components/UnitManagement.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Filter,
  X,
  Edit3,
  Trash2,
  Image,
  Camera,
  Home,
  DollarSign,
  Users,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Layers,
  Eye,
  Grid3X3,
  LayoutGrid,
  Settings,
  Tag,
  FileText,
  RefreshCw,
  Check,
  Sparkles,
  Wifi,
  Car,
  Shield,
  Droplets,
  Dumbbell,
  Waves,
  Tv,
  Wind,
  Sofa,
  ChevronDown
} from 'lucide-react';
import { useProperty } from '../context/PropertyContext';
import { propertyAPI } from '../services/api';

// ==================== TOAST NOTIFICATION SYSTEM ====================
const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const Toast = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove();
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [onRemove, toast.duration]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200',
  };

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${bgColors[toast.type]} animate-slideDown min-w-[300px] max-w-[500px]`}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm font-medium text-gray-800">{toast.message}</p>
      <button
        onClick={onRemove}
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
};

// ==================== CONFIRMATION MODAL ====================
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText, confirmColor, icon: Icon, loading }) => {
  if (!isOpen) return null;

  const colorClasses = {
    red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    blue: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    purple: 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500',
  };

  const iconBgClasses = {
    red: 'bg-red-100 text-red-600',
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fadeIn" 
          onClick={onClose} 
        />
        
        <div className="relative inline-block bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all animate-scaleIn sm:my-8 sm:max-w-lg sm:w-full">
          <div className="bg-white px-6 pt-6 pb-4">
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${iconBgClasses[confirmColor]} flex items-center justify-center`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">{message}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`w-full sm:w-auto inline-flex justify-center items-center gap-2 px-4 py-2.5 border border-transparent text-sm font-medium rounded-xl text-white ${colorClasses[confirmColor]} focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== FEATURE ICONS ====================
const featureIcons = {
  'Parking': Car,
  'Balcony': Home,
  'Security': Shield,
  'Water Backup': Droplets,
  'Gym Access': Dumbbell,
  'Swimming Pool': Waves,
  'Internet': Wifi,
  'Cable TV': Tv,
  'Air Conditioning': Wind,
  'Furnished': Sofa,
};

// ==================== UNIT CARD COMPONENT ====================
const UnitCard = ({ 
  unit, 
  unitTypes, 
  formatCurrency, 
  imageCount, 
  onEdit, 
  onDelete, 
  onOpenGallery 
}) => {
  const [showActions, setShowActions] = useState(false);
  
  const activeFeatures = Object.entries(unit.features || {})
    .filter(([_, value]) => value)
    .map(([key]) => key);

  return (
    <div 
      className="group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-purple-200 transition-all duration-300"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Card Header with Image Preview */}
      <div className="relative h-40 bg-gradient-to-br from-purple-100 via-blue-50 to-indigo-100 overflow-hidden">
        {/* Decorative Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 left-4 w-16 h-16 border-2 border-purple-400 rounded-lg transform rotate-12" />
          <div className="absolute bottom-4 right-4 w-12 h-12 border-2 border-blue-400 rounded-full" />
          <div className="absolute top-1/2 left-1/2 w-20 h-20 border-2 border-indigo-400 rounded-lg transform -translate-x-1/2 -translate-y-1/2 rotate-45" />
        </div>

        {/* Unit Type Badge */}
        <div className="absolute top-3 left-3">
          <span className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-semibold text-purple-700 shadow-sm">
            {unitTypes[unit.unit_type]}
          </span>
        </div>

        {/* Image Count Badge */}
        <button
          onClick={() => onOpenGallery(unit)}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-gray-700 shadow-sm hover:bg-white transition-colors"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>{imageCount || 0}</span>
        </button>

        {/* Status Badge */}
        <div className="absolute bottom-3 left-3">
          <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm ${
            unit.is_occupied 
              ? 'bg-green-500 text-white' 
              : 'bg-blue-500 text-white'
          }`}>
            {unit.is_occupied ? 'Occupied' : 'Available'}
          </span>
        </div>

        {/* Unit Code */}
        <div className="absolute bottom-3 right-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900/80 backdrop-blur-sm rounded-lg">
            <Home className="w-3.5 h-3.5 text-white" />
            <span className="text-xs font-bold text-white">{unit.display_unit_code || unit.unit_code}</span>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4">
        {/* Property Info */}
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-600 truncate">{unit.property_name}</span>
          <span className="text-gray-300">•</span>
          <span className="text-xs text-gray-400">{unit.property_code}</span>
        </div>

        {/* Financial Info */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Monthly Rent</p>
            <p className="text-sm font-bold text-gray-900">{formatCurrency(unit.rent_amount)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Deposit</p>
            <p className="text-sm font-bold text-gray-900">{formatCurrency(unit.deposit_amount)}</p>
          </div>
        </div>

        {/* Features */}
        {activeFeatures.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {activeFeatures.slice(0, 4).map((feature) => {
              const IconComponent = featureIcons[feature] || Tag;
              return (
                <span 
                  key={feature}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded-md text-xs"
                  title={feature}
                >
                  <IconComponent className="w-3 h-3" />
                  <span className="hidden sm:inline">{feature}</span>
                </span>
              );
            })}
            {activeFeatures.length > 4 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs">
                +{activeFeatures.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Description */}
        {unit.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-4">{unit.description}</p>
        )}
      </div>

      {/* Actions - Show on Hover (Desktop) */}
      <div className={`px-4 pb-4 pt-0 flex gap-2 transition-all duration-300 ${
        showActions ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      } hidden sm:flex`}>
        <button
          onClick={() => onOpenGallery(unit)}
          className="flex-1 px-3 py-2 text-sm font-medium text-purple-600 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <Image className="w-4 h-4" />
          Gallery
        </button>
        <button
          onClick={() => onEdit(unit)}
          className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <Edit3 className="w-4 h-4" />
          Edit
        </button>
        <button
          onClick={() => onDelete(unit)}
          className="px-3 py-2 text-sm font-medium text-gray-500 bg-gray-50 rounded-xl hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Actions - Always Visible (Mobile) */}
      <div className="px-4 pb-4 pt-0 flex gap-2 sm:hidden">
        <button
          onClick={() => onOpenGallery(unit)}
          className="flex-1 px-3 py-2.5 text-sm font-medium text-purple-600 bg-purple-50 rounded-xl"
        >
          Gallery
        </button>
        <button
          onClick={() => onEdit(unit)}
          className="flex-1 px-3 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(unit)}
          className="px-3 py-2.5 text-sm font-medium text-gray-500 bg-gray-50 rounded-xl"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ==================== UNIT MODAL (CREATE/EDIT) ====================
const UnitModal = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  properties, 
  editingUnit,
  unitTypes,
  availableFeatures,
  loading
}) => {
  const [selectedProperty, setSelectedProperty] = useState('');
  const [formData, setFormData] = useState({
    unit_number: '',
    unit_type: 'bedsitter',
    rent_amount: '',
    deposit_amount: '',
    description: '',
    features: {}
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      if (editingUnit) {
        setSelectedProperty(editingUnit.property_id);
        setFormData({
          unit_number: editingUnit.unit_number || '',
          unit_type: editingUnit.unit_type || 'bedsitter',
          rent_amount: editingUnit.rent_amount || '',
          deposit_amount: editingUnit.deposit_amount || '',
          description: editingUnit.description || '',
          features: editingUnit.features || {}
        });
      } else {
        setSelectedProperty('');
        setFormData({
          unit_number: '',
          unit_type: 'bedsitter',
          rent_amount: '',
          deposit_amount: '',
          description: '',
          features: {}
        });
      }
      setErrors({});
    }
  }, [isOpen, editingUnit]);

  const toggleFeature = (feature) => {
    setFormData(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [feature]: !prev.features[feature]
      }
    }));
  };

  const validate = () => {
    const newErrors = {};
    if (!selectedProperty) newErrors.property = 'Please select a property';
    if (!formData.unit_number.trim()) newErrors.unit_number = 'Unit number is required';
    if (!formData.rent_amount || parseFloat(formData.rent_amount) <= 0) {
      newErrors.rent_amount = 'Valid rent amount is required';
    }
    if (!formData.deposit_amount || parseFloat(formData.deposit_amount) < 0) {
      newErrors.deposit_amount = 'Valid deposit amount is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      property_id: selectedProperty,
      unit_id: editingUnit?.id,
      ...formData,
      rent_amount: parseFloat(formData.rent_amount),
      deposit_amount: parseFloat(formData.deposit_amount)
    });
  };

  if (!isOpen) return null;

  const selectedPropertyData = properties.find(p => p.id === selectedProperty);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fadeIn" 
          onClick={onClose} 
        />
        
        <div className="relative bg-white rounded-2xl shadow-2xl transform transition-all animate-slideUp w-full max-w-2xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-blue-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                {editingUnit ? <Edit3 className="w-5 h-5 text-purple-600" /> : <Plus className="w-5 h-5 text-purple-600" />}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingUnit ? 'Edit Unit' : 'Create New Unit'}
                </h3>
                <p className="text-sm text-gray-500">
                  {editingUnit ? 'Update unit details' : 'Add a new unit to a property'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            <div className="space-y-6">
              {/* Property Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Property <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedProperty}
                    onChange={(e) => setSelectedProperty(e.target.value)}
                    disabled={!!editingUnit}
                    className={`w-full px-4 py-3 bg-white border rounded-xl appearance-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed ${
                      errors.property ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  >
                    <option value="">Choose a property...</option>
                    {properties.map(property => (
                      <option key={property.id} value={property.id}>
                        {property.name} ({property.property_code})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
                {errors.property && (
                  <p className="mt-1 text-xs text-red-500">{errors.property}</p>
                )}
                {selectedPropertyData && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-purple-600">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Selected: {selectedPropertyData.name}</span>
                  </div>
                )}
              </div>

              {/* Unit Number & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.unit_number}
                    onChange={(e) => setFormData({...formData, unit_number: e.target.value})}
                    placeholder="e.g., 101, A1, G-01"
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors ${
                      errors.unit_number ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                  {errors.unit_number && (
                    <p className="mt-1 text-xs text-red-500">{errors.unit_number}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit Type <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formData.unit_type}
                      onChange={(e) => setFormData({...formData, unit_type: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl appearance-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                    >
                      {Object.entries(unitTypes).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Financial Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monthly Rent (KES) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={formData.rent_amount}
                      onChange={(e) => setFormData({...formData, rent_amount: e.target.value})}
                      placeholder="15000"
                      className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors ${
                        errors.rent_amount ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                  </div>
                  {errors.rent_amount && (
                    <p className="mt-1 text-xs text-red-500">{errors.rent_amount}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Security Deposit (KES) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={formData.deposit_amount}
                      onChange={(e) => setFormData({...formData, deposit_amount: e.target.value})}
                      placeholder="15000"
                      className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors ${
                        errors.deposit_amount ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                  </div>
                  {errors.deposit_amount && (
                    <p className="mt-1 text-xs text-red-500">{errors.deposit_amount}</p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe the unit - size, view, special features..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors resize-none"
                />
              </div>

              {/* Features */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    Unit Features
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableFeatures.map((feature) => {
                    const IconComponent = featureIcons[feature] || Tag;
                    const isSelected = formData.features[feature];
                    
                    return (
                      <button
                        key={feature}
                        type="button"
                        onClick={() => toggleFeature(feature)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                          isSelected 
                            ? 'bg-purple-100 text-purple-700 border-2 border-purple-300' 
                            : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'
                        }`}
                      >
                        <IconComponent className={`w-4 h-4 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                        <span className="truncate">{feature}</span>
                        {isSelected && (
                          <Check className="w-4 h-4 ml-auto text-purple-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || properties.length === 0}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {editingUnit ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  {editingUnit ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingUnit ? 'Update Unit' : 'Create Unit'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== IMAGE GALLERY MODAL ====================
const ImageGalleryModal = ({
  isOpen,
  onClose,
  unit,
  unitTypes,
  images,
  isLoading,
  isUploading,
  uploadError,
  currentIndex,
  setCurrentIndex,
  onUpload,
  onDelete,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onUpload(files);
    }
  };

  const goToPrevious = () => {
    setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, images.length]);

  if (!isOpen || !unit) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-6xl h-[90vh] flex flex-col bg-gray-900 shadow-2xl rounded-2xl overflow-hidden mx-4 animate-scaleIn border border-gray-800">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Camera className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {unit.display_unit_code || unit.unit_code} - Gallery
              </h2>
              <p className="text-sm text-gray-400">
                {unitTypes[unit.unit_type]} • {images.length} image{images.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Main Stage */}
        <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden group">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center text-purple-400">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <span className="text-gray-400 text-sm">Loading gallery...</span>
            </div>
          ) : images.length > 0 ? (
            <>
              {/* Main Image */}
              <img
                key={images[currentIndex]?.id}
                src={images[currentIndex]?.image_url}
                alt={images[currentIndex]?.caption || "Unit"}
                className="max-w-full max-h-full object-contain transition-transform duration-500 hover:scale-[1.02]"
              />

              {/* Caption Overlay */}
              {images[currentIndex]?.caption && (
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <p className="text-center text-white text-lg font-medium">
                    {images[currentIndex]?.caption}
                  </p>
                </div>
              )}

              {/* Navigation Buttons */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); goToPrevious(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 text-white/70 hover:bg-white/20 hover:text-white hover:scale-110 transition-all duration-200 backdrop-blur-sm border border-white/10"
                  >
                    <ChevronLeft className="w-8 h-8" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); goToNext(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 text-white/70 hover:bg-white/20 hover:text-white hover:scale-110 transition-all duration-200 backdrop-blur-sm border border-white/10"
                  >
                    <ChevronRight className="w-8 h-8" />
                  </button>
                </>
              )}

              {/* Delete Button */}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(images[currentIndex]?.id); }}
                className="absolute top-4 right-4 p-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-600 hover:text-white transition-all duration-200 backdrop-blur-md border border-red-500/30 opacity-0 group-hover:opacity-100"
                title="Delete Image"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              {/* Image Counter */}
              <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                {currentIndex + 1} / {images.length}
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500">
              <div className="w-20 h-20 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <Image className="w-10 h-10 text-gray-600" />
              </div>
              <p className="text-lg font-medium text-gray-400">No images yet</p>
              <p className="text-sm text-gray-500 mt-1">Upload photos to showcase this unit</p>
            </div>
          )}
        </div>

        {/* Footer / Thumbnails / Upload */}
        <div className="bg-gray-900 border-t border-gray-800 p-4 space-y-4">
          
          {/* Thumbnails */}
          {images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all duration-200 ${
                    idx === currentIndex 
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
                <Loader2 className="w-5 h-5 animate-spin mr-3" />
                <span className="font-medium">Uploading photos...</span>
              </div>
            ) : (
              <label className="flex flex-col sm:flex-row items-center justify-center p-4 cursor-pointer gap-3 text-gray-400 hover:text-white transition-colors">
                <div className="p-2 rounded-full bg-gray-700/50">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-center sm:text-left">
                  <span className="font-medium text-purple-400 hover:text-purple-300">Click to upload</span>
                  <span className="mx-1">or drag and drop</span>
                  <span className="text-xs text-gray-500 block sm:inline">(Max 10MB each)</span>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files)}
                />
              </label>
            )}
            {uploadError && (
              <div className="absolute -bottom-8 left-0 right-0 text-center">
                <span className="inline-flex items-center gap-1 bg-red-500 text-white text-xs px-3 py-1 rounded-lg shadow-lg">
                  <AlertTriangle className="w-3 h-3" />
                  {uploadError}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== EMPTY STATE ====================
const EmptyState = ({ hasProperties, onAddUnit }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fadeIn">
      <div className="w-20 h-20 rounded-2xl bg-purple-100 flex items-center justify-center mb-6">
        <Layers className="w-10 h-10 text-purple-600" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        {hasProperties ? 'No Units Found' : 'No Properties Yet'}
      </h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6">
        {hasProperties 
          ? 'Start by adding units to your properties. Each unit can have its own rent, features, and images.'
          : 'You need to create properties first before adding units. Units must belong to a property.'}
      </p>
      {hasProperties && (
        <button
          onClick={onAddUnit}
          className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Your First Unit
        </button>
      )}
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
const UnitManagement = () => {
  const { properties, addUnit, updateUnit, deleteUnit, fetchProperties, refreshProperties } = useProperty();
  
  // Modal states
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Image gallery states
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [selectedUnitForImages, setSelectedUnitForImages] = useState(null);
  const [unitImages, setUnitImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [unitImageCounts, setUnitImageCounts] = useState({});

  // Filter & Search
  const [filterProperty, setFilterProperty] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Toast
  const { toasts, addToast, removeToast } = useToast();

  const unitTypes = {
    bedsitter: 'Bedsitter',
    studio: 'Studio',
    one_bedroom: 'One Bedroom',
    two_bedroom: 'Two Bedroom',
    three_bedroom: 'Three Bedroom',
    shop: 'Shop',
    hall: 'Hall'
  };

  const availableFeatures = [
    'Parking', 'Balcony', 'Security', 'Water Backup', 'Gym Access',
    'Swimming Pool', 'Internet', 'Cable TV', 'Air Conditioning', 'Furnished'
  ];

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const normalizeUnitCodeForDisplay = useCallback((unitCode, propertyCode) => {
    if (!unitCode) return unitCode;
    if (!propertyCode) return unitCode;
    const prefix = `${propertyCode}-`;
    const doublePrefix = `${prefix}${prefix}`;
    let normalized = String(unitCode);
    while (normalized.startsWith(doublePrefix)) {
      normalized = normalized.slice(prefix.length);
    }
    return normalized;
  }, []);

  // Get all units from all properties
  const allUnits = useMemo(() => {
    return properties.flatMap(property => 
      (property.units || []).map(unit => ({
        ...unit,
        property_name: property.name,
        property_code: property.property_code,
        property_id: property.id,
        display_unit_code: normalizeUnitCodeForDisplay(unit.unit_code, property.property_code)
      }))
    );
  }, [properties, normalizeUnitCodeForDisplay]);

  // Filtered units
  const filteredUnits = useMemo(() => {
    let result = [...allUnits];

    // Property filter
    if (filterProperty) {
      result = result.filter(unit => unit.property_id === filterProperty);
    }

    // Type filter
    if (filterType) {
      result = result.filter(unit => unit.unit_type === filterType);
    }

    // Status filter
    if (filterStatus === 'occupied') {
      result = result.filter(unit => unit.is_occupied);
    } else if (filterStatus === 'available') {
      result = result.filter(unit => !unit.is_occupied);
    }

    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(unit => 
        unit.display_unit_code?.toLowerCase().includes(query) ||
        unit.unit_code?.toLowerCase().includes(query) ||
        unit.unit_number?.toLowerCase().includes(query) ||
        unit.property_name?.toLowerCase().includes(query) ||
        unitTypes[unit.unit_type]?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [allUnits, filterProperty, filterType, filterStatus, searchQuery]);

  // Stats
  const stats = useMemo(() => ({
    total: allUnits.length,
    occupied: allUnits.filter(u => u.is_occupied).length,
    available: allUnits.filter(u => !u.is_occupied).length,
    occupancyRate: allUnits.length > 0 
      ? Math.round((allUnits.filter(u => u.is_occupied).length / allUnits.length) * 100) 
      : 0
  }), [allUnits]);

  // Fetch image counts
  useEffect(() => {
    const fetchImageCounts = async () => {
      if (allUnits.length === 0) return;
      
      try {
        const unitIds = allUnits.map(u => u.id);
        const response = await propertyAPI.getUnitImageCounts(unitIds);
        if (response.data.success) {
          setUnitImageCounts(response.data.data || {});
        }
      } catch (error) {
        console.log('Could not fetch image counts:', error.message);
      }
    };
    
    fetchImageCounts();
  }, [allUnits.length]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  // Clear filters
  const clearFilters = () => {
    setFilterProperty('');
    setFilterType('');
    setFilterStatus('');
    setSearchQuery('');
  };

  const hasActiveFilters = filterProperty || filterType || filterStatus || searchQuery;

  // Handle add/edit unit
  const handleOpenAddUnit = () => {
    setEditingUnit(null);
    setShowUnitModal(true);
  };

  const handleEditUnit = (unit) => {
    setEditingUnit(unit);
    setShowUnitModal(true);
  };

  const handleSubmitUnit = async (formData) => {
    setActionLoading(true);
    try {
      if (editingUnit) {
        await updateUnit(formData.property_id, formData.unit_id, formData);
        addToast('Unit updated successfully!', 'success');
      } else {
        await addUnit(formData.property_id, formData);
        addToast('Unit created successfully!', 'success');
      }
      setShowUnitModal(false);
      setEditingUnit(null);
      refreshProperties();
    } catch (error) {
      console.error('Error saving unit:', error);
      addToast(error.response?.data?.message || 'Failed to save unit', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle delete unit
  const handleOpenDeleteConfirm = (unit) => {
    setUnitToDelete(unit);
    setShowDeleteConfirm(true);
  };

  const handleDeleteUnit = async () => {
    if (!unitToDelete) return;
    
    setActionLoading(true);
    try {
      await deleteUnit(unitToDelete.property_id, unitToDelete.id);
      addToast(`Unit ${unitToDelete.display_unit_code || unitToDelete.unit_code} deleted successfully`, 'success');
      setShowDeleteConfirm(false);
      setUnitToDelete(null);
      refreshProperties();
    } catch (error) {
      console.error('Error deleting unit:', error);
      addToast(error.response?.data?.message || 'Failed to delete unit', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Image Gallery functions
  const fetchUnitImages = useCallback(async (unitId) => {
    setIsLoadingImages(true);
    setUploadError(null);
    try {
      const response = await propertyAPI.getUnitImages(unitId);
      if (response.data.success) {
        setUnitImages(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching unit images:', error);
      setUploadError('Failed to load images');
    } finally {
      setIsLoadingImages(false);
    }
  }, []);

  const handleOpenImageGallery = (unit) => {
    setSelectedUnitForImages(unit);
    setShowImageGallery(true);
    setCurrentImageIndex(0);
    fetchUnitImages(unit.id);
  };

  const handleImageUpload = async (files) => {
    if (!files || files.length === 0 || !selectedUnitForImages) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('unit_images', file);
      });

      const response = await propertyAPI.uploadUnitImages(selectedUnitForImages.id, formData);
      
      if (response.data.success) {
        await fetchUnitImages(selectedUnitForImages.id);
        setUnitImageCounts(prev => ({
          ...prev,
          [selectedUnitForImages.id]: (prev[selectedUnitForImages.id] || 0) + files.length
        }));
        addToast(`${files.length} image(s) uploaded successfully`, 'success');
      } else {
        setUploadError(response.data.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      setUploadError(error.response?.data?.message || 'Failed to upload images');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteImage = async (imageId) => {
    try {
      const response = await propertyAPI.deleteUnitImage(selectedUnitForImages.id, imageId);
      
      if (response.data.success) {
        setUnitImages(prev => prev.filter(img => img.id !== imageId));
        setUnitImageCounts(prev => ({
          ...prev,
          [selectedUnitForImages.id]: Math.max(0, (prev[selectedUnitForImages.id] || 1) - 1)
        }));
        if (currentImageIndex >= unitImages.length - 1) {
          setCurrentImageIndex(Math.max(0, unitImages.length - 2));
        }
        addToast('Image deleted successfully', 'success');
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      addToast('Failed to delete image', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <Layers className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Unit Management</h1>
            <p className="text-sm text-gray-500">Manage property units and amenities</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshProperties}
            className="p-2.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleOpenAddUnit}
            disabled={properties.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Add Unit</span>
          </button>
        </div>
      </div>

      {/* No Properties Warning */}
      {properties.length === 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">No Properties Found</p>
            <p className="text-sm text-amber-600 mt-0.5">
              You need to create properties first before adding units. Units must be associated with existing properties.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <Layers className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Units</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.occupied}</p>
              <p className="text-xs text-gray-500">Occupied</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Home className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.available}</p>
              <p className="text-xs text-gray-500">Available</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.occupancyRate}%</p>
              <p className="text-xs text-gray-500">Occupancy</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative">
            <input
              type="text"
              placeholder="Search units..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>

          {/* Property Filter */}
          <div className="relative">
            <select
              value={filterProperty}
              onChange={(e) => setFilterProperty(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">All Properties</option>
              {properties.map(property => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">All Types</option>
              {Object.entries(unitTypes).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">All Status</option>
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2.5 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        <div className="mt-3 text-sm text-gray-500">
          Showing {filteredUnits.length} of {allUnits.length} units
        </div>
      </div>

      {/* Units Grid */}
      {filteredUnits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200">
          <EmptyState 
            hasProperties={properties.length > 0}
            onAddUnit={handleOpenAddUnit}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredUnits.map(unit => (
            <UnitCard
              key={unit.id}
              unit={unit}
              unitTypes={unitTypes}
              formatCurrency={formatCurrency}
              imageCount={unitImageCounts[unit.id]}
              onEdit={handleEditUnit}
              onDelete={handleOpenDeleteConfirm}
              onOpenGallery={handleOpenImageGallery}
            />
          ))}
        </div>
      )}

      {/* Unit Modal */}
      <UnitModal
        isOpen={showUnitModal}
        onClose={() => { setShowUnitModal(false); setEditingUnit(null); }}
        onSubmit={handleSubmitUnit}
        properties={properties}
        editingUnit={editingUnit}
        unitTypes={unitTypes}
        availableFeatures={availableFeatures}
        loading={actionLoading}
      />

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setUnitToDelete(null); }}
        onConfirm={handleDeleteUnit}
        title="Delete Unit"
        message={`Are you sure you want to delete unit ${unitToDelete?.display_unit_code || unitToDelete?.unit_code}? This action cannot be undone and will remove all associated data.`}
        confirmText="Delete Unit"
        confirmColor="red"
        icon={Trash2}
        loading={actionLoading}
      />

      {/* Image Gallery */}
      <ImageGalleryModal
        isOpen={showImageGallery}
        onClose={() => { setShowImageGallery(false); setSelectedUnitForImages(null); setUnitImages([]); }}
        unit={selectedUnitForImages}
        unitTypes={unitTypes}
        images={unitImages}
        isLoading={isLoadingImages}
        isUploading={isUploading}
        uploadError={uploadError}
        currentIndex={currentImageIndex}
        setCurrentIndex={setCurrentImageIndex}
        onUpload={handleImageUpload}
        onDelete={handleDeleteImage}
      />

      {/* Custom Animations */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};

export default UnitManagement;
