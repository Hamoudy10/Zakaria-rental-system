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

// Handle responses
api.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('❌ API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.response?.data?.message || error.message
    });
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
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
};

export const userAPI = {
  getUsers: () => api.get('/users'),
  getUser: (id) => api.get(`/users/${id}`),
  createUser: (userData) => api.post('/users', userData),
  updateUser: (id, updates) => api.put(`/users/${id}`, updates),
  deleteUser: (id) => api.delete(`/users/${id}`),
  updateProfile: (updates) => api.put('/users/profile', updates),
  changePassword: (passwordData) => api.put('/users/change-password', passwordData),
};

export const propertyAPI = {
  getProperties: () => api.get('/properties'),
  getProperty: (id) => api.get(`/properties/${id}`),
  createProperty: (propertyData) => api.post('/properties', propertyData),
  updateProperty: (id, updates) => api.put(`/properties/${id}`, updates),
  deleteProperty: (id) => api.delete(`/properties/${id}`),
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
};

export const paymentAPI = {
  getPayments: () => api.get('/payments'),
  getPayment: (id) => api.get(`/payments/${id}`),
  getPaymentsByTenantId: (tenantId) => api.get(`/payments/tenant/${tenantId}`),
  createPayment: (paymentData) => api.post('/payments', paymentData),
  confirmPayment: (id) => api.post(`/payments/${id}/confirm`),
  getPaymentHistory: (tenantId) => api.get(`/payments/history/${tenantId}`),
  generateReceipt: (paymentId) => api.get(`/payments/${paymentId}/receipt`),
    // Unit operations
  addUnit: (propertyId, unitData) => api.post(`/properties/${propertyId}/units`, unitData),
  updateUnit: (propertyId, unitId, updates) => api.put(`/properties/${propertyId}/units/${unitId}`, updates),
  deleteUnit: (propertyId, unitId) => api.delete(`/properties/${propertyId}/units/${unitId}`),
  updateUnitOccupancy: (propertyId, unitId, occupancyData) => 
    api.patch(`/properties/${propertyId}/units/${unitId}/occupancy`, occupancyData),
  
  // Statistics and search
  getPropertyStats: () => api.get('/properties/stats/overview'),
  searchProperties: (searchTerm) => api.get(`/properties/search?q=${encodeURIComponent(searchTerm)}`),
};

// Enhanced payment API with M-Pesa functionality
export const enhancedPaymentAPI = {
  ...paymentAPI,
  processMpesaPayment: (paymentData) => api.post('/payments/mpesa', paymentData),
  processMpesaDeposit: (depositData) => api.post('/payments/mpesa/deposit', depositData),
  verifyMpesaTransaction: (transactionId) => api.get(`/payments/mpesa/verify/${transactionId}`),
  getMpesaTransactions: () => api.get('/payments/mpesa/transactions'),
  deletePayment: (paymentId) => api.delete(`/payments/${paymentId}`),
  getPaymentStats: () => api.get('/payments/stats/overview'),
  getUnitPayments: (unitId) => api.get(`/payments/unit/${unitId}`),
  generateReport: (reportData) => api.post('/reports', reportData),
  // ... other functions ...
};

// Mock M-Pesa API for testing
export const mockMpesaAPI = {
  initiatePayment: (paymentData) => api.post('/payments/mpesa/mock', paymentData),
  confirmPayment: (transactionId) => api.post(`/payments/mpesa/confirm/${transactionId}`),
  checkStatus: (transactionId) => api.get(`/payments/mpesa/status/${transactionId}`),
  simulateCallback: (callbackData) => api.post('/payments/mpesa/simulate-callback', callbackData),
};

// Tenant allocation API
export const tenantAllocationAPI = {
  getAllocations: () => api.get('/allocations'),
  getAllocation: (id) => api.get(`/allocations/${id}`),
  getAllocationsByTenantId: (tenantId) => api.get(`/allocations/tenant/${tenantId}`),
  getAllocationsByUnitId: (unitId) => api.get(`/allocations/unit/${unitId}`),
  createAllocation: (allocationData) => api.post('/allocations', allocationData),
  updateAllocation: (id, updates) => api.put(`/allocations/${id}`, updates),
  deleteAllocation: (id) => api.delete(`/allocations/${id}`),
  terminateAllocation: (id, terminationData) => api.post(`/allocations/${id}/terminate`, terminationData),
};

// Settings API
export const settingsAPI = {
  getSettings: () => api.get('/admin/settings'),
  getSetting: (key) => api.get(`/admin/settings/${key}`),
  updateSetting: (key, value) => api.put(`/admin/settings/${key}`, { value }),
  updateMultipleSettings: (settingsData) => api.put('/admin/settings', settingsData),
};

// Complaint API
export const complaintAPI = {
  getComplaints: () => api.get('/complaints'),
  getComplaint: (id) => api.get(`/complaints/${id}`),
  createComplaint: (complaintData) => api.post('/complaints', complaintData),
  updateComplaint: (id, updates) => api.put(`/complaints/${id}`, updates),
  assignComplaint: (id, agentId) => api.post(`/complaints/${id}/assign`, { agentId }),
  resolveComplaint: (id, resolutionData) => api.post(`/complaints/${id}/resolve`, resolutionData),
  addComplaintUpdate: (id, updateData) => api.post(`/complaints/${id}/updates`, updateData),
  getTenantComplaints: (tenantId) => api.get(`/complaints/tenant/${tenantId}`),
  getAgentComplaints: (agentId) => api.get(`/complaints/agent/${agentId}`),
  getComplaintUpdates: (complaintId) => api.get(`/complaints/${complaintId}/updates`),
};

// Report API
export const reportAPI = {
  generateReport: (reportData) => api.post('/reports/generate', reportData),
  getReports: () => api.get('/reports'),
  getReport: (id) => api.get(`/reports/${id}`),
  downloadReport: (id) => api.get(`/reports/${id}/download`, { responseType: 'blob' }),
  getReportTypes: () => api.get('/reports/types'),
};

// Notification API
export const notificationAPI = {
  getNotifications: () => api.get('/notifications'),
  getUnreadNotifications: () => api.get('/notifications/unread'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  getNotificationPreferences: () => api.get('/notifications/preferences'),
  updateNotificationPreferences: (preferences) => api.put('/notifications/preferences', preferences),
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
};

export default api;
