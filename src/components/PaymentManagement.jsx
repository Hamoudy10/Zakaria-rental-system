// src/components/PaymentManagement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';
import { Filter, Calendar, DollarSign, BarChart, Download, Search, X, ChevronsRight, ChevronsLeft, ChevronRight, ChevronLeft, ArrowDown, ArrowUp } from 'lucide-react';

// Helper for currency formatting
const formatCurrency = (amount) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount || 0);
// Helper for date formatting
const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('en-GB') : 'N/A';

const PaymentManagement = () => {
  const { user } = useAuth();
  const { payments, pagination, loading, error, fetchPayments, fetchTenantHistory } = usePayment();
  const { properties, fetchProperties } = useProperty();

  const [filters, setFilters] = useState({
    propertyId: '',
    period: 'this_month',
    startDate: '',
    endDate: '',
  });
  const [sort, setSort] = useState({ sortBy: 'payment_date', sortOrder: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [showTenantHistory, setShowTenantHistory] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantHistory, setTenantHistory] = useState({ payments: [], summary: {} });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [companyInfo, setCompanyInfo] = useState({
    name: 'Zakaria Housing Agency Limited',
    logo: null
  });

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const handleFetchPayments = useCallback(() => {
    let params = { page: currentPage, limit: 15, ...sort };
    if (filters.propertyId) params.propertyId = filters.propertyId;

    let { startDate, endDate } = filters;
    const now = new Date();
    if (filters.period !== 'custom') {
      const year = now.getFullYear();
      const month = now.getMonth();
      if (filters.period === 'this_month') {
        startDate = new Date(year, month, 1).toISOString().split('T')[0];
        endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
      } else if (filters.period === 'last_month') {
        startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        endDate = new Date(year, month, 0).toISOString().split('T')[0];
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

  const handleSort = (column) => {
    setSort(prevSort => ({
      sortBy: column,
      sortOrder: prevSort.sortBy === column && prevSort.sortOrder === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleViewHistory = async (tenant) => {
    setLoadingHistory(true);
    setSelectedTenant(tenant);
    const historyData = await fetchTenantHistory(tenant.id);
    if (historyData) setTenantHistory(historyData);
    setShowTenantHistory(true);
    setLoadingHistory(false);
  };
  
  const handleExport = (format) => {
    if (!payments || payments.length === 0) {
        alert('No data to export.');
        return;
    }
    const exportConfig = {
      reportType: 'payments', // This matches the key in our export utils
      data: payments,
      filters,
      user,
      title: 'Payment Transactions Report'
    };

    if (format === 'pdf') {
      exportToPDF(exportConfig);
    } else if (format === 'excel') {
      exportToExcel(exportConfig);
    }
  };

  const totalCollected = pagination?.totalCount ? payments.reduce((sum, p) => sum + parseFloat(p.amount), 0) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payment Analytics</h1>
          <p className="text-gray-500">Track and analyze all tenant payments.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => handleExport('pdf')} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:bg-gray-300" disabled={loading || !payments || payments.length === 0}><FileText size={16} />PDF</button>
            <button onClick={() => handleExport('excel')} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600 disabled:bg-gray-300" disabled={loading || !payments || payments.length === 0}><FileSpreadsheet size={16} />Excel</button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-full"><DollarSign className="text-blue-600" /></div>
          <div>
            <p className="text-gray-500 text-sm">Total Collected (in view)</p>
            <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalCollected)}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border flex items-center gap-4">
          <div className="bg-green-100 p-3 rounded-full"><BarChart className="text-green-600" /></div>
          <div>
            <p className="text-gray-500 text-sm">Total Transactions (in view)</p>
            <p className="text-2xl font-bold text-gray-800">{pagination.totalCount || 0}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-full"><Calendar className="text-purple-600" /></div>
          <div>
            <p className="text-gray-500 text-sm">Filter Period</p>
            <p className="text-lg font-semibold text-gray-800 capitalize">{filters.period.replace('_', ' ')}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border space-y-4">
        <div className="flex items-center gap-2"><Filter size={16} className="text-gray-600" /> <h3 className="font-semibold">Filters</h3></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <select value={filters.period} onChange={e => setFilters({...filters, period: e.target.value})} className="border rounded-lg p-2 text-sm">
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          {filters.period === 'custom' && (
            <>
              <input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value, period: 'custom'})} className="border rounded-lg p-2 text-sm" />
              <input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value, period: 'custom'})} className="border rounded-lg p-2 text-sm" />
            </>
          )}
          <select value={filters.propertyId} onChange={e => setFilters({...filters, propertyId: e.target.value})} className="border rounded-lg p-2 text-sm">
            <option value="">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> : 
        error ? <div className="p-8 text-center text-red-500">{error}</div> :
        !payments || payments.length === 0 ? <div className="p-8 text-center text-gray-500">No payments found for the selected filters.</div> :
        (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left font-medium text-gray-600 cursor-pointer" onClick={() => handleSort('first_name')}>Tenant</th>
                  <th className="p-3 text-left font-medium text-gray-600 cursor-pointer" onClick={() => handleSort('property_name')}>Property & Unit</th>
                  <th className="p-3 text-left font-medium text-gray-600 cursor-pointer" onClick={() => handleSort('amount')}>Amount</th>
                  <th className="p-3 text-left font-medium text-gray-600">M-Pesa Code</th>
                  <th className="p-3 text-left font-medium text-gray-600 cursor-pointer" onClick={() => handleSort('payment_date')}>Payment Date</th>
                  <th className="p-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="p-3">{p.first_name} {p.last_name}</td>
                    <td className="p-3">{p.property_name} - {p.unit_code}</td>
                    <td className="p-3 font-semibold">{formatCurrency(p.amount)}</td>
                    <td className="p-3 font-mono text-xs">{p.mpesa_receipt_number || 'N/A'}</td>
                    <td className="p-3">{formatDate(p.payment_date)}</td>
                    <td className="p-3">
                      <button onClick={() => handleViewHistory({id: p.tenant_id, name: `${p.first_name} ${p.last_name}`})} className="text-blue-600 hover:underline text-xs">View History</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
          <span>Page {pagination.currentPage} of {pagination.totalPages} ({pagination.totalCount} results)</span>
          <div className="flex gap-1">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 border rounded-lg disabled:opacity-50"><ChevronsLeft size={16}/></button>
            <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="p-2 border rounded-lg disabled:opacity-50"><ChevronLeft size={16}/></button>
            <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= pagination.totalPages} className="p-2 border rounded-lg disabled:opacity-50"><ChevronRight size={16}/></button>
            <button onClick={() => setCurrentPage(pagination.totalPages)} disabled={currentPage >= pagination.totalPages} className="p-2 border rounded-lg disabled:opacity-50"><ChevronsRight size={16}/></button>
          </div>
        </div>
      )}

      {/* Tenant History Modal */}
      {showTenantHistory && selectedTenant && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">Payment History: {selectedTenant.name}</h3>
              <button onClick={() => setShowTenantHistory(false)} className="p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
            </div>
            {loadingHistory ? <div className="p-8 text-center">Loading history...</div> :
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-800">Total Expected</p>
                  <p className="font-bold text-xl">{formatCurrency(tenantHistory.summary?.totalExpected)}</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm text-green-800">Total Paid</p>
                  <p className="font-bold text-xl">{formatCurrency(tenantHistory.summary?.totalPaid)}</p>
                </div>
                <div className={`p-3 rounded-lg ${tenantHistory.summary?.balance > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${tenantHistory.summary?.balance > 0 ? 'text-red-800' : 'text-gray-800'}`}>Current Balance</p>
                  <p className={`font-bold text-xl ${tenantHistory.summary?.balance > 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatCurrency(tenantHistory.summary?.balance)}</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Property</th>
                    <th className="p-2 text-left">Amount</th>
                    <th className="p-2 text-left">M-Pesa Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tenantHistory.payments?.map(p => (
                    <tr key={p.id}>
                      <td className="p-2">{formatDate(p.payment_date)}</td>
                      <td className="p-2">{p.property_name} - {p.unit_code}</td>
                      <td className="p-2">{formatCurrency(p.amount)}</td>
                      <td className="p-2 font-mono text-xs">{p.mpesa_receipt_number || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            }
            <div className="p-4 border-t flex justify-end">
              <button onClick={() => setShowTenantHistory(false)} className="bg-gray-200 px-4 py-2 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentManagement;