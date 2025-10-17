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
  const [generatedReport, setGeneratedReport] = useState(null);

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
        id: Math.random().toString(36).substr(2, 9),
        type: 'financial',
        period: params.period || 'monthly',
        start_date: params.start_date || new Date().toISOString().slice(0, 10),
        end_date: params.end_date || new Date().toISOString().slice(0, 10),
        total_income: 450000,
        total_expenses: 120000,
        net_profit: 330000,
        generated_at: new Date().toISOString(),
        data: {
          rent_payments: 400000,
          other_income: 50000,
          maintenance_costs: 40000,
          staff_salaries: 60000,
          utilities: 20000
        }
      };
      
      setGeneratedReport(report);
      return report;
    } catch (err) {
      console.error('Error generating financial report:', err);
      setError('Failed to generate financial report');
      throw err;
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
        id: Math.random().toString(36).substr(2, 9),
        type: 'occupancy',
        period: params.period || 'monthly',
        start_date: params.start_date || new Date().toISOString().slice(0, 10),
        end_date: params.end_date || new Date().toISOString().slice(0, 10),
        total_units: 50,
        occupied_units: 35,
        vacant_units: 15,
        occupancy_rate: 70.0,
        generated_at: new Date().toISOString(),
        data: {
          by_property: [
            {
              property_name: 'Westlands Apartments',
              total_units: 24,
              occupied_units: 18,
              vacant_units: 6,
              occupancy_rate: 75.0
            },
            {
              property_name: 'Kilimani Towers',
              total_units: 16,
              occupied_units: 12,
              vacant_units: 4,
              occupancy_rate: 75.0
            },
            {
              property_name: 'Kileleshwa Heights',
              total_units: 10,
              occupied_units: 5,
              vacant_units: 5,
              occupancy_rate: 50.0
            }
          ]
        }
      };
      
      setGeneratedReport(report);
      return report;
    } catch (err) {
      console.error('Error generating occupancy report:', err);
      setError('Failed to generate occupancy report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate payment report
  const generatePaymentReport = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getPaymentReports(params);
      const report = response.data.report || {
        id: Math.random().toString(36).substr(2, 9),
        type: 'payment',
        period: params.period || 'monthly',
        start_date: params.start_date || new Date().toISOString().slice(0, 10),
        end_date: params.end_date || new Date().toISOString().slice(0, 10),
        total_collected: 350000,
        total_pending: 50000,
        collection_rate: 87.5,
        generated_at: new Date().toISOString(),
        data: {
          on_time_payments: 28,
          late_payments: 7,
          pending_payments: 5,
          by_property: [
            {
              property_name: 'Westlands Apartments',
              collected: 180000,
              pending: 20000,
              collection_rate: 90.0
            },
            {
              property_name: 'Kilimani Towers',
              collected: 120000,
              pending: 20000,
              collection_rate: 85.7
            },
            {
              property_name: 'Kileleshwa Heights',
              collected: 50000,
              pending: 10000,
              collection_rate: 83.3
            }
          ]
        }
      };
      
      setGeneratedReport(report);
      return report;
    } catch (err) {
      console.error('Error generating payment report:', err);
      setError('Failed to generate payment report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

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
      setGeneratedReport(report);
      return report;
    } catch (err) {
      console.error('Error generating custom report:', err);
      setError('Failed to generate custom report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Export report
  const exportReport = useCallback(async (reportId, format = 'pdf') => {
    setLoading(true);
    setError(null);
    try {
      // Simulate export process
      const report = reports.find(r => r.id === reportId) || generatedReport;
      if (report) {
        // In a real app, this would download the file
        console.log(`Exporting report ${reportId} as ${format}`, report);
        alert(`Report exported as ${format.toUpperCase()} successfully!`);
      }
    } catch (err) {
      console.error('Error exporting report:', err);
      setError('Failed to export report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [reports, generatedReport]);

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
    reports,
    loading,
    error,
    generatedReport,
    setGeneratedReport,
    fetchReports,
    generateFinancialReport,
    generateOccupancyReport,
    generatePaymentReport,
    generateCustomReport,
    exportReport,
    getReportStats,
    clearError: () => setError(null)
  }), [
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
    getReportStats
  ]);

  return (
    <ReportContext.Provider value={value}>
      {children}
    </ReportContext.Provider>
  );
};