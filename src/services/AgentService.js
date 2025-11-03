// src/services/agentService.js
import api from './api';

const agentService = {
  // Get agent dashboard overview stats
  getDashboardStats: async () => {
    try {
      const response = await api.get('/agent/dashboard/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching agent dashboard stats:', error);
      throw error;
    }
  },

  // Get agent's assigned properties
  getAssignedProperties: async () => {
    try {
      const response = await api.get('/agent/properties');
      return response.data;
    } catch (error) {
      console.error('Error fetching assigned properties:', error);
      throw error;
    }
  },

  // Get agent's tenants with payment status
  getTenantsWithPaymentStatus: async () => {
    try {
      const response = await api.get('/agent/tenants/payment-status');
      return response.data;
    } catch (error) {
      console.error('Error fetching tenants with payment status:', error);
      throw error;
    }
  },

  // Get agent's recent activities
  getRecentActivities: async () => {
    try {
      const response = await api.get('/agent/activities/recent');
      return response.data;
    } catch (error) {
      console.error('Error fetching recent activities:', error);
      throw error;
    }
  },

  // Get agent's performance metrics
  getPerformanceMetrics: async () => {
    try {
      const response = await api.get('/agent/performance/metrics');
      return response.data;
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      throw error;
    }
  },

  // Get agent's salary payments
  getSalaryPayments: async () => {
    try {
      const response = await api.get('/agent/salary-payments');
      return response.data;
    } catch (error) {
      console.error('Error fetching salary payments:', error);
      throw error;
    }
  }
};

export default agentService;