// /src/components/AgentReports.jsx - COMPLETELY UPDATED WITH FIXED API CALLS
import React, { useState, useEffect } from 'react';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  Users, CreditCard, TrendingUp, Building, 
  AlertCircle, Droplets, MessageSquare, 
  FileText, FileSpreadsheet, Calendar, 
  Filter, Search, AlertTriangle, RefreshCw
} from 'lucide-react';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';

const AgentReports = () => {
  const { user } = useAuth();
  const [activeReport, setActiveReport] = useState('tenants');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    propertyId: '',
    status: '',
    search: ''
  });
  const [companyInfo, setCompanyInfo] = useState({
    name: 'Zakaria Housing Agency Limited',
    logo: null
  });
  const [apiErrors, setApiErrors] = useState([]);
  const [availableProperties, setAvailableProperties] = useState([]);

  const reportTypes = [
    { id: 'tenants', name: 'Tenants Report', icon: Users, color: 'bg-blue-500' },
    { id: 'payments', name: 'Payments Report', icon: CreditCard, color: 'bg-green-500' },
    { id: 'revenue', name: 'Revenue Report', icon: TrendingUp, color: 'bg-purple-500' },
    { id: 'properties', name: 'Properties Report', icon: Building, color: 'bg-orange-500' },
    { id: 'complaints', name: 'Complaints Report', icon: AlertCircle, color: 'bg-red-500' },
    { id: 'water', name: 'Water Bills Report', icon: Droplets, color: 'bg-cyan-500' },
    { id: 'sms', name: 'SMS Report', icon: MessageSquare, color: 'bg-indigo-500' },
  ];

  // Fetch company settings from admin settings
  useEffect(() => {
    const fetchCompanyInfo = async () => {
      try {
        const response = await API.settings.getSettings();
        if (response.data?.success) {
          const settings = response.data.data;
          const companyNameSetting = settings.find(s => s.setting_key === 'company_name');
          if (companyNameSetting) {
            setCompanyInfo(prev => ({ ...prev, name: companyNameSetting.setting_value }));
          }
        }
      } catch (error) {
        console.warn('Could not fetch company info:', error);
        setCompanyInfo(prev => ({ ...prev, name: 'Zakaria Housing Agency Limited' }));
      }
    };
    
    fetchCompanyInfo();
  }, []);

  // Fetch available properties for agent
  useEffect(() => {
    const fetchAgentProperties = async () => {
      try {
        const response = await API.properties.getAgentProperties();
        if (response.data?.success) {
          setAvailableProperties(response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch agent properties:', error);
        setAvailableProperties([]);
      }
    };
    
    fetchAgentProperties();
  }, []);

  // Debug function to check API structure
  const debugAPIStructure = () => {
    console.log('🔍 Checking API structure...');
    const modules = Object.keys(API);
    console.log('Available API modules:', modules);
    
    modules.forEach(module => {
      console.log(`API.${module}:`, Object.keys(API[module] || {}));
    });
    
    return modules;
  };

  // Safe API call wrapper
  const safeAPICall = async (apiFunction, fallbackData = []) => {
    try {
      if (typeof apiFunction === 'function') {
        console.log('🔗 Making API call...');
        const response = await apiFunction();
        console.log('✅ API Response:', response);
        return response;
      }
      throw new Error('API function not available');
    } catch (error) {
      console.error('❌ API call failed:', error);
      return { 
        data: { 
          success: false, 
          message: error.message, 
          data: fallbackData 
        } 
      };
    }
  };

  // Direct API call with fetch for endpoints not in API service
  const directAPICall = async (endpoint, method = 'GET', params = {}) => {
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'https://zakaria-rental-system.onrender.com/api';
      const token = localStorage.getItem('token');
      
      let url = `${baseURL}${endpoint}`;
      
      // Add query params for GET requests
      if (method === 'GET' && Object.keys(params).length > 0) {
        const queryParams = new URLSearchParams(params).toString();
        url = `${url}?${queryParams}`;
      }
      
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
      
      if (method !== 'GET' && Object.keys(params).length > 0) {
        options.body = JSON.stringify(params);
      }
      
      console.log(`🌐 ${method} ${url}`, params);
      const response = await fetch(url, options);
      const data = await response.json();
      
      return { data };
    } catch (error) {
      console.error(`❌ Direct API call failed for ${endpoint}:`, error);
      return { 
        data: { 
          success: false, 
          message: error.message,
          data: [] 
        } 
      };
    }
  };

  // Helper to calculate revenue from payments
  const calculateRevenue = (payments) => {
    const revenueByMonth = payments.reduce((acc, payment) => {
      const month = payment.payment_month || 
                   payment.created_at?.substring(0, 7) || 
                   new Date().toISOString().substring(0, 7);
      
      if (!acc[month]) {
        acc[month] = {
          month,
          total_revenue: 0,
          payment_count: 0,
          properties: new Set(),
          tenants: new Set()
        };
      }
      
      acc[month].total_revenue += parseFloat(payment.amount || 0);
      acc[month].payment_count += 1;
      
      if (payment.property_name) acc[month].properties.add(payment.property_name);
      if (payment.tenant_name || payment.first_name) {
        const tenantName = payment.tenant_name || `${payment.first_name || ''} ${payment.last_name || ''}`.trim();
        if (tenantName) acc[month].tenants.add(tenantName);
      }
      
      return acc;
    }, {});
    
    return Object.values(revenueByMonth).map(item => ({
      ...item,
      property_count: item.properties.size,
      tenant_count: item.tenants.size,
      average_payment: item.payment_count > 0 ? item.total_revenue / item.payment_count : 0
    }));
  };

  // Fetch report data based on active report
  const fetchReportData = async () => {
    setLoading(true);
    setApiErrors([]);
    
    try {
      console.log('📥 Fetching report data for:', activeReport);
      
      let response;
      const params = {
        ...filters
      };

      // Debug current API structure
      debugAPIStructure();

      switch (activeReport) {
        case 'tenants':
          // Use agent assigned tenants endpoint
          response = await directAPICall('/agent-properties/my-tenants', 'GET', params);
          break;
          
        case 'payments':
          // Use payments endpoint - backend should filter by agent
          response = await safeAPICall(() => API.payments.getPayments(params));
          break;
          
        case 'properties':
          // Use agent assigned properties endpoint
          response = await safeAPICall(() => API.properties.getAgentProperties());
          break;
          
        case 'complaints':
          // Use agent assigned complaints endpoint
          response = await directAPICall('/agent-properties/my-complaints', 'GET', params);
          break;
          
        case 'water':
          // Use water bills endpoint
          response = await directAPICall('/water-bills', 'GET', params);
          break;
          
        case 'sms':
          // Use SMS history endpoint
          response = await safeAPICall(() => API.billing.getSMSHistory(params));
          break;
          
        case 'revenue':
          // Calculate revenue from payments data
          const paymentsResponse = await safeAPICall(() => API.payments.getPayments(params));
          if (paymentsResponse.data?.success) {
            const revenueData = calculateRevenue(paymentsResponse.data.data || []);
            response = { data: { success: true, data: revenueData } };
          } else {
            response = { data: { success: false, data: [] } };
          }
          break;
          
        default:
          response = { data: { success: true, data: [] } };
      }

      console.log('📦 Final response for', activeReport, ':', response);

      if (response?.data?.success) {
        setData(response.data.data || []);
        console.log(`✅ Loaded ${response.data.data?.length || 0} records for ${activeReport} report`);
      } else {
        console.warn('❌ Report fetch failed:', response?.data?.message || 'Unknown error');
        setData([]);
        setApiErrors(prev => [...prev, 
          `${activeReport} report: ${response?.data?.message || 'API endpoint may not exist'}`
        ]);
      }
    } catch (error) {
      console.error('❌ Fetch error:', error);
      setData([]);
      setApiErrors(prev => [...prev, `Error: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when report type or filters change
  useEffect(() => {
    fetchReportData();
  }, [activeReport, filters]);

  const handleExport = async (format) => {
    if (data.length === 0) {
      alert('No data to export. Please wait for data to load or check if the report has any records.');
      return;
    }

    try {
      const reportTitle = reportTypes.find(r => r.id === activeReport)?.name;
      
      if (format === 'pdf') {
        await exportToPDF({
          reportType: activeReport,
          data: data,
          filters: filters,
          companyInfo: companyInfo,
          user: user,
          title: reportTitle
        });
      } else if (format === 'excel') {
        await exportToExcel({
          reportType: activeReport,
          data: data,
          filters: filters,
          companyInfo: companyInfo,
          user: user,
          title: reportTitle
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error.message}\n\nPlease check that jspdf-autotable is installed:\nnpm install jspdf-autotable`);
    }
  };

  const renderFilters = () => {
    return (
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="self-center">to</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          
          {availableProperties.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property
              </label>
              <select
                value={filters.propertyId}
                onChange={(e) => setFilters({ ...filters, propertyId: e.target.value })}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Properties</option>
                {availableProperties.map(prop => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name} ({prop.property_code})
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="block w-full pl-10 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          
          <button
            onClick={fetchReportData}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          
          <button
            onClick={() => setFilters({
              startDate: '',
              endDate: '',
              propertyId: '',
              status: '',
              search: ''
            })}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>
      </div>
    );
  };

  const renderTable = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="ml-3 text-gray-600">Loading report data...</div>
        </div>
      );
    }

    if (!data || data.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-2">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
            No data available for this report
          </div>
          <div className="text-sm text-gray-500 mb-4">
            This could be because:
            <ul className="mt-2 text-left max-w-md mx-auto">
              <li>• No records exist for this report type</li>
              <li>• Backend endpoint needs to be configured</li>
              <li>• Your filters are too restrictive</li>
            </ul>
          </div>
          {apiErrors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg text-left max-w-md mx-auto">
              <div className="text-sm font-medium text-red-800">Debug Info:</div>
              <div className="text-xs text-red-600 mt-1">
                {apiErrors.map((error, idx) => (
                  <div key={idx}>• {error}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Render different tables based on report type
    switch (activeReport) {
      case 'tenants':
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.slice(0, 10).map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.first_name || item.name} {item.last_name || ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.phone_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.property_name || item.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.unit_code || item.property_code || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      KSh {(parseFloat(item.rent_amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        item.is_active || item.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.is_active ? 'Active' : (item.status || 'Inactive')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        
      case 'properties':
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Units</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Occupied</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.slice(0, 10).map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.property_code || item.id?.substring(0, 8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.address || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.total_units || item.unit_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.occupied_units || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.available_units || item.available_units_count || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        
      default:
        // Generic table for other reports
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.slice(0, 10).map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.id?.substring(0, 8) || index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.name || item.first_name || item.tenant_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        item.status === 'completed' || item.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : item.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      KSh {(parseFloat(item.amount) || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  };

  const getReportStats = () => {
    const count = data.length;
    let totalAmount = 0;
    
    if (activeReport === 'payments' || activeReport === 'revenue') {
      totalAmount = data.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    } else if (activeReport === 'tenants') {
      totalAmount = data.reduce((sum, item) => sum + (parseFloat(item.rent_amount) || 0), 0);
    }
    
    return { count, totalAmount };
  };

  const stats = getReportStats();

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">
            Generate and export detailed reports for your assigned properties
          </p>
          {apiErrors.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-sm text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              Some features may need backend configuration
            </div>
          )}
        </div>
        
        <div className="flex gap-3 mt-4 md:mt-0">
          <button
            onClick={() => handleExport('pdf')}
            disabled={data.length === 0 || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              data.length === 0 || loading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={data.length === 0 || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              data.length === 0 || loading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Report Type Selection */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-6">
        {reportTypes.map((report) => (
          <button
            key={report.id}
            onClick={() => setActiveReport(report.id)}
            disabled={loading}
            className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
              activeReport === report.id
                ? `${report.color} text-white border-transparent shadow-md`
                : loading
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            <report.icon className="w-5 h-5 mb-2" />
            <span className="text-xs font-medium text-center">{report.name}</span>
          </button>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Total Records</div>
          <div className="text-2xl font-bold mt-1">{stats.count}</div>
          <div className="text-xs text-gray-400 mt-1">in this report</div>
        </div>
        {(activeReport === 'payments' || activeReport === 'revenue' || activeReport === 'tenants') && (
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-500">Total Amount</div>
            <div className="text-2xl font-bold mt-1 text-green-600">
              KSh {stats.totalAmount.toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-1">sum of all amounts</div>
          </div>
        )}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Generated By</div>
          <div className="text-lg font-medium mt-1">
            {user?.first_name} {user?.last_name}
          </div>
          <div className="text-xs text-gray-400 mt-1">{user?.role || 'agent'}</div>
        </div>
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Report Content */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {reportTypes.find(r => r.id === activeReport)?.name}
            </h2>
            <div className="text-sm text-gray-500">
              Generated: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {renderTable()}
        </div>
        
        {/* Export info footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              {data.length} records • Export to PDF or Excel
            </div>
            <div className="text-xs text-gray-400">
              Showing first {Math.min(data.length, 10)} of {data.length} records
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-2">
          <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Building className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="font-medium">{companyInfo.name}</div>
            <div>Agent Reports System • {new Date().getFullYear()}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentReports;