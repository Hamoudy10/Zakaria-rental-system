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

export const salaryPaymentAPI = {
  getSalaryPayments: () => api.get('/salary-payments'),
  getSalaryPayment: (id) => api.get(`/salary-payments/${id}`),
  createSalaryPayment: (paymentData) => api.post('/salary-payments', paymentData),
  updateSalaryPayment: (id, updates) => api.put(`/salary-payments/${id}`, updates),
  deleteSalaryPayment: (id) => api.delete(`/salary-payments/${id}`),
  getAgentSalaryPayments: (agentId) => api.get(`/salary-payments/agent/${agentId}`),
  markAsCompleted: (id) => api.post(`/salary-payments/${id}/complete`),
};

export const settingsAPI = {
  getSettings: () => api.get('/admin/settings'),
  updateSetting: (key, value) => api.put(`/admin/settings/${key}`, { value }),
  updateMultipleSettings: (settings) => api.put('/admin/settings', settings),
  resetSettings: () => api.post('/admin/settings/reset-defaults'),
};

// M-Pesa API Integration
export const mpesaAPI = {
  // Initiate STK Push (Lipa Na M-Pesa)
  stkPush: (paymentData) => {
    // In a real implementation, this would call your backend M-Pesa endpoint
    // For now, we'll simulate the M-Pesa API response
    return api.post('/mpesa/stk-push', paymentData);
  },

  // Query transaction status
  queryTransaction: (transactionId) => {
    return api.get(`/mpesa/transaction/${transactionId}`);
  },

  // Register C2B URLs (for paybill confirmation)
  registerUrls: (urlData) => {
    return api.post('/mpesa/register-urls', urlData);
  },

  // Simulate C2B payment (for testing)
  simulateC2B: (paymentData) => {
    return api.post('/mpesa/simulate-c2b', paymentData);
  },

  // Get M-Pesa balance
  getBalance: () => {
    return api.get('/mpesa/balance');
  },

  // Reverse transaction
  reverseTransaction: (transactionData) => {
    return api.post('/mpesa/reverse', transactionData);
  }
};

// Enhanced payment API with M-Pesa integration
export const enhancedPaymentAPI = {
  ...paymentAPI,
  
  // Process M-Pesa payment
  processMpesaPayment: async (paymentData) => {
    try {
      // Step 1: Initiate M-Pesa STK Push
      const stkResponse = await mpesaAPI.stkPush({
        BusinessShortCode: process.env.REACT_APP_MPESA_SHORTCODE || '123456',
        Amount: paymentData.amount,
        PhoneNumber: paymentData.phone_number,
        CallBackURL: `${API_BASE_URL}/mpesa/callback`,
        AccountReference: `RENT_${paymentData.unit_id}`,
        TransactionDesc: `Rent payment for ${paymentData.payment_month}`
      });

      if (stkResponse.data.success) {
        // Step 2: Create payment record with pending status
        const paymentRecord = {
          ...paymentData,
          mpesa_transaction_id: stkResponse.data.CheckoutRequestID,
          mpesa_receipt_number: null,
          status: 'pending',
          payment_date: new Date().toISOString()
        };

        const paymentResponse = await paymentAPI.createPayment(paymentRecord);
        
        return {
          success: true,
          message: 'M-Pesa payment initiated successfully. Check your phone for STK prompt.',
          checkoutRequestId: stkResponse.data.CheckoutRequestID,
          merchantRequestId: stkResponse.data.MerchantRequestID,
          payment: paymentResponse.data
        };
      } else {
        throw new Error(stkResponse.data.errorMessage || 'Failed to initiate M-Pesa payment');
      }
    } catch (error) {
      console.error('M-Pesa payment error:', error);
      throw error;
    }
  },

  // Check payment status
  checkPaymentStatus: async (checkoutRequestId) => {
    try {
      const response = await mpesaAPI.queryTransaction(checkoutRequestId);
      return response.data;
    } catch (error) {
      console.error('Error checking payment status:', error);
      throw error;
    }
  },

  // Confirm payment manually (for admin)
  confirmMpesaPayment: async (paymentId, mpesaData) => {
    try {
      const response = await api.post(`/payments/${paymentId}/confirm-mpesa`, mpesaData);
      return response.data;
    } catch (error) {
      console.error('Error confirming M-Pesa payment:', error);
      throw error;
    }
  },

  // Get M-Pesa payment summary
  getMpesaSummary: async (params = {}) => {
    try {
      const response = await api.get('/payments/mpesa/summary', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching M-Pesa summary:', error);
      throw error;
    }
  }
};

// System settings API for M-Pesa configuration
export const systemSettingsAPI = {
  // Get M-Pesa settings
  getMpesaSettings: () => {
    return api.get('/admin/settings/mpesa');
  },

  // Update M-Pesa settings
  updateMpesaSettings: (settings) => {
    return api.put('/admin/settings/mpesa', settings);
  },

  // Test M-Pesa connection
  testMpesaConnection: () => {
    return api.post('/admin/settings/mpesa/test');
  }
};

// Utility functions for M-Pesa
export const mpesaUtils = {
  // Format phone number for M-Pesa (254 format)
  formatPhoneNumber: (phone) => {
    if (!phone) return '';
    
    let cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    } else if (!cleaned.startsWith('254')) {
      cleaned = '254' + cleaned;
    }
    
    return cleaned;
  },

  // Validate M-Pesa phone number
  isValidMpesaPhone: (phone) => {
    const formatted = mpesaUtils.formatPhoneNumber(phone);
    return /^2547[0-9]{8}$/.test(formatted);
  },

  // Format amount for M-Pesa (must be integer)
  formatAmount: (amount) => {
    return Math.round(parseFloat(amount));
  },

  // Generate transaction reference
  generateTransactionRef: (prefix = 'RENT') => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  },

  // Parse M-Pesa callback data
  parseCallbackData: (callbackData) => {
    try {
      if (typeof callbackData === 'string') {
        return JSON.parse(callbackData);
      }
      return callbackData;
    } catch (error) {
      console.error('Error parsing M-Pesa callback:', error);
      return null;
    }
  }
};

// Mock M-Pesa API for development (remove in production)
export const mockMpesaAPI = {
  stkPush: (paymentData) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          data: {
            success: true,
            CheckoutRequestID: `ws_CO_${Date.now()}`,
            MerchantRequestID: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ResponseCode: '0',
            ResponseDescription: 'Success. Request accepted for processing',
            CustomerMessage: 'Success. Request accepted for processing'
          }
        });
      }, 2000);
    });
  },

  simulatePaymentCallback: (paymentData) => {
    return api.post('/mpesa/simulate-callback', paymentData);
  }
};

export default api;