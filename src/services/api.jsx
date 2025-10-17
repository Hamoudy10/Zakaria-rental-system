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
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
};

export const userAPI = {
  getUsers: () => api.get('/users'),
  getUser: (id) => api.get(`/users/${id}`),
  createUser: (userData) => api.post('/users', userData),
  updateUser: (id, updates) => api.put(`/users/${id}`, updates),
  getAgents: () => api.get('/users/agents'),
  getTenants: () => api.get('/users/tenants'),
};

export const paymentAPI = {
  getPayments: () => api.get('/payments'),
  getPayment: (id) => api.get(`/payments/${id}`),
  createPayment: (paymentData) => api.post('/payments', paymentData),
  updatePayment: (id, updates) => api.put(`/payments/${id}`, updates),
  confirmPayment: (id) => api.post(`/payments/${id}/confirm`),
  getTenantPayments: (tenantId) => api.get(`/payments/tenant/${tenantId}`),
  getPropertyPayments: (propertyId) => api.get(`/payments/property/${propertyId}`),
};

export const reportAPI = {
  getReports: () => api.get('/reports'),
  generateReport: (reportData) => api.post('/reports/generate', reportData),
  getFinancialReports: (params) => api.get('/reports/financial', { params }),
  getOccupancyReports: (params) => api.get('/reports/occupancy', { params }),
  getPaymentReports: (params) => api.get('/reports/payment', { params }),
};

export const tenantAllocationAPI = {
  getAllocations: () => api.get('/allocations'),
  getAllocation: (id) => api.get(`/allocations/${id}`),
  createAllocation: (allocationData) => api.post('/allocations', allocationData),
  updateAllocation: (id, updates) => api.put(`/allocations/${id}`, updates),
  deleteAllocation: (id) => api.delete(`/allocations/${id}`),
  getTenantAllocations: (tenantId) => api.get(`/allocations/tenant/${tenantId}`),
  getUnitAllocations: (unitId) => api.get(`/allocations/unit/${unitId}`),
  endTenancy: (id) => api.post(`/allocations/${id}/end`),
};

export const notificationAPI = {
  getNotifications: () => api.get('/notifications'),
  getUnreadNotifications: () => api.get('/notifications/unread'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  createNotification: (notificationData) => api.post('/notifications', notificationData),
  getAnnouncements: () => api.get('/announcements'),
  createAnnouncement: (announcementData) => api.post('/announcements', announcementData),
};

export const complaintAPI = {
  getComplaints: () => api.get('/complaints'),
  getComplaint: (id) => api.get(`/complaints/${id}`),
  createComplaint: (complaintData) => api.post('/complaints', complaintData),
  updateComplaint: (id, updates) => api.put(`/complaints/${id}`, updates),
  assignComplaint: (id, agentId) => api.post(`/complaints/${id}/assign`, { agentId }),
  resolveComplaint: (id, resolutionData) => api.post(`/complaints/${id}/resolve`, resolutionData),
  addComplaintUpdate: (id, updateData) => api.post(`/complaints/${id}/updates`, updateData),
};

export const propertyAPI = {
  getProperties: () => api.get('/properties'),
  getProperty: (id) => api.get(`/properties/${id}`),
  createProperty: (propertyData) => api.post('/properties', propertyData),
  updateProperty: (id, updates) => api.put(`/properties/${id}`, updates),
  deleteProperty: (id) => api.delete(`/properties/${id}`),
  // Unit endpoints
  getPropertyUnits: (propertyId) => api.get(`/properties/${propertyId}/units`),
  createUnit: (propertyId, unitData) => api.post(`/properties/${propertyId}/units`, unitData),
  updateUnit: (propertyId, unitId, updates) => api.put(`/properties/${propertyId}/units/${unitId}`, updates),
  deleteUnit: (propertyId, unitId) => api.delete(`/properties/${propertyId}/units/${unitId}`),
};

// Add to your existing api.js file

export const salaryPaymentAPI = {
  getSalaryPayments: () => api.get('/salary-payments'),
  getSalaryPayment: (id) => api.get(`/salary-payments/${id}`),
  createSalaryPayment: (paymentData) => api.post('/salary-payments', paymentData),
  updateSalaryPayment: (id, updates) => api.put(`/salary-payments/${id}`, updates),
  deleteSalaryPayment: (id) => api.delete(`/salary-payments/${id}`),
  getAgentSalaryPayments: (agentId) => api.get(`/salary-payments/agent/${agentId}`),
  markAsCompleted: (id) => api.post(`/salary-payments/${id}/complete`),
};

// Add to existing api.js exports
export const settingsAPI = {
  getSettings: () => api.get('/settings'),
  updateSetting: (key, value) => api.put(`/settings/${key}`, { value }),
  updateMultipleSettings: (settings) => api.put('/settings/bulk', { settings }),
  resetSettings: () => api.post('/settings/reset'),
};

export default api;