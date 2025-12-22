// src/services/AgentService.js
import api from './api';

const agentService = {
  // Dashboard data - updated to use new endpoints
  getDashboardStats: async () => {
    return await api.get('/agent-properties/dashboard-stats');
  },

  getAssignedProperties: async () => {
    return await api.get('/agent-properties/my-properties');
  },

  getRecentActivities: async () => {
    // This will be implemented later with actual activities
    return await api.get('/agent/activities');
  },

  getPerformanceMetrics: async () => {
    // This will be implemented later with actual metrics
    return await api.get('/agent/performance');
  },

  // Tenant management - updated to use assigned tenants
  getTenantsWithPaymentStatus: async () => {
    return await api.get('/agent-properties/my-tenants');
  },

  // Complaint management - updated to use assigned complaints
  getAssignedComplaints: async (status = null) => {
    const params = status ? { status } : {};
    return await api.get('/agent-properties/my-complaints', { params });
  },

  updateComplaintStatus: async (complaintId, status, updateData) => {
    return await api.put(`/complaints/${complaintId}`, { status, ...updateData });
  },

  // Salary payments (unchanged)
  getSalaryHistory: async () => {
    return await api.get('/agent/salary-history');
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
    return await api.post('/agent/send-payment-reminder', { tenantId });
  },

  // Send bulk SMS to tenants in assigned properties
  sendBulkSMS: async (smsData) => {
    return await api.post('/agent/send-bulk-sms', smsData);
  },

  // Existing methods for backward compatibility
  getRecentComplaints: async () => {
    return await api.get('/agent-properties/my-complaints?limit=5');
  },

  getPaymentAlerts: async () => {
    return await api.get('/agent-properties/my-tenants?payment_status=pending');
  },

  createComplaint: async (complaintData) => {
    return await api.post('/agent/complaints', complaintData);
  },

  updateProfile: async (profileData) => {
    return await api.put('/agent/profile', profileData);
  },

   createWaterBill: async (billData) => {
    // billData: { tenantId, unitId, propertyId, amount, billMonth (YYYY-MM), notes }
    return await api.post('/agent-properties/water-bills', billData);
  },

  listWaterBills: async (params = {}) => {
    // params: { propertyId, tenantId, month, limit, offset }
    return await api.get('/agent-properties/water-bills', { params });
  },

  getWaterBill: async (id) => {
    return await api.get(`/agent-properties/water-bills/${id}`);
  },

  deleteWaterBill: async (id) => {
    return await api.delete(`/agent-properties/water-bills/${id}`);
  }
};

export default agentService;