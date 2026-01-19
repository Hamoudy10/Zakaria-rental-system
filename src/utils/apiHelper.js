// /src/utils/apiHelper.js
import { API } from '../services/api';
import agentService from '../services/AgentService';

export const getReportAPI = (user) => {
  // Helper to get correct API based on user role and available endpoints
  return {
    // Tenants Report
    getTenants: async (params) => {
      // Use agent service for both agents AND admins for Reports
      // The backend controller now handles returning ALL data for admins
      try {
        const response = await agentService.getTenantsWithPaymentStatus();
        return { data: { success: true, data: response.data?.data || [] } };
      } catch (error) {
        console.error('Report tenants error:', error);
        return { data: { success: true, data: [] } };
      }
    },

    // Payments Report
    getPayments: async (params) => {
      try {
        // Reuse the logic that fetches tenants with payment status
        // This provides a consistent view for the reports
        const response = await agentService.getTenantsWithPaymentStatus();
        const tenants = response.data?.data || [];
        
        // Transform tenants to payment-like structure for reports
        const payments = tenants.map(tenant => ({
          id: tenant.tenant_id || tenant.id,
          tenant_name: tenant.tenant_name || `${tenant.first_name} ${tenant.last_name}`,
          amount: tenant.monthly_rent || 0,
          payment_month: new Date().toISOString().slice(0, 7),
          status: tenant.payment_status || 'pending',
          created_at: new Date().toISOString(),
          // Add extra fields useful for admin view
          property_name: tenant.property_name,
          unit_name: tenant.unit_name
        }));
        return { data: { success: true, data: payments } };
      } catch (error) {
        console.error('Report payments error:', error);
        return { data: { success: true, data: [] } };
      }
    },

    // Properties Report
    getProperties: async () => {
      try {
        // Use agent service which calls /agent-properties/my-properties
        // Backend returns ALL properties for admins
        const response = await agentService.getAssignedProperties();
        return { data: { success: true, data: response.data?.data || [] } };
      } catch (error) {
        console.error('Report properties error:', error);
        return { data: { success: true, data: [] } };
      }
    },

    // Complaints Report
    getComplaints: async (params) => {
      try {
        // Use agent service which calls /agent-properties/my-complaints
        // Backend returns ALL complaints for admins
        const response = await agentService.getAssignedComplaints(params.status || 'open');
        return { data: { success: true, data: response.data?.data || [] } };
      } catch (error) {
        console.error('Report complaints error:', error);
        return { data: { success: true, data: [] } };
      }
    },

    // Water Bills Report
    getWaterBills: async (params) => {
      try {
        // Check if API.waterBill exists
        if (API.reportAPI?.getWaterBills) { // Corrected access to reportAPI
             return await API.reportAPI.getWaterBills(params);
        } else if (API.agentSMS?.listWaterBills) {
             return await API.agentSMS.listWaterBills(params);
        } else {
          // Direct fallback to agent service logic if available
          return await agentService.listWaterBills(params);
        }
      } catch (error) {
        console.error('Water bills error:', error);
        return { data: { success: true, data: [] } };
      }
    },

    // SMS Report
    getSMSHistory: async (params) => {
      try {
        if (API.reportAPI?.getSMSHistory) {
           return await API.reportAPI.getSMSHistory(params);
        } else if (API.agentSMS?.getAgentSMSHistory) {
           return await API.agentSMS.getAgentSMSHistory(params);
        } else {
           return { data: { success: true, data: [] } };
        }
      } catch (error) {
        console.error('SMS history error:', error);
        return { data: { success: true, data: [] } };
      }
    }
  };
};