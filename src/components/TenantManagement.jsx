// src/components/TenantManagement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useProperty } from '../context/PropertyContext';
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // extends jsPDF with autoTable

const TenantManagement = () => {
  const { user } = useAuth();
  const { properties: assignedProperties, loading: propertiesLoading } = useProperty();

  const [tenants, setTenants] = useState([]);
  const [availableUnits, setAvailableUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: 10
  });
  const [searchTerm, setSearchTerm] = useState('');

  // View modal state
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedTenantData, setSelectedTenantData] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    national_id: '',
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    unit_id: '',
    lease_start_date: '',
    lease_end_date: '',
    monthly_rent: '',
    security_deposit: ''
  });
  const [idFrontImage, setIdFrontImage] = useState(null);
  const [idBackImage, setIdBackImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Fetch tenants list (uses getTenants; monthly_rent etc come from DB t.*)
  const fetchTenants = useCallback(
    async (page = 1, search = '') => {
      try {
        setLoading(true);
        setError(null);
        console.log('🔍 Fetching tenants...', { page, search });
        
        const response = await API.tenants.getTenants({
          page,
          limit: pagination.limit,
          search
        });
        
        console.log('📦 Tenants Response:', response.data);
        
        if (response.data.success) {
          const tenantsData = response.data.data?.tenants || response.data.data || [];
          const paginationData = response.data.data?.pagination || {
            currentPage: 1,
            totalPages: 1,
            totalCount: 0,
            limit: 10
          };
          
          setTenants(Array.isArray(tenantsData) ? tenantsData : []);
          setPagination(paginationData);
        }
      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        setError('Failed to load tenants: ' + errorMsg);
        console.error('❌ Error fetching tenants:', err);
        setTenants([]);
      } finally {
        setLoading(false);
      }
    },
    [pagination.limit]
  );

  // Fetch full tenant details for view modal
  const fetchTenantDetails = async (tenantId) => {
    try {
      setLoadingDetails(true);
      const response = await API.tenants.getTenant(tenantId);
      if (response.data.success) {
        setSelectedTenantData(response.data.data);
        setShowViewModal(true);
      }
    } catch (err) {
      console.error('❌ Error fetching tenant details:', err);
      alert('Failed to load tenant details. Please try again.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleViewDetails = async (tenant) => {
    await fetchTenantDetails(tenant.id);
  };

  const handleCloseViewModal = () => {
    setShowViewModal(false);
    setSelectedTenantData(null);
  };

  // Fetch available units; include current unit when editing (Option B)
  const fetchAvailableUnits = useCallback(
    async (currentUnitId = null) => {
      try {
        console.log(
          '🔍 Fetching available units...',
          currentUnitId ? `including current unit ${currentUnitId}` : ''
        );
        
        let allUnits = [];
        
        if (user?.role === 'admin') {
          const response = await API.tenants.getAvailableUnits(
            currentUnitId ? { current_unit_id: currentUnitId } : {}
          );
          if (response.data.success) {
            allUnits = response.data.data || [];
          }
        } else {
          // Agent: from assigned properties only
          for (const property of assignedProperties) {
            try {
              const response = await API.properties.getPropertyUnits(property.id);
              if (response.data.success) {
                const propertyUnits = response.data.data || [];
                
                const availableUnitsInProperty = propertyUnits
                  .filter(unit => {
                    if (!unit.is_active) return false;
                    // Include current unit even if occupied
                    if (currentUnitId && unit.id === currentUnitId) {
                      return true;
                    }
                    // Otherwise only unoccupied
                    return unit.is_occupied === false;
                  })
                  .map(unit => ({
                    ...unit,
                    property_name: property.name || 'Unknown Property',
                    property_code: property.property_code || ''
                  }));
                
                allUnits = [...allUnits, ...availableUnitsInProperty];
              }
            } catch (err) {
              console.error(`Error fetching units for property ${property.id}:`, err);
            }
          }
        }
        
        console.log('✅ Available Units (currentUnitId:', currentUnitId, '):', allUnits);
        setAvailableUnits(Array.isArray(allUnits) ? allUnits : []);
      } catch (err) {
        console.error('❌ Error fetching available units:', err);
        setAvailableUnits([]);
      }
    },
    [assignedProperties, user?.role]
  );

  // Initial load
  useEffect(() => {
    console.log('🚀 TenantManagement mounted, user:', user?.role);
    console.log('🏠 Assigned Properties:', assignedProperties);
    
    const initializeData = async () => {
      await fetchTenants(1, '');
      await fetchAvailableUnits();
    };
    
    initializeData();
    
    return () => {
      console.log('🧹 TenantManagement unmounting');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh units when assigned properties change
  useEffect(() => {
    if (assignedProperties.length > 0) {
      fetchAvailableUnits();
    }
  }, [assignedProperties, fetchAvailableUnits]);

  // Form handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleUnitChange = (e) => {
    const unitId = e.target.value;
    setFormData(prev => ({
      ...prev,
      unit_id: unitId
    }));
    
    if (unitId) {
      const selectedUnit = availableUnits.find(unit => unit.id === unitId);
      if (selectedUnit && selectedUnit.rent_amount) {
        setFormData(prev => ({
          ...prev,
          monthly_rent: selectedUnit.rent_amount.toString()
        }));
      }
    }
    
    if (formErrors.unit_id) {
      setFormErrors(prev => ({
        ...prev,
        unit_id: ''
      }));
    }
  };

  const formatPhoneForDisplay = (phone) => {
    if (!phone) return '';
    return phone.replace(/^254/, '0');
  };

  const formatPhoneForBackend = (phone) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      return '254' + digits.substring(1);
    }
    if (!digits.startsWith('254')) {
      return '254' + digits;
    }
    return digits;
  };

  const handleImageUpload = async (tenantId) => {
    if (!idFrontImage && !idBackImage) return;

    try {
      setUploading(true);
      const formDataUpload = new FormData();
      if (idFrontImage) formDataUpload.append('id_front_image', idFrontImage);
      if (idBackImage) formDataUpload.append('id_back_image', idBackImage);

      await API.tenants.uploadIDImages(tenantId, formDataUpload);
      
      setIdFrontImage(null);
      setIdBackImage(null);
    } catch (err) {
      console.error('Error uploading ID images:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.national_id.trim()) errors.national_id = 'National ID is required';
    if (!formData.first_name.trim()) errors.first_name = 'First name is required';
    if (!formData.last_name.trim()) errors.last_name = 'Last name is required';
    if (!formData.phone_number.trim()) errors.phone_number = 'Phone number is required';
    
    // Unit must be selected (new + edit)
    if (!formData.unit_id) {
      errors.unit_id = 'Unit allocation is required';
    }

    if (formData.unit_id) {
      if (!formData.lease_start_date) errors.lease_start_date = 'Lease start date is required';
      if (!formData.monthly_rent) errors.monthly_rent = 'Monthly rent is required';
    }
    
    const phoneRegex = /^(?:254|\+254|0)?(7\d{8})$/;
    const phoneDigits = formData.phone_number.replace(/\D/g, '');
    if (formData.phone_number && !phoneRegex.test(phoneDigits)) {
      errors.phone_number = 'Invalid Kenyan phone number format (e.g., 0712345678)';
    }
    
    const emergencyPhoneDigits = formData.emergency_contact_phone.replace(/\D/g, '');
    if (formData.emergency_contact_phone && !phoneRegex.test(emergencyPhoneDigits)) {
      errors.emergency_contact_phone = 'Invalid emergency contact phone format';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setError('Please fix the form errors');
      return;
    }
    
    try {
      setError(null);
      setUploading(true);
      
      let response;

      const formattedData = {
        ...formData,
        phone_number: formatPhoneForBackend(formData.phone_number),
        emergency_contact_phone: formData.emergency_contact_phone
          ? formatPhoneForBackend(formData.emergency_contact_phone)
          : '',
        monthly_rent: parseFloat(formData.monthly_rent) || 0,
        security_deposit: parseFloat(formData.security_deposit) || 0
      };

      if (editingTenant) {
        response = await API.tenants.updateTenant(editingTenant.id, formattedData);
        if (idFrontImage || idBackImage) {
          await handleImageUpload(editingTenant.id);
        }
      } else {
        response = await API.tenants.createTenant(formattedData);
        if ((idFrontImage || idBackImage) && response.data.data?.id) {
          await handleImageUpload(response.data.data.id);
        }
      }

      if (response.data.success) {
        resetForm();
        await fetchTenants();
        await fetchAvailableUnits();
        alert(response.data.message || 'Tenant saved successfully!');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to save tenant';
      setError(errorMsg);
      console.error('Error saving tenant:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (tenant) => {
    setEditingTenant(tenant);

    const currentUnitId = tenant.unit_id || tenant.current_allocation?.unit_id || '';

    // Ensure current unit appears even if occupied
    fetchAvailableUnits(currentUnitId);

    setFormData({
      national_id: tenant.national_id || '',
      first_name: tenant.first_name || '',
      last_name: tenant.last_name || '',
      email: tenant.email || '',
      phone_number: formatPhoneForDisplay(tenant.phone_number) || '',
      emergency_contact_name: tenant.emergency_contact_name || '',
      emergency_contact_phone: formatPhoneForDisplay(tenant.emergency_contact_phone) || '',
      unit_id: currentUnitId,
      lease_start_date: tenant.lease_start_date
        ? tenant.lease_start_date.toString().split('T')[0]
        : tenant.current_allocation?.lease_start_date
        ? tenant.current_allocation.lease_start_date.split('T')[0]
        : '',
      lease_end_date: tenant.lease_end_date
        ? tenant.lease_end_date.toString().split('T')[0]
        : tenant.current_allocation?.lease_end_date
        ? tenant.current_allocation.lease_end_date.split('T')[0]
        : '',
      monthly_rent:
        (tenant.monthly_rent ?? tenant.current_allocation?.monthly_rent)?.toString() || '',
      security_deposit:
        (tenant.security_deposit ?? tenant.current_allocation?.security_deposit)?.toString() || ''
    });
    
    setFormErrors({});
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this tenant? This action cannot be undone.')) {
      try {
        const response = await API.tenants.deleteTenant(id);
        if (response.data.success) {
          alert(response.data.message);
          await fetchTenants();
          await fetchAvailableUnits();
        }
      } catch (err) {
        setError('Failed to delete tenant: ' + (err.response?.data?.message || err.message));
      }
    }
  };

  const resetForm = () => {
    setFormData({
      national_id: '',
      first_name: '',
      last_name: '',
      email: '',
      phone_number: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      unit_id: '',
      lease_start_date: '',
      lease_end_date: '',
      monthly_rent: '',
      security_deposit: ''
    });
    setIdFrontImage(null);
    setIdBackImage(null);
    setEditingTenant(null);
    setShowForm(false);
    setError(null);
    setFormErrors({});
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    await fetchTenants(1, searchTerm);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-KE');
  };

  // Load image as data URL for PDF
  const loadImageAsDataURL = async (url) => {
    if (!url) return null;
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error('❌ Failed to load image for PDF:', url, err);
      return null;
    }
  };

  // Export tenant as PDF from view modal
  const handleExportTenantPDF = async () => {
    if (!selectedTenantData) return;

    try {
      const tenant = selectedTenantData;
      const doc = new jsPDF('p', 'mm', 'a4');
      let y = 20;

      // Simple placeholder logo box
      doc.setDrawColor(0);
      doc.rect(14, 10, 20, 10);
      doc.setFontSize(8);
      doc.text('LOGO', 24, 17, { align: 'center' });

      // Header
      doc.setFontSize(16);
      doc.text('Zakaria Housing Agency Limited', 105, y, { align: 'center' });
      y += 8;
      doc.setFontSize(12);
      doc.text('Tenant Information', 105, y, { align: 'center' });
      y += 10;
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString('en-KE')}`, 105, y, { align: 'center' });
      y += 10;

      // Personal Info
      doc.setFontSize(12);
      doc.text('Personal Information', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Full Name: ${tenant.first_name || ''} ${tenant.last_name || ''}`.trim(), 14, y); y += 6;
      doc.text(`National ID: ${tenant.national_id || 'N/A'}`, 14, y); y += 6;
      doc.text(`Phone: ${formatPhoneForDisplay(tenant.phone_number) || 'N/A'}`, 14, y); y += 6;
      doc.text(`Email: ${tenant.email || 'N/A'}`, 14, y); y += 6;
      doc.text(`Status: ${tenant.is_active ? 'Active' : 'Inactive'}`, 14, y); y += 6;
      doc.text(`Registration Date: ${formatDate(tenant.created_at)}`, 14, y); y += 10;

      // Emergency Contact
      if (tenant.emergency_contact_name || tenant.emergency_contact_phone) {
        doc.setFontSize(12);
        doc.text('Emergency Contact', 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.text(`Name: ${tenant.emergency_contact_name || 'N/A'}`, 14, y); y += 6;
        doc.text(
          `Phone: ${formatPhoneForDisplay(tenant.emergency_contact_phone) || 'N/A'}`,
          14,
          y
        );
        y += 10;
      }

      // Unit & Lease
      doc.setFontSize(12);
      doc.text('Unit & Lease Information', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Property: ${tenant.property_name || 'N/A'}`, 14, y); y += 6;
      doc.text(`Unit Code: ${tenant.unit_code || 'N/A'}`, 14, y); y += 6;
      doc.text(`Monthly Rent: ${formatCurrency(tenant.monthly_rent || 0)}`, 14, y); y += 6;
      doc.text(
        `Security Deposit: ${formatCurrency(tenant.security_deposit || 0)}`,
        14,
        y
      );
      y += 6;
      doc.text(`Lease Start: ${formatDate(tenant.lease_start_date)}`, 14, y); y += 6;
      doc.text(
        `Lease End: ${
          tenant.lease_end_date ? formatDate(tenant.lease_end_date) : 'Month-to-Month'
        }`,
        14,
        y
      );
      y += 10;

      // Payment History
      if (tenant.paymentHistory && tenant.paymentHistory.length > 0) {
        const tableRows = tenant.paymentHistory.slice(0, 6).map((payment) => [
          new Date(payment.payment_month).toLocaleDateString('en-KE', {
            month: 'short',
            year: 'numeric'
          }),
          `KES ${Number(payment.amount || 0).toLocaleString()}`,
          payment.status || 'N/A',
          formatDate(payment.created_at)
        ]);

        doc.setFontSize(12);
        doc.text('Recent Payment History', 14, y);
        y += 4;

        doc.autoTable({
          startY: y,
          head: [['Month', 'Amount', 'Status', 'Date']],
          body: tableRows,
          styles: { fontSize: 8 },
          theme: 'grid'
        });

        const finalY = doc.lastAutoTable.finalY || y + 20;
        y = finalY + 8;
      }

      // ID Images
      doc.setFontSize(12);
      doc.text('ID Documents', 14, y);
      y += 4;

      const frontUrl = tenant.id_front_image;
      const backUrl = tenant.id_back_image;

      const maxImageWidth = 80;
      const maxImageHeight = 50;

      if (frontUrl || backUrl) {
        const startX = 14;

        if (frontUrl) {
          const frontDataUrl = await loadImageAsDataURL(frontUrl);
          if (frontDataUrl) {
            let imgY = y + 2;
            doc.setFontSize(9);
            doc.text('ID Front', startX, imgY);
            imgY += 2;
            doc.addImage(frontDataUrl, 'JPEG', startX, imgY, maxImageWidth, maxImageHeight);
          }
        }

        if (backUrl) {
          const backDataUrl = await loadImageAsDataURL(backUrl);
          if (backDataUrl) {
            const backX = startX + maxImageWidth + 10;
            let backY = y + 2;
            doc.setFontSize(9);
            doc.text('ID Back', backX, backY);
            backY += 2;
            doc.addImage(backDataUrl, 'JPEG', backX, backY, maxImageWidth, maxImageHeight);
          }
        }
      } else {
        doc.setFontSize(9);
        doc.text('No ID images uploaded.', 14, y + 4);
      }

      const safeName =
        `${tenant.first_name || ''}${tenant.last_name || ''}`.replace(/\s+/g, '').trim() ||
        'Tenant';
      const fileName = `Tenant_${safeName}_Information.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('❌ Error exporting tenant PDF:', err);
      alert('Failed to export PDF. Check console for details.');
    }
  };

  if (!user) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading user information...</div>
      </div>
    );
  }

  // JSX rendering starts here
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tenant Management</h2>
          <p className="text-gray-600">Manage tenant information, allocations, and ID verification</p>
          {user.role === 'agent' && assignedProperties.length === 0 && !propertiesLoading && !loading && (
            <p className="text-sm text-amber-600 mt-2">
              ⚠️ You have no properties assigned. Contact admin to assign properties.
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
          disabled={user.role === 'agent' && assignedProperties.length === 0}
        >
          <span>+ Add New Tenant</span>
        </button>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="bg-white p-4 rounded-lg border">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by name, phone, or national ID..."
            className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button
            type="submit"
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium"
          >
            Search
          </button>
        </div>
      </form>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && !showForm && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Tenant Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  {editingTenant ? 'Edit Tenant' : 'Add New Tenant'}
                </h3>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Personal Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      National ID *
                    </label>
                    <input
                      type="text"
                      name="national_id"
                      value={formData.national_id}
                      onChange={handleInputChange}
                      required
                      className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.national_id ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter national ID"
                    />
                    {formErrors.national_id && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.national_id}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      name="phone_number"
                      value={formData.phone_number}
                      onChange={handleInputChange}
                      required
                      className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.phone_number ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="0712345678"
                    />
                    {formErrors.phone_number && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.phone_number}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Enter in 07XXXXXXXX format</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleInputChange}
                      required
                      className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.first_name ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter first name"
                    />
                    {formErrors.first_name && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.first_name}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleInputChange}
                      required
                      className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.last_name ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter last name"
                    />
                    {formErrors.last_name && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.last_name}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Emergency Contact</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Name
                      </label>
                      <input
                        type="text"
                        name="emergency_contact_name"
                        value={formData.emergency_contact_name}
                        onChange={handleInputChange}
                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Emergency contact name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Phone
                      </label>
                      <input
                        type="tel"
                        name="emergency_contact_phone"
                        value={formData.emergency_contact_phone}
                        onChange={handleInputChange}
                        className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          formErrors.emergency_contact_phone ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="0712345678"
                      />
                      {formErrors.emergency_contact_phone && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.emergency_contact_phone}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Unit Allocation - REQUIRED */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Unit Allocation *</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Unit *
                      </label>
                      <select
                        name="unit_id"
                        value={formData.unit_id}
                        onChange={handleUnitChange}
                        required
                        className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          formErrors.unit_id ? 'border-red-500' : 'border-gray-300'
                        }`}
                      >
                        <option value="">
                          {availableUnits.length === 0 
                            ? 'No available units in assigned properties' 
                            : 'Select a unit'}
                        </option>
                        {Array.isArray(availableUnits) && availableUnits.map(unit => (
                          <option 
                            key={String(unit?.id || `unit-${Math.random()}`)} 
                            value={unit?.id || ''}
                          >
                            {unit?.property_name || 'Unknown Property'} - {unit?.unit_code || 'N/A'} (KES {unit?.rent_amount?.toLocaleString() || 0})
                          </option>
                        ))}
                      </select>
                      {formErrors.unit_id && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.unit_id}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Units from your assigned properties: {availableUnits.length} units available (includes current unit if editing)
                      </p>
                    </div>
                  </div>

                  {/* Lease Details - Show only when unit is selected */}
                  {formData.unit_id && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                      <h5 className="font-medium text-gray-900 mb-3">Lease Details</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Lease Start Date *
                          </label>
                          <input
                            type="date"
                            name="lease_start_date"
                            value={formData.lease_start_date}
                            onChange={handleInputChange}
                            required
                            className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              formErrors.lease_start_date ? 'border-red-500' : 'border-gray-300'
                            }`}
                          />
                          {formErrors.lease_start_date && (
                            <p className="mt-1 text-sm text-red-600">{formErrors.lease_start_date}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Lease End Date
                          </label>
                          <input
                            type="date"
                            name="lease_end_date"
                            value={formData.lease_end_date}
                            onChange={handleInputChange}
                            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min={formData.lease_start_date}
                          />
                          <p className="text-xs text-gray-500 mt-1">Leave empty for month-to-month</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Monthly Rent *
                          </label>
                          <input
                            type="number"
                            name="monthly_rent"
                            value={formData.monthly_rent}
                            onChange={handleInputChange}
                            required
                            className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              formErrors.monthly_rent ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Amount in KES"
                            min="0"
                            step="100"
                          />
                          {formErrors.monthly_rent && (
                            <p className="mt-1 text-sm text-red-600">{formErrors.monthly_rent}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Security Deposit
                          </label>
                          <input
                            type="number"
                            name="security_deposit"
                            value={formData.security_deposit}
                            onChange={handleInputChange}
                            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Amount in KES"
                            min="0"
                            step="100"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ID Images Upload */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">ID Verification Images</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ID Front Image
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setIdFrontImage(e.target.files?.[0] || null)}
                        className="w-full border rounded-lg px-3 py-2"
                      />
                      {idFrontImage && (
                        <p className="text-xs text-green-600 mt-1">
                          Selected: {idFrontImage.name}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ID Back Image
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setIdBackImage(e.target.files?.[0] || null)}
                        className="w-full border rounded-lg px-3 py-2"
                      />
                      {idBackImage && (
                        <p className="text-xs text-green-600 mt-1">
                          Selected: {idBackImage.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Upload clear images of the tenant's national ID card (front and back)
                  </p>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? 'Saving...' : editingTenant ? 'Update Tenant' : 'Save Tenant'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* View Tenant Details Modal */}
      {showViewModal && selectedTenantData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-6 pb-4 border-b">
                <h3 className="text-2xl font-bold text-gray-900">
                  Tenant Records
                </h3>
                <button
                  onClick={handleCloseViewModal}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Personal Info */}
              <div className="mb-8">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <span className="mr-2">👤</span> Personal Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <label className="text-sm text-gray-600">Full Name</label>
                    <p className="font-medium text-gray-900">
                      {selectedTenantData.first_name} {selectedTenantData.last_name}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">National ID</label>
                    <p className="font-medium text-gray-900">{selectedTenantData.national_id}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Phone Number</label>
                    <p className="font-medium text-gray-900">
                      {formatPhoneForDisplay(selectedTenantData.phone_number)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Email Address</label>
                    <p className="font-medium text-gray-900">
                      {selectedTenantData.email || 'Not provided'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Status</label>
                    <p className="font-medium">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        selectedTenantData.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {selectedTenantData.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Registration Date</label>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedTenantData.created_at)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              {(selectedTenantData.emergency_contact_name || selectedTenantData.emergency_contact_phone) && (
                <div className="mb-8">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <span className="mr-2">🚨</span> Emergency Contact
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                    <div>
                      <label className="text-sm text-gray-600">Contact Name</label>
                      <p className="font-medium text-gray-900">
                        {selectedTenantData.emergency_contact_name || 'Not provided'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Contact Phone</label>
                      <p className="font-medium text-gray-900">
                        {formatPhoneForDisplay(selectedTenantData.emergency_contact_phone) || 'Not provided'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Unit & Lease */}
              {selectedTenantData.unit_code && (
                <div className="mb-8">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <span className="mr-2">🏠</span> Unit & Lease Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
                    <div>
                      <label className="text-sm text-gray-600">Property</label>
                      <p className="font-medium text-gray-900">
                        {selectedTenantData.property_name || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Unit Code</label>
                      <p className="font-medium text-gray-900">{selectedTenantData.unit_code}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Monthly Rent</label>
                      <p className="font-medium text-gray-900">
                        {formatCurrency(selectedTenantData.monthly_rent)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Security Deposit</label>
                      <p className="font-medium text-gray-900">
                        {formatCurrency(selectedTenantData.security_deposit || 0)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Lease Start Date</label>
                      <p className="font-medium text-gray-900">
                        {formatDate(selectedTenantData.lease_start_date)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Lease End Date</label>
                      <p className="font-medium text-gray-900">
                        {selectedTenantData.lease_end_date ? formatDate(selectedTenantData.lease_end_date) : 'Month-to-Month'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment History */}
              {selectedTenantData.paymentHistory && selectedTenantData.paymentHistory.length > 0 && (
                <div className="mb-8">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <span className="mr-2">💰</span> Recent Payment History
                  </h4>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-200">
                        <tr>
                          <th className="px-4 py-2 text-left">Month</th>
                          <th className="px-4 py-2 text-left">Amount</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedTenantData.paymentHistory.slice(0, 6).map((payment, index) => (
                          <tr key={payment.id || index} className="hover:bg-gray-100">
                            <td className="px-4 py-2">
                              {new Date(payment.payment_month).toLocaleDateString('en-KE', { 
                                month: 'short', 
                                year: 'numeric' 
                              })}
                            </td>
                            <td className="px-4 py-2 font-medium">
                              {formatCurrency(payment.amount)}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                payment.status === 'completed' 
                                  ? 'bg-green-100 text-green-800' 
                                  : payment.status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {payment.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-600">
                              {formatDate(payment.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ID Documents */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <span className="mr-2">🆔</span> ID Documents
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Front ID */}
                  <div>
                    <label className="text-sm text-gray-600 block mb-2">ID Front</label>
                    {selectedTenantData.id_front_image ? (
                      <div className="border rounded-lg overflow-hidden bg-gray-50">
                        <img 
                          src={selectedTenantData.id_front_image}
                          alt="ID Front"
                          className="w-full h-64 object-contain cursor-pointer hover:opacity-90"
                          onClick={() => window.open(selectedTenantData.id_front_image, '_blank')}
                        />
                        <div className="p-2 text-center">
                          <button
                            onClick={() => window.open(selectedTenantData.id_front_image, '_blank')}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View Full Size
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="border rounded-lg p-8 bg-gray-50 text-center text-gray-500">
                        <span className="text-3xl mb-2 block">📷</span>
                        No front ID image uploaded
                      </div>
                    )}
                  </div>

                  {/* Back ID */}
                  <div>
                    <label className="text-sm text-gray-600 block mb-2">ID Back</label>
                    {selectedTenantData.id_back_image ? (
                      <div className="border rounded-lg overflow-hidden bg-gray-50">
                        <img 
                          src={selectedTenantData.id_back_image}
                          alt="ID Back"
                          className="w-full h-64 object-contain cursor-pointer hover:opacity-90"
                          onClick={() => window.open(selectedTenantData.id_back_image, '_blank')}
                        />
                        <div className="p-2 text-center">
                          <button
                            onClick={() => window.open(selectedTenantData.id_back_image, '_blank')}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View Full Size
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="border rounded-lg p-8 bg-gray-50 text-center text-gray-500">
                        <span className="text-3xl mb-2 block">📷</span>
                        No back ID image uploaded
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={handleCloseViewModal}
                  className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleExportTenantPDF}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  Export PDF
                </button>
                <button
                  onClick={() => {
                    handleCloseViewModal();
                    handleEdit(selectedTenantData);
                  }}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Edit Tenant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tenants Table */}
      {!loading && !showForm && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                      {user.role === 'agent' && assignedProperties.length === 0
                        ? 'No properties assigned. Contact admin to assign properties.'
                        : 'No tenants found. Click "Add New Tenant" to create one.'}
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant, index) => (
                    <tr key={tenant?.id || `tenant-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900">
                            {tenant?.first_name || 'N/A'} {tenant?.last_name || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {tenant?.national_id || 'N/A'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {formatPhoneForDisplay(tenant?.phone_number) || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500">{tenant?.email || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4">
                        {tenant?.unit_code ? (
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {tenant?.property_name || 'N/A'}
                            </div>
                            <div className="text-sm text-gray-500">
                              {tenant?.unit_code}
                            </div>
                            {tenant?.lease_start_date && (
                              <div className="text-xs text-gray-400">
                                From: {formatDate(tenant.lease_start_date)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-amber-600">Not allocated</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {tenant?.monthly_rent ? (
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(tenant.monthly_rent)}
                            </div>
                            {tenant?.arrears_balance > 0 && (
                              <div className="text-xs text-red-600">
                                Arrears: {formatCurrency(tenant.arrears_balance)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          tenant?.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {tenant?.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewDetails(tenant)}
                            className="text-purple-600 hover:text-purple-900 font-medium text-sm"
                            disabled={loadingDetails}
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleEdit(tenant)}
                            className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(tenant.id)}
                            className="text-red-600 hover:text-red-900 font-medium text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-6 py-4 border-t flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing page {pagination.currentPage} of {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchTenants(pagination.currentPage - 1, searchTerm)}
                  disabled={pagination.currentPage === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchTenants(pagination.currentPage + 1, searchTerm)}
                  disabled={pagination.currentPage === pagination.totalPages}
                  className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TenantManagement;