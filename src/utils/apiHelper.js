// /src/utils/apiHelper.js
import { API } from '../services/api';
import agentService from '../services/AgentService';

export const getReportAPI = (user) => {
  // Helper to get correct API based on user role and available endpoints
  return {
    // Tenants Report
    getTenants: async (params) => {
      if (user?.role === 'agent') {
        // Use agent-specific endpoint
        try {
          const response = await agentService.getTenantsWithPaymentStatus();
          return { data: { success: true, data: response.data?.data || [] } };
        } catch (error) {
          console.error('Agent tenants error:', error);
          // Fallback to regular API
          return { data: { success: true, data: [] } };
        }
      } else {
        return API.tenants?.getTenants?.(params) || { data: { success: true, data: [] } };
      }
    },

    // Payments Report
    getPayments: async (params) => {
      if (user?.role === 'agent') {
        // For now, get tenants with payment status
        try {
          const response = await agentService.getTenantsWithPaymentStatus();
          const tenants = response.data?.data || [];
          // Transform tenants to payment-like structure for reports
          const payments = tenants.map(tenant => ({
            id: tenant.tenant_id || tenant.id,
            tenant_name: tenant.tenant_name || `${tenant.first_name} ${tenant.last_name}`,
            amount: tenant.monthly_rent || 0,
            payment_month: new Date().toISOString().slice(0, 7),
            status: tenant.payment_status || 'pending',
            created_at: new Date().toISOString()
          }));
          return { data: { success: true, data: payments } };
        } catch (error) {
          console.error('Agent payments error:', error);
          return { data: { success: true, data: [] } };
        }
      } else {
        return API.payments?.getPayments?.(params) || { data: { success: true, data: [] } };
      }
    },

    // Properties Report
    getProperties: async () => {
      if (user?.role === 'agent') {
        try {
          const response = await agentService.getAssignedProperties();
          return { data: { success: true, data: response.data?.data || [] } };
        } catch (error) {
          console.error('Agent properties error:', error);
          return { data: { success: true, data: [] } };
        }
      } else {
        return API.properties?.getProperties?.() || { data: { success: true, data: [] } };
      }
    },

    // Complaints Report
    getComplaints: async (params) => {
      if (user?.role === 'agent') {
        try {
          const response = await agentService.getAssignedComplaints(params.status || 'open');
          return { data: { success: true, data: response.data?.data || [] } };
        } catch (error) {
          console.error('Agent complaints error:', error);
          return { data: { success: true, data: [] } };
        }
      } else {
        return API.complaints?.getComplaints?.(params) || { data: { success: true, data: [] } };
      }
    },

    // Water Bills Report
    getWaterBills: async (params) => {
      try {
        // Check if API.waterBill exists
        if (API.waterBill?.listWaterBills) {
          return await API.waterBill.listWaterBills(params);
        } else if (API.waterBills?.listWaterBills) {
          return await API.waterBills.listWaterBills(params);
        } else {
          // Fallback
          return { data: { success: true, data: [] } };
        }
      } catch (error) {
        console.error('Water bills error:', error);
        return { data: { success: true, data: [] } };
      }
    },

    // SMS Report
    getSMSHistory: async (params) => {
      try {
        // Check if API.billing exists
        if (API.billing?.getSMSHistory) {
          return await API.billing.getSMSHistory(params);
        } else if (API.billingAPI?.getSMSHistory) {
          return await API.billingAPI.getSMSHistory(params);
        } else {
          // Fallback
          return { data: { success: true, data: [] } };
        }
      } catch (error) {
        console.error('SMS history error:', error);
        return { data: { success: true, data: [] } };
      }
    }
  };
};