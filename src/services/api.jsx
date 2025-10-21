import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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

// Export API methods
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  refreshToken: () => api.post('/auth/refresh'),
  getProfile: () => api.get('/auth/profile'),
};

export const userAPI = {
  getUsers: () => api.get('/users'),
  getUser: (id) => api.get(`/users/${id}`),
  createUser: (userData) => api.post('/users', userData),
  updateUser: (id, updates) => api.put(`/users/${id}`, updates),
  deleteUser: (id) => api.delete(`/users/${id}`),
  updateProfile: (updates) => api.put('/users/profile', updates),
  changePassword: (passwordData) => api.put('/users/change-password', passwordData),
  getAgents: () => api.get('/users/role/agent'),
  getTenants: () => api.get('/users/role/tenant'),
};

export const propertyAPI = {
  // Property operations
  getProperties: () => api.get('/properties'),
  getProperty: (id) => api.get(`/properties/${id}`),
  createProperty: (propertyData) => api.post('/properties', propertyData),
  updateProperty: (id, updates) => api.put(`/properties/${id}`, updates),
  deleteProperty: (id) => api.delete(`/properties/${id}`),
  
  // Unit operations - FIXED: Using the correct endpoint structure
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
  
  // Additional unit endpoints that might be needed
  getUnit: (propertyId, unitId) => api.get(`/properties/${propertyId}/units/${unitId}`),
  getUnitsByType: (unitType) => api.get(`/properties/units/type/${unitType}`),
};

export const allocationAPI = {
  // Tenant allocation operations - FIXED: Using correct endpoints
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
};

export const paymentAPI = {
  // Payment operations
  getPayments: () => api.get('/payments'),
  getPayment: (id) => api.get(`/payments/${id}`),
  getPaymentsByTenantId: (tenantId) => api.get(`/payments/tenant/${tenantId}`),
  getPaymentsByTenant: (tenantId) => api.get(`/payments/tenant/${tenantId}`), // ADDED: Missing function
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
  
  // Statistics and reports
  getPaymentStats: () => api.get('/payments/stats/overview'),
  getUnitPayments: (unitId) => api.get(`/payments/unit/${unitId}`),
  getPendingPayments: () => api.get('/payments?status=pending'),
  getOverduePayments: () => api.get('/payments?status=overdue'),
  
  // ADDED: Missing functions for tenant dashboard
  getTenantPayments: (tenantId) => api.get(`/payments/tenant/${tenantId}`), // ADDED: Missing function
  getUpcomingPayments: (tenantId) => api.get(`/payments/upcoming/${tenantId}`), // ADDED: Missing function
  getPaymentSummary: (tenantId) => api.get(`/payments/summary/${tenantId}`), // ADDED: Missing function
};

// Mock M-Pesa API for testing
export const mockMpesaAPI = {
  initiatePayment: (paymentData) => api.post('/payments/mpesa/mock', paymentData),
  confirmPayment: (transactionId) => api.post(`/payments/mpesa/confirm/${transactionId}`),
  checkStatus: (transactionId) => api.get(`/payments/mpesa/status/${transactionId}`),
  simulateCallback: (callbackData) => api.post('/payments/mpesa/simulate-callback', callbackData),
};

// Settings API
export const settingsAPI = {
  getSettings: () => api.get('/admin/settings'),
  getSetting: (key) => api.get(`/admin/settings/${key}`),
  updateSetting: (key, value) => api.put(`/admin/settings/${key}`, { value }),
  updateMultipleSettings: (settingsData) => api.put('/admin/settings', settingsData),
  getSystemSettings: () => api.get('/admin/settings/system'),
  updateSystemSettings: (settings) => api.put('/admin/settings/system', settings),
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
};

// Report API
export const reportAPI = {
  generateReport: (reportData) => api.post('/reports/generate', reportData),
  getReports: () => api.get('/reports'),
  getReport: (id) => api.get(`/reports/${id}`),
  downloadReport: (id) => api.get(`/reports/${id}/download`, { responseType: 'blob' }),
  getReportTypes: () => api.get('/reports/types'),
  getPaymentReports: () => api.get('/reports/payments'),
  getOccupancyReports: () => api.get('/reports/occupancy'),
  getFinancialReports: (params) => api.get('/reports/financial', { params }),
};

// Notification API
export const notificationAPI = {
  getNotifications: () => api.get('/notifications'),
  getUnreadNotifications: () => api.get('/notifications/unread'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  getNotificationPreferences: () => api.get('/notifications/preferences'),
  updateNotificationPreferences: (preferences) => api.put('/notifications/preferences', preferences),
  getNotificationCount: () => api.get('/notifications/count'),
  clearAll: () => api.delete('/notifications'),
};

// Salary Payment API
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
};

// ADDED: Missing utility functions for M-Pesa validation
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
  paymentUtils: paymentUtils, // ADDED: Missing payment utilities
  mockMpesa: mockMpesaAPI,
};

export default api;