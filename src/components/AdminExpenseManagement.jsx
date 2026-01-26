import React, { useState, useEffect, useCallback } from 'react';
import { expenseAPI, propertyAPI, userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';

const AdminExpenseManagement = () => {
  const { user } = useAuth();
  
  // State
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [properties, setProperties] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [netProfit, setNetProfit] = useState(null);
  
  // Export state
  const [exporting, setExporting] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    category: '',
    propertyId: '',
    status: '',
    recordedBy: ''
  });
  
  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  
  // Selection for bulk actions
  const [selectedExpenses, setSelectedExpenses] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  
  // Modal states
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Active tab
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'approved', 'rejected', 'all'
  
  // Toast notification
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Fetch initial data
  useEffect(() => {
    fetchCategories();
    fetchProperties();
    fetchAgents();
    fetchStats();
    fetchNetProfit();
  }, []);

  // Fetch expenses when filters, pagination, or tab change
  useEffect(() => {
    fetchExpenses();
  }, [filters, pagination.page, activeTab]);

  // Update status filter when tab changes
  useEffect(() => {
    if (activeTab === 'all') {
      setFilters(prev => ({ ...prev, status: '' }));
    } else {
      setFilters(prev => ({ ...prev, status: activeTab }));
    }
    setPagination(prev => ({ ...prev, page: 1 }));
    setSelectedExpenses([]);
    setSelectAll(false);
  }, [activeTab]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchCategories = async () => {
    try {
      const response = await expenseAPI.getCategories();
      if (response.data.success) {
        setCategories(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchProperties = async () => {
    try {
      const response = await propertyAPI.getProperties();
      if (response.data.success) {
        setProperties(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching properties:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await userAPI.getAgents();
      if (response.data.success || response.data.data) {
        setAgents(response.data.data || response.data);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };
      
      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '') delete params[key];
      });
      
      const response = await expenseAPI.getExpenses(params);
      if (response.data.success) {
        setExpenses(response.data.data);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total,
          totalPages: response.data.pagination.totalPages
        }));
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      showToast('Failed to load expenses', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await expenseAPI.getStats();
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchNetProfit = async () => {
    try {
      const response = await expenseAPI.getNetProfitReport();
      if (response.data.success) {
        setNetProfit(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching net profit:', error);
    }
  };

  // Fetch all expenses for export
  const fetchAllExpensesForExport = async () => {
    try {
      const params = {
        page: 1,
        limit: 10000,
        ...filters
      };
      
      Object.keys(params).forEach(key => {
        if (params[key] === '') delete params[key];
      });
      
      const response = await expenseAPI.getExpenses(params);
      if (response.data.success) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error('Error fetching all expenses:', error);
      return [];
    }
  };

  // Approve single expense
  const handleApprove = async (expenseId) => {
    setProcessing(true);
    try {
      const response = await expenseAPI.updateExpenseStatus(expenseId, { status: 'approved' });
      if (response.data.success) {
        showToast('Expense approved successfully');
        fetchExpenses();
        fetchStats();
        fetchNetProfit();
      }
    } catch (error) {
      console.error('Error approving expense:', error);
      showToast(error.response?.data?.message || 'Failed to approve expense', 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Reject single expense
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      showToast('Please provide a rejection reason', 'error');
      return;
    }
    
    setProcessing(true);
    try {
      const response = await expenseAPI.updateExpenseStatus(selectedExpense.id, {
        status: 'rejected',
        rejection_reason: rejectionReason
      });
      if (response.data.success) {
        showToast('Expense rejected');
        setShowRejectModal(false);
        setRejectionReason('');
        setSelectedExpense(null);
        fetchExpenses();
        fetchStats();
      }
    } catch (error) {
      console.error('Error rejecting expense:', error);
      showToast(error.response?.data?.message || 'Failed to reject expense', 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Bulk approve
  const handleBulkApprove = async () => {
    if (selectedExpenses.length === 0) {
      showToast('No expenses selected', 'error');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to approve ${selectedExpenses.length} expense(s)?`)) return;
    
    setProcessing(true);
    try {
      const response = await expenseAPI.bulkUpdateStatus({
        expenseIds: selectedExpenses,
        status: 'approved'
      });
      if (response.data.success) {
        showToast(`${response.data.data.updatedCount} expense(s) approved`);
        setSelectedExpenses([]);
        setSelectAll(false);
        fetchExpenses();
        fetchStats();
        fetchNetProfit();
      }
    } catch (error) {
      console.error('Error bulk approving:', error);
      showToast(error.response?.data?.message || 'Failed to approve expenses', 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Bulk reject
  const handleBulkReject = async () => {
    if (selectedExpenses.length === 0) {
      showToast('No expenses selected', 'error');
      return;
    }
    
    const reason = window.prompt('Enter rejection reason for all selected expenses:');
    if (!reason) return;
    
    setProcessing(true);
    try {
      // For bulk reject, we need to call individually or create a bulk reject endpoint
      let successCount = 0;
      for (const expenseId of selectedExpenses) {
        try {
          await expenseAPI.updateExpenseStatus(expenseId, {
            status: 'rejected',
            rejection_reason: reason
          });
          successCount++;
        } catch (e) {
          console.error(`Failed to reject expense ${expenseId}:`, e);
        }
      }
      
      showToast(`${successCount} expense(s) rejected`);
      setSelectedExpenses([]);
      setSelectAll(false);
      fetchExpenses();
      fetchStats();
    } catch (error) {
      console.error('Error bulk rejecting:', error);
      showToast('Failed to reject some expenses', 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Mark as reimbursed
  const handleMarkReimbursed = async (expenseId) => {
    setProcessing(true);
    try {
      const response = await expenseAPI.updateExpenseStatus(expenseId, { status: 'reimbursed' });
      if (response.data.success) {
        showToast('Expense marked as reimbursed');
        fetchExpenses();
        fetchStats();
      }
    } catch (error) {
      console.error('Error marking reimbursed:', error);
      showToast(error.response?.data?.message || 'Failed to update expense', 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Toggle selection
  const toggleSelectExpense = (expenseId) => {
    setSelectedExpenses(prev => {
      if (prev.includes(expenseId)) {
        return prev.filter(id => id !== expenseId);
      } else {
        return [...prev, expenseId];
      }
    });
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedExpenses([]);
    } else {
      const pendingIds = expenses.filter(e => e.status === 'pending').map(e => e.id);
      setSelectedExpenses(pendingIds);
    }
    setSelectAll(!selectAll);
  };

  // View expense details
  const handleViewDetails = (expense) => {
    setSelectedExpense(expense);
    setShowDetailModal(true);
  };

  // Open reject modal
  const openRejectModal = (expense) => {
    setSelectedExpense(expense);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  // Export handlers
  const handleExportPDF = async () => {
    if (exporting) return;
    
    setExporting(true);
    showToast('Preparing PDF export...', 'success');
    
    try {
      const allExpenses = await fetchAllExpensesForExport();
      
      if (allExpenses.length === 0) {
        showToast('No expenses to export', 'error');
        return;
      }
      
      let title = 'Expense Report';
      if (activeTab !== 'all') title += ` - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`;
      
      const success = await exportToPDF({
        reportType: 'expenses',
        data: allExpenses,
        filters: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          search: filters.category ? `Category: ${filters.category}` : null
        },
        user,
        title
      });
      
      if (success) {
        showToast('PDF exported successfully!', 'success');
      }
    } catch (error) {
      console.error('PDF export error:', error);
      showToast('Failed to export PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (exporting) return;
    
    setExporting(true);
    showToast('Preparing Excel export...', 'success');
    
    try {
      const allExpenses = await fetchAllExpensesForExport();
      
      if (allExpenses.length === 0) {
        showToast('No expenses to export', 'error');
        return;
      }
      
      let title = 'Expense Report';
      if (activeTab !== 'all') title += ` - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`;
      
      const success = await exportToExcel({
        reportType: 'expenses',
        data: allExpenses,
        filters: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          search: filters.category ? `Category: ${filters.category}` : null
        },
        user,
        title
      });
      
      if (success) {
        showToast('Excel exported successfully!', 'success');
      }
    } catch (error) {
      console.error('Excel export error:', error);
      showToast('Failed to export Excel', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Formatters
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      approved: 'bg-green-100 text-green-800 border-green-200',
      rejected: 'bg-red-100 text-red-800 border-red-200',
      reimbursed: 'bg-blue-100 text-blue-800 border-blue-200'
    };
    return (
      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getTabCount = (status) => {
    if (!stats?.byStatus) return 0;
    const statusData = stats.byStatus.find(s => s.status === status);
    return statusData?.count || 0;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        } text-white font-medium animate-fade-in`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Expense Management</h1>
            <p className="text-sm text-gray-500 mt-1">Review and approve agent expense submissions</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Export Buttons */}
            <button
              onClick={handleExportPDF}
              disabled={exporting || expenses.length === 0}
              className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              PDF
            </button>
            
            <button
              onClick={handleExportExcel}
              disabled={exporting || expenses.length === 0}
              className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-4 sm:px-6 py-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Pending */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Approval</p>
                <p className="text-2xl font-bold text-yellow-600">{getTabCount('pending')}</p>
                <p className="text-xs text-gray-400 mt-1">Needs review</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Approved */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Approved</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(stats?.totals?.approved?.amount || 0)}
                </p>
                <p className="text-xs text-gray-400 mt-1">{getTabCount('approved')} expenses</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Rejected */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{getTabCount('rejected')}</p>
                <p className="text-xs text-gray-400 mt-1">Not approved</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Total This Month */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total (Month)</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(stats?.totals?.total || 0)}
                </p>
                <p className="text-xs text-gray-400 mt-1">{stats?.totals?.totalCount || 0} entries</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Net Profit */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-100">Net Profit (Month)</p>
                <p className={`text-2xl font-bold ${netProfit?.netProfit >= 0 ? 'text-white' : 'text-red-200'}`}>
                  {formatCurrency(netProfit?.netProfit || 0)}
                </p>
                <p className="text-xs text-blue-200 mt-1">
                  {netProfit?.profitMargin || 0}% margin
                </p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 sm:px-6">
        <div className="bg-white rounded-t-xl border border-b-0 border-gray-200">
          <nav className="flex space-x-1 p-1">
            {[
              { id: 'pending', label: 'Pending', count: getTabCount('pending'), color: 'yellow' },
              { id: 'approved', label: 'Approved', count: getTabCount('approved'), color: 'green' },
              { id: 'rejected', label: 'Rejected', count: getTabCount('rejected'), color: 'red' },
              { id: 'all', label: 'All', count: stats?.totals?.totalCount || 0, color: 'gray' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  activeTab === tab.id
                    ? `bg-${tab.color}-100 text-${tab.color}-700 border border-${tab.color}-200`
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  activeTab === tab.id
                    ? `bg-${tab.color}-200 text-${tab.color}-800`
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 sm:px-6">
        <div className="bg-white border-x border-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Property</label>
              <select
                value={filters.propertyId}
                onChange={(e) => setFilters(prev => ({ ...prev, propertyId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">All Properties</option>
                {properties.map(prop => (
                  <option key={prop.id} value={prop.id}>{prop.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Agent</label>
              <select
                value={filters.recordedBy}
                onChange={(e) => setFilters(prev => ({ ...prev, recordedBy: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">All Agents</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.first_name} {agent.last_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="mt-3 flex justify-between items-center">
            <p className="text-sm text-gray-500">
              {pagination.total} expense{pagination.total !== 1 ? 's' : ''} found
            </p>
            <button
              onClick={() => {
                setFilters({ startDate: '', endDate: '', category: '', propertyId: '', status: activeTab === 'all' ? '' : activeTab, recordedBy: '' });
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {activeTab === 'pending' && selectedExpenses.length > 0 && (
        <div className="px-4 sm:px-6">
          <div className="bg-blue-50 border-x border-blue-200 p-3 flex items-center justify-between">
            <span className="text-sm text-blue-800 font-medium">
              {selectedExpenses.length} expense{selectedExpenses.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkApprove}
                disabled={processing}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Approve All
              </button>
              <button
                onClick={handleBulkReject}
                disabled={processing}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Reject All
              </button>
              <button
                onClick={() => { setSelectedExpenses([]); setSelectAll(false); }}
                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      <div className="px-4 sm:px-6">
        <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-lg font-medium">No expenses found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {activeTab === 'pending' && (
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectAll}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-gray-50 transition-colors">
                        {activeTab === 'pending' && (
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedExpenses.includes(expense.id)}
                              onChange={() => toggleSelectExpense(expense.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                        )}
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(expense.expense_date)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{expense.recorded_by_name || 'N/A'}</div>
                          <div className="text-xs text-gray-500">{expense.recorded_by_email}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {expense.category}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 max-w-xs truncate">
                          {expense.description}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                          {expense.property_name || 'General'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                          {formatCurrency(expense.amount)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {getStatusBadge(expense.status)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleViewDetails(expense)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="View Details"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            
                            {expense.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove(expense.id)}
                                  disabled={processing}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                                  title="Approve"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => openRejectModal(expense)}
                                  disabled={processing}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                                  title="Reject"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </>
                            )}
                            
                            {expense.status === 'approved' && (
                              <button
                                onClick={() => handleMarkReimbursed(expense.id)}
                                disabled={processing}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                                title="Mark Reimbursed"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden divide-y divide-gray-100">
                {expenses.map((expense) => (
                  <div key={expense.id} className="p-4">
                    <div className="flex items-start gap-3">
                      {activeTab === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selectedExpenses.includes(expense.id)}
                          onChange={() => toggleSelectExpense(expense.id)}
                          className="mt-1 rounded border-gray-300 text-blue-600"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-gray-900">{expense.category}</p>
                            <p className="text-xs text-gray-500">{expense.recorded_by_name} • {formatDate(expense.expense_date)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{formatCurrency(expense.amount)}</p>
                            {getStatusBadge(expense.status)}
                          </div>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-2 line-clamp-2">{expense.description}</p>
                        
                        {expense.property_name && (
                          <p className="text-xs text-gray-500 mb-2">📍 {expense.property_name}</p>
                        )}
                        
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleViewDetails(expense)}
                            className="flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                          >
                            View Details
                          </button>
                          
                          {expense.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(expense.id)}
                                disabled={processing}
                                className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => openRejectModal(expense)}
                                disabled={processing}
                                className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedExpense && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setShowDetailModal(false)} />
            
            <div className="relative bg-white rounded-2xl shadow-xl transform transition-all w-full max-w-2xl mx-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Expense Details</h3>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-500">Amount</p>
                      <p className="text-3xl font-bold text-gray-900">{formatCurrency(selectedExpense.amount)}</p>
                    </div>
                    {getStatusBadge(selectedExpense.status)}
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedExpense.expense_date)}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Category</p>
                    <p className="font-medium text-gray-900">{selectedExpense.category}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Recorded By</p>
                    <p className="font-medium text-gray-900">{selectedExpense.recorded_by_name || 'N/A'}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Payment Method</p>
                    <p className="font-medium text-gray-900 capitalize">{selectedExpense.payment_method || 'Cash'}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Property</p>
                    <p className="font-medium text-gray-900">{selectedExpense.property_name || 'General'}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Unit</p>
                    <p className="font-medium text-gray-900">{selectedExpense.unit_code || '-'}</p>
                  </div>
                  
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Description</p>
                    <p className="font-medium text-gray-900">{selectedExpense.description}</p>
                  </div>
                  
                  {selectedExpense.vendor_name && (
                    <div>
                      <p className="text-sm text-gray-500">Vendor</p>
                      <p className="font-medium text-gray-900">{selectedExpense.vendor_name}</p>
                    </div>
                  )}
                  
                  {selectedExpense.vendor_phone && (
                    <div>
                      <p className="text-sm text-gray-500">Vendor Phone</p>
                      <p className="font-medium text-gray-900">{selectedExpense.vendor_phone}</p>
                    </div>
                  )}
                  
                  {selectedExpense.receipt_number && (
                    <div>
                      <p className="text-sm text-gray-500">Receipt Number</p>
                      <p className="font-medium text-gray-900">{selectedExpense.receipt_number}</p>
                    </div>
                  )}
                  
                  {selectedExpense.notes && (
                    <div className="col-span-2">
                      <p className="text-sm text-gray-500">Notes</p>
                      <p className="font-medium text-gray-900">{selectedExpense.notes}</p>
                    </div>
                  )}
                  
                  {selectedExpense.status === 'rejected' && selectedExpense.rejection_reason && (
                    <div className="col-span-2 p-3 bg-red-50 rounded-lg">
                      <p className="text-sm text-red-600 font-medium">Rejection Reason</p>
                      <p className="text-red-800">{selectedExpense.rejection_reason}</p>
                    </div>
                  )}
                  
                  {selectedExpense.approved_by_name && (
                    <div className="col-span-2 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">
                        {selectedExpense.status === 'approved' ? 'Approved' : selectedExpense.status === 'rejected' ? 'Rejected' : 'Processed'} by
                      </p>
                      <p className="font-medium text-gray-900">
                        {selectedExpense.approved_by_name} on {formatDateTime(selectedExpense.approved_at)}
                      </p>
                    </div>
                  )}
                  
                  <div className="col-span-2 text-xs text-gray-400 text-right">
                    Created: {formatDateTime(selectedExpense.created_at)}
                  </div>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                {selectedExpense.status === 'pending' && (
                  <>
                    <button
                      onClick={() => openRejectModal(selectedExpense)}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => { handleApprove(selectedExpense.id); setShowDetailModal(false); }}
                      disabled={processing}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedExpense && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setShowRejectModal(false)} />
            
            <div className="relative bg-white rounded-2xl shadow-xl transform transition-all w-full max-w-md mx-auto">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Reject Expense</h3>
              </div>
              
              <div className="p-6">
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Expense Amount</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedExpense.amount)}</p>
                  <p className="text-sm text-gray-600 mt-1">{selectedExpense.category} • {selectedExpense.recorded_by_name}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Please provide a reason for rejecting this expense..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => { setShowRejectModal(false); setRejectionReason(''); }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing || !rejectionReason.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Rejecting...' : 'Reject Expense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminExpenseManagement;