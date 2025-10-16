import React, { createContext, useState, useContext } from 'react';

const ReportContext = createContext();

export const useReport = () => {
  const context = useContext(ReportContext);
  if (!context) {
    throw new Error('useReport must be used within a ReportProvider');
  }
  return context;
};

export const ReportProvider = ({ children }) => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // First day of current month
    endDate: new Date()
  });

  const generateFinancialReport = async (filters = {}) => {
    setLoading(true);
    try {
      const response = await fetch('/api/reports/financial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          startDate: filters.startDate || dateRange.startDate,
          endDate: filters.endDate || dateRange.endDate,
          propertyId: filters.propertyId,
          reportType: filters.reportType
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      setReportData(data);
      return data;
    } catch (error) {
      console.error('Error generating financial report:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const generateOccupancyReport = async (filters = {}) => {
    setLoading(true);
    try {
      const response = await fetch('/api/reports/occupancy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          startDate: filters.startDate || dateRange.startDate,
          endDate: filters.endDate || dateRange.endDate,
          propertyId: filters.propertyId
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      setReportData(data);
      return data;
    } catch (error) {
      console.error('Error generating occupancy report:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const generateRevenueReport = async (filters = {}) => {
    setLoading(true);
    try {
      const response = await fetch('/api/reports/revenue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          startDate: filters.startDate || dateRange.startDate,
          endDate: filters.endDate || dateRange.endDate,
          propertyId: filters.propertyId,
          groupBy: filters.groupBy || 'month'
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      setReportData(data);
      return data;
    } catch (error) {
      console.error('Error generating revenue report:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (format = 'pdf', reportType, filters = {}) => {
    try {
      const response = await fetch(`/api/reports/export?format=${format}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          reportType,
          ...filters,
          startDate: filters.startDate || dateRange.startDate,
          endDate: filters.endDate || dateRange.endDate
        })
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}_report.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error('Error exporting report:', error);
      throw error;
    }
  };

  const value = {
    reportData,
    loading,
    dateRange,
    setDateRange,
    generateFinancialReport,
    generateOccupancyReport,
    generateRevenueReport,
    exportReport
  };

  return (
    <ReportContext.Provider value={value}>
      {children}
    </ReportContext.Provider>
  );
};