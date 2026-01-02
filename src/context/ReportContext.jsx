import React, { createContext, useState, useContext, useCallback } from 'react';
import { reportAPI } from '../services/api';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ExcelJS from 'exceljs';

const ReportContext = createContext(undefined);

export const useReport = () => {
  const context = useContext(ReportContext);
  if (!context) throw new Error('useReport must be used within a ReportProvider');
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

  // General error handler
  const handleError = (err, fallbackMessage) => {
    console.error(err);
    setError(fallbackMessage);
    setReportData(null);
  };

  // Fetch all reports metadata
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getReports();
      setReports(response.data.reports || []);
    } catch (err) {
      handleError(err, 'Failed to fetch reports');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Helper: add insights like growth rates & overdue payments
  const enrichFinancialReport = (report) => {
    if (!report) return {};
    const { summary, transactions } = report;

    // Calculate overdue payments
    const overduePayments = (transactions || []).filter(t => t.status !== 'completed');

    // Example: growthRate = comparison of last 30 days vs previous 30 days
    const growthRate = summary?.totalRevenue && summary?.previousRevenue
      ? ((summary.totalRevenue - summary.previousRevenue) / summary.previousRevenue) * 100
      : 0;

    return {
      ...report,
      summary: {
        ...summary,
        growthRate,
        overduePaymentsCount: overduePayments.length,
        overduePaymentsAmount: overduePayments.reduce((sum, t) => sum + t.amount, 0)
      }
    };
  };

  // Generate Financial Report
  const generateFinancialReport = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getFinancialReports(params);
      const report = enrichFinancialReport(response.data.report);

      setReportData(report);
      return report;
    } catch (err) {
      handleError(err, 'Failed to generate financial report');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate Occupancy Report
  const generateOccupancyReport = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getOccupancyReports(params);
      const report = response.data.report;
      setReportData(report);
      return report;
    } catch (err) {
      handleError(err, 'Failed to generate occupancy report');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate Revenue Report
  const generateRevenueReport = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getRevenueReports(params);
      const report = response.data.report;
      setReportData(report);
      return report;
    } catch (err) {
      handleError(err, 'Failed to generate revenue report');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Export Reports: PDF, Excel, CSV
  const exportReport = useCallback(async (format, reportType, filters) => {
    if (!reportData) return;

    setLoading(true);
    setError(null);
    try {
      const fileName = `${reportType}_report_${new Date().toISOString().split('T')[0]}`;

      if (format === 'pdf') {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(`${reportType.toUpperCase()} REPORT`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
        // Dynamic table
        if (reportType === 'financial') {
          const rows = (reportData.transactions || []).map(t => [
            new Date(t.payment_date).toLocaleDateString(),
            t.tenant_name,
            t.property_name,
            t.amount,
            t.status
          ]);
          doc.autoTable({
            head: [['Date', 'Tenant', 'Property', 'Amount', 'Status']],
            body: rows,
            startY: 35
          });
        }
        doc.save(`${fileName}.pdf`);
      } else if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Report');

        if (reportType === 'financial') {
          sheet.addRow(['Date', 'Tenant', 'Property', 'Amount', 'Status']);
          (reportData.transactions || []).forEach(t => {
            sheet.addRow([
              new Date(t.payment_date).toLocaleDateString(),
              t.tenant_name,
              t.property_name,
              t.amount,
              t.status
            ]);
          });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else if (format === 'csv') {
        let csvContent = '';
        if (reportType === 'financial') {
          csvContent += 'Date,Tenant,Property,Amount,Status\n';
          (reportData.transactions || []).forEach(t => {
            csvContent += `${new Date(t.payment_date).toLocaleDateString()},${t.tenant_name},${t.property_name},${t.amount},${t.status}\n`;
          });
        }
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      return true;
    } catch (err) {
      handleError(err, 'Failed to export report');
      return false;
    } finally {
      setLoading(false);
    }
  }, [reportData]);

  const getReportStats = useCallback(() => {
    const financialReports = reports.filter(r => r.type === 'financial').length;
    const occupancyReports = reports.filter(r => r.type === 'occupancy').length;
    const paymentReports = reports.filter(r => r.type === 'payment').length;
    const customReports = reports.filter(r => r.type === 'custom').length;

    return { total: reports.length, financial: financialReports, occupancy: occupancyReports, payment: paymentReports, custom: customReports };
  }, [reports]);

  const value = React.useMemo(() => ({
    reports,
    reportData,
    dateRange,
    loading,
    error,
    setReportData,
    setDateRange,
    clearError: () => setError(null),
    fetchReports,
    generateFinancialReport,
    generateOccupancyReport,
    generateRevenueReport,
    exportReport,
    getReportStats
  }), [
    reports,
    reportData,
    dateRange,
    loading,
    error,
    fetchReports,
    generateFinancialReport,
    generateOccupancyReport,
    generateRevenueReport,
    exportReport,
    getReportStats
  ]);

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
};
