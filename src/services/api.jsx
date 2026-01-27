import axios from 'axios';

const API_BASE_URL =
  (import.meta.env.VITE_API_URL ||
   "https://zakaria-rental-system.onrender.com") + "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // Increased timeout for M-Pesa requests
});

// Response interceptor for error handling
// FIXED: Exclude auth endpoints from auto-logout on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    const status = error.response?.status;
    
    // DEBUG: Log to verify new code is running
    console.log('🔍 INTERCEPTOR v2:', { requestUrl, status });
    
    // List of endpoints that should NOT trigger auto-logout on 401
    const authEndpoints = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password'
    ];
    
    // Check if this is an auth endpoint
    const isAuthEndpoint = authEndpoints.some(endpoint => requestUrl.includes(endpoint));
    
    console.log('🔍 Is Auth Endpoint:', isAuthEndpoint, '| Should redirect:', status === 401 && !isAuthEndpoint);
    
    if (status === 401 && !isAuthEndpoint) {
      // Only auto-logout for non-auth endpoints (e.g., expired token on protected routes)
      console.log('🔒 Session expired, redirecting to login...');
      localStorage.removeItem('token');
      
      // Use a small delay to prevent race conditions
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
    } else if (status === 401 && isAuthEndpoint) {
      // DEBUG: Confirm we're NOT redirecting
      console.log('✅ Auth endpoint 401 - NOT redirecting (this is correct)');
    }
    
    // Always reject the error so calling code can handle it
    return Promise.reject(error);
  }
);

// Add this NEW agentSMSAPI section (add it after billingAPI):
export const agentSMSAPI = {
  triggerAgentBillingSMS: (data) => api.post('/cron/agent/trigger-billing', data),
  getAgentFailedSMS: (params = {}) => api.get('/cron/agent/failed-sms', { params }),
  retryAgentFailedSMS: (data) => api.post('/cron/agent/retry-sms', data),
  checkMissingWaterBills: (month, propertyId = null) => {
    const params = new URLSearchParams();
    params.append('month', month);
    if (propertyId) params.append('propertyId', propertyId);
    return api.get(`/water-bills/missing-tenants?${params.toString()}`);
  },
  getSMSQueueStatus: () => api.get('/cron/queue-status'),
  getAgentSMSHistory: (params = {}) => api.get('/cron/agent/history', { params })
};




// M-Pesa utility functions
export const mpesaUtils = {
  formatPhoneNumber: (phone) => {
    // Convert Kenyan phone numbers to M-Pesa format (254...)
    if (phone.startsWith('0')) {
      return '254' + phone.substring(1);
    } else if (phone.startsWith('+254')) {
      return phone.substring(1);
    } else if (phone.startsWith('254')) {
      return phone;
    } else {
      return '254' + phone;
    }
  },
  
  validatePhoneNumber: (phone) => {
    const regex = /^(?:254|\+254|0)?(7\d{8})$/;
    return regex.test(phone);
  },
  
  generateTransactionReference: (prefix = 'RENT') => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`.toUpperCase();
  },
  
  formatAmount: (amount) => {
    return Math.round(amount); // M-Pesa requires whole numbers
  }
};

// FIXED: Enhanced Notification API with all endpoints
export const notificationAPI = {
  // Get user personal notifications
  getNotifications: (params) => api.get('/notifications', { params }),

  // Get unread notification count
  getUnreadCount: () => api.get('/notifications/unread-count'),

  // Get notification statistics
  getNotificationStats: () => api.get('/notifications/stats'),

  // Mark specific notification as read
  markAsRead: (id) => api.put(`/notifications/${id}/read`),

  // Mark all user notifications as read
  markAllAsRead: () => api.put('/notifications/read-all'),

  // Create single notification
  createNotification: (data) => api.post('/notifications', data),

  // Create role-based broadcast (In-app)
  createBroadcastNotification: (data) => api.post('/notifications/broadcast', data),

  // Delete single notification
  deleteNotification: (id) => api.delete(`/notifications/${id}`),

  // Clear all read notifications
  clearReadNotifications: () => api.delete('/notifications/clear-read'),

  // Admin/Agent: Send Bulk SMS to properties
  sendBulkSMS: (data) => api.post('/notifications/bulk-sms', data),

  // Admin endpoints
  getAdminNotifications: (params) => api.get('/notifications/admin/all', { params }),

  clearUserNotifications: (userId) => api.delete(`/notifications/admin/clear-all/${userId}`)
};

// Enhanced Payment API with salary payments and paybill integration
export const paymentAPI = {
  // Payment operations
  getPayments: (params = {}) => api.get('/payments', { params }),
  getPayment: (id) => api.get(`/payments/${id}`),
  // Kept getPaymentsByTenant as the primary tenant-specific payments endpoint
  getPaymentsByTenant: (tenantId) => api.get(`/payments/tenant/${tenantId}`),
  createPayment: (paymentData) => api.post('/payments', paymentData),
  confirmPayment: (id) => api.post(`/payments/${id}/confirm`),
  // Consolidated getPaymentHistory to accept tenantId and optional params (unitId, months)
  getPaymentHistory: (tenantId, params = {}) => api.get(`/payments/history/${tenantId}`, { params }),
  generateReceipt: (paymentId) => api.get(`/payments/${paymentId}/receipt`),
  deletePayment: (paymentId) => api.delete(`/payments/${paymentId}`),
  
  // M-Pesa specific payments
  processMpesaPayment: (paymentData) => api.post('/payments/mpesa', paymentData),
  processMpesaDeposit: (depositData) => api.post('/payments/mpesa/deposit', depositData),
  verifyMpesaTransaction: (transactionId) => api.get(`/payments/mpesa/verify/${transactionId}`),
  getMpesaTransactions: () => api.get('/payments/mpesa/transactions'),
  
  // NEW: Paybill payment endpoints
  processPaybillPayment: (paymentData) => api.post('/payments/paybill', paymentData),
  getPaymentStatusByUnitCode: (unitCode, month = null) => {
    const params = month ? { month } : {};
    return api.get(`/payments/unit/${unitCode}/status`, { params });
  },
  sendBalanceReminders: () => api.post('/payments/send-reminders'),
  testSMSService: (testData) => api.post('/payments/test-sms', testData),
  getPaybillStats: (period = '30days') => api.get('/payments/paybill/stats', { params: { period } }),
  
  // Statistics and reports
  getPaymentStats: () => api.get('/payments/stats/overview'),
  getUnitPayments: (unitId) => api.get(`/payments/unit/${unitId}`),
  getPendingPayments: () => api.get('/payments?status=pending'), // Consider params for filtering
  getOverduePayments: () => api.get('/payments?status=overdue'), // Consider params for filtering
  
  // Tenant payment functions
  // getTenantPayments is a duplicate of getPaymentsByTenant, kept one.
  // Assuming getTenantAllocations is the correct endpoint for allocations specific to a tenant
  getTenantAllocations: (tenantId) => api.get(`/tenant-allocations/tenant/${tenantId}`), // Corrected API for tenant allocations if different from payments
  getUpcomingPayments: (tenantId) => api.get(`/payments/upcoming/${tenantId}`),
  getPaymentSummary: (tenantId, unitId) => api.get(`/payments/summary/${tenantId}/${unitId}`),
  
  // Payment status and updates
  checkPaymentStatus: (checkoutRequestId) => api.get(`/payments/mpesa/status/${checkoutRequestId}`),
  updatePayment: (paymentId, updates) => api.put(`/payments/${paymentId}`, updates),
  
  // NEW: Enhanced payment tracking endpoints
  getFuturePaymentsStatus: (tenantId, unitId, params = {}) => 
    api.get(`/payments/future/${tenantId}/${unitId}`, { params }),
  
  // Salary payments
  processSalaryPayment: (salaryData) => api.post('/payments/salary', salaryData),
  getSalaryPayments: (params = {}) => api.get('/payments/salary', { params }),
  getAgentSalaryPayments: (agentId) => api.get(`/payments/salary/agent/${agentId}`),

  // M-Pesa configuration test
  testMpesaConfig: () => api.get('/payments/mpesa/test-config'),

  // Assuming you have a general report generation endpoint for PDF/Excel
  generateReport: (reportData) => api.post('/reports/payments', reportData), // Example endpoint
};

// Mock M-Pesa API for testing
export const mockMpesaAPI = {
  initiatePayment: (paymentData) => api.post('/payments/mpesa/mock', paymentData),
  confirmPayment: (transactionId) => api.post(`/payments/mpesa/confirm/${transactionId}`),
  checkStatus: (transactionId) => api.get(`/payments/mpesa/status/${transactionId}`),
  simulateCallback: (callbackData) => api.post('/payments/mpesa/simulate-callback', callbackData),
};

// Paybill API for external integrations
export const paybillAPI = {
  processPayment: (paymentData) => api.post('/payments/paybill', paymentData),
  getPaymentStatus: (unitCode, month = null) => {
    const params = month ? { month } : {};
    return api.get(`/payments/unit/${unitCode}/status`, { params });
  },
  sendReminders: () => api.post('/payments/send-reminders'),
  getStats: (period = '30days') => api.get('/payments/paybill/stats', { params: { period } })
};

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  refreshToken: () => api.post('/auth/refresh'),
  getProfile: () => api.get('/auth/profile'),
  
  // Updated: Profile update with FormData support for image upload
  updateProfile: (formData) => {
    // Check if formData is FormData instance (has file) or regular object
    const isFormData = formData instanceof FormData;
    
    return api.put('/auth/profile', formData, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {}
    });
  },
  
  // New: Delete profile image
  deleteProfileImage: () => api.delete('/auth/profile/image'),
  
  changePassword: (passwordData) => api.put('/auth/change-password', passwordData),
};

// User API
export const userAPI = {
  getUsers: (params = {}) => api.get('/users', { params }),
  getUser: (id) => api.get(`/users/${id}`),
  createUser: (userData) => api.post('/users', userData),
  updateUser: (id, updates) => api.put(`/users/${id}`, updates),
  deleteUser: (id) => api.delete(`/users/${id}`),
  updateProfile: (updates) => api.put('/users/profile', updates),
  changePassword: (passwordData) => api.put('/users/change-password', passwordData),
  getAgents: () => api.get('/users/role/agent'),
  getTenants: () => api.get('/users/role/tenant'),
  getUserStats: () => api.get('/users/stats/overview'),
  updateNotificationPreferences: (preferences) => 
    api.put('/users/notification-preferences', preferences),
};

// Property API - Updated with image management endpoints
export const propertyAPI = {
  // Basic property operations
  getProperties: (params = {}) => api.get('/properties', { params }),
  getProperty: (id) => api.get(`/properties/${id}`),
  createProperty: (propertyData) => api.post('/properties', propertyData),
  updateProperty: (id, updates) => api.put(`/properties/${id}`, updates),
  deleteProperty: (id) => api.delete(`/properties/${id}`),
  
  // Unit operations
  getPropertyUnits: (propertyId) => api.get(`/properties/${propertyId}/units`),
  getAvailableUnits: () => api.get('/properties/units/available'),
  addUnit: (propertyId, unitData) => api.post(`/properties/${propertyId}/units`, unitData),
  updateUnit: (propertyId, unitId, updates) => api.put(`/properties/${propertyId}/units/${unitId}`, updates),
  deleteUnit: (propertyId, unitId) => api.delete(`/properties/${propertyId}/units/${unitId}`),
  updateUnitOccupancy: (propertyId, unitId, occupancyData) => 
    api.patch(`/properties/${propertyId}/units/${unitId}/occupancy`, occupancyData),

  // Statistics and search
  getPropertyStats: () => api.get('/properties/stats/overview'),
  searchProperties: (searchTerm) => api.get(`/properties/search?q=${encodeURIComponent(searchTerm)}`),
  
  // Additional unit endpoints
  getUnit: (propertyId, unitId) => api.get(`/properties/${propertyId}/units/${unitId}`),
  getUnitsByType: (unitType) => api.get(`/properties/units/type/${unitType}`),
  getUnitAllocations: (unitId) => api.get(`/properties/units/${unitId}/allocations`),

  // NEW: Agent-specific property endpoints
  getAgentProperties: () => api.get('/agent-properties/my-properties'),
  getAgentDashboardStats: () => api.get('/agent-properties/dashboard-stats'),
  getAgentAssignedTenants: () => api.get('/agent-properties/my-tenants'),
  getAgentAssignedComplaints: () => api.get('/agent-properties/my-complaints'),

  // SHOWCASE API (For Agents to show properties)
  getShowcaseProperties: () => api.get('/properties/showcase/list'),
  getShowcasePropertyDetails: (id) => api.get(`/properties/showcase/${id}`),

  // ==================== PROPERTY IMAGES ====================
  // Get all images for a property
  getPropertyImages: (propertyId) => api.get(`/properties/${propertyId}/images`),
  
  // Upload property images (accepts FormData with 'property_images' field)
  uploadPropertyImages: (propertyId, formData) => {
    return api.post(`/properties/${propertyId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  // Update image caption or display order
  updatePropertyImage: (propertyId, imageId, updates) => 
    api.patch(`/properties/${propertyId}/images/${imageId}`, updates),
  
  // Delete a property image
  deletePropertyImage: (propertyId, imageId) => 
    api.delete(`/properties/${propertyId}/images/${imageId}`),
  
  // Reorder property images (bulk update)
  reorderPropertyImages: (propertyId, imageOrder) => 
    api.put(`/properties/${propertyId}/images/reorder`, { imageOrder }),

  // ==================== UNIT IMAGES ====================
  // Get all images for a unit
  getUnitImages: (unitId) => api.get(`/units/${unitId}/images`),
  
  // Upload unit images (accepts FormData with 'unit_images' field)
  uploadUnitImages: (unitId, formData) => {
    return api.post(`/units/${unitId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  // Update unit image caption or display order
  updateUnitImage: (unitId, imageId, updates) => 
    api.patch(`/units/${unitId}/images/${imageId}`, updates),
  
  // Delete a unit image
  deleteUnitImage: (unitId, imageId) => 
    api.delete(`/units/${unitId}/images/${imageId}`),
  
  // Reorder unit images (bulk update)
  reorderUnitImages: (unitId, imageOrder) => 
    api.put(`/units/${unitId}/images/reorder`, { imageOrder }),
  
  // Get image counts for multiple units
  getUnitImageCounts: (unitIds) => api.post('/units/image-counts', { unitIds }),
};


// Allocation API
export const allocationAPI = {
  // Tenant allocation operations
  getAllocations: (params = {}) => api.get('/allocations', { params }),
  getAllocation: (id) => api.get(`/allocations/${id}`),
  getAllocationsByTenantId: (tenantId) => api.get(`/allocations/tenant/${tenantId}`),
  getAllocationsByUnitId: (unitId) => api.get(`/allocations/unit/${unitId}`),
  createAllocation: (allocationData) => api.post('/allocations', allocationData),
  updateAllocation: (id, updates) => api.put(`/allocations/${id}`, updates),
  deleteAllocation: (id) => api.delete(`/allocations/${id}`),
  deallocateTenant: (id) => api.put(`/allocations/${id}`, { is_active: false }),
  
  // Statistics and additional endpoints
  getAllocationStats: () => api.get('/allocations/stats/overview'),
  getMyAllocation: () => api.get('/allocations/my/allocation'),
  getActiveAllocations: () => api.get('/allocations?is_active=true'),
  getExpiringAllocations: () => api.get('/allocations?expiring_soon=true'),
  terminateAllocation: (id, terminationData) => 
    api.post(`/allocations/${id}/terminate`, terminationData),
};

// Add to your settingsAPI in api.jsx:

export const settingsAPI = {
  // Existing methods...
  getSettings: () => api.get('/admin/settings'),
  getSettingsByCategory: (category) => api.get(`/admin/settings/category?category=${category}`),
  getSettingByKey: (key) => api.get(`/admin/settings/${key}`),
  updateSetting: (key, value) => api.put(`/admin/settings/${key}`, { value }),
  updateMultipleSettings: (settings) => api.put('/admin/settings', settings),
  resetToDefaults: () => api.post('/admin/settings/reset-defaults'),
  getBillingConfig: () => api.get('/admin/settings/billing/config'),
  
  // NEW: Company info methods
  getCompanyInfo: () => api.get('/admin/company-info'),
  
  updateCompanyInfo: (formData) => {
    const isFormData = formData instanceof FormData;
    return api.put('/admin/company-info', formData, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {}
    });
  },
  
  deleteCompanyLogo: () => api.delete('/admin/company-logo'),
};
// Add this NEW billingAPI section (add it after settingsAPI):
export const billingAPI = {
  // Trigger manual billing run
  triggerAgentBilling: () => api.post('/cron/agent/trigger-billing'),
  
  // Get billing run history
  getBillingHistory: (params = {}) => api.get('/cron/agent/history', { params }),
  
  // Get failed SMS for retry
  getAgentFailedSMS: (params = {}) => api.get('/cron/agent/failed-sms', { params }),
  
  // Retry failed SMS
  retryAgentFailedSMS: (smsIds) => api.post('/cron/agent/retry-sms', { smsIds }),
  
  // Test SMS service
  testSMSService: (testData) => api.post('/cron/agent/test-sms', testData),

   getSMSHistory: (params) => api.get('/cron/sms-history', { params }), // Adjust if needed
};

// ============================================
// ADD THESE TO YOUR EXISTING complaintAPI in api.jsx
// ============================================

// Replace your existing complaintAPI with this updated version:
export const complaintAPI = {
  getComplaints: (params = {}) => api.get('/complaints', { params }),
  getComplaint: (id) => api.get(`/complaints/${id}`),
  createComplaint: (complaintData) => api.post('/complaints', complaintData),
  updateComplaint: (id, updates) => api.patch(`/complaints/${id}`, updates),  // Changed to PATCH
  assignComplaint: (id, agentId) => api.patch(`/complaints/${id}/assign`, { agent_id: agentId }),
  updateComplaintStatus: (id, status) => api.put(`/complaints/${id}/status`, { status }),
  addComplaintUpdate: (id, updateData) => api.post(`/complaints/${id}/updates`, updateData),
  getTenantComplaints: (tenantId) => api.get(`/complaints/tenant/${tenantId}`),
  getAgentComplaints: (agentId) => api.get(`/complaints/agent/${agentId}`),
  getComplaintUpdates: (complaintId) => api.get(`/complaints/${complaintId}/updates`),
  getComplaintStats: () => api.get('/complaints/stats/overview'),
  addComplaintComment: (id, comment) => api.post(`/complaints/${id}/comments`, { comment }),
  resolveComplaint: (id, resolutionData) => api.post(`/complaints/${id}/resolve`, resolutionData),
  deleteComplaint: (id) => api.delete(`/complaints/${id}`),
  // NEW: Steps endpoints
  getComplaintSteps: (complaintId) => api.get(`/complaints/${complaintId}/steps`),
  addComplaintStep: (complaintId, stepData) => api.post(`/complaints/${complaintId}/steps`, stepData),
  toggleComplaintStep: (complaintId, stepId, isCompleted) => 
    api.patch(`/complaints/${complaintId}/steps/${stepId}`, { is_completed: isCompleted }),
  deleteComplaintStep: (complaintId, stepId) => api.delete(`/complaints/${complaintId}/steps/${stepId}`),
};

// Report API
// Updated Report API integrated into main API export
// Report API
export const reportAPI = {
  // Generate a new report
  generateReport: (reportData) => api.post('/reports/generate', reportData),

  // Get all reports
  getReports: (params = {}) => api.get('/reports', { params }),

  // Get a single report by ID
  getReport: (id) => api.get(`/reports/${id}`),

  // Download a report file (PDF/CSV) safely
  downloadReport: async (id, format = 'pdf') => {
    try {
      const response = await api.get(`/reports/${id}/export?format=${format}`, {
        responseType: 'blob',
      });

      // If backend returns JSON instead of blob (e.g., 404), throw error
      const contentType = response.headers['content-type'];
      if (contentType.includes('application/json')) {
        const errorData = await response.data.text ? await response.data.text() : null;
        throw new Error(`Download failed: ${errorData || 'Report not found'}`);
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${id}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      return { success: true };
    } catch (error) {
      console.error('Report download error:', error);
      return { success: false, message: error.message || 'Failed to download report' };
    }
  },

  // Generic export helper (alias)
  exportReport: async (id, format = 'pdf') => {
    return reportAPI.downloadReport(id, format);
  },

  // Get available report types
  getReportTypes: () => api.get('/reports/types'),

  // Prebuilt reports
  getPaymentReports: (params) => api.get('/reports/payments', { params }),
  getOccupancyReports: (params) => api.get('/reports/occupancy', { params }),
  getFinancialReports: (params) => api.get('/reports/financial', { params }),
  getMaintenanceReports: (params) => api.get('/reports/maintenance', { params }),

   // ✅ Expose these for apiHelper
  getWaterBills: (params) => api.get('/agent-properties/water-bills', { params }),
  getSMSHistory: (params) => api.get('/cron/sms-history', { params })
};


// Salary Payment API (legacy - now integrated into paymentAPI)
export const salaryPaymentAPI = {
  getSalaryPayments: () => api.get('/salary-payments'),
  getSalaryPayment: (id) => api.get(`/salary-payments/${id}`),
  createSalaryPayment: (paymentData) => api.post('/salary-payments', paymentData),
  updateSalaryPayment: (id, updates) => api.put(`/salary-payments/${id}`, updates),
  processSalaryPayment: (id) => api.post(`/salary-payments/${id}/process`),
  getAgentSalaryPayments: (agentId) => api.get(`/salary-payments/agent/${agentId}`),
  processMpesaSalary: (salaryData) => api.post('/salary-payments/mpesa', salaryData),
  getSalaryStats: () => api.get('/salary-payments/stats/overview'),
};

// Dashboard API for consolidated data
export const dashboardAPI = {
  getAdminDashboard: () => api.get('/dashboard/admin'),
  getAgentDashboard: () => api.get('/dashboard/agent'),
  getTenantDashboard: () => api.get('/dashboard/tenant'),
  getOverviewStats: () => api.get('/dashboard/stats/overview'),
  getRecentActivity: () => api.get('/dashboard/activity/recent'),
  getFinancialOverview: () => api.get('/dashboard/financial/overview'),
  getOccupancyMetrics: () => api.get('/dashboard/metrics/occupancy'),
  getMaintenanceMetrics: () => api.get('/dashboard/metrics/maintenance'),
};

// File Upload API
export const fileAPI = {
  uploadImage: (formData) => api.post('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  uploadDocument: (formData) => api.post('/upload/document', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteFile: (filePath) => api.delete('/upload/file', { data: { filePath } }),
  uploadMultiple: (formData) => api.post('/upload/multiple', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
};

// Enhanced utility functions for M-Pesa validation and payment processing
export const paymentUtils = {
  // Validate Kenyan phone number for M-Pesa
  isValidMpesaPhone: (phone) => {
    if (!phone) return false;
    
    // Remove any non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Check if it's a valid Kenyan phone number
    // Formats: 0712345678, 254712345678, +254712345678
    const regex = /^(07\d{8}|2547\d{8}|\+2547\d{8})$/;
    return regex.test(cleaned);
  },

  // Format phone number to 2547XXXXXXXX format
  formatMpesaPhone: (phone) => {
    if (!phone) return '';
    
    // Remove any non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Convert to 2547XXXXXXXX format
    if (cleaned.startsWith('07') && cleaned.length === 10) {
      return '254' + cleaned.slice(1);
    } else if (cleaned.startsWith('2547') && cleaned.length === 12) {
      return cleaned;
    } else if (cleaned.startsWith('254') && cleaned.length === 12) {
      return cleaned;
    } else if (cleaned.startsWith('7') && cleaned.length === 9) {
      return '254' + cleaned;
    }
    
    return cleaned; // Return as is if no pattern matches
  },

  // Generate transaction reference
  generateTransactionRef: () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `RENT${timestamp}${random}`;
  },

  // Format amount for display
  formatAmount: (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0);
  },

  // Validate payment amount
  validatePaymentAmount: (amount, expectedAmount) => {
    const paymentAmount = parseFloat(amount);
    const expected = parseFloat(expectedAmount);
    return paymentAmount === expected;
  },

  // Calculate due dates and late fees
  calculateDueDate: (allocation) => {
    if (!allocation) return null;
    
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), allocation.rent_due_day || 1);
    
    if (dueDate < now) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    }
    
    return dueDate;
  },

  // Check if payment is overdue
  isPaymentOverdue: (paymentDate, dueDate) => {
    const payment = new Date(paymentDate);
    const due = new Date(dueDate);
    return payment > due;
  },

  // Calculate late fee
  calculateLateFee: (rentAmount, daysLate, lateFeeRate = 0.05) => {
    const dailyLateFee = rentAmount * lateFeeRate;
    return Math.round(dailyLateFee * daysLate);
  }
};

// COMPLETELY UPDATED Notification utility functions
export const notificationUtils = {
  // Get notification icon based on type
  getNotificationIcon: (type) => {
    switch (type) {
      case 'payment_success':
      case 'payment_received':
        return '💰';
      case 'salary_paid':
      case 'salary_processed':
        return '💵';
      case 'payment_failed':
        return '❌';
      case 'complaint_updated':
      case 'complaint_created':
      case 'complaint_resolved':
        return '🔧';
      case 'announcement':
        return '📢';
      case 'system_alert':
        return '⚠️';
      default:
        return '🔔';
    }
  },

  // Format timestamp for display
  formatTimestamp: (timestamp) => {
    if (!timestamp) return 'Unknown time';
    
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffInMs = now - date;
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      if (diffInMinutes < 1) return 'Just now';
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
      if (diffInHours < 24) return `${diffInHours}h ago`;
      if (diffInDays < 7) return `${diffInDays}d ago`;
      
      return date.toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Invalid date';
    }
  },

  // Format notification message based on type
  formatNotificationMessage: (notification) => {
    const { type, message, title } = notification;
    
    switch (type) {
      case 'payment_success':
        return `✅ Payment confirmed: ${message}`;
      case 'payment_received':
        return `💰 Payment received: ${message}`;
      case 'payment_failed':
        return `❌ Payment failed: ${message}`;
      case 'salary_paid':
        return `💵 Salary processed: ${message}`;
      case 'complaint_updated':
        return `🔧 Complaint update: ${message}`;
      case 'announcement':
        return `📢 Announcement: ${message}`;
      case 'system_alert':
        return `⚠️ System alert: ${message}`;
      default:
        return message || title;
    }
  },

  // Check if notification is recent (within 24 hours)
  isRecent: (timestamp) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffInHours = (now - date) / (1000 * 60 * 60);
      return diffInHours < 24;
    } catch {
      return false;
    }
  },

  // Group notifications by date
  groupNotificationsByDate: (notifications) => {
    const groups = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: []
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    notifications.forEach(notification => {
      const notificationDate = new Date(notification.created_at);
      
      if (notificationDate >= today) {
        groups.today.push(notification);
      } else if (notificationDate >= yesterday) {
        groups.yesterday.push(notification);
      } else if (notificationDate >= lastWeek) {
        groups.thisWeek.push(notification);
      } else {
        groups.older.push(notification);
      }
    });

    return groups;
  }
};

// Tenant Management API
export const tenantAPI = {
  // Get all tenants with pagination
  getTenants: (params = {}) => api.get('/tenants', { params }),
  
  // Get single tenant by ID
  getTenant: (id) => api.get(`/tenants/${id}`),
  
  // Create new tenant
  createTenant: (tenantData) => api.post('/tenants', tenantData),
  
  // Update tenant
  updateTenant: (id, tenantData) => api.put(`/tenants/${id}`, tenantData),
  
  // Delete tenant
  deleteTenant: (id) => api.delete(`/tenants/${id}`),

    checkMissingWaterBills: (month, propertyId = null) => {
    const params = new URLSearchParams();
    params.append('month', month);
    if (propertyId) params.append('propertyId', propertyId);
    
    return api.get(`/water-bills/missing-tenants?${params.toString()}`);
  },
  
  // Get available units for tenant allocation
  getAvailableUnits: () => api.get('/tenants/available-units'),
  
  // Search tenants
  searchTenants: (searchTerm) => api.get(`/tenants/search?q=${encodeURIComponent(searchTerm)}`),
  
  // Get tenant statistics
  getTenantStats: () => api.get('/tenants/stats'),

    // Upload ID images (with files)
  uploadIDImages: (id, formData) => {
    return api.post(`/tenants/${id}/upload-id`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  
  // Get tenant's ID images
  getTenantIDImages: (id) => api.get(`/tenants/${id}/id-images`),
  
  // Delete specific ID image
  deleteTenantIDImage: (id, imageType) => api.delete(`/tenants/${id}/id-images/${imageType}`),
  
  // Helper function to create form data for upload
  createImageFormData: (frontImageFile, backImageFile) => {
    const formData = new FormData();
    
    if (frontImageFile) {
      formData.append('id_front_image', frontImageFile);
    }
    
    if (backImageFile) {
      formData.append('id_back_image', backImageFile);
    }
    
    return formData;
  }
};

// Then add to API object:

// Chat API for unread messages and notifications
// Chat API for unread messages and notifications
export const chatAPI = {
  // Get unread chat messages count (for notification badge)
  getUnreadCount: async () => {
    try {
      const res = await api.get('/chat/unread-count'); // Matches your chat.js route
      return res.data?.unreadCount ?? 0;
    } catch (error) {
      console.error('Failed to fetch chat unread count:', error);
      return 0;
    }
  },

  // Get recent chat conversations
  getRecentChats: async (limit = 50, offset = 0) => {
    try {
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const res = await api.get(`/chat/conversations?${params.toString()}`);
      return Array.isArray(res.data) ?  res.data : Array.isArray(res.data.data) ? res.data.data : [];
    } catch (error) {
      console.error('Failed to fetch recent chats:', error);
      return [];
    }
  },

  // Mark a chat message or conversation as read
  markAsRead: async (messageIds) => {
    try {
      const res = await api.post('/chat/messages/mark-read', { messageIds });
      return res.data;
    } catch (error) {
      console.error('Failed to mark chat as read:', error);
      return null;
    }
  },

  // Send a chat message
  sendMessage: async ({ conversationId, messageText }) => {
    try {
      const res = await api.post('/chat/messages/send', { conversationId, messageText });
      return res.data;
    } catch (error) {
      console.error('Failed to send chat message:', error);
      return null;
    }
  },

  // Get chat messages in a conversation
  getMessages: async (conversationId) => {
    try {
      const res = await api.get(`/chat/conversations/${conversationId}/messages`);
      return Array.isArray(res.data) ? res.data : [];
    } catch (error) {
      console.error('Failed to fetch chat messages:', error);
      return [];
    }
  },

  // Get available users for starting a chat
  getAvailableUsers: async () => {
  try {
    const res = await api.get('/chat/available-users');
    return Array.isArray(res.data?.data) ? res.data.data : [];
  } catch (error) {
    console.error('Failed to fetch available users:', error);
    return [];
  }
},

  // Optional: Get chat conversation by conversation ID
  getChatById: async (conversationId) => {
    try {
      const res = await api.get(`/chat/conversations/${conversationId}`);
      return res.data ?? null;
    } catch (error) {
      console.error('Failed to fetch chat by ID:', error);
      return null;
    }
  },

  // Create a new conversation
  createConversation: async ({ participantIds, title, type }) => {
    try {
      const res = await api.post('/chat/conversations', { participantIds, title, type });
      return res.data ?? null;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }
  },
};

// ==================== EXPENSE API ====================
export const expenseAPI = {
  // Get expense categories
  getCategories: () => api.get('/expenses/categories'),
  
  // Get all expenses (with filters)
  getExpenses: (params = {}) => api.get('/expenses', { params }),
  
  // Get single expense
  getExpense: (id) => api.get(`/expenses/${id}`),
  
  // Get expense statistics
  getStats: (params = {}) => api.get('/expenses/stats', { params }),
  
  // Create expense
  createExpense: (expenseData) => api.post('/expenses', expenseData),
  
  // Update expense
  updateExpense: (id, updates) => api.put(`/expenses/${id}`, updates),
  
  // Update expense status (admin only)
  updateExpenseStatus: (id, statusData) => api.patch(`/expenses/${id}/status`, statusData),
  
  // Bulk approve/reject (admin only)
  bulkUpdateStatus: (data) => api.post('/expenses/bulk-approve', data),
  
  // Delete expense
  deleteExpense: (id) => api.delete(`/expenses/${id}`),
  
  // Get net profit report (admin only)
  getNetProfitReport: (params = {}) => api.get('/expenses/reports/net-profit', { params }),
  
  // Upload receipt image (uses existing file upload)
  uploadReceipt: (formData) => api.post('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
};


// Export all APIs in a single object for easy importing
export const API = {
  auth: authAPI,
  users: userAPI,
  properties: propertyAPI,
  allocations: allocationAPI,
  payments: paymentAPI,
  complaints: complaintAPI,
  reports: reportAPI,
  notifications: notificationAPI,
  salary: salaryPaymentAPI,
  expenses: expenseAPI,
  settings: settingsAPI,
  dashboard: dashboardAPI,
  files: fileAPI,
  mpesa: mpesaUtils,
  paymentUtils: paymentUtils,
  notificationUtils: notificationUtils,
  mockMpesa: mockMpesaAPI,
  paybill: paybillAPI, 
  billing: billingAPI, 
  tenants: tenantAPI,          // Admin billing endpoints
  agentSMS: agentSMSAPI,
   chatAPI,// NEW: Added paybill API
};

// Health check function
export const healthCheck = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    console.error('Health check failed:', error);
    return { success: false, message: 'Service unavailable' };
  }
};

// Global error handler
export const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error status
    const message = error.response.data?.message || error.response.data?.error || 'An error occurred';
    const status = error.response.status;
    
    return {
      success: false,
      message,
      status,
      data: error.response.data
    };
  } else if (error.request) {
    // Request made but no response received
    return {
      success: false,
      message: 'Network error: Unable to connect to server',
      status: 0
    };
  } else {
    // Something else happened
    return {
      success: false,
      message: error.message || 'An unexpected error occurred',
      status: -1
    };
  }
};

export default api;