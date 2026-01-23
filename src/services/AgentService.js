// src/services/AgentService.js
import api from './api';

const agentService = {
  // Dashboard data
  getDashboardStats: async () => {
    return await api.get('/agent-properties/dashboard-stats');
  },

  getAssignedProperties: async () => {
    return await api.get('/agent-properties/my-properties');
  },

  // Tenant management
  getTenantsWithPaymentStatus: async () => {
    return await api.get('/agent-properties/my-tenants');
  },

  // Complaint management
  getAssignedComplaints: async (status = null) => {
    const params = status ? { status } : {};
    return await api.get('/agent-properties/my-complaints', { params });
  },

  updateComplaintStatus: async (complaintId, status, updateData) => {
    return await api.put(`/complaints/${complaintId}`, { status, ...updateData });
  },

  // Salary payments
  getSalaryHistory: async () => {
    return await api.get('/salary-payments/history'); // Assuming this exists or falls back
  },

  // Property details
  getPropertyDetails: async (propertyId) => {
    return await api.get(`/properties/${propertyId}`);
  },

  // Tenant details
  getTenantDetails: async (tenantId) => {
    return await api.get(`/tenants/${tenantId}`);
  },

  // Send payment reminder
  sendPaymentReminder: async (tenantId) => {
    return await api.post('/notifications/send-reminder', { tenantId }); // Adjusted path if needed
  },

  // Send bulk SMS
  sendBulkSMS: async (smsData) => {
    return await api.post('/cron/agent/send-bulk', smsData); // Adjusted path
  },

  // Water bills
  createWaterBill: async (billData) => {
    return await api.post('/agent-properties/water-bills', billData);
  },

  listWaterBills: async (params = {}) => {
    return await api.get('/agent-properties/water-bills', { params });
  },

  getWaterBill: async (id) => {
    return await api.get(`/agent-properties/water-bills/${id}`);
  },

  deleteWaterBill: async (id) => {
    return await api.delete(`/agent-properties/water-bills/${id}`);
  },

  
  // NEW: water balance for a tenant
  getWaterBalance: async (tenantId) => {
    return await api.get(`/agent-properties/water-bills/balance/${tenantId}`);
  }
};

export default agentService;