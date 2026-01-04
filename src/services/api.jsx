import axios from 'axios';

const API_BASE_URL =
  (import.meta.env.VITE_API_URL ||
   "https://zakaria-rental-system.onrender.com") + "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // Increased timeout for M-Pesa requests
});

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

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
  // FIXED: Get notifications with proper parameter handling
  getNotifications: (limit = 20, offset = 0, type, is_read) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());
    
    if (type) params.append('type', type);
    if (is_read !== undefined) params.append('is_read', is_read.toString());
    
    return api.get(`/notifications?${params.toString()}`);
  },

  // FIXED: Get unread notification count
  getUnreadCount: () => api.get('/notifications/unread-count'),

  // FIXED: Get notification statistics
  getNotificationStats: () => api.get('/notifications/stats'),

  // FIXED: Get notifications by type
  getNotificationsByType: (type, page = 1, limit = 20) => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    
    return api.get(`/notifications/type/${type}?${params.toString()}`);
  },

  // FIXED: Mark notification as read
  markAsRead: (notificationId) => api.put(`/notifications/${notificationId}/read`),

  // FIXED: Mark all notifications as read
  markAllAsRead: () => api.put('/notifications/read-all'),

  // FIXED: Create notification
  createNotification: (notificationData) => api.post('/notifications', notificationData),

  // FIXED: Create broadcast notification (admin only)
  createBroadcastNotification: (broadcastData) => api.post('/notifications/broadcast', broadcastData),

  // FIXED: Delete notification
  deleteNotification: (notificationId) => api.delete(`/notifications/${notificationId}`),

  // FIXED: Clear all read notifications
  clearReadNotifications: () => api.delete('/notifications/clear-read'),

  // Admin endpoints
  getAdminNotifications: (page = 1, limit = 50, filters = {}) => {
    const params = { page, limit, ...filters };
    return api.get('/notifications/admin/all', { params });
  },

  getAdminNotificationStats: (start_date, end_date) => {
    const params = {};
    if (start_date) params.start_date = start_date;
    if (end_date) params.end_date = end_date;
    return api.get('/notifications/admin/stats/overview', { params });
  },

  clearUserNotifications: (userId) => api.delete(`/notifications/admin/clear-all/${userId}`),

  // Health check
  healthCheck: () => api.get('/notifications/health')
};

// Enhanced Payment API with salary payments and paybill integration
export const paymentAPI = {
  // Payment operations
  getPayments: (params = {}) => api.get('/payments', { params }),
  getPayment: (id) => api.get(`/payments/${id}`),
  getPaymentsByTenantId: (tenantId) => api.get(`/payments/tenant/${tenantId}`),
  getPaymentsByTenant: (tenantId) => api.get(`/payments/tenant/${tenantId}`),
  createPayment: (paymentData) => api.post('/payments', paymentData),
  confirmPayment: (id) => api.post(`/payments/${id}/confirm`),
  getPaymentHistory: (tenantId) => api.get(`/payments/history/${tenantId}`),
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
  getPendingPayments: () => api.get('/payments?status=pending'),
  getOverduePayments: () => api.get('/payments?status=overdue'),
  
  // Tenant payment functions
  getTenantPayments: (tenantId) => api.get(`/payments/tenant/${tenantId}`),
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
  testMpesaConfig: () => api.get('/payments/mpesa/test-config')
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
  updateProfile: (updates) => api.put('/auth/profile', updates),
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

// Property API
export const propertyAPI = {
  // Property operations
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

// Settings API
export const settingsAPI = {
  getSettings: () => api.get('/admin-settings'),

  updateSetting: (key, value) =>
    api.put(`/admin-settings/${key}`, { value }),

  updateMultipleSettings: (settings) =>
    api.put('/admin-settings', settings)
};


// Complaint API
export const complaintAPI = {
  getComplaints: (params = {}) => api.get('/complaints', { params }),
  getComplaint: (id) => api.get(`/complaints/${id}`),
  createComplaint: (complaintData) => api.post('/complaints', complaintData),
  updateComplaint: (id, updates) => api.put(`/complaints/${id}`, updates),
  assignComplaint: (id, agentId) => api.post(`/complaints/${id}/assign`, { agentId }),
  resolveComplaint: (id, resolutionData) => api.post(`/complaints/${id}/resolve`, resolutionData),
  addComplaintUpdate: (id, updateData) => api.post(`/complaints/${id}/updates`, updateData),
  getTenantComplaints: (tenantId) => api.get(`/complaints/tenant/${tenantId}`),
  getAgentComplaints: (agentId) => api.get(`/complaints/agent/${agentId}`),
  getComplaintUpdates: (complaintId) => api.get(`/complaints/${complaintId}/updates`),
  getComplaintStats: () => api.get('/complaints/stats/overview'),
  updateComplaintStatus: (id, status) => api.patch(`/complaints/${id}/status`, { status }),
  addComplaintComment: (id, comment) => api.post(`/complaints/${id}/comments`, { comment }),
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
  settings: settingsAPI,
  dashboard: dashboardAPI,
  files: fileAPI,
  mpesa: mpesaUtils,
  paymentUtils: paymentUtils,
  notificationUtils: notificationUtils,
  mockMpesa: mockMpesaAPI,
  paybill: paybillAPI, // NEW: Added paybill API
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