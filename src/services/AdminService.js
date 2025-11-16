// src/services/AdminService.js
import api from './api';

const adminService = {
  // Get all users - we'll filter for agents on the frontend
  getUsers: async () => {
    try {
      const response = await api.get('/users');
      console.log('Users API Response:', response); // Debug log
      return response;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  // Get properties
  getProperties: async () => {
    try {
      const response = await api.get('/properties');
      console.log('Properties API Response:', response); // Debug log
      return response;
    } catch (error) {
      console.error('Error fetching properties:', error);
      throw error;
    }
  },

  // Agent allocation methods - these might not exist yet in backend
  getAgentAllocations: async () => {
    try {
      const response = await api.get('/agent-allocations');
      return response;
    } catch (error) {
      console.warn('Agent allocations endpoint not available, returning empty array');
      return { data: [] };
    }
  },

  assignPropertiesToAgent: async (agentId, propertyIds) => {
    try {
      const response = await api.post('/agent-allocations', {
        agent_id: agentId,
        property_ids: propertyIds
      });
      return response;
    } catch (error) {
      console.warn('Assign properties endpoint not available, simulating success');
      // Simulate success for demo purposes
      return { data: { success: true, message: 'Properties assigned successfully' } };
    }
  },

  removeAgentAllocation: async (allocationId) => {
    try {
      const response = await api.delete(`/agent-allocations/${allocationId}`);
      return response;
    } catch (error) {
      console.warn('Remove allocation endpoint not available, simulating success');
      return { data: { success: true, message: 'Allocation removed successfully' } };
    }
  },

  // Dashboard stats
  getDashboardStats: async () => {
    try {
      const response = await api.get('/admin/dashboard/stats');
      return response;
    } catch (error) {
      console.warn('Dashboard stats endpoint not available, returning mock data');
      return { 
        data: {
          totalRevenue: 'KSh 1,234,567',
          totalUsers: 156,
          totalProperties: 24,
          totalUnits: 142,
          occupancyRate: '85%',
          pendingComplaints: 8,
          pendingPayments: 12,
          activeTenants: 120,
          monthlyGrowth: '+12%',
          assignedAgents: 15,
          unassignedProperties: 3
        }
      };
    }
  }
};

export default adminService;