// src/components/TenantHub.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Building2,
  Search,
  X,
  RefreshCw,
  User,
  Phone,
  Mail,
  Home,
  Calendar,
  AlertCircle,
  Image,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  Download,
  Upload,
  ChevronDown,
  Filter,
  UserPlus,
  UserMinus,
  Trash2,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  DollarSign,
  MapPin,
  Shield,
  CalendarDays,
  Loader2,
  MoreVertical,
  Edit3,
  Info,
  CreditCard,
  BadgeCheck,
  UserX,
  HomeIcon,
  TrendingUp,
  Layers
} from 'lucide-react';
import { useAllocation } from '../context/TenantAllocationContext';
import { useProperty } from '../context/PropertyContext';
import { tenantAPI } from '../services/api';
import api, { API } from '../services/api';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ExcelJS from 'exceljs';

// ==================== CONSTANTS ====================
const DEFAULT_COMPANY = {
  name: 'Rental Management System',
  email: '',
  phone: '',
  address: '',
  logo: ''
};

const LEASE_WARNING_DAYS = 30;

// Company info cache
let cachedCompanyInfo = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000;

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

// ==================== TENANT DETAIL MODAL ====================
const TenantDetailModal = ({ tenant, isOpen, onClose, formatPhone, formatDate, formatCurrency, onRefreshTenant, onNotify }) => {
  const [agreementFile, setAgreementFile] = useState(null);
  const [uploadingAgreement, setUploadingAgreement] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setAgreementFile(null);
      setUploadingAgreement(false);
    }
  }, [isOpen, tenant?.id]);

  if (!isOpen || !tenant) return null;

  const leaseEndDate = tenant.lease_end_date ? new Date(tenant.lease_end_date) : null;
  const daysUntilExpiry = leaseEndDate ? Math.ceil((leaseEndDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= LEASE_WARNING_DAYS && daysUntilExpiry > 0;
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0;
  const formatFileSize = (bytes) => {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };
  const handleDownloadAgreement = async (tenantId, documentId) => {
    try {
      const response = await tenantAPI.getTenantAgreementDownloadUrl(
        tenantId,
        documentId,
      );
      const signedUrl = response?.data?.data?.url;
      if (!signedUrl) throw new Error("No signed URL returned");
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Failed to download agreement:", error);
      alert(
        error.response?.data?.message ||
          "Failed to generate secure agreement download link.",
      );
    }
  };
  const handleDeleteAgreement = async (tenantId, documentId) => {
    const confirmed = window.confirm(
      "Delete this agreement file? This cannot be undone.",
    );
    if (!confirmed) return;

    try {
      const response = await tenantAPI.deleteTenantAgreement(tenantId, documentId);
      if (response.data.success && typeof onRefreshTenant === "function") {
        await onRefreshTenant(tenantId);
        if (typeof onNotify === "function") {
          onNotify("Agreement file deleted", "success");
        }
      }
    } catch (error) {
      console.error("Failed to delete agreement:", error);
      if (typeof onNotify === "function") {
        onNotify(error.response?.data?.message || "Failed to delete agreement file.", "error");
      }
      alert(
        error.response?.data?.message || "Failed to delete agreement file.",
      );
    }
  };
  const handleUploadAgreement = async (tenantId) => {
    if (!agreementFile) return;

    try {
      setUploadingAgreement(true);
      const formData = new FormData();
      formData.append("agreement_file", agreementFile);
      formData.append("file_name", agreementFile.name);

      const response = await tenantAPI.uploadTenantAgreement(tenantId, formData);
      if (response.data?.success) {
        setAgreementFile(null);
        if (typeof onRefreshTenant === "function") {
          await onRefreshTenant(tenantId);
        }
        if (typeof onNotify === "function") {
          onNotify("Agreement uploaded successfully", "success");
        }
      }
    } catch (error) {
      console.error("Failed to upload agreement:", error);
      if (typeof onNotify === "function") {
        onNotify(error.response?.data?.message || "Failed to upload agreement file.", "error");
      }
      alert(error.response?.data?.message || "Failed to upload agreement file.");
    } finally {
      setUploadingAgreement(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fadeIn" 
          onClick={onClose} 
        />
        
        <div className="relative bg-white rounded-2xl shadow-2xl transform transition-all animate-slideUp w-full max-w-2xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white text-2xl font-bold">
                {tenant.first_name?.[0]}{tenant.last_name?.[0]}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {tenant.first_name} {tenant.last_name}
                </h2>
                <p className="text-blue-100 flex items-center gap-2 mt-1">
                  <CreditCard className="w-4 h-4" />
                  ID: {tenant.national_id}
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div className="absolute bottom-4 right-6">
              {tenant.unit_id ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-500 text-white">
                  <BadgeCheck className="w-4 h-4" />
                  Allocated
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-amber-500 text-white">
                  <UserX className="w-4 h-4" />
                  Unallocated
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Information */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  Contact Information
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{formatPhone(tenant.phone_number)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{tenant.email || 'No email'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">Registered: {formatDate(tenant.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-red-600" />
                  </div>
                  Emergency Contact
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{tenant.emergency_contact_name || 'Not provided'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{formatPhone(tenant.emergency_contact_phone) || 'Not provided'}</span>
                  </div>
                </div>
              </div>

              {/* Allocation Details */}
              {tenant.unit_id && (
                <div className="bg-gray-50 rounded-xl p-4 md:col-span-2">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                      <Home className="w-4 h-4 text-green-600" />
                    </div>
                    Allocation Details
                    
                    {/* Lease Expiry Warning */}
                    {isExpired && (
                      <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        <AlertTriangle className="w-3 h-3" />
                        Lease Expired
                      </span>
                    )}
                    {isExpiringSoon && (
                      <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <Clock className="w-3 h-3" />
                        Expires in {daysUntilExpiry} days
                      </span>
                    )}
                  </h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Property</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">{tenant.property_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Unit</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">{tenant.unit_code || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Monthly Rent</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">{formatCurrency(tenant.monthly_rent)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Security Deposit</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">{formatCurrency(tenant.security_deposit)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Arrears Balance</p>
                      <p className={`text-sm font-medium mt-1 ${parseFloat(tenant.arrears_balance) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatCurrency(tenant.arrears_balance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Lease Period</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {formatDate(tenant.lease_start_date)} - {formatDate(tenant.lease_end_date)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ID Documents */}
              <div className="bg-gray-50 rounded-xl p-4 md:col-span-2">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Image className="w-4 h-4 text-purple-600" />
                  </div>
                  ID Documents
                </h3>
                <div className="flex flex-wrap gap-4">
                  {tenant.id_front_image ? (
                    <a
                      href={tenant.id_front_image}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Front ID
                    </a>
                  ) : (
                    <span className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-sm text-gray-400">
                      <Image className="w-4 h-4" />
                      No Front ID
                    </span>
                  )}
                  {tenant.id_back_image ? (
                    <a
                      href={tenant.id_back_image}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Back ID
                    </a>
                  ) : (
                    <span className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-sm text-gray-400">
                      <Image className="w-4 h-4" />
                      No Back ID
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 md:col-span-2">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  Agreement Files
                </h3>
                <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => setAgreementFile(e.target.files?.[0] || null)}
                      className="flex-1 text-sm text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => handleUploadAgreement(tenant.id)}
                      disabled={!agreementFile || uploadingAgreement}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadingAgreement ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Upload Agreement
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {Array.isArray(tenant.agreement_documents) && tenant.agreement_documents.length > 0 ? (
                  <div className="space-y-2">
                    {tenant.agreement_documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{doc.file_name}</p>
                          <p className="text-xs text-gray-500">
                            {doc.file_type || 'Unknown type'} • {formatFileSize(doc.file_size)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleDownloadAgreement(tenant.id, doc.id)}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAgreement(tenant.id, doc.id)}
                            className="text-sm font-medium text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 bg-gray-100 rounded-lg text-sm text-gray-500">
                    No agreement files uploaded
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== ALLOCATION MODAL ====================
const AllocationModal = ({ 
  isOpen, 
  onClose, 
  tenant, 
  availableUnits, 
  properties, 
  onAllocate, 
  loading,
  formatCurrency 
}) => {
  const [selectedUnit, setSelectedUnit] = useState('');
  const [leaseData, setLeaseData] = useState({
    lease_start_date: '',
    lease_end_date: '',
    monthly_rent: '',
    security_deposit: '',
    rent_due_day: 5,
    grace_period_days: 7
  });
  const [error, setError] = useState('');

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedUnit('');
      setLeaseData({
        lease_start_date: '',
        lease_end_date: '',
        monthly_rent: '',
        security_deposit: '',
        rent_due_day: 5,
        grace_period_days: 7
      });
      setError('');
    }
  }, [isOpen]);

  // Auto-fill rent when unit is selected
  useEffect(() => {
    if (selectedUnit) {
      const unit = availableUnits.find(u => u.id === selectedUnit);
      if (unit) {
        setLeaseData(prev => ({
          ...prev,
          monthly_rent: unit.rent_amount || '',
          security_deposit: unit.deposit_amount || ''
        }));
      }
    }
  }, [selectedUnit, availableUnits]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedUnit) {
      setError('Please select a unit');
      return;
    }

    if (!leaseData.lease_start_date || !leaseData.lease_end_date) {
      setError('Please enter lease dates');
      return;
    }

    try {
      await onAllocate({
        tenant_id: tenant.id,
        unit_id: selectedUnit,
        ...leaseData,
        monthly_rent: parseFloat(leaseData.monthly_rent) || 0,
        security_deposit: parseFloat(leaseData.security_deposit) || 0
      });
    } catch (err) {
      setError(err.message || 'Failed to allocate tenant');
    }
  };

  if (!isOpen || !tenant) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fadeIn" 
          onClick={onClose} 
        />
        
        <div className="relative bg-white rounded-2xl shadow-2xl transform transition-all animate-slideUp w-full max-w-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Allocate Tenant</h3>
                <p className="text-sm text-gray-500">{tenant.first_name} {tenant.last_name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Unit Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Unit *
              </label>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                required
              >
                <option value="">Choose a unit...</option>
                {availableUnits.map(unit => {
                  const property = properties.find(p => p.id === unit.property_id);
                  return (
                    <option key={unit.id} value={unit.id}>
                      {property?.name || 'Unknown'} - {unit.unit_code} ({unit.unit_type}) - {formatCurrency(unit.rent_amount)}
                    </option>
                  );
                })}
              </select>
              {availableUnits.length === 0 && (
                <p className="mt-2 text-xs text-amber-600">No available units. Please add units first.</p>
              )}
            </div>

            {/* Lease Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lease Start *
                </label>
                <input
                  type="date"
                  value={leaseData.lease_start_date}
                  onChange={(e) => setLeaseData({...leaseData, lease_start_date: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lease End *
                </label>
                <input
                  type="date"
                  value={leaseData.lease_end_date}
                  onChange={(e) => setLeaseData({...leaseData, lease_end_date: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Rent & Deposit */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monthly Rent (KES) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={leaseData.monthly_rent}
                  onChange={(e) => setLeaseData({...leaseData, monthly_rent: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Security Deposit (KES) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={leaseData.security_deposit}
                  onChange={(e) => setLeaseData({...leaseData, security_deposit: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Due Day & Grace Period */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rent Due Day *
                </label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={leaseData.rent_due_day}
                  onChange={(e) => setLeaseData({...leaseData, rent_due_day: parseInt(e.target.value) || 5})}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grace Period (Days) *
                </label>
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={leaseData.grace_period_days}
                  onChange={(e) => setLeaseData({...leaseData, grace_period_days: parseInt(e.target.value) || 7})}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || availableUnits.length === 0}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Allocating...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Allocate Tenant
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ==================== TENANT CARD COMPONENT ====================
const TenantCard = ({ 
  tenant, 
  onViewDetails, 
  onAllocate, 
  onDeallocate, 
  onDelete,
  formatPhone,
  formatCurrency,
  formatDate,
  availableUnitsCount
}) => {
  const [showActions, setShowActions] = useState(false);

  const leaseEndDate = tenant.lease_end_date ? new Date(tenant.lease_end_date) : null;
  const daysUntilExpiry = leaseEndDate ? Math.ceil((leaseEndDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= LEASE_WARNING_DAYS && daysUntilExpiry > 0;
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0;
  const hasArrears = parseFloat(tenant.arrears_balance) > 0;

  return (
    <div 
      className="group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all duration-300"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Card Header */}
      <div className={`relative p-4 ${tenant.unit_id ? 'bg-gradient-to-r from-green-50 to-emerald-50' : 'bg-gradient-to-r from-amber-50 to-orange-50'}`}>
        {/* Status Indicators */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {isExpired && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Expired
            </span>
          )}
          {isExpiringSoon && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {daysUntilExpiry}d
            </span>
          )}
          {hasArrears && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Arrears
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold ${
            tenant.unit_id ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-amber-500 to-orange-600'
          }`}>
            {tenant.first_name?.[0]}{tenant.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">
              {tenant.first_name} {tenant.last_name}
            </h3>
            <p className="text-sm text-gray-500 truncate">ID: {tenant.national_id}</p>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        {/* Contact Info */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Phone className="w-4 h-4 text-gray-400" />
          <span>{formatPhone(tenant.phone_number)}</span>
        </div>
        
        {tenant.email && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Mail className="w-4 h-4 text-gray-400" />
            <span className="truncate">{tenant.email}</span>
          </div>
        )}

        {/* Allocation Info */}
        {tenant.unit_id ? (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-green-500" />
              <span className="font-medium text-gray-900">{tenant.property_name}</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">{tenant.unit_code}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Rent:</span>
              <span className="font-medium text-gray-900">{formatCurrency(tenant.monthly_rent)}/mo</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Lease ends:</span>
              <span className={`font-medium ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-600' : 'text-gray-900'}`}>
                {formatDate(tenant.lease_end_date)}
              </span>
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="w-4 h-4" />
              <span>Not assigned to any unit</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions - Show on Hover */}
      <div className={`px-4 pb-4 pt-2 border-t border-gray-100 flex gap-2 transition-all duration-300 ${
        showActions ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}>
        <button
          onClick={() => onViewDetails(tenant)}
          className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <Eye className="w-4 h-4" />
          View
        </button>
        
        {tenant.unit_id ? (
          <button
            onClick={() => onDeallocate(tenant)}
            className="flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <UserMinus className="w-4 h-4" />
            Deallocate
          </button>
        ) : (
          <>
            <button
              onClick={() => onAllocate(tenant)}
              disabled={availableUnitsCount === 0}
              className="flex-1 px-3 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4" />
              Allocate
            </button>
            <button
              onClick={() => onDelete(tenant)}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-gray-50 rounded-lg hover:bg-gray-100 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Mobile Actions - Always Visible */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-100 flex gap-2 sm:hidden">
        <button
          onClick={() => onViewDetails(tenant)}
          className="flex-1 px-3 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg"
        >
          View
        </button>
        {tenant.unit_id ? (
          <button
            onClick={() => onDeallocate(tenant)}
            className="flex-1 px-3 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg"
          >
            Deallocate
          </button>
        ) : (
          <button
            onClick={() => onAllocate(tenant)}
            disabled={availableUnitsCount === 0}
            className="flex-1 px-3 py-2.5 text-sm font-medium text-green-600 bg-green-50 rounded-lg disabled:opacity-50"
          >
            Allocate
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== EMPTY STATE ====================
const EmptyState = ({ type, searchQuery, onClearFilters }) => {
  const configs = {
    noResults: {
      icon: Search,
      title: 'No tenants found',
      description: searchQuery 
        ? `No tenants match "${searchQuery}". Try adjusting your search or filters.`
        : 'No tenants match your current filters.',
      color: 'blue'
    },
    noTenants: {
      icon: Users,
      title: 'No tenants yet',
      description: 'There are no tenants in the system. Add tenants to get started.',
      color: 'gray'
    },
    allocated: {
      icon: CheckCircle2,
      title: 'No allocated tenants',
      description: 'There are no tenants currently allocated to units.',
      color: 'green'
    },
    unallocated: {
      icon: UserX,
      title: 'All tenants allocated!',
      description: 'Great job! All tenants have been assigned to units.',
      color: 'green'
    }
  };

  const config = configs[type] || configs.noResults;
  const Icon = config.icon;

  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    gray: 'bg-gray-100 text-gray-600'
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fadeIn">
      <div className={`w-16 h-16 rounded-2xl ${colorClasses[config.color]} flex items-center justify-center mb-4`}>
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{config.title}</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-4">{config.description}</p>
      {(searchQuery || type === 'noResults') && onClearFilters && (
        <button
          onClick={onClearFilters}
          className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
};

// ==================== EXPORT MODAL ====================
const ExportModal = ({ isOpen, onClose, exportType, onExport, filteredCount, totalCount, exporting }) => {
  const [includeImages, setIncludeImages] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
        
        <div className="relative bg-white rounded-2xl shadow-2xl transform transition-all animate-scaleIn w-full max-w-md">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              {exportType === 'pdf' ? (
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-red-600" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6 text-green-600" />
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Export to {exportType === 'pdf' ? 'PDF' : 'Excel'}
                </h3>
                <p className="text-sm text-gray-500">
                  {filteredCount} of {totalCount} tenants
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(e) => setIncludeImages(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-medium text-gray-900">Include ID Images</span>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {exportType === 'pdf' 
                      ? 'Embed ID images in PDF (larger file, one tenant per page)'
                      : 'Add clickable links to ID images'
                    }
                  </p>
                </div>
              </label>

              {includeImages && exportType === 'pdf' && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Including images may take longer and create a larger file.</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 p-6 pt-0">
            <button
              onClick={onClose}
              disabled={exporting}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onExport(includeImages)}
              disabled={exporting}
              className={`flex-1 px-4 py-2.5 text-white rounded-xl font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 ${
                exportType === 'pdf' 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
const TenantHub = () => {
  // Data state
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Context hooks
  const { properties, loading: propertiesLoading } = useProperty();
  const { 
    allocations, 
    loading: allocationsLoading, 
    allocateTenant, 
    deallocateTenant, 
    fetchAllocations,
    clearError: clearAllocationError 
  } = useAllocation();

  // Filter state
  const [activeTab, setActiveTab] = useState('all');
  const [selectedProperties, setSelectedProperties] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  
  // UI state
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState(null);
  const [exporting, setExporting] = useState(false);
  
  // Modal states
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const [showDeallocateConfirm, setShowDeallocateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Toast
  const { toasts, addToast, removeToast } = useToast();

  // Safe arrays
  const safeProperties = useMemo(() => Array.isArray(properties) ? properties : [], [properties]);
  const safeAllocations = useMemo(() => Array.isArray(allocations) ? allocations : [], [allocations]);
  const safeTenants = useMemo(() => Array.isArray(tenants) ? tenants : [], [tenants]);

  // Available units
  const availableUnits = useMemo(() => {
    return safeProperties.flatMap(property => {
      const propertyUnits = Array.isArray(property.units) ? property.units : [];
      return propertyUnits.filter(unit => !unit.is_occupied);
    });
  }, [safeProperties]);

  // Fetch tenants
  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      const limit = 100;
      let page = 1;
      let totalPages = 1;
      const allTenants = [];

      do {
        const response = await api.get('/tenants', { params: { page, limit } });
        const payload = response.data?.data;
        const tenantsData = payload?.tenants || payload || [];
        const pagination = payload?.pagination || {};

        if (Array.isArray(tenantsData)) {
          allTenants.push(...tenantsData);
        }

        totalPages = Number(pagination.totalPages) || 1;
        page += 1;
      } while (page <= totalPages);

      setTenants(allTenants);
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setError('Failed to load tenants');
      addToast('Failed to load tenants', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Initial fetch
  useEffect(() => {
    fetchTenants();
    fetchAllocations();
  }, [fetchTenants, fetchAllocations]);

  // Merge tenants with allocation data
  const tenantsWithStatus = useMemo(() => {
    return safeTenants.map(tenant => {
      const activeAllocation = safeAllocations.find(
        alloc => alloc.tenant_id === tenant.id && alloc.is_active
      );
      
      return {
        ...tenant,
        allocation: activeAllocation || null,
        isAllocated: !!activeAllocation,
        allocation_id: activeAllocation?.id || null
      };
    });
  }, [safeTenants, safeAllocations]);

  // Filter and sort tenants
  const filteredTenants = useMemo(() => {
    let result = [...tenantsWithStatus];

    // Tab filter
    if (activeTab === 'allocated') {
      result = result.filter(t => t.unit_id !== null);
    } else if (activeTab === 'unallocated') {
      result = result.filter(t => t.unit_id === null);
    }

    // Property filter
    if (selectedProperties.length > 0) {
      result = result.filter(t => 
        t.property_code && selectedProperties.includes(t.property_code)
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(t => 
        t.first_name?.toLowerCase().includes(query) ||
        t.last_name?.toLowerCase().includes(query) ||
        t.national_id?.toLowerCase().includes(query) ||
        t.phone_number?.includes(query) ||
        t.email?.toLowerCase().includes(query) ||
        t.unit_code?.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
        case 'name_desc':
          return `${b.first_name} ${b.last_name}`.localeCompare(`${a.first_name} ${a.last_name}`);
        case 'lease_expiry':
          const dateA = a.lease_end_date ? new Date(a.lease_end_date) : new Date('9999-12-31');
          const dateB = b.lease_end_date ? new Date(b.lease_end_date) : new Date('9999-12-31');
          return dateA - dateB;
        case 'created_at':
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    return result;
  }, [tenantsWithStatus, activeTab, selectedProperties, searchQuery, sortBy]);

  // Stats
  const stats = useMemo(() => ({
    total: tenantsWithStatus.length,
    allocated: tenantsWithStatus.filter(t => t.unit_id !== null).length,
    unallocated: tenantsWithStatus.filter(t => t.unit_id === null).length,
    availableUnits: availableUnits.length,
    expiringSoon: tenantsWithStatus.filter(t => {
      if (!t.lease_end_date) return false;
      const days = Math.ceil((new Date(t.lease_end_date) - new Date()) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= LEASE_WARNING_DAYS;
    }).length
  }), [tenantsWithStatus, availableUnits]);

  // Formatters
  const formatPhone = (phone) => {
    if (!phone) return 'N/A';
    return phone.replace(/^254/, '0');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    if (!amount) return 'KES 0';
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Toggle property selection
  const toggleProperty = (propertyCode) => {
    setSelectedProperties(prev => 
      prev.includes(propertyCode) 
        ? prev.filter(p => p !== propertyCode)
        : [...prev, propertyCode]
    );
  };

  // Clear all filters
  const clearFilters = () => {
    setActiveTab('all');
    setSelectedProperties([]);
    setSearchQuery('');
    setSortBy('created_at');
  };

  // View tenant details
  const handleViewDetails = (tenant) => {
    setSelectedTenant(tenant);
    setShowDetailModal(true);
  };

  // Open allocation modal
  const handleOpenAllocate = (tenant) => {
    setSelectedTenant(tenant);
    setShowAllocationModal(true);
  };

  // Allocate tenant
  const handleAllocate = async (allocationData) => {
    setActionLoading(true);
    try {
      await allocateTenant(allocationData);
      setShowAllocationModal(false);
      setSelectedTenant(null);
      await fetchAllocations();
      await fetchTenants();
      addToast(`${selectedTenant.first_name} allocated successfully!`, 'success');
    } catch (err) {
      console.error('Allocation error:', err);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  // Open deallocate confirmation
  const handleOpenDeallocate = (tenant) => {
    setSelectedTenant(tenant);
    setShowDeallocateConfirm(true);
  };

  // Deallocate tenant
  const handleDeallocate = async () => {
    if (!selectedTenant?.allocation_id) return;
    
    setActionLoading(true);
    try {
      await deallocateTenant(selectedTenant.allocation_id);
      setShowDeallocateConfirm(false);
      await fetchAllocations();
      await fetchTenants();
      addToast(`${selectedTenant.first_name} deallocated successfully!`, 'success');
      setSelectedTenant(null);
    } catch (err) {
      console.error('Deallocation error:', err);
      addToast('Failed to deallocate tenant', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open delete confirmation
  const handleOpenDelete = (tenant) => {
    setSelectedTenant(tenant);
    setShowDeleteConfirm(true);
  };

  // Delete tenant
  const handleDelete = async () => {
    if (!selectedTenant) return;
    
    setActionLoading(true);
    try {
      const response = await tenantAPI.deleteTenant(selectedTenant.id);
      
      if (response.data.success) {
        setShowDeleteConfirm(false);
        await fetchTenants();
        await fetchAllocations();
        addToast(`${selectedTenant.first_name} deleted permanently`, 'success');
        setSelectedTenant(null);
      } else {
        addToast(response.data.message || 'Failed to delete tenant', 'error');
      }
    } catch (err) {
      console.error('Delete error:', err);
      addToast(err.response?.data?.message || 'Failed to delete tenant', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Fetch company info
  const fetchCompanyInfo = async () => {
    const now = Date.now();
    
    if (cachedCompanyInfo && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
      return cachedCompanyInfo;
    }
    
    try {
      const response = await API.settings.getCompanyInfo();
      
      if (response.data?.success && response.data?.data) {
        cachedCompanyInfo = {
          name: response.data.data.name || DEFAULT_COMPANY.name,
          email: response.data.data.email || '',
          phone: response.data.data.phone || '',
          address: response.data.data.address || '',
          logo: response.data.data.logo || ''
        };
        cacheTimestamp = now;
        return cachedCompanyInfo;
      }
    } catch (error) {
      console.error('Could not fetch company info:', error);
    }
    
    return DEFAULT_COMPANY;
  };

  // Image to base64
  const imageToBase64 = async (url) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // Export to PDF
  const exportToPDF = async (includeImages) => {
    setExporting(true);
    try {
      const companyInfo = await fetchCompanyInfo();
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 15;

      // Company Header
      doc.setFontSize(16);
      doc.setTextColor(30, 64, 175);
      doc.setFont('helvetica', 'bold');
      doc.text(companyInfo.name, pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;

      if (companyInfo.address) {
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        doc.text(companyInfo.address, pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
      }

      const contactParts = [];
      if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
      if (companyInfo.email) contactParts.push(`Email: ${companyInfo.email}`);
      if (contactParts.length > 0) {
        doc.text(contactParts.join('  |  '), pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
      }

      // Divider
      yPos += 2;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, pageWidth - 14, yPos);
      yPos += 6;

      // Title
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text('Tenant Report', pageWidth / 2, yPos, { align: 'center' });
      yPos += 7;

      // Metadata
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()} | Total: ${filteredTenants.length} tenants`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      if (includeImages) {
        // Detailed view with images
        for (let i = 0; i < filteredTenants.length; i++) {
          const tenant = filteredTenants[i];
          
          if (i > 0) {
            doc.addPage();
            yPos = 20;
          }

          doc.setFontSize(14);
          doc.setTextColor(30, 64, 175);
          doc.setFont('helvetica', 'bold');
          doc.text(`${tenant.first_name} ${tenant.last_name}`, 14, yPos);
          yPos += 8;

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);

          const info = [
            `National ID: ${tenant.national_id || 'N/A'}`,
            `Phone: ${formatPhone(tenant.phone_number)}`,
            `Email: ${tenant.email || 'N/A'}`,
            `Status: ${tenant.unit_id ? 'Allocated' : 'Unallocated'}`,
          ];

          if (tenant.unit_id) {
            info.push(
              `Property: ${tenant.property_name || 'N/A'}`,
              `Unit: ${tenant.unit_code || 'N/A'}`,
              `Rent: ${formatCurrency(tenant.monthly_rent)}`
            );
          }

          info.forEach(line => {
            doc.text(line, 14, yPos);
            yPos += 5;
          });

          // ID Images
          if (tenant.id_front_image || tenant.id_back_image) {
            yPos += 5;
            doc.setFont('helvetica', 'bold');
            doc.text('ID Documents:', 14, yPos);
            yPos += 5;

            let xPos = 14;
            
            if (tenant.id_front_image) {
              try {
                const base64 = await imageToBase64(tenant.id_front_image);
                if (base64) {
                  doc.addImage(base64, 'JPEG', xPos, yPos, 60, 40);
                  xPos += 70;
                }
              } catch (e) {
                doc.text('Front ID: Failed to load', xPos, yPos + 20);
                xPos += 70;
              }
            }

            if (tenant.id_back_image) {
              try {
                const base64 = await imageToBase64(tenant.id_back_image);
                if (base64) {
                  doc.addImage(base64, 'JPEG', xPos, yPos, 60, 40);
                }
              } catch (e) {
                doc.text('Back ID: Failed to load', xPos, yPos + 20);
              }
            }
          }
        }
      } else {
        // Table view
        const tableData = filteredTenants.map(t => [
          `${t.first_name} ${t.last_name}`,
          t.national_id || 'N/A',
          formatPhone(t.phone_number),
          t.email || 'N/A',
          t.property_name || 'N/A',
          t.unit_code || 'N/A',
          t.unit_id ? 'Allocated' : 'Unallocated',
          formatCurrency(t.monthly_rent),
          formatDate(t.lease_end_date)
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Name', 'National ID', 'Phone', 'Email', 'Property', 'Unit', 'Status', 'Rent', 'Lease End']],
          body: tableData,
          theme: 'striped',
          headStyles: { 
            fillColor: [30, 64, 175], 
            fontSize: 8,
            fontStyle: 'bold'
          },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [248, 250, 252] }
        });
      }

      doc.save(`Tenants_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      setShowExportModal(false);
      addToast('PDF exported successfully!', 'success');
    } catch (error) {
      console.error('PDF export error:', error);
      addToast('Failed to export PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Export to Excel
  const exportToExcel = async (includeImages) => {
    setExporting(true);
    try {
      const companyInfo = await fetchCompanyInfo();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = companyInfo.name;
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Tenants');

      // Header
      const titleRow = worksheet.addRow([companyInfo.name]);
      titleRow.font = { size: 16, bold: true, color: { argb: 'FF1E40AF' } };
      titleRow.alignment = { horizontal: 'center' };
      worksheet.mergeCells('A1:I1');

      worksheet.addRow([]);
      const dateRow = worksheet.addRow([`Generated: ${new Date().toLocaleString()} | Total: ${filteredTenants.length} tenants`]);
      dateRow.alignment = { horizontal: 'center' };
      worksheet.mergeCells('A3:I3');
      worksheet.addRow([]);

      // Column headers
      const headers = ['Name', 'National ID', 'Phone', 'Email', 'Property', 'Unit', 'Status', 'Rent', 'Lease End'];
      if (includeImages) {
        headers.push('ID Front', 'ID Back');
      }

      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' }
      };

      // Set column widths
      worksheet.columns = [
        { width: 25 },
        { width: 15 },
        { width: 15 },
        { width: 30 },
        { width: 25 },
        { width: 12 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
        ...(includeImages ? [{ width: 50 }, { width: 50 }] : [])
      ];

      // Data rows
      filteredTenants.forEach((t, index) => {
        const rowData = [
          `${t.first_name} ${t.last_name}`,
          t.national_id || 'N/A',
          formatPhone(t.phone_number),
          t.email || 'N/A',
          t.property_name || 'N/A',
          t.unit_code || 'N/A',
          t.unit_id ? 'Allocated' : 'Unallocated',
          t.monthly_rent ? parseFloat(t.monthly_rent) : 'N/A',
          t.lease_end_date ? new Date(t.lease_end_date) : 'N/A'
        ];

        if (includeImages) {
          rowData.push(t.id_front_image || 'N/A');
          rowData.push(t.id_back_image || 'N/A');
        }

        const row = worksheet.addRow(rowData);

        if (index % 2 === 1) {
          row.eachCell(cell => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            };
          });
        }

        // Make image URLs clickable
        if (includeImages) {
          if (t.id_front_image) {
            row.getCell(10).value = { text: 'View Front ID', hyperlink: t.id_front_image };
            row.getCell(10).font = { color: { argb: 'FF0000FF' }, underline: true };
          }
          if (t.id_back_image) {
            row.getCell(11).value = { text: 'View Back ID', hyperlink: t.id_back_image };
            row.getCell(11).font = { color: { argb: 'FF0000FF' }, underline: true };
          }
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Tenants_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      setShowExportModal(false);
      addToast('Excel exported successfully!', 'success');
    } catch (error) {
      console.error('Excel export error:', error);
      addToast('Failed to export Excel', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Handle export
  const handleExport = (includeImages) => {
    if (exportType === 'pdf') {
      exportToPDF(includeImages);
    } else {
      exportToExcel(includeImages);
    }
  };

  // Loading state
  const isLoading = loading || propertiesLoading || allocationsLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-pulse" />
          <Loader2 className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
        </div>
        <p className="text-gray-600 font-medium">Loading tenants...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            Tenant Hub
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage tenants, allocations, and lease agreements
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchTenants(); fetchAllocations(); }}
            className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setExportType('pdf'); setShowExportModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors text-sm font-medium"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            onClick={() => { setExportType('excel'); setShowExportModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors text-sm font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Tenants</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <BadgeCheck className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.allocated}</p>
              <p className="text-xs text-gray-500">Allocated</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <UserX className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.unallocated}</p>
              <p className="text-xs text-gray-500">Unallocated</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <Layers className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.availableUnits}</p>
              <p className="text-xs text-gray-500">Available Units</p>
            </div>
          </div>
        </div>
      </div>

      {/* Expiring Soon Alert */}
      {stats.expiringSoon > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl animate-fadeIn">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-medium text-amber-800">
              {stats.expiringSoon} lease{stats.expiringSoon > 1 ? 's' : ''} expiring soon
            </p>
            <p className="text-sm text-amber-600">
              These leases will expire within the next {LEASE_WARNING_DAYS} days
            </p>
          </div>
          <button
            onClick={() => setSortBy('lease_expiry')}
            className="ml-auto px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors"
          >
            View All
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 sm:flex-none px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'all'
                  ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setActiveTab('allocated')}
              className={`flex-1 sm:flex-none px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'allocated'
                  ? 'border-green-500 text-green-600 bg-green-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Allocated ({stats.allocated})
            </button>
            <button
              onClick={() => setActiveTab('unallocated')}
              className={`flex-1 sm:flex-none px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'unallocated'
                  ? 'border-amber-500 text-amber-600 bg-amber-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Unallocated ({stats.unallocated})
            </button>
          </nav>
        </div>

        {/* Filters */}
        <div className="p-4 bg-gray-50/50 border-b border-gray-100">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px] relative">
              <input
                type="text"
                placeholder="Search by name, ID, phone, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>

            {/* Property Filter */}
            <div className="relative">
              <button
                onClick={() => setShowPropertyDropdown(!showPropertyDropdown)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                <Building2 className="w-4 h-4 text-gray-500" />
                <span>
                  {selectedProperties.length === 0 
                    ? 'All Properties' 
                    : `${selectedProperties.length} Selected`}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {showPropertyDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowPropertyDropdown(false)} 
                  />
                  <div className="absolute z-20 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                      <button
                        onClick={() => {
                          if (selectedProperties.length === safeProperties.length) {
                            setSelectedProperties([]);
                          } else {
                            setSelectedProperties(safeProperties.map(p => p.property_code));
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        {selectedProperties.length === safeProperties.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2">
                      {safeProperties.map(property => (
                        <label
                          key={property.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedProperties.includes(property.property_code)}
                            onChange={() => toggleProperty(property.property_code)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{property.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="created_at">Newest First</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="lease_expiry">Lease Expiry</option>
            </select>

            {/* Clear Filters */}
            {(selectedProperties.length > 0 || searchQuery || sortBy !== 'created_at' || activeTab !== 'all') && (
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
            Showing {filteredTenants.length} of {stats.total} tenants
          </div>
        </div>

        {/* Tenant Cards */}
        <div className="p-4">
          {filteredTenants.length === 0 ? (
            <EmptyState 
              type={
                stats.total === 0 
                  ? 'noTenants' 
                  : activeTab === 'allocated' && stats.allocated === 0
                    ? 'allocated'
                    : activeTab === 'unallocated' && stats.unallocated === 0
                      ? 'unallocated'
                      : 'noResults'
              }
              searchQuery={searchQuery}
              onClearFilters={clearFilters}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredTenants.map(tenant => (
                <TenantCard
                  key={tenant.id}
                  tenant={tenant}
                  onViewDetails={handleViewDetails}
                  onAllocate={handleOpenAllocate}
                  onDeallocate={handleOpenDeallocate}
                  onDelete={handleOpenDelete}
                  formatPhone={formatPhone}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                  availableUnitsCount={availableUnits.length}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <TenantDetailModal
        tenant={selectedTenant}
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedTenant(null); }}
        formatPhone={formatPhone}
        formatDate={formatDate}
        formatCurrency={formatCurrency}
        onNotify={addToast}
        onRefreshTenant={async (tenantId) => {
          await fetchTenants();
          try {
            const response = await tenantAPI.getTenant(tenantId);
            if (response.data?.success) {
              setSelectedTenant(response.data.data);
            }
          } catch (error) {
            console.error("Failed to refresh tenant details:", error);
          }
        }}
      />

      <AllocationModal
        isOpen={showAllocationModal}
        onClose={() => { setShowAllocationModal(false); setSelectedTenant(null); }}
        tenant={selectedTenant}
        availableUnits={availableUnits}
        properties={safeProperties}
        onAllocate={handleAllocate}
        loading={actionLoading}
        formatCurrency={formatCurrency}
      />

      <ConfirmationModal
        isOpen={showDeallocateConfirm}
        onClose={() => { setShowDeallocateConfirm(false); setSelectedTenant(null); }}
        onConfirm={handleDeallocate}
        title="Deallocate Tenant"
        message={`Are you sure you want to deallocate ${selectedTenant?.first_name} ${selectedTenant?.last_name}? This will end their lease and free up the unit. The tenant will NOT be deleted from the system.`}
        confirmText="Deallocate"
        confirmColor="amber"
        icon={UserMinus}
        loading={actionLoading}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setSelectedTenant(null); }}
        onConfirm={handleDelete}
        title="Delete Tenant Permanently"
        message={`Are you sure you want to PERMANENTLY delete ${selectedTenant?.first_name} ${selectedTenant?.last_name}? This action cannot be undone and all tenant data including payment history will be removed.`}
        confirmText="Delete Permanently"
        confirmColor="red"
        icon={Trash2}
        loading={actionLoading}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        exportType={exportType}
        onExport={handleExport}
        filteredCount={filteredTenants.length}
        totalCount={stats.total}
        exporting={exporting}
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

export default TenantHub;
