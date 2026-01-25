// src/utils/pdfExport.js

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { settingsAPI } from '../services/api';

// ============================================
// STATE & CACHING
// ============================================

// Cache for company info to prevent unnecessary API calls
let companyInfoCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Complaint categories mapping (for readable labels)
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

// ============================================
// HELPER FUNCTIONS
// ============================================

// Fetch company info with caching
const getCompanyInfo = async () => {
  const now = Date.now();
  
  // Return cached data if valid
  if (companyInfoCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
    return companyInfoCache;
  }
  
  try {
    const response = await settingsAPI.getCompanyInfo();
    // Handle different API response structures (data.data or just data)
    companyInfoCache = response.data?.data || response.data || {};
    cacheTimestamp = now;
    console.log("Company info fetched for PDF:", companyInfoCache);
    return companyInfoCache;
  } catch (error) {
    console.warn('Error fetching company info, using defaults:', error);
    // Return safe default to prevent crash
    return {
      company_name: 'Zakaria Rental System',
      company_address: '',
      company_phone: '',
      company_email: ''
    };
  }
};

// Clear cache (call this from settings page when info is updated)
export const clearCompanyInfoCache = () => {
  companyInfoCache = null;
  cacheTimestamp = null;
};

// Format date helper
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

// Get human-readable category labels
const getCategoryLabels = (complaint) => {
  const categories = complaint.categories || [complaint.category];
  // Filter out undefined/null and map to labels
  return categories
    .filter(Boolean)
    .map(catId => CATEGORY_LABELS[catId] || catId)
    .join(', ');
};

// Get formatted status label
const getStatusLabel = (status) => {
  if (!status) return 'Unknown';
  const labels = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed'
  };
  return labels[status] || status.replace('_', ' ');
};

// Calculate steps progress string
const getStepsProgress = (steps) => {
  if (!steps || steps.length === 0) return 'No steps';
  const completed = steps.filter(s => s.is_completed).length;
  return `${completed}/${steps.length}`;
};

// ============================================
// EXPORT FUNCTIONS
// ============================================

/**
 * Reusable function to add the standard company header to a doc
 * @param {Object} doc - jsPDF instance
 * @param {String} title - Report title
 * @param {Object} companyInfo - Company info object
 */
export const addCompanyHeader = (doc, title, companyInfo) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryColor = [37, 99, 235]; // Blue

  // Blue Background Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  // Company Name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(companyInfo.company_name || 'Zakaria Rental System', 14, 12);
  
  // Company Details (Address | Phone | Email)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const details = [
    companyInfo.company_address,
    companyInfo.company_phone,
    companyInfo.company_email
  ].filter(Boolean).join(' | ');
  doc.text(details, 14, 19);
  
  // Report Title (Below header)
  doc.setTextColor(55, 65, 81); // Dark Gray
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 35);
  
  // Return Y position where header ends
  return 35;
};

/**
 * Main function to export a list of complaints
 */
export const exportComplaintsToPDF = async (complaints, options = {}) => {
  const {
    title = 'Complaints Report',
    includeSteps = true,
    filterStatus = null
  } = options;
  
  // 1. Filter complaints if needed
  let filteredComplaints = complaints;
  if (filterStatus) {
    filteredComplaints = complaints.filter(c => c.status === filterStatus);
  }
  
  // 2. Get company info
  const companyInfo = await getCompanyInfo();
  
  // 3. Initialize PDF
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Colors
  const primaryColor = [37, 99, 235];
  const textColor = [55, 65, 81];
  const lightGray = [243, 244, 246];
  
  // 4. Draw Header using helper
  addCompanyHeader(doc, title, companyInfo);

  // 5. Add Meta Data (Date, Stats)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  
  doc.text(`Generated: ${formatDate(new Date())}`, 14, 42);
  doc.text(`Total Records: ${filteredComplaints.length}`, 14, 47);
  
  // Stats summary right aligned
  const stats = {
    open: filteredComplaints.filter(c => c.status === 'open').length,
    in_progress: filteredComplaints.filter(c => c.status === 'in_progress').length,
    resolved: filteredComplaints.filter(c => c.status === 'resolved').length
  };
  doc.text(`Open: ${stats.open} | In Progress: ${stats.in_progress} | Resolved: ${stats.resolved}`, pageWidth - 14, 42, { align: 'right' });
  
  // 6. Define Footer Helper
  const addFooter = (pageNum, totalPages) => {
    doc.setFillColor(...lightGray);
    doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
    
    doc.setTextColor(...textColor);
    doc.setFontSize(8);
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 4, { align: 'center' });
    doc.text(companyInfo.company_name || 'Zakaria Rental System', 14, pageHeight - 4);
    doc.text(formatDate(new Date()), pageWidth - 14, pageHeight - 4, { align: 'right' });
  };
  
  // 7. Prepare Table Data
  const tableData = filteredComplaints.map(complaint => {
    const steps = complaint.steps || [];
    const stepsProgress = getStepsProgress(steps);
    
    return [
      `${complaint.tenant_first_name || ''} ${complaint.tenant_last_name || ''}`.trim() || 'Unknown',
      complaint.property_name || 'N/A',
      complaint.unit_code || 'N/A',
      getCategoryLabels(complaint),
      complaint.title || 'N/A',
      getStatusLabel(complaint.status),
      stepsProgress,
      formatDate(complaint.raised_at),
      complaint.status === 'resolved' ? formatDate(complaint.resolved_at) : '-'
    ];
  });
  
  // 8. Generate Table
  doc.autoTable({
    startY: 55,
    head: [[
      'Tenant',
      'Property',
      'Unit',
      'Categories',
      'Title',
      'Status',
      'Steps',
      'Date Raised',
      'Resolved'
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
      2: { cellWidth: 15 }, // Unit
      3: { cellWidth: 30 }, // Categories
      4: { cellWidth: 45 }, // Title
      5: { cellWidth: 20 }, // Status
      6: { cellWidth: 15 }, // Steps
      7: { cellWidth: 30 }, // Raised
      8: { cellWidth: 30 }, // Resolved
    },
    didDrawPage: (data) => {
      // Add footer on each page
      const totalPages = doc.internal.getNumberOfPages();
      addFooter(data.pageNumber, totalPages);
    },
    margin: { top: 55, bottom: 15 }
  });
  
  // 9. Add Detailed Steps Section (Optional)
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
        // Page break check
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = 20;
        }
        
        // Complaint Title
        doc.setTextColor(...primaryColor);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${complaint.title}`, 14, yPos);
        
        // Metadata line
        doc.setTextColor(...textColor);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        yPos += 5;
        doc.text(`Tenant: ${complaint.tenant_first_name} ${complaint.tenant_last_name} | Unit: ${complaint.unit_code} | Status: ${getStatusLabel(complaint.status)}`, 14, yPos);
        
        yPos += 7;
        
        // List Steps
        const sortedSteps = [...(complaint.steps || [])].sort((a, b) => a.step_order - b.step_order);
        
        for (const step of sortedSteps) {
          const checkbox = step.is_completed ? '[X]' : '[ ]';
          const stepText = `${checkbox} Step ${step.step_order}: ${step.step_description}`;
          
          doc.setFont('helvetica', step.is_completed ? 'normal' : 'bold');
          doc.setTextColor(step.is_completed ? 100 : 55, step.is_completed ? 100 : 65, step.is_completed ? 100 : 81);
          
          // Text wrapping
          const lines = doc.splitTextToSize(stepText, pageWidth - 30);
          for (const line of lines) {
            if (yPos > pageHeight - 20) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(line, 20, yPos);
            yPos += 5;
          }
          
          // Completion date
          if (step.is_completed && step.completed_at) {
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(`   Completed: ${formatDate(step.completed_at)}`, 20, yPos);
            yPos += 4;
            doc.setFontSize(8); // Reset
          }
        }
        
        yPos += 8;
        // Separator
        doc.setDrawColor(229, 231, 235);
        doc.line(14, yPos - 3, pageWidth - 14, yPos - 3);
      }
    }
  }
  
  // 10. Update Total Pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(i, totalPages);
  }
  
  // 11. Save
  const fileName = `complaints_report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  
  return { success: true, fileName };
};

/**
 * Export a single complaint details to PDF
 */
export const exportSingleComplaintToPDF = async (complaint) => {
  const companyInfo = await getCompanyInfo();
  
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Colors
  const primaryColor = [37, 99, 235];
  const textColor = [55, 65, 81];
  
  // Header
  addCompanyHeader(doc, 'Complaint Details Report', companyInfo);
  
  // Main Content Start Position
  let yPos = 45;
  
  // Title
  doc.setTextColor(...textColor);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(complaint.title, pageWidth - 28);
  doc.text(titleLines, 14, yPos);
  
  yPos += (titleLines.length * 7) + 5;
  
  // Info Grid
  doc.setFontSize(10);
  const infoItems = [
    ['Tenant', `${complaint.tenant_first_name || ''} ${complaint.tenant_last_name || ''}`],
    ['Property', complaint.property_name],
    ['Unit', complaint.unit_code],
    ['Status', getStatusLabel(complaint.status)],
    ['Priority', (complaint.priority || '').charAt(0).toUpperCase() + (complaint.priority || '').slice(1)],
    ['Categories', getCategoryLabels(complaint)],
    ['Date Raised', formatDate(complaint.raised_at)],
    ['Date Resolved', complaint.resolved_at ? formatDate(complaint.resolved_at) : 'Not yet resolved']
  ];
  
  infoItems.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(value || 'N/A', 50, yPos);
    yPos += 7;
  });
  
  yPos += 5;
  
  // Description
  doc.setFont('helvetica', 'bold');
  doc.text('Description:', 14, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  const descLines = doc.splitTextToSize(complaint.description || 'No description provided.', pageWidth - 28);
  doc.text(descLines, 14, yPos);
  
  yPos += (descLines.length * 5) + 10;
  
  // Steps Section
  if (complaint.steps && complaint.steps.length > 0) {
    // Check space
    if (yPos > pageHeight - 50) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFillColor(...primaryColor);
    doc.rect(14, yPos, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Resolution Progress', 16, yPos + 5.5);
    
    // Progress %
    const progress = getStepsProgress(complaint.steps);
    doc.text(progress, pageWidth - 16, yPos + 5.5, { align: 'right' });
    
    yPos += 15;
    doc.setTextColor(...textColor);
    
    const sortedSteps = [...complaint.steps].sort((a, b) => a.step_order - b.step_order);
    
    for (const step of sortedSteps) {
      const checkbox = step.is_completed ? '☑' : '☐';
      
      doc.setFont('helvetica', step.is_completed ? 'normal' : 'bold');
      const stepText = `${checkbox} Step ${step.step_order}: ${step.step_description}`;
      
      const lines = doc.splitTextToSize(stepText, pageWidth - 28);
      
      if (yPos + (lines.length * 5) > pageHeight - 20) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(lines, 14, yPos);
      yPos += (lines.length * 5);
      
      if (step.is_completed && step.completed_at) {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`   Completed: ${formatDate(step.completed_at)}`, 14, yPos);
        doc.setTextColor(...textColor);
        doc.setFontSize(10);
        yPos += 5;
      }
      yPos += 3; // Spacing
    }
  }
  
  // Footer
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
  clearCompanyInfoCache,
  addCompanyHeader
};