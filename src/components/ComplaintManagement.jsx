import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { complaintAPI, propertyAPI, allocationAPI } from '../services/api';
import { 
  X, Plus, Filter, FileText, CheckCircle2, Circle, Clock, 
  AlertTriangle, Building2, User, Home, MessageSquare, 
  ChevronDown, ChevronUp, Search, RefreshCw, Wrench,
  Calendar, ArrowRight, Check, Loader2
} from 'lucide-react';

// Import your existing PDF export utility
// import { exportComplaintsToPDF } from '../utils/pdfExport';

const COMPLAINT_CATEGORIES = [
  { id: 'plumbing', label: 'Plumbing', icon: '🔧' },
  { id: 'electrical', label: 'Electrical', icon: '⚡' },
  { id: 'structural', label: 'Structural', icon: '🏗️' },
  { id: 'appliance', label: 'Appliance', icon: '🔌' },
  { id: 'security', label: 'Security', icon: '🔒' },
  { id: 'cleanliness', label: 'Cleanliness', icon: '🧹' },
  { id: 'pest_control', label: 'Pest Control', icon: '🐛' },
  { id: 'noise', label: 'Noise Complaint', icon: '🔊' },
  { id: 'parking', label: 'Parking Issues', icon: '🚗' },
  { id: 'water', label: 'Water Issues', icon: '💧' },
  { id: 'other', label: 'Other', icon: '📝' }
];

const ComplaintManagement = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isAgent = user?.role === 'agent';

  // Main state
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Properties and tenants for cascading selection
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStepsModal, setShowStepsModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  // Filter states
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    category: '',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Create complaint form state
  const [createForm, setCreateForm] = useState({
    property_id: '',
    tenant_id: '',
    unit_id: '',
    unit_code: '',
    title: '',
    description: '',
    categories: [],
    priority: 'medium'
  });

  // Steps form state
  const [stepsForm, setStepsForm] = useState({
    steps: ['']
  });
  const [savingSteps, setSavingSteps] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    high_priority: 0
  });

  // Fetch complaints
  const fetchComplaints = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      
      const response = await complaintAPI.getComplaints(params);
      const complaintsData = response.data?.data || response.data?.complaints || [];
      setComplaints(Array.isArray(complaintsData) ? complaintsData : []);
      
      // Calculate stats
      const safeComplaints = Array.isArray(complaintsData) ? complaintsData : [];
      setStats({
        total: safeComplaints.length,
        open: safeComplaints.filter(c => c.status === 'open').length,
        in_progress: safeComplaints.filter(c => c.status === 'in_progress').length,
        resolved: safeComplaints.filter(c => c.status === 'resolved').length,
        high_priority: safeComplaints.filter(c => c.priority === 'high').length
      });
    } catch (err) {
      console.error('Error fetching complaints:', err);
      setError('Failed to fetch complaints');
      setComplaints([]);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.priority]);

  // Fetch properties
  const fetchProperties = useCallback(async () => {
    try {
      const response = isAgent 
        ? await propertyAPI.getAgentProperties()
        : await propertyAPI.getProperties();
      const propertiesData = response.data?.data || response.data || [];
      setProperties(Array.isArray(propertiesData) ? propertiesData : []);
    } catch (err) {
      console.error('Error fetching properties:', err);
    }
  }, [isAgent]);

  // Fetch tenants by property using allocations
  const fetchTenantsByProperty = async (propertyId) => {
    if (!propertyId) {
      setTenants([]);
      return;
    }
    
    try {
      setLoadingTenants(true);
      
      // First, get the units for this property to know which unit_ids belong to it
      const unitsResponse = await propertyAPI.getPropertyUnits(propertyId);
      const unitsData = unitsResponse.data?.data || unitsResponse.data || [];
      const units = Array.isArray(unitsData) ? unitsData : [];
      const unitIds = units.map(u => u.id);
      
      console.log('Units for property:', propertyId, units);
      
      // Get all active allocations
      const allocResponse = await allocationAPI.getAllocations({ is_active: true });
      const allocationsData = allocResponse.data?.data || allocResponse.data || [];
      const allocations = Array.isArray(allocationsData) ? allocationsData : [];
      
      console.log('All allocations:', allocations);
      
      // Filter allocations that belong to units in this property
      const tenantsWithUnits = allocations
        .filter(allocation => {
          // Check if this allocation's unit belongs to the selected property
          const belongsToProperty = unitIds.includes(allocation.unit_id) || 
                                    allocation.property_id === propertyId ||
                                    allocation.unit?.property_id === propertyId;
          return belongsToProperty && allocation.is_active !== false;
        })
        .map(allocation => {
          // Build tenant name from various possible fields
          const tenantFirstName = allocation.tenant_first_name || allocation.tenant?.first_name || '';
          const tenantLastName = allocation.tenant_last_name || allocation.tenant?.last_name || '';
          const tenantFullName = allocation.tenant_full_name || `${tenantFirstName} ${tenantLastName}`.trim();
          
          // Find the unit info
          const unitInfo = units.find(u => u.id === allocation.unit_id);
          
          return {
            tenant_id: allocation.tenant_id,
            tenant_name: tenantFullName || 'Unknown Tenant',
            unit_id: allocation.unit_id,
            unit_code: allocation.unit_code || unitInfo?.unit_code || allocation.unit?.unit_code || 'Unknown Unit'
          };
        });
      
      console.log('Tenants found for property:', propertyId, tenantsWithUnits);
      setTenants(tenantsWithUnits);
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setTenants([]);
    } finally {
      setLoadingTenants(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchComplaints();
    fetchProperties();
  }, [fetchComplaints, fetchProperties]);

  // Handle property selection - fetch tenants
  useEffect(() => {
    if (createForm.property_id) {
      fetchTenantsByProperty(createForm.property_id);
      setCreateForm(prev => ({ ...prev, tenant_id: '', unit_id: '', unit_code: '' }));
    }
  }, [createForm.property_id]);

  // Handle tenant selection - auto-fill unit
  useEffect(() => {
    if (createForm.tenant_id) {
      const selectedTenant = tenants.find(t => t.tenant_id === createForm.tenant_id);
      if (selectedTenant) {
        setCreateForm(prev => ({
          ...prev,
          unit_id: selectedTenant.unit_id,
          unit_code: selectedTenant.unit_code
        }));
      }
    }
  }, [createForm.tenant_id, tenants]);

  // Toggle category selection
  const toggleCategory = (categoryId) => {
    setCreateForm(prev => {
      const categories = prev.categories.includes(categoryId)
        ? prev.categories.filter(c => c !== categoryId)
        : [...prev.categories, categoryId];
      return { ...prev, categories };
    });
  };

  // Create complaint
  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    
    if (!createForm.unit_id || !createForm.title || !createForm.description || createForm.categories.length === 0) {
      setError('Please fill in all required fields and select at least one category');
      return;
    }

    try {
      setLoading(true);
      await complaintAPI.createComplaint({
        tenant_id: createForm.tenant_id,
        unit_id: createForm.unit_id,
        title: createForm.title,
        description: createForm.description,
        category: createForm.categories[0], // Primary category for backward compatibility
        categories: createForm.categories,
        priority: createForm.priority
      });
      
      setSuccessMessage('Complaint created successfully!');
      setShowCreateModal(false);
      resetCreateForm();
      fetchComplaints();
      
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error creating complaint:', err);
      setError(err.response?.data?.message || 'Failed to create complaint');
    } finally {
      setLoading(false);
    }
  };

  // Reset create form
  const resetCreateForm = () => {
    setCreateForm({
      property_id: '',
      tenant_id: '',
      unit_id: '',
      unit_code: '',
      title: '',
      description: '',
      categories: [],
      priority: 'medium'
    });
    setTenants([]);
  };

  // Open steps modal (Start Servicing)
  const openStepsModal = (complaint) => {
    setSelectedComplaint(complaint);
    setStepsForm({ steps: [''] });
    setShowStepsModal(true);
  };

  // Add step input
  const addStepInput = () => {
    setStepsForm(prev => ({
      steps: [...prev.steps, '']
    }));
  };

  // Remove step input
  const removeStepInput = (index) => {
    setStepsForm(prev => ({
      steps: prev.steps.filter((_, i) => i !== index)
    }));
  };

  // Update step input
  const updateStepInput = (index, value) => {
    setStepsForm(prev => ({
      steps: prev.steps.map((step, i) => i === index ? value : step)
    }));
  };

  // Submit steps
  const handleSubmitSteps = async (e) => {
    e.preventDefault();
    
    const validSteps = stepsForm.steps.filter(s => s.trim());
    if (validSteps.length === 0) {
      setError('Please add at least one step');
      return;
    }

    try {
      setSavingSteps(true);
      
      // Add steps to the complaint
      for (let i = 0; i < validSteps.length; i++) {
        await complaintAPI.addComplaintStep(selectedComplaint.id, {
          step_order: i + 1,
          step_description: validSteps[i]
        });
      }
      
      // Update complaint status to in_progress
      await complaintAPI.updateComplaintStatus(selectedComplaint.id, 'in_progress');
      
      setSuccessMessage('Servicing steps added successfully!');
      setShowStepsModal(false);
      setSelectedComplaint(null);
      fetchComplaints();
      
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error adding steps:', err);
      setError(err.response?.data?.message || 'Failed to add servicing steps');
    } finally {
      setSavingSteps(false);
    }
  };

  // View complaint details
  const openDetailsModal = async (complaint) => {
    try {
      const response = await complaintAPI.getComplaint(complaint.id);
      const fullComplaint = response.data?.data || response.data;
      
      // Fetch steps
      const stepsResponse = await complaintAPI.getComplaintSteps(complaint.id);
      const steps = stepsResponse.data?.data || stepsResponse.data || [];
      
      setSelectedComplaint({ ...fullComplaint, steps: Array.isArray(steps) ? steps : [] });
      setShowDetailsModal(true);
    } catch (err) {
      console.error('Error fetching complaint details:', err);
      setError('Failed to load complaint details');
    }
  };

  // Toggle step completion
  const toggleStepCompletion = async (stepId, isCompleted) => {
    try {
      await complaintAPI.toggleComplaintStep(selectedComplaint.id, stepId, !isCompleted);
      
      // Refresh complaint details
      const stepsResponse = await complaintAPI.getComplaintSteps(selectedComplaint.id);
      const steps = stepsResponse.data?.data || stepsResponse.data || [];
      
      const updatedSteps = Array.isArray(steps) ? steps : [];
      setSelectedComplaint(prev => ({ ...prev, steps: updatedSteps }));
      
      // Check if all steps are completed
      const allCompleted = updatedSteps.every(s => s.is_completed);
      if (allCompleted && updatedSteps.length > 0) {
        await complaintAPI.updateComplaintStatus(selectedComplaint.id, 'resolved');
        setSuccessMessage('All steps completed! Complaint marked as resolved.');
        fetchComplaints();
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (err) {
      console.error('Error toggling step:', err);
      setError('Failed to update step');
    }
  };

  // Export to PDF
  const handleExportPDF = async () => {
    try {
      // Filter complaints based on user role
      const complaintsToExport = complaints;
      
      // You would call your existing pdfExport utility here
      // await exportComplaintsToPDF(complaintsToExport);
      
      setSuccessMessage('PDF export started...');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError('Failed to export PDF');
    }
  };

  // Filter complaints
  const filteredComplaints = complaints.filter(complaint => {
    const matchesSearch = !filters.search || 
      complaint.title?.toLowerCase().includes(filters.search.toLowerCase()) ||
      complaint.description?.toLowerCase().includes(filters.search.toLowerCase()) ||
      complaint.tenant_first_name?.toLowerCase().includes(filters.search.toLowerCase()) ||
      complaint.tenant_last_name?.toLowerCase().includes(filters.search.toLowerCase());
    
    const matchesCategory = !filters.category || 
      complaint.category === filters.category ||
      (complaint.categories && complaint.categories.includes(filters.category));
    
    return matchesSearch && matchesCategory;
  });

  // Get status badge styles
  const getStatusBadge = (status) => {
    const styles = {
      open: 'bg-red-100 text-red-800 border-red-200',
      in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
      resolved: 'bg-green-100 text-green-800 border-green-200',
      closed: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return styles[status] || styles.open;
  };

  // Get priority badge styles
  const getPriorityBadge = (priority) => {
    const styles = {
      high: 'bg-red-500 text-white',
      medium: 'bg-amber-500 text-white',
      low: 'bg-blue-500 text-white'
    };
    return styles[priority] || styles.medium;
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get category labels
  const getCategoryLabels = (complaint) => {
    const categories = complaint.categories || [complaint.category];
    return categories.map(catId => {
      const cat = COMPLAINT_CATEGORIES.find(c => c.id === catId);
      return cat ? `${cat.icon} ${cat.label}` : catId;
    }).join(', ');
  };

  // Calculate steps progress
  const getStepsProgress = (steps) => {
    if (!steps || steps.length === 0) return { completed: 0, total: 0, percentage: 0 };
    const completed = steps.filter(s => s.is_completed).length;
    return {
      completed,
      total: steps.length,
      percentage: Math.round((completed / steps.length) * 100)
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Complaint Management
            </h1>
            <p className="text-gray-600 mt-1">
              {isAdmin ? 'Manage all tenant complaints across properties' : 'Manage complaints for your assigned properties'}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Complaint
            </button>
            
            <button
              onClick={handleExportPDF}
              className="inline-flex items-center px-4 py-2.5 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm border border-gray-300 font-medium"
            >
              <FileText className="w-5 h-5 mr-2" />
              Export PDF
            </button>
            
            <button
              onClick={fetchComplaints}
              className="inline-flex items-center px-3 py-2.5 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm border border-gray-300"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-800">
          <CheckCircle2 className="w-5 h-5 mr-2 flex-shrink-0" />
          {successMessage}
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-red-800">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
            {error}
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Total</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Open</p>
              <p className="text-2xl font-bold text-red-600">{stats.open}</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Circle className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">In Progress</p>
              <p className="text-2xl font-bold text-amber-600">{stats.in_progress}</p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Resolved</p>
              <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">High Priority</p>
              <p className="text-2xl font-bold text-orange-600">{stats.high_priority}</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div 
          className="p-4 flex items-center justify-between cursor-pointer"
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <span className="font-medium text-gray-700">Filters</span>
            {(filters.status || filters.priority || filters.category || filters.search) && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                Active
              </span>
            )}
          </div>
          {showFilters ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
        </div>
        
        {showFilters && (
          <div className="p-4 pt-0 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search complaints..."
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={filters.priority}
                  onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Priorities</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Categories</option>
                  {COMPLAINT_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setFilters({ status: '', priority: '', category: '', search: '' })}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Complaints List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Complaints ({filteredComplaints.length})
          </h2>
        </div>
        
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-500">Loading complaints...</p>
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No complaints found</h3>
            <p className="text-gray-500">
              {filters.status || filters.priority || filters.category || filters.search
                ? 'Try adjusting your filters'
                : 'Create a new complaint to get started'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredComplaints.map((complaint) => (
              <div 
                key={complaint.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left side - Complaint info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                        complaint.status === 'open' ? 'bg-red-500' :
                        complaint.status === 'in_progress' ? 'bg-amber-500' : 'bg-green-500'
                      }`} />
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {complaint.title}
                        </h3>
                        
                        <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                          {complaint.description}
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadge(complaint.status)}`}>
                            {complaint.status?.replace('_', ' ')}
                          </span>
                          
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadge(complaint.priority)}`}>
                            {complaint.priority}
                          </span>
                          
                          <span className="text-xs text-gray-500">
                            {getCategoryLabels(complaint)}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            <span>{complaint.tenant_first_name} {complaint.tenant_last_name}</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            <span>{complaint.property_name}</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Home className="w-4 h-4" />
                            <span>{complaint.unit_code}</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(complaint.raised_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Right side - Actions */}
                  <div className="flex items-center gap-2 lg:flex-shrink-0">
                    {complaint.status === 'open' && (isAdmin || isAgent) && (
                      <button
                        onClick={() => openStepsModal(complaint)}
                        className="inline-flex items-center px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium"
                      >
                        <Wrench className="w-4 h-4 mr-1.5" />
                        Start Servicing
                      </button>
                    )}
                    
                    <button
                      onClick={() => openDetailsModal(complaint)}
                      className="inline-flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                    >
                      View Details
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Complaint Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Create New Complaint</h2>
              <button
                onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <form onSubmit={handleCreateComplaint} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-5">
                {/* Property Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Property <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createForm.property_id}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, property_id: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select a property</option>
                    {properties.map(property => (
                      <option key={property.id} value={property.id}>
                        {property.name} - {property.address}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Tenant Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tenant <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createForm.tenant_id}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, tenant_id: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    disabled={!createForm.property_id || loadingTenants}
                  >
                    <option value="">
                      {loadingTenants ? 'Loading tenants...' : 'Select a tenant'}
                    </option>
                    {tenants.map(tenant => (
                      <option key={tenant.tenant_id} value={tenant.tenant_id}>
                        {tenant.tenant_name} ({tenant.unit_code})
                      </option>
                    ))}
                  </select>
                  {createForm.property_id && !loadingTenants && tenants.length === 0 && (
                    <p className="text-sm text-amber-600 mt-1">No tenants found in this property</p>
                  )}
                </div>
                
                {/* Unit (Auto-filled) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={createForm.unit_code || 'Will be auto-filled'}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                    disabled
                  />
                </div>
                
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Complaint Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={createForm.title}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Brief description of the issue"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                
                {/* Categories */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Categories <span className="text-red-500">*</span>
                    <span className="text-gray-400 font-normal ml-1">(Select one or more)</span>
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {COMPLAINT_CATEGORIES.map(category => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                          createForm.categories.includes(category.id)
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span>{category.icon}</span>
                        <span>{category.label}</span>
                        {createForm.categories.includes(category.id) && (
                          <Check className="w-4 h-4 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <div className="flex gap-3">
                    {['low', 'medium', 'high'].map(priority => (
                      <button
                        key={priority}
                        type="button"
                        onClick={() => setCreateForm(prev => ({ ...prev, priority }))}
                        className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors capitalize ${
                          createForm.priority === priority
                            ? priority === 'high' ? 'bg-red-500 border-red-500 text-white' :
                              priority === 'medium' ? 'bg-amber-500 border-amber-500 text-white' :
                              'bg-blue-500 border-blue-500 text-white'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {priority}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={createForm.description}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Provide detailed information about the complaint..."
                    rows={4}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    required
                  />
                </div>
              </div>
              
              {/* Form Actions */}
              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create Complaint'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Start Servicing Modal (Add Steps) */}
      {showStepsModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Start Servicing</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedComplaint.title}</p>
              </div>
              <button
                onClick={() => { setShowStepsModal(false); setSelectedComplaint(null); }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <form onSubmit={handleSubmitSteps} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Add the steps you'll take to resolve this complaint. Each step can be checked off as completed.
                </p>
              </div>
              
              <div className="space-y-3">
                {stepsForm.steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={step}
                      onChange={(e) => updateStepInput(index, e.target.value)}
                      placeholder={`Step ${index + 1} description...`}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {stepsForm.steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStepInput(index)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              
              <button
                type="button"
                onClick={addStepInput}
                className="mt-4 inline-flex items-center px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Another Step
              </button>
              
              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => { setShowStepsModal(false); setSelectedComplaint(null); }}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSteps}
                  className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {savingSteps ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Wrench className="w-4 h-4 mr-2" />
                      Start Servicing
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showDetailsModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className="text-xl font-semibold text-gray-900 truncate">{selectedComplaint.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadge(selectedComplaint.status)}`}>
                    {selectedComplaint.status?.replace('_', ' ')}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadge(selectedComplaint.priority)}`}>
                    {selectedComplaint.priority}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { setShowDetailsModal(false); setSelectedComplaint(null); }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              {/* Complaint Info */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Tenant</p>
                    <p className="font-medium text-gray-900">
                      {selectedComplaint.tenant_first_name} {selectedComplaint.tenant_last_name}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Property</p>
                    <p className="font-medium text-gray-900">{selectedComplaint.property_name}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Home className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Unit</p>
                    <p className="font-medium text-gray-900">{selectedComplaint.unit_code}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Raised At</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedComplaint.raised_at)}</p>
                  </div>
                </div>
              </div>
              
              {/* Categories */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Categories</h4>
                <div className="flex flex-wrap gap-2">
                  {(selectedComplaint.categories || [selectedComplaint.category]).map(catId => {
                    const cat = COMPLAINT_CATEGORIES.find(c => c.id === catId);
                    return (
                      <span key={catId} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                        <span>{cat?.icon || '📝'}</span>
                        <span>{cat?.label || catId}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              
              {/* Description */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                <p className="text-gray-600 bg-gray-50 p-4 rounded-lg">
                  {selectedComplaint.description}
                </p>
              </div>
              
              {/* Steps Progress */}
              {selectedComplaint.steps && selectedComplaint.steps.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-700">Resolution Steps</h4>
                    <span className="text-sm text-gray-500">
                      {getStepsProgress(selectedComplaint.steps).completed}/{getStepsProgress(selectedComplaint.steps).total} completed
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${getStepsProgress(selectedComplaint.steps).percentage}%` }}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    {selectedComplaint.steps.sort((a, b) => a.step_order - b.step_order).map((step) => (
                      <div 
                        key={step.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          step.is_completed 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <button
                          onClick={() => toggleStepCompletion(step.id, step.is_completed)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            step.is_completed
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 hover:border-green-500'
                          }`}
                        >
                          {step.is_completed && <Check className="w-4 h-4" />}
                        </button>
                        
                        <div className="flex-1">
                          <p className={`${step.is_completed ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                            {step.step_description}
                          </p>
                          {step.is_completed && step.completed_at && (
                            <p className="text-xs text-green-600 mt-1">
                              Completed on {formatDate(step.completed_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Resolved info */}
              {selectedComplaint.status === 'resolved' && selectedComplaint.resolved_at && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Resolved on {formatDate(selectedComplaint.resolved_at)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintManagement;