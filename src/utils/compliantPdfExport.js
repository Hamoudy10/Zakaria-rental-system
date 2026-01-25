// ============================================
// src/utils/complaintPdfExport.js
// Complaint PDF Export Utility - FIXED VERSION
// ============================================

import { settingsAPI } from '../services/api';

// Cache for company info
let companyInfoCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch company info with caching
export const getCompanyInfo = async () => {
  const now = Date.now();
  
  if (companyInfoCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
    console.log('Using cached company info:', companyInfoCache);
    return companyInfoCache;
  }
  
  try {
    const response = await settingsAPI.getCompanyInfo();
    const data = response.data?.data || response.data || {};
    
    console.log('Raw API response:', data);
    
    // FIXED: Map the API response keys to expected keys
    // API returns: { name, email, phone, address, logo }
    // We need: { company_name, company_email, company_phone, company_address, company_logo }
    companyInfoCache = {
      company_name: data.name || data.company_name || 'Zakaria Rental System',
      company_email: data.email || data.company_email || '',
      company_phone: data.phone || data.company_phone || '',
      company_address: data.address || data.company_address || '',
      company_logo: data.logo || data.company_logo || null
    };
    
    cacheTimestamp = now;
    console.log('Company info loaded and normalized:', companyInfoCache);
    return companyInfoCache;
  } catch (error) {
    console.error('Error fetching company info:', error);
    return {
      company_name: 'Zakaria Rental System',
      company_email: '',
      company_phone: '',
      company_address: '',
      company_logo: null
    };
  }
};

// Clear cache (call when company info is updated)
export const clearCompanyInfoCache = () => {
  companyInfoCache = null;
  cacheTimestamp = null;
  console.log('Company info cache cleared');
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
  try {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return 'N/A';
  }
};

// Get category labels
const getCategoryLabels = (complaint) => {
  const categories = complaint.categories || [complaint.category];
  if (!categories || categories.length === 0) return 'General';
  return categories
    .filter(Boolean)
    .map(catId => CATEGORY_LABELS[catId] || catId)
    .join(', ');
};

// Get status label
const getStatusLabel = (status) => {
  const labels = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed'
  };
  return labels[status] || status || 'Unknown';
};

// Calculate steps progress
const getStepsProgress = (steps) => {
  if (!steps || steps.length === 0) return 'No steps';
  const completed = steps.filter(s => s.is_completed).length;
  return `${completed}/${steps.length}`;
};

// Export complaints to PDF
export const exportComplaintsToPDF = async (complaints, options = {}) => {
  const {
    title = 'Complaints Report',
    includeSteps = true,
    filterStatus = null,
    isAdmin = false
  } = options;
  
  // Filter complaints if needed
  let filteredComplaints = complaints || [];
  if (filterStatus) {
    filteredComplaints = filteredComplaints.filter(c => c.status === filterStatus);
  }
  
  // Get company info FIRST
  const companyInfo = await getCompanyInfo();
  console.log('PDF Export - Using company info:', companyInfo);
  
  // Load PDF libraries dynamically
  let jsPDF;
  try {
    const jspdfModule = await import('jspdf');
    jsPDF = jspdfModule.jsPDF || jspdfModule.default;
    
    // FIXED: For jspdf-autotable v5.x, just import it - it auto-registers
    await import('jspdf-autotable');
    
    console.log('PDF libraries loaded successfully');
  } catch (error) {
    console.error('Failed to load PDF libraries:', error);
    throw new Error('PDF libraries not available. Please run: npm install jspdf jspdf-autotable');
  }
  
  // Create PDF document
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Colors
  const primaryColor = [37, 99, 235]; // Blue
  const textColor = [55, 65, 81]; // Gray
  const lightGray = [243, 244, 246];
  
  // Calculate stats
  const stats = {
    total: filteredComplaints.length,
    open: filteredComplaints.filter(c => c.status === 'open').length,
    in_progress: filteredComplaints.filter(c => c.status === 'in_progress').length,
    resolved: filteredComplaints.filter(c => c.status === 'resolved').length,
    high_priority: filteredComplaints.filter(c => c.priority === 'high').length
  };
  
  // ========== DRAW HEADER ==========
  // Blue header bar
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  // Company name - USE THE FETCHED DATA
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(companyInfo.company_name, 14, 12);
  
  // Company details line
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const detailParts = [
    companyInfo.company_address,
    companyInfo.company_phone,
    companyInfo.company_email
  ].filter(Boolean);
  
  if (detailParts.length > 0) {
    doc.text(detailParts.join(' | '), 14, 19);
  }
  
  // Report title
  doc.setTextColor(...textColor);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const reportTitle = isAdmin ? 'All Properties Complaints Report' : (title || 'Complaints Report');
  doc.text(reportTitle, 14, 35);
  
  // Date generated
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${formatDate(new Date())}`, 14, 42);
  
  // Stats summary
  doc.text(`Total: ${stats.total} | Open: ${stats.open} | In Progress: ${stats.in_progress} | Resolved: ${stats.resolved}`, 14, 48);
  
  // ========== PREPARE TABLE DATA ==========
  const tableData = filteredComplaints.map(complaint => {
    const tenantName = `${complaint.tenant_first_name || ''} ${complaint.tenant_last_name || ''}`.trim() || 'Unknown';
    const stepsProgress = getStepsProgress(complaint.steps);
    
    return [
      tenantName,
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
  
  // ========== CREATE MAIN TABLE ==========
  if (tableData.length > 0) {
    // FIXED: For jspdf-autotable v5.x, use doc.autoTable() directly
    // The plugin auto-attaches to the jsPDF prototype
    doc.autoTable({
      startY: 55, // Explicit startY - this is crucial
      head: [[
        'Tenant',
        'Property',
        'Unit',
        'Categories',
        'Title',
        'Status',
        'Steps',
        'Date Raised',
        'Date Resolved'
      ]],
      body: tableData,
      styles: {
        fontSize: 8,
        cellPadding: 3,
        lineColor: [229, 231, 235],
        lineWidth: 0.1,
        overflow: 'linebreak'
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
        0: { cellWidth: 28 },
        1: { cellWidth: 28 },
        2: { cellWidth: 18 },
        3: { cellWidth: 35 },
        4: { cellWidth: 40 },
        5: { cellWidth: 22 },
        6: { cellWidth: 18 },
        7: { cellWidth: 28 },
        8: { cellWidth: 28 }
      },
      margin: { top: 30, bottom: 15 },
      didDrawPage: (data) => {
        // Add header on subsequent pages
        if (data.pageNumber > 1) {
          doc.setFillColor(...primaryColor);
          doc.rect(0, 0, pageWidth, 15, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(`${companyInfo.company_name} - Complaints Report (continued)`, 14, 10);
        }
      }
    });
  } else {
    // No data message
    doc.setTextColor(...textColor);
    doc.setFontSize(12);
    doc.text('No complaints to display.', 14, 60);
  }
  
  // ========== ADD DETAILED STEPS SECTION ==========
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
          
          // Add continuation header
          doc.setFillColor(...primaryColor);
          doc.rect(0, 0, pageWidth, 15, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text('Detailed Steps (continued)', 14, 10);
          
          yPos = 25;
        }
        
        // Complaint title
        doc.setTextColor(...primaryColor);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(complaint.title || 'Untitled Complaint', 14, yPos);
        
        // Complaint meta info
        doc.setTextColor(...textColor);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        yPos += 5;
        const tenantName = `${complaint.tenant_first_name || ''} ${complaint.tenant_last_name || ''}`.trim() || 'Unknown';
        doc.text(`Tenant: ${tenantName} | Unit: ${complaint.unit_code || 'N/A'} | Status: ${getStatusLabel(complaint.status)}`, 14, yPos);
        
        yPos += 7;
        
        // Steps list
        const sortedSteps = [...(complaint.steps || [])].sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
        
        for (const step of sortedSteps) {
          const checkbox = step.is_completed ? '[X]' : '[ ]';
          const stepText = `${checkbox} Step ${step.step_order || '?'}: ${step.step_description || 'No description'}`;
          
          doc.setFont('helvetica', step.is_completed ? 'normal' : 'bold');
          doc.setTextColor(
            step.is_completed ? 100 : 55,
            step.is_completed ? 100 : 65,
            step.is_completed ? 100 : 81
          );
          
          // Wrap text if too long
          const lines = doc.splitTextToSize(stepText, pageWidth - 34);
          for (const line of lines) {
            if (yPos > pageHeight - 20) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(line, 20, yPos);
            yPos += 5;
          }
          
          // Show completion date if completed
          if (step.is_completed && step.completed_at) {
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(`   Completed: ${formatDate(step.completed_at)}`, 20, yPos);
            yPos += 4;
            doc.setFontSize(8);
          }
        }
        
        yPos += 8;
        
        // Separator line
        doc.setDrawColor(229, 231, 235);
        doc.line(14, yPos - 3, pageWidth - 14, yPos - 3);
      }
    }
  }
  
  // ========== ADD FOOTERS TO ALL PAGES ==========
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Footer background
    doc.setFillColor(...lightGray);
    doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
    
    // Footer text
    doc.setTextColor(...textColor);
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 4, { align: 'center' });
    doc.text(companyInfo.company_name, 14, pageHeight - 4);
    doc.text(formatDate(new Date()), pageWidth - 14, pageHeight - 4, { align: 'right' });
  }
  
  // ========== SAVE THE PDF ==========
  const fileName = `complaints_report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  
  console.log('PDF saved:', fileName);
  return { success: true, fileName };
};

// Export single complaint to PDF
export const exportSingleComplaintToPDF = async (complaint) => {
  // Get company info
  const companyInfo = await getCompanyInfo();
  console.log('Single PDF Export - Using company info:', companyInfo);
  
  // Load PDF libraries
  let jsPDF;
  try {
    const jspdfModule = await import('jspdf');
    jsPDF = jspdfModule.jsPDF || jspdfModule.default;
    await import('jspdf-autotable');
  } catch (error) {
    throw new Error('PDF libraries not available');
  }
  
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Colors
  const primaryColor = [37, 99, 235];
  const textColor = [55, 65, 81];
  
  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 30, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(companyInfo.company_name, 14, 15);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Complaint Details Report', 14, 23);
  
  // Complaint title
  let yPos = 45;
  
  doc.setTextColor(...textColor);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  
  const titleLines = doc.splitTextToSize(complaint.title || 'Untitled Complaint', pageWidth - 28);
  for (const line of titleLines) {
    doc.text(line, 14, yPos);
    yPos += 8;
  }
  
  yPos += 5;
  
  // Info grid
  doc.setFontSize(10);
  const tenantName = `${complaint.tenant_first_name || ''} ${complaint.tenant_last_name || ''}`.trim() || 'Unknown';
  
  const infoItems = [
    ['Tenant', tenantName],
    ['Property', complaint.property_name || 'N/A'],
    ['Unit', complaint.unit_code || 'N/A'],
    ['Status', getStatusLabel(complaint.status)],
    ['Priority', (complaint.priority || 'medium').charAt(0).toUpperCase() + (complaint.priority || 'medium').slice(1)],
    ['Categories', getCategoryLabels(complaint)],
    ['Date Raised', formatDate(complaint.raised_at)],
    ['Date Resolved', complaint.resolved_at ? formatDate(complaint.resolved_at) : 'Not yet resolved']
  ];
  
  for (const [label, value] of infoItems) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 14, yPos);
    doc.setFont('helvetica', 'normal');
    
    const valueLines = doc.splitTextToSize(value || 'N/A', pageWidth - 60);
    doc.text(valueLines[0], 55, yPos);
    yPos += 7;
    
    // Handle multi-line values
    for (let i = 1; i < valueLines.length; i++) {
      doc.text(valueLines[i], 55, yPos);
      yPos += 6;
    }
  }
  
  yPos += 8;
  
  // Description section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Description:', 14, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const descLines = doc.splitTextToSize(complaint.description || 'No description provided', pageWidth - 28);
  for (const line of descLines) {
    if (yPos > pageHeight - 30) {
      doc.addPage();
      yPos = 20;
    }
    doc.text(line, 14, yPos);
    yPos += 5;
  }
  
  yPos += 10;
  
  // Steps section
  if (complaint.steps && complaint.steps.length > 0) {
    if (yPos > pageHeight - 50) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Resolution Steps', 14, yPos);
    
    const progress = getStepsProgress(complaint.steps);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`(${progress} completed)`, 55, yPos);
    
    yPos += 10;
    
    const sortedSteps = [...complaint.steps].sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
    
    for (const step of sortedSteps) {
      if (yPos > pageHeight - 25) {
        doc.addPage();
        yPos = 20;
      }
      
      const checkbox = step.is_completed ? '☑' : '☐';
      
      doc.setFont('helvetica', step.is_completed ? 'normal' : 'bold');
      doc.setTextColor(
        step.is_completed ? 100 : 55,
        step.is_completed ? 100 : 65,
        step.is_completed ? 100 : 81
      );
      
      const stepText = `${checkbox} Step ${step.step_order || '?'}: ${step.step_description || 'No description'}`;
      const stepLines = doc.splitTextToSize(stepText, pageWidth - 28);
      
      for (const line of stepLines) {
        doc.text(line, 14, yPos);
        yPos += 5;
      }
      
      if (step.is_completed && step.completed_at) {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`   Completed: ${formatDate(step.completed_at)}`, 14, yPos);
        yPos += 4;
        doc.setFontSize(10);
      }
      
      yPos += 3;
    }
  }
  
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated on ${formatDate(new Date())}`, 14, pageHeight - 10);
  doc.text(companyInfo.company_name, pageWidth - 14, pageHeight - 10, { align: 'right' });
  
  // Save
  const fileName = `complaint_${complaint.id || 'details'}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  
  return { success: true, fileName };
};

// Default export
export default {
  exportComplaintsToPDF,
  exportSingleComplaintToPDF,
  getCompanyInfo,
  clearCompanyInfoCache
};