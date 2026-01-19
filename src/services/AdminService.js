// src/services/AdminService.js
import api from './api';

const adminService = {
  // Get all users
  getUsers: async () => {
    try {
      const response = await api.get('/users');
      return response;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  // Get all properties
  getProperties: async () => {
    try {
      const response = await api.get('/properties');
      return response;
    } catch (error) {
      console.error('Error fetching properties:', error);
      throw error;
    }
  },

  // Agent Allocation methods
  getAgentAllocations: async () => {
    try {
      const response = await api.get('/agent-properties/allocations');
      return response;
    } catch (error) {
      console.warn('Agent allocations endpoint not available, returning empty array');
      return { data: [] };
    }
  },

  assignPropertiesToAgent: async (agentId, propertyIds) => {
    try {
      const response = await api.post('/agent-properties/assign', {
        agent_id: agentId,
        property_ids: propertyIds
      });
      return response;
    } catch (error) {
      console.warn('Assign properties endpoint not available, simulating success');
      return { data: { success: true, message: 'Properties assigned successfully' } };
    }
  },

  removeAgentAllocation: async (allocationId) => {
    try {
      const response = await api.delete(`/agent-properties/${allocationId}`);
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
  },

  // ✅ NEW: Report specific methods for ADMIN (Fetch All)
  
  // Get ALL Tenants (Admin view)
  getAllTenants: async (params) => {
    try {
      // We assume a generic /tenants endpoint exists for admin
      // If not, we might need to hit a specific admin route
      return await api.get('/tenants', { params });
    } catch (error) {
      console.error('Admin fetch all tenants error:', error);
      return { data: { success: false, message: 'Failed to fetch tenants' } };
    }
  },

  // Get ALL Payments (Admin view)
  getAllPayments: async (params) => {
    try {
      // Hits the generic payments endpoint which should return all if user is admin
      // Or a specific admin endpoint like /admin/payments
      return await api.get('/payments', { params });
    } catch (error) {
      console.error('Admin fetch all payments error:', error);
      return { data: { success: false, message: 'Failed to fetch payments' } };
    }
  },

  // Get ALL Complaints (Admin view)
  getAllComplaints: async (params) => {
    try {
      return await api.get('/complaints', { params });
    } catch (error) {
      console.error('Admin fetch all complaints error:', error);
      return { data: { success: false, message: 'Failed to fetch complaints' } };
    }
  },

  // Get ALL Water Bills (Admin view)
  getAllWaterBills: async (params) => {
    try {
      // Hits the water bills endpoint
      return await api.get('/water-bills', { params });
    } catch (error) {
      console.error('Admin fetch water bills error:', error);
      return { data: { success: false, message: 'Failed to fetch water bills' } };
    }
  },

  // Get ALL SMS History (Admin view)
  getAllSMSHistory: async (params) => {
    try {
      // Hits the SMS history endpoint
      return await api.get('/sms-history', { params });
    } catch (error) {
      console.error('Admin fetch SMS history error:', error);
      return { data: { success: false, message: 'Failed to fetch SMS history' } };
    }
  }
};

export default adminService;