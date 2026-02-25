// src/components/UserManagement.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  X,
  Edit3,
  UserX,
  Mail,
  Phone,
  CreditCard,
  Shield,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  RefreshCw,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  User,
  Crown,
  BadgeCheck,
  UserCog,
  Activity,
  Check,
  MoreVertical,
  Key
} from 'lucide-react';
import { useUser } from '../context/UserContext';

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
    amber: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    green: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
  };

  const iconBgClasses = {
    red: 'bg-red-100 text-red-600',
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
    green: 'bg-green-100 text-green-600',
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

// ==================== USER CARD COMPONENT ====================
const UserCard = ({ user, onEdit, onDeactivate, onActivate }) => {
  const [showActions, setShowActions] = useState(false);

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin':
        return Crown;
      case 'agent':
        return UserCog;
      default:
        return User;
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return {
          bg: 'bg-purple-100',
          text: 'text-purple-700',
          border: 'border-purple-200',
          gradient: 'from-purple-500 to-indigo-600'
        };
      case 'agent':
        return {
          bg: 'bg-blue-100',
          text: 'text-blue-700',
          border: 'border-blue-200',
          gradient: 'from-blue-500 to-cyan-600'
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          border: 'border-gray-200',
          gradient: 'from-gray-500 to-gray-600'
        };
    }
  };

  const RoleIcon = getRoleIcon(user.role);
  const roleColors = getRoleColor(user.role);

  return (
    <div 
      className={`group bg-white rounded-2xl border-2 overflow-hidden hover:shadow-xl transition-all duration-300 ${
        user.is_active 
          ? 'border-gray-200 hover:border-blue-200' 
          : 'border-red-100 bg-red-50/30 hover:border-red-200'
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Card Header */}
      <div className={`relative h-24 bg-gradient-to-br ${roleColors.gradient} overflow-hidden`}>
        {/* Decorative Elements */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-2 right-2 w-16 h-16 border-2 border-white rounded-full" />
          <div className="absolute bottom-2 left-2 w-10 h-10 border-2 border-white rounded-lg transform rotate-12" />
        </div>

        {/* Role Badge */}
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${roleColors.bg} rounded-lg text-xs font-semibold ${roleColors.text} shadow-sm`}>
            <RoleIcon className="w-3.5 h-3.5" />
            {user.role?.charAt(0).toUpperCase() + user.role?.slice(1)}
          </span>
        </div>

        {/* Status Badge */}
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm ${
            user.is_active 
              ? 'bg-green-500 text-white' 
              : 'bg-red-500 text-white'
          }`}>
            {user.is_active ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                Active
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3" />
                Inactive
              </>
            )}
          </span>
        </div>

        {/* Avatar */}
        <div className="absolute -bottom-8 left-4">
          <div className="w-16 h-16 rounded-xl bg-white shadow-lg flex items-center justify-center border-4 border-white">
            {user.profile_image ? (
              <img 
                src={user.profile_image} 
                alt={`${user.first_name} ${user.last_name}`}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className={`w-full h-full rounded-lg bg-gradient-to-br ${roleColors.gradient} flex items-center justify-center text-white text-lg font-bold`}>
                {user.first_name?.[0]}{user.last_name?.[0]}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="pt-10 px-4 pb-4">
        {/* Name & National ID */}
        <div className="mb-3">
          <h3 className="font-semibold text-gray-900 text-lg">
            {user.first_name} {user.last_name}
          </h3>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
            <CreditCard className="w-3.5 h-3.5" />
            <span>ID: {user.national_id}</span>
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Mail className="w-4 h-4 text-gray-500" />
            </div>
            <span className="truncate">{user.email}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Phone className="w-4 h-4 text-gray-500" />
            </div>
            <span>{user.phone_number?.replace(/^254/, '0') || 'N/A'}</span>
          </div>
        </div>

        {/* Created Date */}
        {user.created_at && (
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            <span>Joined {new Date(user.created_at).toLocaleDateString('en-KE', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}</span>
          </div>
        )}
      </div>

      {/* Actions - Show on Hover (Desktop) */}
      <div className={`px-4 pb-4 pt-0 flex gap-2 transition-all duration-300 ${
        showActions ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      } hidden sm:flex`}>
        <button
          onClick={() => onEdit(user)}
          className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <Edit3 className="w-4 h-4" />
          Edit
        </button>
        {user.is_active ? (
          <button
            onClick={() => onDeactivate(user)}
            className="flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <UserX className="w-4 h-4" />
            Deactivate
          </button>
        ) : (
          <button
            onClick={() => onActivate(user)}
            className="flex-1 px-3 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-xl hover:bg-green-100 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <UserCheck className="w-4 h-4" />
            Activate
          </button>
        )}
      </div>

      {/* Actions - Always Visible (Mobile) */}
      <div className="px-4 pb-4 pt-0 flex gap-2 sm:hidden">
        <button
          onClick={() => onEdit(user)}
          className="flex-1 px-3 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl"
        >
          Edit
        </button>
        {user.is_active ? (
          <button
            onClick={() => onDeactivate(user)}
            className="flex-1 px-3 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-xl"
          >
            Deactivate
          </button>
        ) : (
          <button
            onClick={() => onActivate(user)}
            className="flex-1 px-3 py-2.5 text-sm font-medium text-green-600 bg-green-50 rounded-xl"
          >
            Activate
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== USER MODAL (CREATE/EDIT) ====================
const UserModal = ({ isOpen, onClose, onSubmit, editingUser, loading }) => {
  const [formData, setFormData] = useState({
    national_id: '',
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    password: '',
    role: 'agent'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      if (editingUser) {
        setFormData({
          national_id: editingUser.national_id || '',
          first_name: editingUser.first_name || '',
          last_name: editingUser.last_name || '',
          email: editingUser.email || '',
          phone_number: editingUser.phone_number || '',
          password: '',
          role: editingUser.role || 'agent'
        });
      } else {
        setFormData({
          national_id: '',
          first_name: '',
          last_name: '',
          email: '',
          phone_number: '',
          password: '',
          role: 'agent'
        });
      }
      setErrors({});
      setShowPassword(false);
    }
  }, [isOpen, editingUser]);

  const validate = () => {
    const newErrors = {};
    if (!formData.national_id.trim()) newErrors.national_id = 'National ID is required';
    if (!formData.first_name.trim()) newErrors.first_name = 'First name is required';
    if (!formData.last_name.trim()) newErrors.last_name = 'Last name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.phone_number.trim()) newErrors.phone_number = 'Phone number is required';
    if (!editingUser && !formData.password.trim()) newErrors.password = 'Password is required';
    else if (!editingUser && formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fadeIn" 
          onClick={onClose} 
        />
        
        <div className="relative bg-white rounded-2xl shadow-2xl transform transition-all animate-slideUp w-full max-w-lg max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                {editingUser ? <Edit3 className="w-5 h-5 text-blue-600" /> : <UserPlus className="w-5 h-5 text-blue-600" />}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingUser ? 'Edit User' : 'Create New User'}
                </h3>
                <p className="text-sm text-gray-500">
                  {editingUser ? 'Update user information' : 'Add a new system user'}
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
            <div className="space-y-4">
              {/* National ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  National ID <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.national_id}
                    onChange={(e) => setFormData({...formData, national_id: e.target.value})}
                    placeholder="Enter national ID"
                    className={`w-full pl-4 pr-10 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.national_id ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                </div>
                {errors.national_id && (
                  <p className="mt-1 text-xs text-red-500">{errors.national_id}</p>
                )}
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                    placeholder="First name"
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.first_name ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                  {errors.first_name && (
                    <p className="mt-1 text-xs text-red-500">{errors.first_name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                    placeholder="Last name"
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.last_name ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                  {errors.last_name && (
                    <p className="mt-1 text-xs text-red-500">{errors.last_name}</p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="user@example.com"
                    className={`w-full pl-4 pr-10 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.email ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-xs text-red-500">{errors.email}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                    placeholder="0712345678"
                    className={`w-full pl-4 pr-10 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.phone_number ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                </div>
                {errors.phone_number && (
                  <p className="mt-1 text-xs text-red-500">{errors.phone_number}</p>
                )}
              </div>

              {/* Password (only for create) */}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute right-12 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      placeholder="Minimum 6 characters"
                      className={`w-full pl-4 pr-20 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.password ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-500">{errors.password}</p>
                  )}
                </div>
              )}

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, role: 'agent'})}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                      formData.role === 'agent'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      formData.role === 'agent' ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      <UserCog className={`w-5 h-5 ${formData.role === 'agent' ? 'text-blue-600' : 'text-gray-400'}`} />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Agent</p>
                      <p className="text-xs opacity-70">Property manager</p>
                    </div>
                    {formData.role === 'agent' && (
                      <Check className="w-5 h-5 ml-auto text-blue-600" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, role: 'admin'})}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                      formData.role === 'admin'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      formData.role === 'admin' ? 'bg-purple-100' : 'bg-gray-100'
                    }`}>
                      <Crown className={`w-5 h-5 ${formData.role === 'admin' ? 'text-purple-600' : 'text-gray-400'}`} />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Admin</p>
                      <p className="text-xs opacity-70">Full access</p>
                    </div>
                    {formData.role === 'admin' && (
                      <Check className="w-5 h-5 ml-auto text-purple-600" />
                    )}
                  </button>
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
              disabled={loading}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {editingUser ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  {editingUser ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  {editingUser ? 'Update User' : 'Create User'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== EMPTY STATE ====================
const EmptyState = ({ onAddUser }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fadeIn">
      <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center mb-6">
        <Users className="w-10 h-10 text-blue-600" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">No Users Found</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6">
        There are no users in the system yet. Start by adding your first user to manage the platform.
      </p>
      <button
        onClick={onAddUser}
        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
      >
        <UserPlus className="w-5 h-5" />
        Add Your First User
      </button>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
const UserManagement = () => {
  const { 
    users, 
    loading, 
    error, 
    fetchUsers, 
    createUser, 
    updateUser, 
    deleteUser 
  } = useUser();

  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Toast
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Safe users array
  const safeUsers = useMemo(() => Array.isArray(users) ? users : [], [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    let result = [...safeUsers];

    // Role filter
    if (filterRole) {
      result = result.filter(user => user.role === filterRole);
    }

    // Status filter
    if (filterStatus === 'active') {
      result = result.filter(user => user.is_active);
    } else if (filterStatus === 'inactive') {
      result = result.filter(user => !user.is_active);
    }

    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(user => 
        user.first_name?.toLowerCase().includes(query) ||
        user.last_name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        user.national_id?.toLowerCase().includes(query) ||
        user.phone_number?.includes(query)
      );
    }

    return result;
  }, [safeUsers, filterRole, filterStatus, searchQuery]);

  // Stats
  const stats = useMemo(() => ({
    total: safeUsers.length,
    admins: safeUsers.filter(u => u.role === 'admin').length,
    agents: safeUsers.filter(u => u.role === 'agent').length,
    active: safeUsers.filter(u => u.is_active).length,
    inactive: safeUsers.filter(u => !u.is_active).length
  }), [safeUsers]);

  // Clear filters
  const clearFilters = () => {
    setSearchQuery('');
    setFilterRole('');
    setFilterStatus('');
  };

  const hasActiveFilters = searchQuery || filterRole || filterStatus;

  // Handle create user
  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleSubmitUser = async (formData) => {
    setActionLoading(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, formData);
        addToast(`${formData.first_name} updated successfully!`, 'success');
      } else {
        await createUser(formData);
        addToast(`${formData.first_name} created successfully!`, 'success');
      }
      setShowUserModal(false);
      setEditingUser(null);
    } catch (err) {
      console.error('Error saving user:', err);
      addToast(err.response?.data?.message || 'Failed to save user', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle deactivate
  const handleOpenDeactivate = (user) => {
    setSelectedUser(user);
    setShowDeactivateConfirm(true);
  };

  const handleDeactivate = async () => {
    if (!selectedUser) return;
    
    setActionLoading(true);
    try {
      await deleteUser(selectedUser.id);
      addToast(`${selectedUser.first_name} deactivated successfully`, 'success');
      setShowDeactivateConfirm(false);
      setSelectedUser(null);
    } catch (err) {
      console.error('Error deactivating user:', err);
      addToast('Failed to deactivate user', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle activate
  const handleOpenActivate = (user) => {
    setSelectedUser(user);
    setShowActivateConfirm(true);
  };

  const handleActivate = async () => {
    if (!selectedUser) return;
    
    setActionLoading(true);
    try {
      await updateUser(selectedUser.id, { is_active: true });
      addToast(`${selectedUser.first_name} activated successfully`, 'success');
      setShowActivateConfirm(false);
      setSelectedUser(null);
      fetchUsers(); // Refresh to get updated status
    } catch (err) {
      console.error('Error activating user:', err);
      addToast('Failed to activate user', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-pulse" />
          <Loader2 className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
        </div>
        <p className="text-gray-600 font-medium">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-500">Manage system users and permissions</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-5 h-5" />
            <span className="hidden sm:inline">Add User</span>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Users</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <Crown className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.admins}</p>
              <p className="text-xs text-gray-500">Admins</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center">
              <UserCog className="w-6 h-6 text-cyan-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.agents}</p>
              <p className="text-xs text-gray-500">Agents</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
              <p className="text-xs text-gray-500">Active</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
              <UserX className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.inactive}</p>
              <p className="text-xs text-gray-500">Inactive</p>
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
              placeholder="Search by name, email, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>

          {/* Role Filter */}
          <div className="relative">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="agent">Agent</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
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
          Showing {filteredUsers.length} of {safeUsers.length} users
        </div>
      </div>

      {/* Users Grid */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200">
          <EmptyState onAddUser={handleOpenCreateModal} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredUsers.map(user => (
            <UserCard
              key={user.id}
              user={user}
              onEdit={handleEditUser}
              onDeactivate={handleOpenDeactivate}
              onActivate={handleOpenActivate}
            />
          ))}
        </div>
      )}

      {/* User Modal */}
      <UserModal
        isOpen={showUserModal}
        onClose={() => { setShowUserModal(false); setEditingUser(null); }}
        onSubmit={handleSubmitUser}
        editingUser={editingUser}
        loading={actionLoading}
      />

      {/* Deactivate Confirmation */}
      <ConfirmationModal
        isOpen={showDeactivateConfirm}
        onClose={() => { setShowDeactivateConfirm(false); setSelectedUser(null); }}
        onConfirm={handleDeactivate}
        title="Deactivate User"
        message={`Are you sure you want to deactivate ${selectedUser?.first_name} ${selectedUser?.last_name}? They will no longer be able to access the system.`}
        confirmText="Deactivate"
        confirmColor="red"
        icon={UserX}
        loading={actionLoading}
      />

      {/* Activate Confirmation */}
      <ConfirmationModal
        isOpen={showActivateConfirm}
        onClose={() => { setShowActivateConfirm(false); setSelectedUser(null); }}
        onConfirm={handleActivate}
        title="Activate User"
        message={`Are you sure you want to activate ${selectedUser?.first_name} ${selectedUser?.last_name}? They will regain access to the system.`}
        confirmText="Activate"
        confirmColor="green"
        icon={UserCheck}
        loading={actionLoading}
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
      `}</style>
    </div>
  );
};

export default UserManagement;
