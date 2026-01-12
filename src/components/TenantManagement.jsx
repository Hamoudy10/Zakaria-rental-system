import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useProperty } from '../context/PropertyContext';

const TenantManagement = () => {
  const { user } = useAuth();
  const [tenants, setTenants] = useState([]);
  const { properties: assignedProperties, loading: propertiesLoading } = useProperty();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [availableUnits, setAvailableUnits] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: 10
  });
  const [searchTerm, setSearchTerm] = useState('');

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

  // Fetch tenants
  const fetchTenants = useCallback(async (page = 1, search = '') => {
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
      setTenants([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, [pagination.limit]);

  // Fetch available units
  const fetchAvailableUnits = useCallback(async () => {
    try {
      console.log('🔍 Fetching available units...');
      const response = await API.tenants.getAvailableUnits();
      console.log('📦 Available Units Response:', response.data);
      
      if (response.data.success) {
        const unitsData = response.data.data || [];
        console.log('✅ Units Data:', unitsData);
        setAvailableUnits(Array.isArray(unitsData) ? unitsData : []);
      } else {
        console.warn('⚠️ Units fetch unsuccessful:', response.data);
        setAvailableUnits([]);
      }
    } catch (err) {
      console.error('❌ Error fetching available units:', err);
      setAvailableUnits([]); // Set empty array on error
    }
  }, []);

  // Initial load - FIXED: Remove function dependencies
  useEffect(() => {
    console.log('🚀 TenantManagement mounted, user:', user?.role);
    
    const initializeData = async () => {
      await fetchTenants(1, '');
      await fetchAvailableUnits();
    };
    
    initializeData();
    
    // Cleanup
    return () => {
      console.log('🧹 TenantManagement unmounting');
    };
  }, []); // Empty dependencies - only run once on mount

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle ID image uploads
  const handleImageUpload = async (tenantId) => {
    if (!idFrontImage && !idBackImage) return;

    try {
      setUploading(true);
      const formData = new FormData();
      if (idFrontImage) formData.append('id_images', idFrontImage);
      if (idBackImage) formData.append('id_images', idBackImage);

      await API.tenants.uploadIDImages(tenantId, formData);
      
      // Reset image states
      setIdFrontImage(null);
      setIdBackImage(null);
    } catch (err) {
      console.error('Error uploading ID images:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setError(null);
      let response;

      if (editingTenant) {
        // Update existing tenant
        response = await API.tenants.updateTenant(editingTenant.id, formData);
        
        // Upload ID images if provided
        if (idFrontImage || idBackImage) {
          await handleImageUpload(editingTenant.id);
        }
      } else {
        // Create new tenant
        response = await API.tenants.createTenant(formData);
        
        // Upload ID images if provided
        if ((idFrontImage || idBackImage) && response.data.data?.id) {
          await handleImageUpload(response.data.data.id);
        }
      }

      if (response.data.success) {
        // Reset form and refresh data
        resetForm();
        await fetchTenants();
        alert(response.data.message || 'Tenant saved successfully!');
      }
    } catch (err) {
      setError('Failed to save tenant: ' + (err.response?.data?.message || err.message));
      console.error('Error saving tenant:', err);
    }
  };

  // Edit tenant
  const handleEdit = (tenant) => {
    setEditingTenant(tenant);
    setFormData({
      national_id: tenant.national_id || '',
      first_name: tenant.first_name || '',
      last_name: tenant.last_name || '',
      email: tenant.email || '',
      phone_number: tenant.phone_number || '',
      emergency_contact_name: tenant.emergency_contact_name || '',
      emergency_contact_phone: tenant.emergency_contact_phone || '',
      unit_id: tenant.unit_id || '',
      lease_start_date: tenant.lease_start_date || '',
      lease_end_date: tenant.lease_end_date || '',
      monthly_rent: tenant.monthly_rent || '',
      security_deposit: tenant.security_deposit || ''
    });
    setShowForm(true);
  };

  // Delete tenant
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this tenant? This action cannot be undone.')) {
      try {
        const response = await API.tenants.deleteTenant(id);
        if (response.data.success) {
          alert(response.data.message);
          await fetchTenants();
        }
      } catch (err) {
        setError('Failed to delete tenant: ' + (err.response?.data?.message || err.message));
      }
    }
  };

  // Reset form
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
  };

  // Handle search
  const handleSearch = async (e) => {
    e.preventDefault();
    await fetchTenants(1, searchTerm);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-KE');
  };

  // Early return for non-authenticated users
  if (!user) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading user information...</div>
      </div>
    );
  }

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
                      className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter national ID"
                    />
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
                      className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="07XXXXXXXX"
                    />
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
                      className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter first name"
                    />
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
                      className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter last name"
                    />
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
                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="07XXXXXXXX"
                      />
                    </div>
                  </div>
                </div>

                {/* Unit Allocation */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Unit Allocation (Optional)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Unit
                      </label>
                      <select
                        name="unit_id"
                        value={formData.unit_id}
                        onChange={handleInputChange}
                        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">
                          {availableUnits.length === 0 ? 'No units available' : 'Select a unit (optional)'}
                        </option>
                        {Array.isArray(availableUnits) && availableUnits.map(unit => (
                          <option 
                            key={String(unit?.id || `unit-${Math.random()}`)} 
                            value={unit?.id || ''}
                          >
                            {unit?.property_name || 'Unknown Property'} - {unit?.unit_code || 'N/A'} (KES {unit?.rent_amount || 0})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {formData.unit_id && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
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
                          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
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
                        />
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
                          required={!!formData.unit_id}
                          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Amount in KES"
                        />
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
                        />
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
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                  >
                    {uploading ? 'Saving...' : editingTenant ? 'Update Tenant' : 'Save Tenant'}
                  </button>
                </div>
              </form>
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
                        <div className="text-sm text-gray-900">{tenant?.phone_number || 'N/A'}</div>
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
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Not allocated</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {tenant?.monthly_rent ? (
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(tenant.monthly_rent)}
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