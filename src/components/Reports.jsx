import React, { useState, useEffect } from 'react';
import { useReport } from '../context/ReportContext';
import { useProperty } from '../context/PropertyContext';

const Reports = () => {
  const { properties } = useProperty();
  const {
    reportData,
    loading,
    dateRange = { startDate: '', endDate: '' }, // Add default value
    setDateRange,
    generateFinancialReport,
    generateOccupancyReport,
    generateRevenueReport,
    exportReport
  } = useReport();

  const [activeReport, setActiveReport] = useState('financial');
  const [filters, setFilters] = useState({
    propertyId: '',
    groupBy: 'month'
  });

  useEffect(() => {
    // Load default report when component mounts
    generateFinancialReport();
  }, []);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleDateChange = (key, value) => {
    setDateRange(prev => ({ 
      ...(prev || { startDate: '', endDate: '' }), // Safe access
      [key]: value 
    }));
  };

  const handleGenerateReport = async () => {
    try {
      const reportFilters = {
        ...filters,
        startDate: dateRange?.startDate || new Date().toISOString().split('T')[0],
        endDate: dateRange?.endDate || new Date().toISOString().split('T')[0]
      };

      switch (activeReport) {
        case 'financial':
          await generateFinancialReport(reportFilters);
          break;
        case 'occupancy':
          await generateOccupancyReport(reportFilters);
          break;
        case 'revenue':
          await generateRevenueReport(reportFilters);
          break;
        default:
          await generateFinancialReport(reportFilters);
      }
    } catch (error) {
      alert('Error generating report: ' + error.message);
    }
  };

  const handleExport = async (format) => {
    try {
      await exportReport(format, activeReport, {
        ...filters,
        startDate: dateRange?.startDate || new Date().toISOString().split('T')[0],
        endDate: dateRange?.endDate || new Date().toISOString().split('T')[0]
      });
      alert(`Report exported successfully as ${format.toUpperCase()}`);
    } catch (error) {
      alert('Error exporting report: ' + error.message);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-KE');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Advanced Reports & Analytics</h1>
        <p className="text-gray-600">Generate detailed financial, occupancy, and revenue reports</p>
      </div>

      {/* Report Controls */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {/* Report Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
            <select
              value={activeReport}
              onChange={(e) => setActiveReport(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="financial">Financial Report</option>
              <option value="occupancy">Occupancy Analytics</option>
              <option value="revenue">Revenue Tracking</option>
            </select>
          </div>

          {/* Property Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Property</label>
            <select
              value={filters.propertyId}
              onChange={(e) => handleFilterChange('propertyId', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Properties</option>
              {properties.map(property => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="date"
              value={dateRange?.startDate ? new Date(dateRange.startDate).toISOString().split('T')[0] : ''}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="date"
              value={dateRange?.endDate ? new Date(dateRange.endDate).toISOString().split('T')[0] : ''}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Group By for Revenue Report */}
        {activeReport === 'revenue' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Group By</label>
            <select
              value={filters.groupBy}
              onChange={(e) => handleFilterChange('groupBy', e.target.value)}
              className="w-full md:w-64 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-4">
          <button
            onClick={handleGenerateReport}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          
          {reportData && (
            <div className="flex space-x-2">
              <button
                onClick={() => handleExport('pdf')}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Export PDF
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Export CSV
              </button>
              <button
                onClick={() => handleExport('excel')}
                className="bg-green-700 text-white px-4 py-2 rounded-md hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Export Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Report Display */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {reportData && !loading && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          {/* Report Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900 capitalize">
                {activeReport} Report
              </h2>
              <p className="text-gray-600">
                {formatDate(dateRange?.startDate)} - {formatDate(dateRange?.endDate)}
                {filters.propertyId && ` • ${properties.find(p => p.id === filters.propertyId)?.name}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Generated on</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date().toLocaleDateString('en-KE')}
              </p>
            </div>
          </div>

          {/* Financial Report */}
          {activeReport === 'financial' && reportData.summary && (
            <FinancialReportView data={reportData} formatCurrency={formatCurrency} />
          )}

          {/* Occupancy Report */}
          {activeReport === 'occupancy' && reportData.occupancy && (
            <OccupancyReportView data={reportData} properties={properties} />
          )}

          {/* Revenue Report */}
          {activeReport === 'revenue' && reportData.revenue && (
            <RevenueReportView data={reportData} formatCurrency={formatCurrency} />
          )}
        </div>
      )}
    </div>
  );
};

// Financial Report Component
const FinancialReportView = ({ data, formatCurrency }) => {
  const { summary, transactions, expenses } = data;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-800">Total Revenue</h3>
          <p className="text-2xl font-bold text-green-900">
            {formatCurrency(summary?.totalRevenue || 0)}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-red-800">Total Expenses</h3>
          <p className="text-2xl font-bold text-red-900">
            {formatCurrency(summary?.totalExpenses || 0)}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800">Net Income</h3>
          <p className="text-2xl font-bold text-blue-900">
            {formatCurrency(summary?.netIncome || 0)}
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-purple-800">Profit Margin</h3>
          <p className="text-2xl font-bold text-purple-900">
            {summary?.profitMargin || 0}%
          </p>
        </div>
      </div>

      {/* Transactions Table */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Property</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(transactions || []).slice(0, 10).map((transaction, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(transaction.payment_date).toLocaleDateString('en-KE')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transaction.tenant_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transaction.property_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      transaction.status === 'completed' 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {transaction.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expense Breakdown */}
      {expenses && expenses.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Expense Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {expenses.map((expense, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 capitalize">{expense.expense_type}</h4>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(expense.total_amount)}
                </p>
                <p className="text-sm text-gray-500">
                  {expense.count} expense{expense.count !== 1 ? 's' : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Occupancy Report Component
const OccupancyReportView = ({ data, properties }) => {
  const { occupancy, trends } = data;

  return (
    <div className="space-y-6">
      {/* Overall Occupancy */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800">Overall Occupancy Rate</h3>
          <p className="text-2xl font-bold text-blue-900">
            {occupancy?.overallRate || 0}%
          </p>
          <p className="text-sm text-blue-700">
            {occupancy?.occupiedUnits || 0} / {occupancy?.totalUnits || 0} units occupied
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-800">Available Units</h3>
          <p className="text-2xl font-bold text-green-900">
            {occupancy?.availableUnits || 0}
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-orange-800">Vacancy Rate</h3>
          <p className="text-2xl font-bold text-orange-900">
            {occupancy?.vacancyRate || 0}%
          </p>
        </div>
      </div>

      {/* Property-wise Occupancy */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Occupancy by Property</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Property</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Units</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Occupied</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Occupancy Rate</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(occupancy?.byProperty || []).map((property, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {property.propertyName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {property.totalUnits}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {property.occupiedUnits}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {property.availableUnits}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-gray-900 mr-2">
                        {property.occupancyRate}%
                      </span>
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ width: `${property.occupancyRate}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Occupancy Trends */}
      {trends && trends.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Occupancy Trends</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {trends.map((trend, index) => (
                <div key={index} className="text-center">
                  <p className="text-sm text-gray-600">{trend.period}</p>
                  <p className="text-lg font-bold text-gray-900">{trend.rate}%</p>
                  <p className={`text-xs ${trend.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {trend.change >= 0 ? '↑' : '↓'} {Math.abs(trend.change)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Revenue Report Component
const RevenueReportView = ({ data, formatCurrency }) => {
  const { revenue, breakdown } = data;

  return (
    <div className="space-y-6">
      {/* Revenue Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-800">Total Revenue</h3>
          <p className="text-2xl font-bold text-green-900">
            {formatCurrency(revenue?.totalRevenue || 0)}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800">Average Monthly</h3>
          <p className="text-2xl font-bold text-blue-900">
            {formatCurrency(revenue?.averageMonthly || 0)}
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-purple-800">Growth Rate</h3>
          <p className="text-2xl font-bold text-purple-900">
            {revenue?.growthRate || 0}%
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-orange-800">Projected Revenue</h3>
          <p className="text-2xl font-bold text-orange-900">
            {formatCurrency(revenue?.projectedRevenue || 0)}
          </p>
        </div>
      </div>

      {/* Revenue Breakdown */}
      {breakdown && breakdown.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Revenue Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rent Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Other Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Growth</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {breakdown.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.period}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(item.rentRevenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(item.otherRevenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(item.totalRevenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${
                        item.growth >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {item.growth >= 0 ? '↑' : '↓'} {Math.abs(item.growth)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Revenue by Property */}
      {revenue?.byProperty && revenue.byProperty.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Revenue by Property</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {revenue.byProperty.map((property, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900">{property.propertyName}</h4>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(property.revenue)}
                </p>
                <p className="text-sm text-gray-500">
                  {property.occupancyRate}% occupancy
                </p>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{ width: `${(property.revenue / revenue.totalRevenue) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;