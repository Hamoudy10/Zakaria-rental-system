import React, { createContext, useState, useContext, useCallback } from 'react';
import { reportAPI, API } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

const ReportContext = createContext(undefined);

export const useReport = () => {
  const context = useContext(ReportContext);
  if (!context) throw new Error('useReport must be used within a ReportProvider');
  return context;
};

// Default company branding (fallback)
const DEFAULT_COMPANY = {
  name: 'Zakaria Housing Agency Limited',
  email: '',
  phone: '',
  address: '',
  logo: ''
};

// Cache for company info
let cachedCompanyInfo = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch company info from API with caching
 */
const fetchCompanyInfo = async () => {
  const now = Date.now();
  
  if (cachedCompanyInfo && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
    return cachedCompanyInfo;
  }
  
  try {
    const response = await API.settings.getCompanyInfo();
    if (response.data?.success) {
      cachedCompanyInfo = response.data.data;
      cacheTimestamp = now;
      return cachedCompanyInfo;
    }
  } catch (error) {
    console.warn('Could not fetch company info for export:', error);
  }
  
  return DEFAULT_COMPANY;
};

/**
 * Convert image URL to base64 for PDF embedding
 */
const getImageAsBase64 = async (imageUrl) => {
  if (!imageUrl) return null;
  
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Could not load company logo:', error);
    return null;
  }
};

export const ReportProvider = ({ children }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [generatedReport, setGeneratedReport] = useState(null);
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
      setReports(response.data.reports || response.data.data || []);
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

    const overduePayments = (transactions || []).filter(t => t.status !== 'completed');

    const growthRate = summary?.totalRevenue && summary?.previousRevenue
      ? ((summary.totalRevenue - summary.previousRevenue) / summary.previousRevenue) * 100
      : 0;

    return {
      ...report,
      summary: {
        ...summary,
        growthRate,
        overduePaymentsCount: overduePayments.length,
        overduePaymentsAmount: overduePayments.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
      }
    };
  };

  // Generate Financial Report
  const generateFinancialReport = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getFinancialReports(params);
      const report = enrichFinancialReport(response.data.report || response.data.data);
      
      const enrichedReport = {
        ...report,
        type: 'financial',
        generated_at: new Date().toISOString(),
        ...params
      };

      setReportData(report);
      setGeneratedReport(enrichedReport);
      return enrichedReport;
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
      const report = response.data.report || response.data.data;
      
      const enrichedReport = {
        ...report,
        type: 'occupancy',
        generated_at: new Date().toISOString(),
        ...params
      };

      setReportData(report);
      setGeneratedReport(enrichedReport);
      return enrichedReport;
    } catch (err) {
      handleError(err, 'Failed to generate occupancy report');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate Payment Report
  const generatePaymentReport = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.getPaymentReports(params);
      const report = response.data.report || response.data.data;
      
      const enrichedReport = {
        ...report,
        type: 'payment',
        generated_at: new Date().toISOString(),
        ...params
      };

      setReportData(report);
      setGeneratedReport(enrichedReport);
      return enrichedReport;
    } catch (err) {
      handleError(err, 'Failed to generate payment report');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate Custom Report
  const generateCustomReport = useCallback(async (customData = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await reportAPI.generateReport(customData);
      const report = response.data.report || response.data.data;
      
      const enrichedReport = {
        ...report,
        type: 'custom',
        title: customData.title,
        description: customData.description,
        generated_at: new Date().toISOString()
      };

      setReportData(report);
      setGeneratedReport(enrichedReport);
      return enrichedReport;
    } catch (err) {
      handleError(err, 'Failed to generate custom report');
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
      const response = await reportAPI.getFinancialReports(params);
      const report = response.data.report || response.data.data;
      
      const enrichedReport = {
        ...report,
        type: 'revenue',
        generated_at: new Date().toISOString(),
        ...params
      };

      setReportData(report);
      setGeneratedReport(enrichedReport);
      return enrichedReport;
    } catch (err) {
      handleError(err, 'Failed to generate revenue report');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // EXPORT TO PDF WITH COMPANY BRANDING
  // ============================================
  const exportToPDF = useCallback(async (reportType, data, filters = {}) => {
    try {
      // Fetch company info
      const companyInfo = await fetchCompanyInfo();
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 15;

      // Try to add company logo
      if (companyInfo.logo) {
        try {
          const logoBase64 = await getImageAsBase64(companyInfo.logo);
          if (logoBase64) {
            const logoSize = 18;
            const logoX = (pageWidth - logoSize) / 2;
            doc.addImage(logoBase64, 'AUTO', logoX, yPos, logoSize, logoSize);
            yPos += logoSize + 5;
          }
        } catch (logoError) {
          console.warn('Could not add logo to PDF:', logoError);
        }
      }

      // Company Name
      doc.setFontSize(16);
      doc.setTextColor(30, 64, 175);
      doc.setFont('helvetica', 'bold');
      doc.text(companyInfo.name || DEFAULT_COMPANY.name, pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;

      // Contact Info
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');

      const contactParts = [];
      if (companyInfo.address) contactParts.push(companyInfo.address);
      if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
      if (companyInfo.email) contactParts.push(`Email: ${companyInfo.email}`);

      if (contactParts.length > 0) {
        doc.text(contactParts.join(' | '), pageWidth / 2, yPos, { align: 'center' });
        yPos += 5;
      }

      // Divider
      yPos += 3;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, pageWidth - 14, yPos);
      yPos += 8;

      // Report Title
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      const reportTitle = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`;
      doc.text(reportTitle, pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      // Metadata
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
      yPos += 5;

      if (filters.period) {
        doc.text(`Period: ${filters.period}`, 14, yPos);
        yPos += 5;
      }

      if (filters.start_date && filters.end_date) {
        doc.text(`Date Range: ${filters.start_date} to ${filters.end_date}`, 14, yPos);
        yPos += 5;
      }

      yPos += 5;

      // Table data based on report type
      let tableData = { head: [], body: [] };

      if (reportType === 'financial' && data?.transactions) {
        tableData.head = [['Date', 'Tenant', 'Property', 'Amount (KSh)', 'Status']];
        tableData.body = data.transactions.map(t => [
          t.payment_date ? new Date(t.payment_date).toLocaleDateString() : 'N/A',
          t.tenant_name || 'N/A',
          t.property_name || 'N/A',
          (parseFloat(t.amount) || 0).toLocaleString(),
          t.status || 'Pending'
        ]);
      } else if (reportType === 'occupancy' && data?.properties) {
        tableData.head = [['Property', 'Total Units', 'Occupied', 'Vacant', 'Occupancy %']];
        tableData.body = data.properties.map(p => [
          p.name || 'N/A',
          p.total_units || 0,
          p.occupied_units || 0,
          p.vacant_units || 0,
          `${p.occupancy_rate || 0}%`
        ]);
      } else if (reportType === 'payment' && data?.payments) {
        tableData.head = [['Date', 'Tenant', 'Amount (KSh)', 'Method', 'Status']];
        tableData.body = data.payments.map(p => [
          p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A',
          p.tenant_name || 'N/A',
          (parseFloat(p.amount) || 0).toLocaleString(),
          p.payment_method || 'M-Pesa',
          p.status || 'Pending'
        ]);
      } else if (data?.data && Array.isArray(data.data)) {
        // Generic data handling
        const firstItem = data.data[0] || {};
        const keys = Object.keys(firstItem).slice(0, 6);
        tableData.head = [keys.map(k => k.replace(/_/g, ' ').toUpperCase())];
        tableData.body = data.data.map(item => 
          keys.map(k => {
            const val = item[k];
            if (typeof val === 'number') return val.toLocaleString();
            if (val instanceof Date) return val.toLocaleDateString();
            return val || 'N/A';
          })
        );
      }

      // Generate table if we have data
      if (tableData.body.length > 0) {
        autoTable(doc, {
          head: tableData.head,
          body: tableData.body,
          startY: yPos,
          margin: { left: 14, right: 14, bottom: 25 },
          headStyles: {
            fillColor: [30, 64, 175],
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold'
          },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          theme: 'striped',
          didDrawPage: (pageData) => {
            // Footer on each page
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(
              `${companyInfo.name || DEFAULT_COMPANY.name} - Confidential`,
              14,
              doc.internal.pageSize.getHeight() - 10
            );
            doc.text(
              `Page ${pageData.pageNumber} of ${pageCount}`,
              pageWidth - 14,
              doc.internal.pageSize.getHeight() - 10,
              { align: 'right' }
            );
          }
        });

        // Add summary if available
        const finalY = doc.lastAutoTable?.finalY || yPos + 50;
        
        if (data?.summary && finalY < doc.internal.pageSize.getHeight() - 50) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 64, 175);
          
          let summaryY = finalY + 10;
          doc.text('Summary:', 14, summaryY);
          summaryY += 6;
          
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          
          Object.entries(data.summary).forEach(([key, value]) => {
            if (typeof value !== 'object') {
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              const displayValue = typeof value === 'number' 
                ? (key.includes('rate') || key.includes('Rate') ? `${value}%` : `KSh ${value.toLocaleString()}`)
                : value;
              doc.text(`${label}: ${displayValue}`, 14, summaryY);
              summaryY += 5;
            }
          });
        }
      } else {
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text('No data available for this report.', pageWidth / 2, yPos + 20, { align: 'center' });
      }

      // Save PDF
      const fileName = `${reportType}_report_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      console.log('✅ PDF exported successfully:', fileName);
      return true;
    } catch (error) {
      console.error('PDF export failed:', error);
      throw error;
    }
  }, []);

  // ============================================
  // EXPORT TO EXCEL WITH COMPANY BRANDING
  // ============================================
  const exportToExcel = useCallback(async (reportType, data, filters = {}) => {
    try {
      // Fetch company info
      const companyInfo = await fetchCompanyInfo();

      const workbook = new ExcelJS.Workbook();
      workbook.creator = companyInfo.name || DEFAULT_COMPANY.name;
      workbook.created = new Date();
      
      const sheet = workbook.addWorksheet(`${reportType} Report`);

      // Company Header
      const row1 = sheet.addRow([companyInfo.name || DEFAULT_COMPANY.name]);
      row1.font = { size: 16, bold: true, color: { argb: 'FF1E40AF' } };
      row1.alignment = { horizontal: 'center' };
      sheet.mergeCells('A1:F1');

      // Contact Info
      const contactParts = [];
      if (companyInfo.address) contactParts.push(companyInfo.address);
      if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
      if (companyInfo.email) contactParts.push(`Email: ${companyInfo.email}`);

      if (contactParts.length > 0) {
        const row2 = sheet.addRow([contactParts.join(' | ')]);
        row2.font = { size: 10, color: { argb: 'FF6B7280' } };
        row2.alignment = { horizontal: 'center' };
        sheet.mergeCells('A2:F2');
      }

      sheet.addRow([]);

      // Report Title
      const titleRow = sheet.addRow([`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`]);
      titleRow.font = { size: 14, bold: true };
      titleRow.alignment = { horizontal: 'center' };
      sheet.mergeCells(`A${sheet.rowCount}:F${sheet.rowCount}`);

      sheet.addRow([]);

      // Metadata
      sheet.addRow(['Generated:', new Date().toLocaleString()]);
      if (filters.period) {
        sheet.addRow(['Period:', filters.period]);
      }
      if (filters.start_date && filters.end_date) {
        sheet.addRow(['Date Range:', `${filters.start_date} to ${filters.end_date}`]);
      }

      sheet.addRow([]);

      // Data based on report type
      let headers = [];
      let rows = [];

      if (reportType === 'financial' && data?.transactions) {
        headers = ['Date', 'Tenant', 'Property', 'Amount (KSh)', 'Status'];
        rows = data.transactions.map(t => [
          t.payment_date ? new Date(t.payment_date).toLocaleDateString() : 'N/A',
          t.tenant_name || 'N/A',
          t.property_name || 'N/A',
          parseFloat(t.amount) || 0,
          t.status || 'Pending'
        ]);
      } else if (reportType === 'occupancy' && data?.properties) {
        headers = ['Property', 'Total Units', 'Occupied', 'Vacant', 'Occupancy %'];
        rows = data.properties.map(p => [
          p.name || 'N/A',
          p.total_units || 0,
          p.occupied_units || 0,
          p.vacant_units || 0,
          (p.occupancy_rate || 0) / 100
        ]);
      } else if (reportType === 'payment' && data?.payments) {
        headers = ['Date', 'Tenant', 'Amount (KSh)', 'Method', 'Status'];
        rows = data.payments.map(p => [
          p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A',
          p.tenant_name || 'N/A',
          parseFloat(p.amount) || 0,
          p.payment_method || 'M-Pesa',
          p.status || 'Pending'
        ]);
      } else if (data?.data && Array.isArray(data.data)) {
        const firstItem = data.data[0] || {};
        headers = Object.keys(firstItem).slice(0, 6).map(k => 
          k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        );
        rows = data.data.map(item => 
          Object.keys(item).slice(0, 6).map(k => item[k] || 'N/A')
        );
      }

      // Add headers
      if (headers.length > 0) {
        const headerRow = sheet.addRow(headers);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E40AF' }
          };
          cell.alignment = { horizontal: 'center' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });

        // Add data rows
        rows.forEach((rowData, index) => {
          const row = sheet.addRow(rowData);
          row.eachCell((cell, colNumber) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
              left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
              bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
              right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };

            if (index % 2 === 1) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8FAFC' }
              };
            }

            // Format numbers and percentages
            if (typeof rowData[colNumber - 1] === 'number') {
              if (headers[colNumber - 1]?.includes('%')) {
                cell.numFmt = '0%';
              } else if (headers[colNumber - 1]?.includes('Amount') || headers[colNumber - 1]?.includes('KSh')) {
                cell.numFmt = '#,##0';
              }
            }
          });
        });
      }

      // Add summary if available
      if (data?.summary) {
        sheet.addRow([]);
        const summaryTitleRow = sheet.addRow(['Summary']);
        summaryTitleRow.font = { bold: true, size: 12, color: { argb: 'FF1E40AF' } };

        Object.entries(data.summary).forEach(([key, value]) => {
          if (typeof value !== 'object') {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const row = sheet.addRow([label, value]);
            row.getCell(1).font = { bold: true };
          }
        });
      }

      // Add footer
      sheet.addRow([]);
      const footerRow = sheet.addRow([`${companyInfo.name || DEFAULT_COMPANY.name} - Confidential Report`]);
      footerRow.font = { italic: true, color: { argb: 'FF9CA3AF' } };
      footerRow.alignment = { horizontal: 'center' };
      sheet.mergeCells(`A${sheet.rowCount}:F${sheet.rowCount}`);

      // Auto-fit columns
      sheet.columns.forEach((column) => {
        let maxLength = 10;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const cellLength = cell.value ? cell.value.toString().length : 0;
          if (cellLength > maxLength) maxLength = cellLength;
        });
        column.width = Math.min(maxLength + 2, 40);
      });

      // Generate and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const fileName = `${reportType}_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log('✅ Excel exported successfully:', fileName);
      return true;
    } catch (error) {
      console.error('Excel export failed:', error);
      throw error;
    }
  }, []);

  // ============================================
  // MAIN EXPORT FUNCTION
  // ============================================
  const exportReport = useCallback(async (reportIdOrFormat, formatOrReportType, filtersOrUndefined) => {
    // Handle both old signature (reportId, format) and new signature (format, reportType, filters)
    let format, reportType, data, filters;

    if (typeof reportIdOrFormat === 'string' && ['pdf', 'excel', 'csv'].includes(reportIdOrFormat)) {
      // New signature: exportReport('pdf', 'financial', filters)
      format = reportIdOrFormat;
      reportType = formatOrReportType || generatedReport?.type || 'report';
      data = reportData || generatedReport;
      filters = filtersOrUndefined || {};
    } else {
      // Old signature: exportReport(reportId, 'pdf')
      format = formatOrReportType;
      reportType = generatedReport?.type || 'report';
      data = reportData || generatedReport;
      filters = {};
    }

    if (!data) {
      setError('No report data available. Please generate a report first.');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      if (format === 'pdf') {
        await exportToPDF(reportType, data, filters);
      } else if (format === 'excel') {
        await exportToExcel(reportType, data, filters);
      } else if (format === 'csv') {
        // CSV export (simple, no company branding needed)
        let csvContent = '';
        
        if (reportType === 'financial' && data?.transactions) {
          csvContent += 'Date,Tenant,Property,Amount,Status\n';
          data.transactions.forEach(t => {
            csvContent += `${t.payment_date ? new Date(t.payment_date).toLocaleDateString() : 'N/A'},${t.tenant_name || 'N/A'},${t.property_name || 'N/A'},${t.amount || 0},${t.status || 'Pending'}\n`;
          });
        } else if (reportType === 'occupancy' && data?.properties) {
          csvContent += 'Property,Total Units,Occupied,Vacant,Occupancy Rate\n';
          data.properties.forEach(p => {
            csvContent += `${p.name || 'N/A'},${p.total_units || 0},${p.occupied_units || 0},${p.vacant_units || 0},${p.occupancy_rate || 0}%\n`;
          });
        } else if (reportType === 'payment' && data?.payments) {
          csvContent += 'Date,Tenant,Amount,Method,Status\n';
          data.payments.forEach(p => {
            csvContent += `${p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'},${p.tenant_name || 'N/A'},${p.amount || 0},${p.payment_method || 'M-Pesa'},${p.status || 'Pending'}\n`;
          });
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const fileName = `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        console.log('✅ CSV exported successfully:', fileName);
      }

      return true;
    } catch (err) {
      handleError(err, `Failed to export report as ${format.toUpperCase()}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [reportData, generatedReport, exportToPDF, exportToExcel]);

  const getReportStats = useCallback(() => {
    const safeReports = Array.isArray(reports) ? reports : [];
    const financialReports = safeReports.filter(r => r.type === 'financial').length;
    const occupancyReports = safeReports.filter(r => r.type === 'occupancy').length;
    const paymentReports = safeReports.filter(r => r.type === 'payment').length;
    const customReports = safeReports.filter(r => r.type === 'custom').length;

    return { 
      total: safeReports.length, 
      financial: financialReports, 
      occupancy: occupancyReports, 
      payment: paymentReports, 
      custom: customReports 
    };
  }, [reports]);

  const value = React.useMemo(() => ({
    reports,
    reportData,
    generatedReport,
    dateRange,
    loading,
    error,
    setReportData,
    setDateRange,
    clearError: () => setError(null),
    fetchReports,
    generateFinancialReport,
    generateOccupancyReport,
    generatePaymentReport,
    generateCustomReport,
    generateRevenueReport,
    exportReport,
    getReportStats
  }), [
    reports,
    reportData,
    generatedReport,
    dateRange,
    loading,
    error,
    fetchReports,
    generateFinancialReport,
    generateOccupancyReport,
    generatePaymentReport,
    generateCustomReport,
    generateRevenueReport,
    exportReport,
    getReportStats
  ]);

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
};

// Export cache clear function
export const clearCompanyInfoCache = () => {
  cachedCompanyInfo = null;
  cacheTimestamp = null;
};