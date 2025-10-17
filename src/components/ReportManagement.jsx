import React, { useState, useEffect } from 'react';
import { useReport } from '../context/ReportContext';

const ReportsManagement = () => {
  const {
    reports,
    loading,
    error,
    generatedReport,
    fetchReports,
    generateFinancialReport,
    generateOccupancyReport,
    generatePaymentReport,
    generateCustomReport,
    exportReport,
    getReportStats,
    clearError
  } = useReport();

  const [selectedReportType, setSelectedReportType] = useState('financial');
  const [reportParams, setReportParams] = useState({
    period: 'monthly',
    start_date: '',
    end_date: '',
    property_id: ''
  });
  const [customReportData, setCustomReportData] = useState({
    title: '',
    description: '',
    report_type: 'custom',
    filters: {}
  });

  // SAFE CHECK: Ensure data is always arrays
  const safeReports = Array.isArray(reports) ? reports : [];

  // Load reports on component mount
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Set default date range to current month
  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    setReportParams(prev => ({
      ...prev,
      start_date: firstDay.toISOString().split('T')[0],
      end_date: lastDay.toISOString().split('T')[0]
    }));
  }, []);

  const handleGenerateReport = async () => {
    clearError();
    
    try {
      let report;
      switch (selectedReportType) {
        case 'financial':
          report = await generateFinancialReport(reportParams);
          break;
        case 'occupancy':
          report = await generateOccupancyReport(reportParams);
          break;
        case 'payment':
          report = await generatePaymentReport(reportParams);
          break;
        case 'custom':
          report = await generateCustomReport(customReportData);
          break;
        default:
          throw new Error('Invalid report type');
      }
      
      console.log('Report generated:', report);
    } catch (error) {
      console.error('Error generating report:', error);
    }
  };

  const handleExportReport = (format) => {
    if (generatedReport) {
      exportReport(generatedReport.id, format);
    } else {
      alert('Please generate a report first');
    }
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
    try {
      return new Date(dateString).toLocaleDateString('en-KE');
    } catch {
      return 'Invalid Date';
    }
  };

  // Get report statistics
  const reportStats = getReportStats();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Generating report...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reports & Analytics</h2>
          <p className="text-gray-600">Generate and export various business reports</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button 
            onClick={clearError}
            className="float-right text-red-800 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{reportStats.total}</div>
            <div className="text-sm text-gray-600">Total Reports</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{reportStats.financial}</div>
            <div className="text-sm text-gray-600">Financial</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{reportStats.occupancy}</div>
            <div className="text-sm text-gray-600">Occupancy</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{reportStats.payment}</div>
            <div className="text-sm text-gray-600">Payment</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-600">{reportStats.custom}</div>
            <div className="text-sm text-gray-600">Custom</div>
          </div>
        </div>
      </div>

      {/* Report Generator */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Generate Report</h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Report Type Selection */}
          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
            <div className="space-y-2">
              {[
                { value: 'financial', label: 'Financial Report', icon: '💰' },
                { value: 'occupancy', label: 'Occupancy Report', icon: '🏠' },
                { value: 'payment', label: 'Payment Report', icon: '💳' },
                { value: 'custom', label: 'Custom Report', icon: '📊' }
              ].map(type => (
                <button
                  key={type.value}
                  onClick={() => setSelectedReportType(type.value)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                    selectedReportType === type.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-xl">{type.icon}</span>
                    <span className="font-medium">{type.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Report Parameters */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Period</label>
                <select
                  value={reportParams.period}
                  onChange={(e) => setReportParams({...reportParams, period: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              
              {reportParams.period === 'custom' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Start Date</label>
                    <input
                      type="date"
                      value={reportParams.start_date}
                      onChange={(e) => setReportParams({...reportParams, start_date: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">End Date</label>
                    <input
                      type="date"
                      value={reportParams.end_date}
                      onChange={(e) => setReportParams({...reportParams, end_date: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}
            </div>

            {selectedReportType === 'custom' && (
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Report Title</label>
                  <input
                    type="text"
                    value={customReportData.title}
                    onChange={(e) => setCustomReportData({...customReportData, title: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter report title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={customReportData.description}
                    onChange={(e) => setCustomReportData({...customReportData, description: e.target.value})}
                    rows={3}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe the purpose of this report"
                  />
                </div>
              </div>
            )}

            <div className="flex space-x-4">
              <button
                onClick={handleGenerateReport}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
              >
                Generate Report
              </button>
              {generatedReport && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExportReport('pdf')}
                    className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
                  >
                    Export PDF
                  </button>
                  <button
                    onClick={() => handleExportReport('excel')}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                  >
                    Export Excel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Generated Report Display */}
      {generatedReport && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              Generated Report: {generatedReport.type?.charAt(0).toUpperCase() + generatedReport.type?.slice(1)}
            </h3>
            <div className="text-sm text-gray-500">
              Generated on: {formatDate(generatedReport.generated_at)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {generatedReport.total_income !== undefined && (
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(generatedReport.total_income)}
                </div>
                <div className="text-sm text-green-800">Total Income</div>
              </div>
            )}
            {generatedReport.total_expenses !== undefined && (
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(generatedReport.total_expenses)}
                </div>
                <div className="text-sm text-red-800">Total Expenses</div>
              </div>
            )}
            {generatedReport.net_profit !== undefined && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(generatedReport.net_profit)}
                </div>
                <div className="text-sm text-blue-800">Net Profit</div>
              </div>
            )}
            {generatedReport.occupancy_rate !== undefined && (
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {generatedReport.occupancy_rate}%
                </div>
                <div className="text-sm text-purple-800">Occupancy Rate</div>
              </div>
            )}
            {generatedReport.collection_rate !== undefined && (
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {generatedReport.collection_rate}%
                </div>
                <div className="text-sm text-orange-800">Collection Rate</div>
              </div>
            )}
          </div>

          {/* Detailed Data */}
          {generatedReport.data && (
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Detailed Breakdown</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(generatedReport.data).map(([key, value]) => (
                      <tr key={key}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                          {key.replace(/_/g, ' ')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {typeof value === 'number' ? formatCurrency(value) : value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Previous Reports */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Previous Reports ({safeReports.length})</h3>
        
        {safeReports.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📋</div>
            <p>No reports generated yet</p>
            <p className="text-sm">Generate your first report to see it here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Report
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Generated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {safeReports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {report.title || `${report.type} Report`}
                      </div>
                      <div className="text-sm text-gray-500">
                        {report.description || 'No description'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${report.type === 'financial' ? 'bg-green-100 text-green-800' : 
                          report.type === 'occupancy' ? 'bg-purple-100 text-purple-800' : 
                          report.type === 'payment' ? 'bg-orange-100 text-orange-800' : 
                          'bg-indigo-100 text-indigo-800'}`}>
                        {report.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {report.period || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(report.generated_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => exportReport(report.id, 'pdf')}
                        className="text-red-600 hover:text-red-900 whitespace-nowrap"
                      >
                        Export PDF
                      </button>
                      <button
                        onClick={() => exportReport(report.id, 'excel')}
                        className="text-green-600 hover:text-green-900 whitespace-nowrap"
                      >
                        Export Excel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsManagement;