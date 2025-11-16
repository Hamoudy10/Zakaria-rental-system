// src/services/AgentService.js
import api from './api';

const agentService = {
  // Dashboard data
  getDashboardStats: async () => {
    return await api.get('/agent/dashboard/stats');
  },

  getRecentComplaints: async () => {
    return await api.get('/agent/complaints/recent');
  },

  getPaymentAlerts: async () => {
    return await api.get('/agent/payments/alerts');
  },

  // Complaint management
  getAssignedComplaints: async () => {
    return await api.get('/agent/complaints');
  },

  createComplaint: async (complaintData) => {
    return await api.post('/agent/complaints', complaintData);
  },

  updateComplaintStatus: async (complaintId, status, updateData) => {
    return await api.put(`/agent/complaints/${complaintId}`, { status, ...updateData });
  },

  // Payment management
  getTenantsWithPaymentStatus: async () => {
    return await api.get('/agent/tenants/payments');
  },

  sendPaymentReminder: async (tenantId) => {
    return await api.post('/agent/tenants/send-reminder', { tenantId });
  },

  // Notification management
  getAssignedProperties: async () => {
    return await api.get('/agent/properties');
  },

  sendBulkSMS: async (smsData) => {
    return await api.post('/agent/notifications/send-bulk-sms', smsData);
  },

  // Profile and account
  updateProfile: async (profileData) => {
    return await api.put('/agent/profile', profileData);
  }
};

export default agentService;