// src/components/PaymentManagement.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';
import { 
  Calendar, DollarSign, BarChart, Activity, Search, X, 
  ChevronsRight, ChevronsLeft, ChevronRight, ChevronLeft, 
  ArrowDown, ArrowUp, FileText, FileSpreadsheet 
} from 'lucide-react'; // Removed unused Filter, Users icons

// Helper for currency formatting
const formatCurrency = (amount) => new Intl.NumberFormat('en-KE', { 
  style: 'currency', 
  currency: 'KES', 
  minimumFractionDigits: 0 
}).format(amount || 0);

// Helper for date formatting
const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('en-GB') : 'N/A';

const PaymentManagement = () => {
  const { user } = useAuth();
  const { 
    payments, 
    pagination, // Now correctly available from context
    loading, 
    error, 
    fetchPayments, 
    fetchTenantHistory 
  } = usePayment();

  // Safely accessing property context
  const propertyContext = useProperty();
  const properties = propertyContext?.properties || [];
  const propertiesLoading = propertyContext?.loading || false;
  const fetchProperties = propertyContext?.fetchProperties || (() => {});

  const [filters, setFilters] = useState({
    propertyId: '',
    period: 'this_month',
    startDate: '',
    endDate: '',
    search: '',
  });
  
  const [sort, setSort] = useState({ sortBy: 'payment_date', sortOrder: 'desc' });
  const [currentPage, setCurrentPage] = useState(1); // Initialize to 1, useEffect will sync with actual pagination

  // Modal State
  const [showTenantHistory, setShowTenantHistory] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantHistory, setTenantHistory] = useState({ payments: [], summary: {} });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // Load properties on mount
  useEffect(() => {
    if (typeof fetchProperties === 'function') {
      fetchProperties();
    }
  }, [fetchProperties]);

  const handleFetchPayments = useCallback(() => {
    const params = {
      page: currentPage,
      limit: 15,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder
    };

    if (filters.propertyId) params.propertyId = filters.propertyId;
    if (filters.search) params.search = filters.search;

    let { startDate, endDate } = filters;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Handle Period Filters
    if (filters.period !== 'custom') {
      if (filters.period === 'this_month') {
        startDate = new Date(year, month, 1).toISOString().split('T')[0];
        endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
      } else if (filters.period === 'last_month') {
        startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        endDate = new Date(year, month, 0).toISOString().split('T')[0];
      } else if (filters.period === 'this_quarter') {
        const quarter = Math.floor(month / 3);
        startDate = new Date(year, quarter * 3, 1).toISOString().split('T')[0];
        endDate = new Date(year, (quarter + 1) * 3, 0).toISOString().split('T')[0];
      } else if (filters.period === 'this_year') {
        startDate = new Date(year, 0, 1).toISOString().split('T')[0];
        endDate = new Date(year, 11, 31).toISOString().split('T')[0];
      }
    }
    
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    fetchPayments(params);
  }, [currentPage, filters, sort, fetchPayments]);

  useEffect(() => {
    handleFetchPayments();
  }, [handleFetchPayments]);

  // Sync currentPage with pagination updates received from context
  useEffect(() => {
    // Only update if pagination exists and currentPage is different to prevent infinite loops
    if (pagination && pagination.currentPage && pagination.currentPage !== currentPage) {
      setCurrentPage(pagination.currentPage);
    }
  }, [pagination, currentPage]);

  const handleSort = (column) => {
    setSort(prev => ({
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleViewHistory = async (tenantId, fullName) => {
    setLoadingHistory(true);
    setHistoryError(''); // Clear previous errors
    setSelectedTenant({ id: tenantId, name: fullName });
    
    try {
      // fetchTenantHistory is expected to return { payments: [], summary: {} }
      const historyData = await fetchTenantHistory(tenantId); 
      if (historyData) {
        setTenantHistory(historyData);
      } else {
        setTenantHistory({ payments: [], summary: {} }); // Ensure state is cleared
        setHistoryError('No payment history found for this tenant.');
      }
    } catch (err) {
      console.error('Fetch tenant history error:', err);
      setHistoryError('Failed to load payment history. Please try again.');
    } finally {
      setShowTenantHistory(true); // Open modal regardless of success/error
      setLoadingHistory(false);
    }
  };
  
  const handleExport = (format) => {
    if (!payments || payments.length === 0) {
      alert('No data available to export.');
      return;
    }
    
    const config = {
      reportType: 'payments',
      data: payments,
      filters,
      user,
      title: `Payment Transactions - ${filters.period.replace('_', ' ').toUpperCase()}`
    };

    if (format === 'pdf') exportToPDF(config);
    else exportToExcel(config);
  };

  const totalInView = useMemo(() => 
    payments?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0
  , [payments]);

  // Use optional chaining for payments here too
  const recentTransactions = useMemo(() => payments?.slice(0, 5) || [], [payments]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Activity className="text-blue-600" /> Payment Analytics
          </h1>
          <p className="text-gray-500">Comprehensive view of tenant financial records.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={() => handleExport('pdf')} 
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed" 
            disabled={loading || !payments?.length}
          >
            <FileText size={16} /> PDF
          </button>
          <button 
            onClick={() => handleExport('excel')} 
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed" 
            disabled={loading || !payments?.length}
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-full"><DollarSign className="text-blue-600" /></div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Total in View</p>
            <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalInView)}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
          <div className="bg-green-100 p-3 rounded-full"><BarChart className="text-green-600" /></div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Transaction Count</p>
            {/* Access pagination safely */}
            <p className="text-2xl font-bold text-gray-800">{pagination?.totalCount || 0}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-full"><Calendar className="text-purple-600" /></div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Period</p>
            <p className="text-lg font-bold text-gray-800 capitalize">{filters.period.replace('_', ' ')}</p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search tenant or receipt..." 
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={filters.search}
              onChange={e => setFilters({...filters, search: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 md:flex gap-2">
            <select 
              value={filters.period} 
              onChange={e => setFilters({...filters, period: e.target.value})} 
              className="border rounded-lg p-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
            <select 
              value={filters.propertyId} 
              onChange={e => setFilters({...filters, propertyId: e.target.value})} 
              className="border rounded-lg p-2 text-sm outline-none focus:border-blue-500"
              disabled={propertiesLoading}
            >
              <option value="">All Properties</option>
              {properties?.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {filters.period === 'custom' && (
          <div className="flex gap-4 p-3 bg-gray-50 rounded-lg animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">From:</span>
              <input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="border rounded-md p-1 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">To:</span>
              <input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="border rounded-md p-1 text-sm" />
            </div>
          </div>
        )}
      </div>

      {/* Recent Transactions Section */}
      {recentTransactions.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
          <div className="flex items-center gap-2 mb-2 text-blue-800">
            <Activity className="size-5" />
            <h3 className="font-bold text-lg">Recent Transactions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-blue-200 text-blue-900">
                  <th className="py-2">Tenant</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Ref</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map(p => (
                  <tr key={p.id} className="hover:bg-white/50 transition-colors">
                    <td className="py-2">{p.first_name} {p.last_name}</td>
                    <td className="py-2 font-bold">{formatCurrency(p.amount)}</td>
                    <td className="py-2 font-mono text-xs">{p.mpesa_receipt_number?.substring(0, 10)}...</td>
                    <td className="py-2">{formatDate(p.payment_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Table Section */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-20 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Fetching records...</p>
          </div>
        ) : error ? (
          <div className="p-20 text-center text-red-500">{error}</div>
        ) : !payments || payments.length === 0 ? (
          <div className="p-20 text-center">
            <DollarSign size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">No payment records found for the selected criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b text-gray-600 uppercase text-xs font-bold">
                <tr>
                  <th className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap" onClick={() => handleSort('first_name')}>
                    Tenant {sort.sortBy === 'first_name' && (sort.sortOrder === 'asc' ? <ArrowUp size={12} className="inline ml-1"/> : <ArrowDown size={12} className="inline ml-1"/>)}
                  </th>
                  <th className="p-4">Property & Unit</th>
                  <th className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap" onClick={() => handleSort('amount')}>
                    Amount {sort.sortBy === 'amount' && (sort.sortOrder === 'asc' ? <ArrowUp size={12} className="inline ml-1"/> : <ArrowDown size={12} className="inline ml-1"/>)}
                  </th>
                  <th className="p-4">M-Pesa / Ref</th>
                  <th className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap" onClick={() => handleSort('payment_date')}>
                    Date {sort.sortBy === 'payment_date' && (sort.sortOrder === 'asc' ? <ArrowUp size={12} className="inline ml-1"/> : <ArrowDown size={12} className="inline ml-1"/>)}
                  </th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="p-4 font-medium text-gray-900 whitespace-nowrap">{p.first_name} {p.last_name}</td>
                    <td className="p-4 text-gray-600 whitespace-nowrap">
                      {p.property_name} 
                      <span className="block text-xs font-bold text-blue-500">{p.unit_code}</span>
                    </td>
                    <td className="p-4 font-bold text-gray-800 whitespace-nowrap">{formatCurrency(p.amount)}</td>
                    <td className="p-4 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {p.mpesa_receipt_number || p.mpesa_transaction_id || 'N/A'}
                    </td>
                    <td className="p-4 text-gray-600 whitespace-nowrap">{formatDate(p.payment_date)}</td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <button 
                        onClick={() => handleViewHistory(p.tenant_id, `${p.first_name} ${p.last_name}`)} 
                        className="bg-blue-50 text-blue-600 px-3 py-1 rounded-md text-xs font-bold hover:bg-blue-600 hover:text-white transition-all touch-manipulation"
                      >
                        View History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Pagination */}
      {pagination?.totalPages > 1 && (
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50 p-4 rounded-xl border">
          <span className="text-sm text-gray-600 font-medium">
            Showing Page <span className="text-gray-900">{pagination.currentPage}</span> of {pagination.totalPages} ({pagination.totalCount} records)
          </span>
          <div className="flex gap-1">
            <button 
              onClick={() => setCurrentPage(1)} 
              disabled={currentPage === 1} 
              className="p-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
            >
              <ChevronsLeft size={18}/>
            </button>
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
              disabled={currentPage === 1} 
              className="p-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
            >
              <ChevronLeft size={18}/>
            </button>
            <button 
              onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))} 
              disabled={currentPage >= pagination.totalPages} 
              className="p-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
            >
              <ChevronRight size={18}/>
            </button>
            <button 
              onClick={() => setCurrentPage(pagination.totalPages)} 
              disabled={currentPage >= pagination.totalPages} 
              className="p-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
            >
              <ChevronsRight size={18}/>
            </button>
          </div>
        </div>
      )}

      {/* Tenant Payment History Modal */}
      {showTenantHistory && selectedTenant && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border max-h-[90vh]">
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-xl text-gray-800">Payment Statement</h3>
                <p className="text-blue-600 font-medium">{selectedTenant.name}</p>
              </div>
              <button 
                onClick={() => setShowTenantHistory(false)} 
                className="p-2 rounded-full hover:bg-gray-200 transition-colors touch-manipulation"
              >
                <X size={24}/>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {loadingHistory ? (
                <div className="py-20 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : historyError ? (
                <div className="text-center py-10 text-red-500">{historyError}</div>
              ) : (
                <div className="space-y-6">
                  {/* Summary row */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                      <p className="text-xs font-bold text-blue-400 uppercase mb-1">Total Expected</p>
                      <p className="text-xl font-black text-blue-700">
                        {formatCurrency(tenantHistory.summary?.totalExpected)}
                      </p>
                    </div>
                    <div className="bg-green-50 border border-green-100 p-4 rounded-xl">
                      <p className="text-xs font-bold text-green-400 uppercase mb-1">Total Paid</p>
                      <p className="text-xl font-black text-green-700">
                        {formatCurrency(tenantHistory.summary?.totalPaid)}
                      </p>
                    </div>
                    <div className={`${(tenantHistory.summary?.balance || 0) > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'} border p-4 rounded-xl`}>
                      <p className="text-xs font-bold text-gray-400 uppercase mb-1">Outstanding Balance</p>
                      <p className={`text-xl font-black ${(tenantHistory.summary?.balance || 0) > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                        {formatCurrency(tenantHistory.summary?.balance || 0)}
                      </p>
                    </div>
                  </div>

                  {/* History table */}
                  <div className="border rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0 border-b">
                        <tr>
                          <th className="p-3 text-left">Date</th>
                          <th className="p-3 text-left">Amount</th>
                          <th className="p-3 text-left">Ref Code</th>
                          <th className="p-3 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {!tenantHistory.payments || tenantHistory.payments.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="text-center py-8 text-gray-500">
                              No payment records found
                            </td>
                          </tr>
                        ) : (
                          tenantHistory.payments.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="p-3">{formatDate(p.payment_date)}</td>
                              <td className="p-3 font-bold">{formatCurrency(p.amount)}</td>
                              <td className="p-3 font-mono text-xs">
                                {p.mpesa_receipt_number || p.mpesa_transaction_id || 'STK_PUSH'}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  p.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                  p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {p.status || 'Unknown'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button 
                onClick={() => setShowTenantHistory(false)} 
                className="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-900 transition-all touch-manipulation"
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentManagement;