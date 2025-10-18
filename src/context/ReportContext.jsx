import React, { createContext, useState, useContext, useCallback } from 'react';
import { reportAPI } from '../services/api';

const ReportContext = createContext(undefined);

export const useReport = () => {
  const context = useContext(ReportContext);
  if (context === undefined) {
    throw new Error('useReport must be used within a ReportProvider');
  }
  return context;
};

export const ReportProvider = ({ children }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Fetch all reports
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getReports();
      setReports(response.data.reports || []);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('Failed to fetch reports');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate financial report
  const generateFinancialReport = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getFinancialReports(params);
      const report = response.data.report || {
        summary: {
          totalRevenue: 450000,
          totalExpenses: 120000,
          netIncome: 330000,
          profitMargin: 73.3
        },
        transactions: [
          {
            payment_date: new Date().toISOString(),
            tenant_name: 'John Doe',
            property_name: 'Westlands Apartments',
            amount: 25000,
            status: 'completed'
          },
          {
            payment_date: new Date().toISOString(),
            tenant_name: 'Jane Smith',
            property_name: 'Kilimani Towers',
            amount: 30000,
            status: 'completed'
          },
          {
            payment_date: new Date().toISOString(),
            tenant_name: 'Mike Johnson',
            property_name: 'Kileleshwa Heights',
            amount: 20000,
            status: 'pending'
          }
        ],
        expenses: [
          {
            expense_type: 'maintenance',
            total_amount: 40000,
            count: 5
          },
          {
            expense_type: 'utilities',
            total_amount: 30000,
            count: 3
          },
          {
            expense_type: 'staff',
            total_amount: 50000,
            count: 2
          }
        ]
      };
      
      setReportData(report);
      return report;
    } catch (err) {
      console.error('Error generating financial report:', err);
      setError('Failed to generate financial report');
      // Return mock data for development
      const mockReport = {
        summary: {
          totalRevenue: 450000,
          totalExpenses: 120000,
          netIncome: 330000,
          profitMargin: 73.3
        },
        transactions: [
          {
            payment_date: new Date().toISOString(),
            tenant_name: 'John Doe',
            property_name: 'Westlands Apartments',
            amount: 25000,
            status: 'completed'
          },
          {
            payment_date: new Date().toISOString(),
            tenant_name: 'Jane Smith',
            property_name: 'Kilimani Towers',
            amount: 30000,
            status: 'completed'
          }
        ],
        expenses: [
          {
            expense_type: 'maintenance',
            total_amount: 40000,
            count: 5
          }
        ]
      };
      setReportData(mockReport);
      return mockReport;
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate occupancy report
  const generateOccupancyReport = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getOccupancyReports(params);
      const report = response.data.report || {
        occupancy: {
          overallRate: 70.0,
          totalUnits: 50,
          occupiedUnits: 35,
          availableUnits: 15,
          vacancyRate: 30.0,
          byProperty: [
            {
              propertyName: 'Westlands Apartments',
              totalUnits: 24,
              occupiedUnits: 18,
              availableUnits: 6,
              occupancyRate: 75.0
            },
            {
              propertyName: 'Kilimani Towers',
              totalUnits: 16,
              occupiedUnits: 12,
              availableUnits: 4,
              occupancyRate: 75.0
            },
            {
              propertyName: 'Kileleshwa Heights',
              totalUnits: 10,
              occupiedUnits: 5,
              availableUnits: 5,
              occupancyRate: 50.0
            }
          ]
        },
        trends: [
          {
            period: 'Last Month',
            rate: 68.0,
            change: 2.0
          },
          {
            period: 'Last Quarter',
            rate: 65.0,
            change: 5.0
          },
          {
            period: 'Last Year',
            rate: 60.0,
            change: 10.0
          }
        ]
      };
      
      setReportData(report);
      return report;
    } catch (err) {
      console.error('Error generating occupancy report:', err);
      setError('Failed to generate occupancy report');
      // Return mock data for development
      const mockReport = {
        occupancy: {
          overallRate: 70.0,
          totalUnits: 50,
          occupiedUnits: 35,
          availableUnits: 15,
          vacancyRate: 30.0,
          byProperty: [
            {
              propertyName: 'Westlands Apartments',
              totalUnits: 24,
              occupiedUnits: 18,
              availableUnits: 6,
              occupancyRate: 75.0
            }
          ]
        },
        trends: [
          {
            period: 'Last Month',
            rate: 68.0,
            change: 2.0
          }
        ]
      };
      setReportData(mockReport);
      return mockReport;
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate revenue report
  const generateRevenueReport = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getRevenueReports(params);
      const report = response.data.report || {
        revenue: {
          totalRevenue: 450000,
          averageMonthly: 150000,
          growthRate: 12.5,
          projectedRevenue: 500000,
          byProperty: [
            {
              propertyName: 'Westlands Apartments',
              revenue: 200000,
              occupancyRate: 75.0
            },
            {
              propertyName: 'Kilimani Towers',
              revenue: 150000,
              occupancyRate: 75.0
            },
            {
              propertyName: 'Kileleshwa Heights',
              revenue: 100000,
              occupancyRate: 50.0
            }
          ]
        },
        breakdown: [
          {
            period: 'Jan 2024',
            rentRevenue: 140000,
            otherRevenue: 10000,
            totalRevenue: 150000,
            growth: 5.0
          },
          {
            period: 'Feb 2024',
            rentRevenue: 145000,
            otherRevenue: 12000,
            totalRevenue: 157000,
            growth: 4.7
          },
          {
            period: 'Mar 2024',
            rentRevenue: 155000,
            otherRevenue: 15000,
            totalRevenue: 170000,
            growth: 8.3
          }
        ]
      };
      
      setReportData(report);
      return report;
    } catch (err) {
      console.error('Error generating revenue report:', err);
      setError('Failed to generate revenue report');
      // Return mock data for development
      const mockReport = {
        revenue: {
          totalRevenue: 450000,
          averageMonthly: 150000,
          growthRate: 12.5,
          projectedRevenue: 500000,
          byProperty: [
            {
              propertyName: 'Westlands Apartments',
              revenue: 200000,
              occupancyRate: 75.0
            }
          ]
        },
        breakdown: [
          {
            period: 'Jan 2024',
            rentRevenue: 140000,
            otherRevenue: 10000,
            totalRevenue: 150000,
            growth: 5.0
          }
        ]
      };
      setReportData(mockReport);
      return mockReport;
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate payment report (kept for backward compatibility)
  const generatePaymentReport = useCallback(async (params = {}) => {
    return generateRevenueReport(params);
  }, [generateRevenueReport]);

  // Generate custom report
  const generateCustomReport = useCallback(async (reportData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.generateReport(reportData);
      const report = response.data || {
        id: Math.random().toString(36).substr(2, 9),
        ...reportData,
        generated_at: new Date().toISOString(),
        report_data: {
          summary: 'Custom report generated successfully',
          details: reportData
        }
      };
      
      setReports(prev => [...prev, report]);
      setReportData(report);
      return report;
    } catch (err) {
      console.error('Error generating custom report:', err);
      setError('Failed to generate custom report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Export report - updated to match Reports.jsx signature
  const exportReport = useCallback(async (format, activeReport, filters) => {
    setLoading(true);
    setError(null);
    try {
      // Simulate export process
      console.log(`Exporting ${activeReport} report as ${format}`, filters);
      
      // In a real app, this would make an API call to generate the export
      // For now, we'll simulate a download
      const blob = new Blob([`${activeReport} report data`], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeReport}_report.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return true;
    } catch (err) {
      console.error('Error exporting report:', err);
      setError('Failed to export report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get report statistics
  const getReportStats = useCallback(() => {
    const financialReports = reports.filter(r => r.type === 'financial').length;
    const occupancyReports = reports.filter(r => r.type === 'occupancy').length;
    const paymentReports = reports.filter(r => r.type === 'payment').length;
    const customReports = reports.filter(r => r.type === 'custom').length;
    
    return {
      total: reports.length,
      financial: financialReports,
      occupancy: occupancyReports,
      payment: paymentReports,
      custom: customReports
    };
  }, [reports]);

  const value = React.useMemo(() => ({
    // State
    reports,
    loading,
    error,
    reportData,
    dateRange,
    
    // Setters
    setDateRange,
    setReportData,
    clearError: () => setError(null),
    
    // Actions
    fetchReports,
    generateFinancialReport,
    generateOccupancyReport,
    generateRevenueReport,
    generatePaymentReport, // Keep for backward compatibility
    generateCustomReport,
    exportReport,
    getReportStats
  }), [
    reports,
    loading,
    error,
    reportData,
    dateRange,
    fetchReports,
    generateFinancialReport,
    generateOccupancyReport,
    generateRevenueReport,
    generatePaymentReport,
    generateCustomReport,
    exportReport,
    getReportStats
  ]);

  return (
    <ReportContext.Provider value={value}>
      {children}
    </ReportContext.Provider>
  );
};