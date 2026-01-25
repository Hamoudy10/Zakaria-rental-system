import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { complaintAPI, propertyAPI, allocationAPI, settingsAPI } from '../services/api';
import { 
  X, Plus, Filter, CheckCircle2, Circle, Clock, 
  AlertTriangle, Building2, User, Home, MessageSquare, 
  ChevronDown, ChevronUp, Search, RefreshCw, Wrench,
  Calendar, ArrowRight, Check, Loader2, Edit3, Download
} from 'lucide-react';

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

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStepsModal, setShowStepsModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [exportingPDF, setExportingPDF] = useState(false);

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    categories: [],
    priority: 'medium'
  });

  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    category: '',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);

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

  const [stepsForm, setStepsForm] = useState({ steps: [''] });
  const [savingSteps, setSavingSteps] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    high_priority: 0
  });

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  // Get category labels helper
  const getCategoryLabels = (complaint) => {
    const categories = complaint.categories || [complaint.category];
    return categories
      .filter(Boolean)
      .map(catId => {
        const cat = COMPLAINT_CATEGORIES.find(c => c.id === catId);
        return cat ? `${cat.icon} ${cat.label}` : catId;
      })
      .join(', ') || 'General';
  };

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

  const fetchComplaints = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      
      const response = await complaintAPI.getComplaints(params);
      const complaintsData = response.data?.data || response.data?.complaints || [];
      setComplaints(Array.isArray(complaintsData) ? complaintsData : []);
      
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

  const fetchTenantsByProperty = async (propertyId) => {
    if (!propertyId) {
      setTenants([]);
      return;
    }
    
    try {
      setLoadingTenants(true);
      const unitsResponse = await propertyAPI.getPropertyUnits(propertyId);
      const unitsData = unitsResponse.data?.data || unitsResponse.data || [];
      const units = Array.isArray(unitsData) ? unitsData : [];
      const unitIds = units.map(u => u.id);
      
      const allocResponse = await allocationAPI.getAllocations({ is_active: true });
      const allocationsData = allocResponse.data?.data || allocResponse.data || [];
      const allocations = Array.isArray(allocationsData) ? allocationsData : [];
      
      const tenantsWithUnits = allocations
        .filter(allocation => {
          const belongsToProperty = unitIds.includes(allocation.unit_id) || 
                                    allocation.property_id === propertyId ||
                                    allocation.unit?.property_id === propertyId;
          return belongsToProperty && allocation.is_active !== false;
        })
        .map(allocation => {
          const tenantFirstName = allocation.tenant_first_name || allocation.tenant?.first_name || '';
          const tenantLastName = allocation.tenant_last_name || allocation.tenant?.last_name || '';
          const tenantFullName = allocation.tenant_full_name || `${tenantFirstName} ${tenantLastName}`.trim();
          const unitInfo = units.find(u => u.id === allocation.unit_id);
          
          return {
            tenant_id: allocation.tenant_id,
            tenant_name: tenantFullName || 'Unknown Tenant',
            unit_id: allocation.unit_id,
            unit_code: allocation.unit_code || unitInfo?.unit_code || allocation.unit?.unit_code || 'Unknown Unit'
          };
        });
      
      setTenants(tenantsWithUnits);
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setTenants([]);
    } finally {
      setLoadingTenants(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
    fetchProperties();
  }, [fetchComplaints, fetchProperties]);

  useEffect(() => {
    if (createForm.property_id) {
      fetchTenantsByProperty(createForm.property_id);
      setCreateForm(prev => ({ ...prev, tenant_id: '', unit_id: '', unit_code: '' }));
    }
  }, [createForm.property_id]);

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

  const toggleCategory = (categoryId) => {
    setCreateForm(prev => {
      const categories = prev.categories.includes(categoryId)
        ? prev.categories.filter(c => c !== categoryId)
        : [...prev.categories, categoryId];
      return { ...prev, categories };
    });
  };

  const toggleEditCategory = (categoryId) => {
    setEditForm(prev => {
      const categories = prev.categories.includes(categoryId)
        ? prev.categories.filter(c => c !== categoryId)
        : [...prev.categories, categoryId];
      return { ...prev, categories };
    });
  };

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
        category: createForm.categories[0],
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

  const openStepsModal = (complaint) => {
    setSelectedComplaint(complaint);
    setStepsForm({ steps: [''] });
    setShowStepsModal(true);
  };

  const addStepInput = () => {
    setStepsForm(prev => ({ steps: [...prev.steps, ''] }));
  };

  const removeStepInput = (index) => {
    setStepsForm(prev => ({ steps: prev.steps.filter((_, i) => i !== index) }));
  };

  const updateStepInput = (index, value) => {
    setStepsForm(prev => ({
      steps: prev.steps.map((step, i) => i === index ? value : step)
    }));
  };

  const handleSubmitSteps = async (e) => {
    e.preventDefault();
    const validSteps = stepsForm.steps.filter(s => s.trim());
    if (validSteps.length === 0) {
      setError('Please add at least one step');
      return;
    }

    try {
      setSavingSteps(true);
      for (let i = 0; i < validSteps.length; i++) {
        await complaintAPI.addComplaintStep(selectedComplaint.id, {
          step_order: i + 1,
          step_description: validSteps[i]
        });
      }
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

  const openDetailsModal = async (complaint) => {
    try {
      const response = await complaintAPI.getComplaint(complaint.id);
      const fullComplaint = response.data?.data || response.data;
      const stepsResponse = await complaintAPI.getComplaintSteps(complaint.id);
      const steps = stepsResponse.data?.data || stepsResponse.data || [];
      setSelectedComplaint({ ...fullComplaint, steps: Array.isArray(steps) ? steps : [] });
      setShowDetailsModal(true);
    } catch (err) {
      console.error('Error fetching complaint details:', err);
      setError('Failed to load complaint details');
    }
  };

  const toggleStepCompletion = async (stepId, isCompleted) => {
    try {
      await complaintAPI.toggleComplaintStep(selectedComplaint.id, stepId, !isCompleted);
      const stepsResponse = await complaintAPI.getComplaintSteps(selectedComplaint.id);
      const steps = stepsResponse.data?.data || stepsResponse.data || [];
      const updatedSteps = Array.isArray(steps) ? steps : [];
      setSelectedComplaint(prev => ({ ...prev, steps: updatedSteps }));
      
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

  const openEditModal = (complaint) => {
    setSelectedComplaint(complaint);
    setEditForm({
      title: complaint.title || '',
      description: complaint.description || '',
      categories: complaint.categories || [complaint.category] || [],
      priority: complaint.priority || 'medium'
    });
    setShowEditModal(true);
  };

  const handleEditComplaint = async (e) => {
    e.preventDefault();
    if (!editForm.title || !editForm.description || editForm.categories.length === 0) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const updateData = {
        title: editForm.title,
        description: editForm.description,
        category: editForm.categories[0],
        priority: editForm.priority,
        categories: editForm.categories
      };
      
      await complaintAPI.updateComplaint(selectedComplaint.id, updateData);
      setSuccessMessage('Complaint updated successfully!');
      setShowEditModal(false);
      setSelectedComplaint(null);
      fetchComplaints();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error updating complaint:', err);
      setError(err.response?.data?.message || 'Failed to update complaint');
    } finally {
      setLoading(false);
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

 // PDF Export Function - FIXED FOR jspdf-autotable v5.x
const handleExportPDF = async () => {
  try {
    setExportingPDF(true);
    setError(null);
    
    // Get company info
    let companyName = 'Zakaria Rental System';
    let companyAddress = '';
    let companyPhone = '';
    let companyEmail = '';
    
    try {
      const companyResponse = await settingsAPI.getCompanyInfo();
      const data = companyResponse.data?.data || companyResponse.data || {};
      companyName = data.name || data.company_name || 'Zakaria Rental System';
      companyAddress = data.address || data.company_address || '';
      companyPhone = data.phone || data.company_phone || '';
      companyEmail = data.email || data.company_email || '';
    } catch (e) {
      console.warn('Using default company info');
    }
    
    // Fetch steps for complaints
    const complaintsWithSteps = await Promise.all(
      filteredComplaints.map(async (complaint) => {
        try {
          const stepsResponse = await complaintAPI.getComplaintSteps(complaint.id);
          const steps = stepsResponse.data?.data || stepsResponse.data || [];
          return { ...complaint, steps: Array.isArray(steps) ? steps : [] };
        } catch (e) {
          return { ...complaint, steps: [] };
        }
      })
    );
    
    // Load jsPDF
    const jspdfModule = await import('jspdf');
    const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
    
    // Load autoTable - get the default export function
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = autoTableModule.default;
    
    // Create document
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    const primaryColor = [37, 99, 235];
    const textColor = [55, 65, 81];
    
    // Header
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, 14, 12);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const detailParts = [companyAddress, companyPhone, companyEmail].filter(Boolean);
    if (detailParts.length > 0) {
      doc.text(detailParts.join(' | '), 14, 19);
    }
    
    // Title
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(isAdmin ? 'All Properties Complaints Report' : 'My Properties Complaints Report', 14, 35);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${formatDate(new Date())}`, 14, 42);
    doc.text(`Total: ${complaintsWithSteps.length} | Open: ${stats.open} | In Progress: ${stats.in_progress} | Resolved: ${stats.resolved}`, 14, 48);
    
    // Table data
    const tableData = complaintsWithSteps.map(complaint => {
      const stepsProgress = complaint.steps?.length > 0 
        ? `${complaint.steps.filter(s => s.is_completed).length}/${complaint.steps.length}` 
        : 'No steps';
      
      return [
        `${complaint.tenant_first_name || ''} ${complaint.tenant_last_name || ''}`.trim() || 'Unknown',
        complaint.property_name || 'N/A',
        complaint.unit_code || 'N/A',
        getCategoryLabels(complaint),
        complaint.title || 'N/A',
        (complaint.status || 'open').replace('_', ' '),
        stepsProgress,
        formatDate(complaint.raised_at),
        complaint.status === 'resolved' ? formatDate(complaint.resolved_at) : 'N/A'
      ];
    });
    
    // Create table using autoTable function (v5.x style)
    autoTable(doc, {
      startY: 55,
      head: [['Tenant', 'Property', 'Unit', 'Categories', 'Title', 'Status', 'Steps', 'Date Raised', 'Date Resolved']],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 28 }, 1: { cellWidth: 28 }, 2: { cellWidth: 18 },
        3: { cellWidth: 35 }, 4: { cellWidth: 40 }, 5: { cellWidth: 22 },
        6: { cellWidth: 18 }, 7: { cellWidth: 28 }, 8: { cellWidth: 28 }
      },
      margin: { top: 55, bottom: 15 }
    });
    
    // Steps detail page
    const complaintsWithActualSteps = complaintsWithSteps.filter(c => c.steps && c.steps.length > 0);
    
    if (complaintsWithActualSteps.length > 0) {
      doc.addPage();
      
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Detailed Steps by Complaint', 14, 10);
      
      let yPos = 25;
      
      for (const complaint of complaintsWithActualSteps) {
        if (yPos > pageHeight - 50) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(complaint.title || 'Untitled', 14, yPos);
        
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        yPos += 5;
        doc.text(`Tenant: ${complaint.tenant_first_name || ''} ${complaint.tenant_last_name || ''} | Unit: ${complaint.unit_code || 'N/A'} | Status: ${(complaint.status || 'open').replace('_', ' ')}`, 14, yPos);
        
        yPos += 7;
        
        const sortedSteps = [...(complaint.steps || [])].sort((a, b) => a.step_order - b.step_order);
        for (const step of sortedSteps) {
          const checkbox = step.is_completed ? '[X]' : '[ ]';
          const stepText = `${checkbox} Step ${step.step_order}: ${step.step_description}`;
          
          doc.setFont('helvetica', step.is_completed ? 'normal' : 'bold');
          doc.setTextColor(step.is_completed ? 100 : 55, step.is_completed ? 100 : 65, step.is_completed ? 100 : 81);
          
          const lines = doc.splitTextToSize(stepText, pageWidth - 28);
          for (const line of lines) {
            if (yPos > pageHeight - 20) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(line, 20, yPos);
            yPos += 5;
          }
          
          if (step.is_completed && step.completed_at) {
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(`   Completed: ${formatDate(step.completed_at)}`, 20, yPos);
            yPos += 4;
            doc.setFontSize(8);
          }
        }
        
        yPos += 8;
        doc.setDrawColor(229, 231, 235);
        doc.line(14, yPos - 3, pageWidth - 14, yPos - 3);
      }
    }
    
    // Page numbers
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
      doc.text(companyName, 14, pageHeight - 5);
    }
    
    doc.save(`complaints_report_${new Date().toISOString().split('T')[0]}.pdf`);
    setSuccessMessage('PDF exported successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  } catch (err) {
    console.error('Error exporting PDF:', err);
    setError('Failed to export PDF: ' + (err.message || 'Unknown error'));
  } finally {
    setExportingPDF(false);
  }
};
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Complaint Management</h1>
            <p className="text-gray-600 mt-1">
              {isAdmin ? 'Manage all tenant complaints across properties' : 'Manage complaints for your assigned properties'}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
              <Plus className="w-5 h-5 mr-2" />Create Complaint
            </button>
            
            <button onClick={handleExportPDF} disabled={exportingPDF || filteredComplaints.length === 0} className="inline-flex items-center px-4 py-2.5 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm border border-gray-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {exportingPDF ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Exporting...</>) : (<><Download className="w-5 h-5 mr-2" />Export PDF</>)}
            </button>
            
            <button onClick={fetchComplaints} className="inline-flex items-center px-3 py-2.5 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm border border-gray-300">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-800">
          <CheckCircle2 className="w-5 h-5 mr-2 flex-shrink-0" />{successMessage}
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-red-800">
          <div className="flex items-center"><AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />{error}</div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800"><X className="w-5 h-5" /></button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500 font-medium">Total</p><p className="text-2xl font-bold text-gray-900">{stats.total}</p></div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><MessageSquare className="w-5 h-5 text-blue-600" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500 font-medium">Open</p><p className="text-2xl font-bold text-red-600">{stats.open}</p></div>
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><Circle className="w-5 h-5 text-red-600" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500 font-medium">In Progress</p><p className="text-2xl font-bold text-amber-600">{stats.in_progress}</p></div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><Clock className="w-5 h-5 text-amber-600" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500 font-medium">Resolved</p><p className="text-2xl font-bold text-green-600">{stats.resolved}</p></div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500 font-medium">High Priority</p><p className="text-2xl font-bold text-orange-600">{stats.high_priority}</p></div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-orange-600" /></div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setShowFilters(!showFilters)}>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <span className="font-medium text-gray-700">Filters</span>
            {(filters.status || filters.priority || filters.category || filters.search) && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">Active</span>
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
                  <input type="text" placeholder="Search complaints..." value={filters.search} onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={filters.status} onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select value={filters.priority} onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">All Priorities</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={filters.category} onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">All Categories</option>
                  {COMPLAINT_CATEGORIES.map(cat => (<option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setFilters({ status: '', priority: '', category: '', search: '' })} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Clear Filters</button>
            </div>
          </div>
        )}
      </div>

      {/* Complaints List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Complaints ({filteredComplaints.length})</h2>
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
            <p className="text-gray-500">{filters.status || filters.priority || filters.category || filters.search ? 'Try adjusting your filters' : 'Create a new complaint to get started'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredComplaints.map((complaint) => (
              <div key={complaint.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${complaint.status === 'open' ? 'bg-red-500' : complaint.status === 'in_progress' ? 'bg-amber-500' : 'bg-green-500'}`} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{complaint.title}</h3>
                        <p className="text-sm text-gray-500 line-clamp-2 mt-1">{complaint.description}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadge(complaint.status)}`}>{complaint.status?.replace('_', ' ')}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadge(complaint.priority)}`}>{complaint.priority}</span>
                          <span className="text-xs text-gray-500">{getCategoryLabels(complaint)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1"><User className="w-4 h-4" /><span>{complaint.tenant_first_name} {complaint.tenant_last_name}</span></div>
                          <div className="flex items-center gap-1"><Building2 className="w-4 h-4" /><span>{complaint.property_name}</span></div>
                          <div className="flex items-center gap-1"><Home className="w-4 h-4" /><span>{complaint.unit_code}</span></div>
                          <div className="flex items-center gap-1"><Calendar className="w-4 h-4" /><span>{formatDate(complaint.raised_at)}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 lg:flex-shrink-0">
                    {complaint.status === 'open' && (isAdmin || isAgent) && (
                      <button onClick={() => openStepsModal(complaint)} className="inline-flex items-center px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium">
                        <Wrench className="w-4 h-4 mr-1.5" />Start Servicing
                      </button>
                    )}
                    {complaint.status !== 'resolved' && (
                      <button onClick={() => openEditModal(complaint)} className="inline-flex items-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium">
                        <Edit3 className="w-4 h-4 mr-1.5" />Edit
                      </button>
                    )}
                    <button onClick={() => openDetailsModal(complaint)} className="inline-flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
                      View Details<ArrowRight className="w-4 h-4 ml-1.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Create New Complaint</h2>
              <button onClick={() => { setShowCreateModal(false); resetCreateForm(); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleCreateComplaint} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property <span className="text-red-500">*</span></label>
                  <select value={createForm.property_id} onChange={(e) => setCreateForm(prev => ({ ...prev, property_id: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required>
                    <option value="">Select a property</option>
                    {properties.map(property => (<option key={property.id} value={property.id}>{property.name} - {property.address}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tenant <span className="text-red-500">*</span></label>
                  <select value={createForm.tenant_id} onChange={(e) => setCreateForm(prev => ({ ...prev, tenant_id: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required disabled={!createForm.property_id || loadingTenants}>
                    <option value="">{loadingTenants ? 'Loading tenants...' : 'Select a tenant'}</option>
                    {tenants.map(tenant => (<option key={tenant.tenant_id} value={tenant.tenant_id}>{tenant.tenant_name} ({tenant.unit_code})</option>))}
                  </select>
                  {createForm.property_id && !loadingTenants && tenants.length === 0 && (<p className="text-sm text-amber-600 mt-1">No tenants found in this property</p>)}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input type="text" value={createForm.unit_code || 'Will be auto-filled'} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600" disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Complaint Title <span className="text-red-500">*</span></label>
                  <input type="text" value={createForm.title} onChange={(e) => setCreateForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Brief description of the issue" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Categories <span className="text-red-500">*</span><span className="text-gray-400 font-normal ml-1">(Select one or more)</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {COMPLAINT_CATEGORIES.map(category => (
                      <button key={category.id} type="button" onClick={() => toggleCategory(category.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${createForm.categories.includes(category.id) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                        <span>{category.icon}</span><span>{category.label}</span>{createForm.categories.includes(category.id) && (<Check className="w-4 h-4 ml-auto" />)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <div className="flex gap-3">
                    {['low', 'medium', 'high'].map(priority => (
                      <button key={priority} type="button" onClick={() => setCreateForm(prev => ({ ...prev, priority }))} className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors capitalize ${createForm.priority === priority ? priority === 'high' ? 'bg-red-500 border-red-500 text-white' : priority === 'medium' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{priority}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
                  <textarea value={createForm.description} onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Provide detailed information about the complaint..." rows={4} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" required />
                </div>
              </div>
              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                <button type="button" onClick={() => { setShowCreateModal(false); resetCreateForm(); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                  {loading ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</>) : 'Create Complaint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Steps Modal */}
      {showStepsModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div><h2 className="text-xl font-semibold text-gray-900">Start Servicing</h2><p className="text-sm text-gray-500 mt-1">{selectedComplaint.title}</p></div>
              <button onClick={() => { setShowStepsModal(false); setSelectedComplaint(null); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleSubmitSteps} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="mb-4"><p className="text-sm text-gray-600">Add the steps you'll take to resolve this complaint.</p></div>
              <div className="space-y-3">
                {stepsForm.steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">{index + 1}</span>
                    <input type="text" value={step} onChange={(e) => updateStepInput(index, e.target.value)} placeholder={`Step ${index + 1} description...`} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    {stepsForm.steps.length > 1 && (<button type="button" onClick={() => removeStepInput(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><X className="w-5 h-5" /></button>)}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addStepInput} className="mt-4 inline-flex items-center px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"><Plus className="w-4 h-4 mr-1.5" />Add Another Step</button>
              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                <button type="button" onClick={() => { setShowStepsModal(false); setSelectedComplaint(null); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={savingSteps} className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                  {savingSteps ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>) : (<><Wrench className="w-4 h-4 mr-2" />Start Servicing</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className="text-xl font-semibold text-gray-900 truncate">{selectedComplaint.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadge(selectedComplaint.status)}`}>{selectedComplaint.status?.replace('_', ' ')}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadge(selectedComplaint.priority)}`}>{selectedComplaint.priority}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedComplaint.status !== 'resolved' && (<button onClick={() => { setShowDetailsModal(false); openEditModal(selectedComplaint); }} className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors" title="Edit"><Edit3 className="w-5 h-5" /></button>)}
                <button onClick={() => { setShowDetailsModal(false); setSelectedComplaint(null); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><User className="w-5 h-5 text-gray-400" /><div><p className="text-xs text-gray-500">Tenant</p><p className="font-medium text-gray-900">{selectedComplaint.tenant_first_name} {selectedComplaint.tenant_last_name}</p></div></div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Building2 className="w-5 h-5 text-gray-400" /><div><p className="text-xs text-gray-500">Property</p><p className="font-medium text-gray-900">{selectedComplaint.property_name}</p></div></div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Home className="w-5 h-5 text-gray-400" /><div><p className="text-xs text-gray-500">Unit</p><p className="font-medium text-gray-900">{selectedComplaint.unit_code}</p></div></div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Calendar className="w-5 h-5 text-gray-400" /><div><p className="text-xs text-gray-500">Raised At</p><p className="font-medium text-gray-900">{formatDate(selectedComplaint.raised_at)}</p></div></div>
              </div>
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Categories</h4>
                <div className="flex flex-wrap gap-2">
                  {(selectedComplaint.categories || [selectedComplaint.category]).filter(Boolean).map(catId => { const cat = COMPLAINT_CATEGORIES.find(c => c.id === catId); return (<span key={catId} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"><span>{cat?.icon || '📝'}</span><span>{cat?.label || catId}</span></span>); })}
                </div>
              </div>
              <div className="mb-6"><h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4><p className="text-gray-600 bg-gray-50 p-4 rounded-lg">{selectedComplaint.description}</p></div>
              {selectedComplaint.steps && selectedComplaint.steps.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3"><h4 className="text-sm font-medium text-gray-700">Resolution Steps</h4><span className="text-sm text-gray-500">{getStepsProgress(selectedComplaint.steps).completed}/{getStepsProgress(selectedComplaint.steps).total} completed</span></div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-4"><div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${getStepsProgress(selectedComplaint.steps).percentage}%` }} /></div>
                  <div className="space-y-2">
                    {selectedComplaint.steps.sort((a, b) => a.step_order - b.step_order).map((step) => (
                      <div key={step.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${step.is_completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                        <button onClick={() => toggleStepCompletion(step.id, step.is_completed)} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${step.is_completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-500'}`}>{step.is_completed && <Check className="w-4 h-4" />}</button>
                        <div className="flex-1"><p className={`${step.is_completed ? 'text-green-800 line-through' : 'text-gray-900'}`}>{step.step_description}</p>{step.is_completed && step.completed_at && (<p className="text-xs text-green-600 mt-1">Completed on {formatDate(step.completed_at)}</p>)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedComplaint.status === 'resolved' && selectedComplaint.resolved_at && (<div className="p-4 bg-green-50 border border-green-200 rounded-lg"><div className="flex items-center gap-2 text-green-800"><CheckCircle2 className="w-5 h-5" /><span className="font-medium">Resolved on {formatDate(selectedComplaint.resolved_at)}</span></div></div>)}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div><h2 className="text-xl font-semibold text-gray-900">Edit Complaint</h2><p className="text-sm text-gray-500 mt-1">Update complaint details</p></div>
              <button onClick={() => { setShowEditModal(false); setSelectedComplaint(null); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleEditComplaint} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-5">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-gray-500">Tenant:</span><span className="ml-2 font-medium text-gray-900">{selectedComplaint.tenant_first_name} {selectedComplaint.tenant_last_name}</span></div>
                    <div><span className="text-gray-500">Unit:</span><span className="ml-2 font-medium text-gray-900">{selectedComplaint.unit_code}</span></div>
                    <div><span className="text-gray-500">Property:</span><span className="ml-2 font-medium text-gray-900">{selectedComplaint.property_name}</span></div>
                    <div><span className="text-gray-500">Status:</span><span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadge(selectedComplaint.status)}`}>{selectedComplaint.status?.replace('_', ' ')}</span></div>
                  </div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Complaint Title <span className="text-red-500">*</span></label><input type="text" value={editForm.title} onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Brief description of the issue" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required /></div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Categories <span className="text-red-500">*</span><span className="text-gray-400 font-normal ml-1">(Select one or more)</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {COMPLAINT_CATEGORIES.map(category => (
                      <button key={category.id} type="button" onClick={() => toggleEditCategory(category.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${editForm.categories.includes(category.id) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                        <span>{category.icon}</span><span>{category.label}</span>{editForm.categories.includes(category.id) && (<Check className="w-4 h-4 ml-auto" />)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <div className="flex gap-3">
                    {['low', 'medium', 'high'].map(priority => (
                      <button key={priority} type="button" onClick={() => setEditForm(prev => ({ ...prev, priority }))} className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors capitalize ${editForm.priority === priority ? priority === 'high' ? 'bg-red-500 border-red-500 text-white' : priority === 'medium' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{priority}</button>
                    ))}
                  </div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label><textarea value={editForm.description} onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Provide detailed information about the complaint..." rows={4} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" required /></div>
              </div>
              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                <button type="button" onClick={() => { setShowEditModal(false); setSelectedComplaint(null); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                  {loading ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Updating...</>) : (<><Check className="w-4 h-4 mr-2" />Update Complaint</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintManagement;