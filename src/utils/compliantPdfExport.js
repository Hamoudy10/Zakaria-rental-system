// ============================================
// ADD THIS TO YOUR src/utils/pdfExport.js OR CREATE NEW FILE
// Complaint PDF Export Utility
// ============================================

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { settingsAPI } from '../services/api';

// Cache for company info
let companyInfoCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch company info with caching
const getCompanyInfo = async () => {
  const now = Date.now();
  
  if (companyInfoCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
    return companyInfoCache;
  }
  
  try {
    const response = await settingsAPI.getCompanyInfo();
    companyInfoCache = response.data?.data || response.data || {};
    cacheTimestamp = now;
    return companyInfoCache;
  } catch (error) {
    console.error('Error fetching company info:', error);
    return {
      company_name: 'Zakaria Rental System',
      company_address: '',
      company_phone: '',
      company_email: ''
    };
  }
};

// Clear cache (call when company info is updated)
export const clearCompanyInfoCache = () => {
  companyInfoCache = null;
  cacheTimestamp = null;
};

// Complaint categories mapping
const CATEGORY_LABELS = {
  plumbing: '🔧 Plumbing',
  electrical: '⚡ Electrical',
  structural: '🏗️ Structural',
  appliance: '🔌 Appliance',
  security: '🔒 Security',
  cleanliness: '🧹 Cleanliness',
  pest_control: '🐛 Pest Control',
  noise: '🔊 Noise',
  parking: '🚗 Parking',
  water: '💧 Water Issues',
  other: '📝 Other'
};

// Format date
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Get category labels
const getCategoryLabels = (complaint) => {
  const categories = complaint.categories || [complaint.category];
  return categories.map(catId => CATEGORY_LABELS[catId] || catId).join(', ');
};

// Get status label
const getStatusLabel = (status) => {
  const labels = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed'
  };
  return labels[status] || status;
};

// Calculate steps progress
const getStepsProgress = (steps) => {
  if (!steps || steps.length === 0) return 'No steps';
  const completed = steps.filter(s => s.is_completed).length;
  return `${completed}/${steps.length} completed`;
};

// Export complaints to PDF
export const exportComplaintsToPDF = async (complaints, options = {}) => {
  const {
    title = 'Complaints Report',
    includeSteps = true,
    filterStatus = null // 'open', 'in_progress', 'resolved', or null for all
  } = options;
  
  // Filter complaints if needed
  let filteredComplaints = complaints;
  if (filterStatus) {
    filteredComplaints = complaints.filter(c => c.status === filterStatus);
  }
  
  // Get company info
  const companyInfo = await getCompanyInfo();
  
  // Create PDF
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Colors
  const primaryColor = [37, 99, 235]; // Blue
  const textColor = [55, 65, 81]; // Gray
  const lightGray = [243, 244, 246];
  
  // Add header
  const addHeader = () => {
    // Company logo placeholder (if logo URL exists, you'd load and add it here)
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    // Company name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(companyInfo.company_name || 'Zakaria Rental System', 14, 12);
    
    // Company details
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const details = [
      companyInfo.company_address,
      companyInfo.company_phone,
      companyInfo.company_email
    ].filter(Boolean).join(' | ');
    doc.text(details, 14, 19);
    
    // Report title
    doc.setTextColor(...textColor);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 35);
    
    // Date generated
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${formatDate(new Date())}`, 14, 42);
    doc.text(`Total Complaints: ${filteredComplaints.length}`, 14, 48);
    
    // Stats summary
    const stats = {
      open: filteredComplaints.filter(c => c.status === 'open').length,
      in_progress: filteredComplaints.filter(c => c.status === 'in_progress').length,
      resolved: filteredComplaints.filter(c => c.status === 'resolved').length
    };
    doc.text(`Open: ${stats.open} | In Progress: ${stats.in_progress} | Resolved: ${stats.resolved}`, pageWidth - 14, 42, { align: 'right' });
  };
  
  // Add footer
  const addFooter = (pageNum, totalPages) => {
    doc.setFillColor(...lightGray);
    doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
    
    doc.setTextColor(...textColor);
    doc.setFontSize(8);
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 4, { align: 'center' });
    doc.text(companyInfo.company_name || 'Zakaria Rental System', 14, pageHeight - 4);
    doc.text(formatDate(new Date()), pageWidth - 14, pageHeight - 4, { align: 'right' });
  };
  
  addHeader();
  
  // Prepare table data
  const tableData = filteredComplaints.map(complaint => {
    const steps = complaint.steps || [];
    const stepsProgress = getStepsProgress(steps);
    
    // Format steps details
    let stepsDetails = '';
    if (includeSteps && steps.length > 0) {
      stepsDetails = steps.map((step, i) => {
        const status = step.is_completed ? '✓' : '○';
        return `${status} ${i + 1}. ${step.step_description}`;
      }).join('\n');
    }
    
    return [
      `${complaint.tenant_first_name || ''} ${complaint.tenant_last_name || ''}`.trim() || 'Unknown',
      complaint.property_name || 'N/A',
      complaint.unit_code || 'N/A',
      getCategoryLabels(complaint),
      complaint.title || 'N/A',
      getStatusLabel(complaint.status),
      stepsProgress,
      formatDate(complaint.raised_at),
      complaint.status === 'resolved' ? formatDate(complaint.resolved_at) : 'N/A'
    ];
  });
  
  // Create table
  doc.autoTable({
    startY: 55,
    head: [[
      'Tenant',
      'Property',
      'Unit',
      'Categories',
      'Title',
      'Status',
      'Steps Progress',
      'Date Raised',
      'Date Resolved'
    ]],
    body: tableData,
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineColor: [229, 231, 235],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left'
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251]
    },
    columnStyles: {
      0: { cellWidth: 30 }, // Tenant
      1: { cellWidth: 30 }, // Property
      2: { cellWidth: 20 }, // Unit
      3: { cellWidth: 35 }, // Categories
      4: { cellWidth: 45 }, // Title
      5: { cellWidth: 22 }, // Status
      6: { cellWidth: 25 }, // Steps Progress
      7: { cellWidth: 30 }, // Date Raised
      8: { cellWidth: 30 }, // Date Resolved
    },
    didDrawPage: (data) => {
      // Add footer on each page
      const totalPages = doc.internal.getNumberOfPages();
      addFooter(data.pageNumber, totalPages);
    },
    margin: { top: 55, bottom: 15 }
  });
  
  // If includeSteps, add detailed steps section
  if (includeSteps) {
    const complaintsWithSteps = filteredComplaints.filter(c => c.steps && c.steps.length > 0);
    
    if (complaintsWithSteps.length > 0) {
      doc.addPage();
      
      // Section header
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Detailed Steps by Complaint', 14, 10);
      
      let yPos = 25;
      
      for (const complaint of complaintsWithSteps) {
        // Check if we need a new page
        if (yPos > pageHeight - 50) {
          doc.addPage();
          yPos = 20;
        }
        
        // Complaint header
        doc.setTextColor(...primaryColor);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${complaint.title}`, 14, yPos);
        
        doc.setTextColor(...textColor);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        yPos += 5;
        doc.text(`Tenant: ${complaint.tenant_first_name} ${complaint.tenant_last_name} | Unit: ${complaint.unit_code} | Status: ${getStatusLabel(complaint.status)}`, 14, yPos);
        
        yPos += 7;
        
        // Steps
        for (const step of complaint.steps.sort((a, b) => a.step_order - b.step_order)) {
          const checkbox = step.is_completed ? '[✓]' : '[ ]';
          const stepText = `${checkbox} Step ${step.step_order}: ${step.step_description}`;
          
          doc.setFont('helvetica', step.is_completed ? 'normal' : 'bold');
          doc.setTextColor(step.is_completed ? 100 : 55, step.is_completed ? 100 : 65, step.is_completed ? 100 : 81);
          
          // Wrap text if too long
          const lines = doc.splitTextToSize(stepText, pageWidth - 28);
          for (const line of lines) {
            if (yPos > pageHeight - 20) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(line, 20, yPos);
            yPos += 5;
          }
          
          if (step.is_completed && step.completed_at) {
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(`Completed: ${formatDate(step.completed_at)}`, 25, yPos);
            yPos += 4;
          }
        }
        
        yPos += 8;
        
        // Separator line
        doc.setDrawColor(229, 231, 235);
        doc.line(14, yPos - 3, pageWidth - 14, yPos - 3);
      }
    }
  }
  
  // Update footers on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(i, totalPages);
  }
  
  // Save the PDF
  const fileName = `complaints_report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  
  return { success: true, fileName };
};

// Export single complaint to PDF
export const exportSingleComplaintToPDF = async (complaint) => {
  const companyInfo = await getCompanyInfo();
  
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Colors
  const primaryColor = [37, 99, 235];
  const textColor = [55, 65, 81];
  
  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 30, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(companyInfo.company_name || 'Zakaria Rental System', 14, 15);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Complaint Details Report', 14, 23);
  
  // Complaint info
  let yPos = 45;
  
  doc.setTextColor(...textColor);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(complaint.title, 14, yPos);
  
  yPos += 10;
  
  // Status and Priority badges
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Info grid
  const infoItems = [
    ['Tenant', `${complaint.tenant_first_name} ${complaint.tenant_last_name}`],
    ['Property', complaint.property_name],
    ['Unit', complaint.unit_code],
    ['Status', getStatusLabel(complaint.status)],
    ['Priority', complaint.priority?.charAt(0).toUpperCase() + complaint.priority?.slice(1)],
    ['Categories', getCategoryLabels(complaint)],
    ['Date Raised', formatDate(complaint.raised_at)],
    ['Date Resolved', complaint.resolved_at ? formatDate(complaint.resolved_at) : 'Not yet resolved']
  ];
  
  for (const [label, value] of infoItems) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(value || 'N/A', 50, yPos);
    yPos += 7;
  }
  
  yPos += 5;
  
  // Description
  doc.setFont('helvetica', 'bold');
  doc.text('Description:', 14, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  const descLines = doc.splitTextToSize(complaint.description || 'No description', pageWidth - 28);
  for (const line of descLines) {
    doc.text(line, 14, yPos);
    yPos += 5;
  }
  
  yPos += 10;
  
  // Steps
  if (complaint.steps && complaint.steps.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Resolution Steps', 14, yPos);
    
    const progress = getStepsProgress(complaint.steps);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`(${progress})`, 60, yPos);
    
    yPos += 8;
    
    for (const step of complaint.steps.sort((a, b) => a.step_order - b.step_order)) {
      const checkbox = step.is_completed ? '☑' : '☐';
      
      doc.setFont('helvetica', step.is_completed ? 'normal' : 'bold');
      doc.text(`${checkbox} Step ${step.step_order}: ${step.step_description}`, 14, yPos);
      
      if (step.is_completed && step.completed_at) {
        yPos += 5;
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`   Completed: ${formatDate(step.completed_at)}`, 14, yPos);
        doc.setTextColor(...textColor);
        doc.setFontSize(10);
      }
      
      yPos += 7;
    }
  }
  
  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated on ${formatDate(new Date())}`, 14, pageHeight - 10);
  doc.text(companyInfo.company_name || 'Zakaria Rental System', pageWidth - 14, pageHeight - 10, { align: 'right' });
  
  // Save
  const fileName = `complaint_${complaint.id}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  
  return { success: true, fileName };
};

export default {
  exportComplaintsToPDF,
  exportSingleComplaintToPDF,
  clearCompanyInfoCache
};