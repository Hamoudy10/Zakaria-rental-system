import React, { createContext, useState, useContext, useCallback, useMemo } from 'react';
import { paymentAPI, mpesaUtils } from '../services/api'; // Removed mockMpesaAPI as it's not directly used here for client-side mocks

const PaymentContext = createContext(undefined);

export const usePayment = () => {
  const context = useContext(PaymentContext);
  if (context === undefined) {
    throw new Error('usePayment must be used within a PaymentProvider');
  }
  return context;
};

export const PaymentProvider = ({ children }) => {
  const [payments, setPayments] = useState([]);
  const [allocations, setAllocations] = useState([]); // Provide allocations in context
  const [paymentNotifications, setPaymentNotifications] = useState([]); // Provide notifications in context
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
  });
  // Clear error
  const clearError = useCallback(() => setError(null), []);

  // Function to format payment month to proper format
  const formatPaymentMonthForBackend = useCallback((paymentMonth) => {
    // console.log('📅 Formatting payment month in frontend:', paymentMonth);
    
    // If it's already in YYYY-MM-DD format, return as is
    if (typeof paymentMonth === 'string' && paymentMonth.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return paymentMonth;
    }
    
    // If it's in YYYY-MM format, add the first day
    if (typeof paymentMonth === 'string' && paymentMonth.match(/^\d{4}-\d{2}$/)) {
      return `${paymentMonth}-01`;
    }
    
    // If it's a Date object, format it
    if (paymentMonth instanceof Date) {
      return paymentMonth.toISOString().split('T')[0];
    }
    
    // Default: use current month first day
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }, []);

  const fetchPayments = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getPayments(params);
      if (response.data.success) {
        setPayments(response.data.data.payments || []);
        setPagination(response.data.data.pagination || {});
      } else {
        throw new Error(response.data.message || 'Failed to fetch payments');
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch payments');
      setPayments([]);
      setPagination({ currentPage: 1, totalPages: 1, totalCount: 0 }); // Reset pagination on error
    } finally {
      setLoading(false);
    }
  }, []);

 // ✅ NEW: Fetch full payment history for a single tenant (used by PaymentManagement.jsx)
  const fetchTenantHistory = useCallback(async (tenantId) => {
    try {
      // paymentAPI.getPaymentHistory now accepts optional params for flexibility
      const response = await paymentAPI.getPaymentHistory(tenantId); 
      if (response.data.success) {
        // Expecting { payments: [], summary: {} } from this specific API call
        return response.data.data; 
      }
      throw new Error(response.data.message || 'Failed to fetch tenant history');
    } catch (err) {
      console.error('Error fetching tenant history:', err);
      // Do NOT set global error here, let the calling component (PaymentManagement.jsx) handle `historyError`
      return null; // Return null to indicate failure to the component
    }
  }, []);

  // Get payments by tenant ID
  const getPaymentsByTenant = useCallback(async (tenantId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getPaymentsByTenant(tenantId);
      if (response.data.success) {
        return response.data.data.payments || [];
      }
      throw new Error(response.data.message || 'Failed to fetch tenant payments');
    } catch (err) {
      console.error('Error fetching tenant payments:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch tenant payments');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Get allocation by tenant ID
  const getAllocationByTenantId = useCallback(async (tenantId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getTenantAllocations(tenantId); // Assuming an endpoint for tenant allocations
      if (response.data.success) {
        const allocations = response.data.data.allocations || [];
        // Return the first active allocation
        return allocations.find(allocation => allocation.is_active) || allocations[0] || null;
      }
      throw new Error(response.data.message || 'Failed to fetch allocation');
    } catch (err) {
      console.error('Error fetching allocation:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch allocation details');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // NEW: Poll payment status until confirmed or timeout
  const pollPaymentStatus = useCallback(async (checkoutRequestId, maxAttempts = 60) => {
    let attempts = 0;
    
    const poll = async () => {
      attempts++;
      console.log(`🔄 Polling payment status (attempt ${attempts}/${maxAttempts})`);
      
      try {
        const statusResponse = await paymentAPI.checkPaymentStatus(checkoutRequestId);
        const payment = statusResponse.data.data.payment; // Assuming 'data' wrapper

        console.log('📊 Payment status:', payment.status);
        
        if (payment.status === 'completed') {
          console.log('✅ Payment completed via M-Pesa callback');
          await fetchPayments(); // Refresh main payment list
          return { 
            success: true, 
            payment,
            message: 'Payment confirmed successfully!' 
          };
        } else if (payment.status === 'failed' || payment.status === 'cancelled') {
          console.log('❌ Payment failed via M-Pesa callback');
          return { 
            success: false, 
            payment,
            error: payment.failure_reason || 'Payment failed' 
          };
        }
        
        // If still pending and not exceeded max attempts, continue polling
        if (attempts < maxAttempts && payment.status === 'pending') {
          console.log('⏳ Payment still pending, waiting...');
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
          return await poll();
        } else if (attempts >= maxAttempts) {
          console.log('⏰ Payment status polling timeout');
          return { 
            success: false, 
            payment,
            error: 'Payment confirmation timeout. Please check your M-Pesa messages.' 
          };
        }
        
        return { success: false, payment, error: 'Payment status unknown' };
        
      } catch (error) {
        console.error('❌ Error polling payment status:', error);
        
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          return await poll();
        } else {
          setError(error.response?.data?.message || error.message || 'Unable to verify payment status. Please check your M-Pesa messages.');
          return { 
            success: false, 
            error: 'Unable to verify payment status. Please check your M-Pesa messages.' 
          };
        }
      }
    };
    
    return await poll();
  }, [fetchPayments, setError]);

  // Client-side mock for M-Pesa payment (for dev environment when not using real M-Pesa)
  const processMockMpesaPayment = useCallback(async (paymentData) => {
    console.log('🔄 Simulating mock M-Pesa payment (client-side)...', paymentData);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

    const mockCheckoutRequestId = `MOCK_REQ_${Date.now()}`;
    const mockMpesaReceiptNumber = `RCL${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const mockTransactionId = `MOCK_TRX_${Date.now()}`;

    // Return a mock success response immediately for client-side testing
    const mockPayment = {
      id: `mock-payment-${Date.now()}`,
      mpesa_receipt_number: mockMpesaReceiptNumber,
      mpesa_transaction_id: mockTransactionId,
      status: 'completed', 
      amount: paymentData.amount,
      payment_date: new Date().toISOString(),
      tenant_id: `mock-tenant-${Date.now()}`, // Placeholder
      unit_id: paymentData.unitId,
      // Add other necessary fields if the frontend relies on them
    };

    return {
      success: true,
      message: 'Mock M-Pesa payment simulated successfully (client-side)',
      payment: mockPayment,
      mpesa_receipt: mockMpesaReceiptNumber,
      transactionId: mockTransactionId, // Ensure this matches payment.mpesa_transaction_id
      checkoutRequestID: mockCheckoutRequestId, // This is what the backend usually returns for STK push
      requiresPolling: false, // No polling needed for client-side mock
    };
  }, []);

  // UPDATED: Process M-Pesa payment with proper status polling
  const processMpesaPayment = useCallback(async (paymentData) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('📦 Original payment data from form:', paymentData);
      
      // Format payment month before sending to backend
      const formattedPaymentMonth = formatPaymentMonthForBackend(paymentData.payment_month);
      console.log('📅 Formatted payment month for backend:', formattedPaymentMonth);
      
      // Map frontend field names to backend expected field names
      const formattedPaymentData = {
        phone: mpesaUtils.formatPhoneNumber(paymentData.phone_number),
        amount: Math.round(parseFloat(paymentData.amount)), // M-Pesa requires whole numbers
        unitId: paymentData.unit_id,
        paymentMonth: formattedPaymentMonth
      };

      console.log('📤 Formatted payment data for backend:', formattedPaymentData);

      // Validate all required fields are present
      if (!formattedPaymentData.phone || !formattedPaymentData.amount || 
          !formattedPaymentData.unitId || !formattedPaymentData.paymentMonth) {
        throw new Error('Missing required payment fields after formatting');
      }

      const isDevelopment = import.meta.env.MODE === 'development';
      const useRealMpesa = import.meta.env.VITE_USE_REAL_MPESA === 'true';
      
      console.log('🔧 Environment settings:', { isDevelopment, useRealMpesa });
      
      let result;
      
      // If in development and not explicitly forcing real M-Pesa, use client-side mock
      if (isDevelopment && !useRealMpesa) {
        console.log('🔄 Using client-side mock M-Pesa API for development');
        result = await processMockMpesaPayment(formattedPaymentData);
        
        // For client-side mock, it's already 'completed', so refresh payments
        if (result.success) {
          await fetchPayments();
        }
      } else {
        // Use real M-Pesa API for production or when explicitly set in development
        console.log('🔄 Using real M-Pesa API');
        const response = await paymentAPI.processMpesaPayment(formattedPaymentData);
        result = response.data; // Assuming backend response is already { success, data, message } format
        
        console.log('📥 Backend response (real M-Pesa):', result);

        // Check if STK push was initiated successfully
        if (!result.success || !result.checkoutRequestID) {
          throw new Error(result.error || result.message || 'Failed to initiate M-Pesa payment');
        }
      }
      
      // Return details for polling if STK push initiated, or final result if mock
      return {
        success: result.success,
        checkoutRequestID: result.checkoutRequestID, // Should be present for real M-Pesa, mock also provides one
        message: result.message || 'M-Pesa payment initiated. Please check your phone to enter your M-Pesa PIN.',
        requiresPolling: !(isDevelopment && !useRealMpesa), // Requires polling unless it's a client-side mock
        payment: result.payment // Mock provides this directly, real M-Pesa might not
      };
      
    } catch (err) {
      console.error('💥 ERROR in processMpesaPayment:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      const errorMsg = err.response?.data?.message || err.message || 'M-Pesa payment failed';
      setError(errorMsg);
      return {
        success: false,
        error: errorMsg,
        requiresPolling: false
      };
    } finally {
      setLoading(false);
    }
  }, [fetchPayments, formatPaymentMonthForBackend, processMockMpesaPayment, setError]);

  // NEW: Process paybill payment
  const processPaybillPayment = useCallback(async (paymentData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.processPaybillPayment(paymentData);
      if (response.data.success) { // Assuming response is { data: { success, message, ... }}
        await fetchPayments();
        return response.data;
      }
      throw new Error(response.data.message || 'Failed to process paybill payment');
    } catch (err) {
      console.error('Error processing paybill payment:', err);
      setError(err.response?.data?.message || err.message || 'Failed to process paybill payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPayments, setError]);

  // NEW: Get payment status by unit code
  const getPaymentStatusByUnitCode = useCallback(async (unitCode, month = null) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getPaymentStatusByUnitCode(unitCode, month);
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to get payment status');
    } catch (err) {
      console.error('Error getting payment status:', err);
      setError(err.response?.data?.message || err.message || 'Failed to get payment status');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // NEW: Send balance reminders
  const sendBalanceReminders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.sendBalanceReminders();
      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.message || 'Failed to send balance reminders');
    } catch (err) {
      console.error('Error sending balance reminders:', err);
      setError(err.response?.data?.message || err.message || 'Failed to send balance reminders');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // NEW: Test SMS service
  const testSMSService = useCallback(async (testData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.testSMSService(testData);
      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.message || 'Failed to test SMS service');
    } catch (err) {
      console.error('Error testing SMS service:', err);
      setError(err.response?.data?.message || err.message || 'Failed to test SMS service');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // NEW: Get paybill statistics
  const getPaybillStats = useCallback(async (period = '30days') => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getPaybillStats(period);
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to get paybill statistics');
    } catch (err) {
      console.error('Error getting paybill stats:', err);
      setError(err.response?.data?.message || err.message || 'Failed to get paybill statistics');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // NEW: Function to check payment status (for polling)
  const checkPaymentStatus = useCallback(async (checkoutRequestId) => {
    try {
      // console.log('🔍 Checking payment status for:', checkoutRequestId);
      const response = await paymentAPI.checkPaymentStatus(checkoutRequestId);
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to check payment status');
    } catch (err) {
      console.error('Error checking payment status:', err);
      // Let pollPaymentStatus handle the global error
      throw err;
    }
  }, []);

  // Get upcoming payments
  const getUpcomingPayments = useCallback(async (tenantId) => { // Made async as it calls API
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getUpcomingPayments(tenantId);
      if (response.data.success) {
        // Assuming response.data.data contains the list of upcoming payments or allocations
        // Adjust this based on your actual API response for upcoming payments
        const upcoming = response.data.data.upcomingPayments || response.data.data;
        return upcoming.map(allocation => ({
          ...allocation,
          // You might need to fetch `payments` state here if `paidThisMonth` relies on the current payments context
          // For simplicity, `paidThisMonth` logic can be moved to the backend or passed as a parameter to the API.
          // For now, removing `paidThisMonth` calculation that relies on `payments` state.
          // If needed, the backend for getUpcomingPayments should include this info.
          // paidThisMonth: payments.some(...) // This would cause `payments` dependency in useCallback
        }));
      }
      throw new Error(response.data.message || 'Failed to fetch upcoming payments');
    } catch (err) {
      console.error('Error fetching upcoming payments:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch upcoming payments');
      return [];
    } finally {
      setLoading(false);
    }
  }, [setError]); // Removed `payments` from dependency array

  // Create payment (for other payment methods, assuming backend handles allocations)
  const createPayment = useCallback(async (paymentData) => {
    setLoading(true);
    setError(null);
    try {
      // Format payment month before sending
      const formattedData = {
        ...paymentData,
        payment_month: formatPaymentMonthForBackend(paymentData.payment_month)
      };
      
      const response = await paymentAPI.createPayment(formattedData);
      if (response.data.success) { // Assuming response.data.success
        await fetchPayments();
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to create payment');
    } catch (err) {
      console.error('Error creating payment:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPayments, formatPaymentMonthForBackend, setError]);

  // Update payment
  const updatePayment = useCallback(async (paymentId, updates) => {
    setLoading(true);
    setError(null);
    try {
      // Format payment month if present
      const formattedUpdates = { ...updates };
      if (updates.payment_month) {
        formattedUpdates.payment_month = formatPaymentMonthForBackend(updates.payment_month);
      }
      
      const response = await paymentAPI.updatePayment(paymentId, formattedUpdates);
      if (response.data.success) { // Assuming response.data.success
        await fetchPayments();
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to update payment');
    } catch (err) {
      console.error('Error updating payment:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPayments, formatPaymentMonthForBackend, setError]);

  // Delete payment function
  const deletePayment = useCallback(async (paymentId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.deletePayment(paymentId);
      if (response.data.success) { // Assuming response.data.success
        // Remove payment from local state
        setPayments(prev => prev.filter(payment => payment.id !== paymentId));
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to delete payment');
    } catch (err) {
      console.error('Error deleting payment:', err);
      setError(err.response?.data?.message || err.message || 'Failed to delete payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // Confirm payment
  const confirmPayment = useCallback(async (paymentId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.confirmPayment(paymentId);
      if (response.data.success) { // Assuming response.data.success
        await fetchPayments();
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to confirm payment');
    } catch (err) {
      console.error('Error confirming payment:', err);
      setError(err.response?.data?.message || err.message || 'Failed to confirm payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPayments, setError]);

  // Enhanced get payment summary function with proper API call
  const getPaymentSummary = useCallback(async (tenantId, unitId) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Fetching payment summary for tenant ${tenantId}, unit ${unitId}`);
      
      const response = await paymentAPI.getPaymentSummary(tenantId, unitId);
      
      if (response.data?.success) {
        console.log('✅ Payment summary fetched successfully:', response.data.data.summary);
        return response.data.data.summary;
      } else {
        // Fallback or specific error if API fails
        throw new Error(response.data?.message || 'Failed to fetch payment summary from API');
      }
    } catch (err) {
      console.error('❌ Error fetching payment summary:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch payment summary');
      return null; // Return null to indicate failure
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // Enhanced get payment history function (for specific unit/months)
  const getPaymentHistory = useCallback(async (tenantId, unitId, months = 12) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Fetching detailed payment history for tenant ${tenantId}, unit ${unitId}`);
      // paymentAPI.getPaymentHistory now accepts optional params
      const response = await paymentAPI.getPaymentHistory(tenantId, { unitId, months });
      
      if (response.data?.success) {
        console.log(`✅ Detailed payment history fetched successfully: ${response.data.data?.payments?.length || 0} payments`);
        return response.data.data; // Expecting { payments: [], monthlySummary: [], ... }
      } else {
        throw new Error(response.data?.message || 'Failed to fetch detailed payment history from API');
      }
    } catch (err) {
      console.error('❌ Error fetching detailed payment history:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch detailed payment history');
      return null; // Return null to indicate failure
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // NEW: Get future payments status
  const getFuturePaymentsStatus = useCallback(async (tenantId, unitId, futureMonths = 6) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Fetching future payments status for tenant ${tenantId}, unit ${unitId}`);
      
      const response = await paymentAPI.getFuturePaymentsStatus(tenantId, unitId, { futureMonths });
      
      if (response.data?.success) {
        console.log(`✅ Future payments status fetched successfully: ${response.data.data?.futurePayments?.length || 0} months`);
        return response.data.data;
      } else {
        throw new Error(response.data?.message || 'Failed to fetch future payments status');
      }
    } catch (err) {
      console.error('❌ Error fetching future payments status:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch future payments status');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // Get monthly summary function (client-side calculation from `payments` state)
  const getMonthlySummary = useCallback((year, month) => {
    const currentMonthPayments = payments.filter(payment => {
      if (!payment.payment_month) return false;
      
      const paymentDate = new Date(payment.payment_month);
      return (
        paymentDate.getFullYear() === year &&
        paymentDate.getMonth() === month && // Month is 0-indexed in JS Date, so remove +1
        payment.status === 'completed'
      );
    });

    return {
      completedPayments: currentMonthPayments.length,
      totalAmount: currentMonthPayments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0),
      pendingPayments: payments.filter(payment => {
        if (!payment.payment_month) return false;
        const paymentDate = new Date(payment.payment_month);
        return (
          paymentDate.getFullYear() === year &&
          paymentDate.getMonth() === month && // Month is 0-indexed
          payment.status === 'pending'
        );
      }).length
    };
  }, [payments]);

  // Fetch payment statistics from API
  const fetchPaymentStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getPaymentStats();
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to fetch payment statistics');
    } catch (err) {
      console.error('Error fetching payment statistics:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch payment statistics');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // Get payments by unit ID
  const getPaymentsByUnit = useCallback(async (unitId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getUnitPayments(unitId);
      if (response.data.success) {
        return response.data.data.payments || [];
      }
      throw new Error(response.data.message || 'Failed to fetch unit payments');
    } catch (err) {
      console.error('Error fetching unit payments:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch unit payments');
      return [];
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // Generate payment report
  const generatePaymentReport = useCallback(async (reportData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.generateReport(reportData); // Assuming paymentAPI.generateReport exists
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to generate payment report');
    } catch (err) {
      console.error('Error generating payment report:', err);
      setError(err.response?.data?.message || err.message || 'Failed to generate payment report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setError]);

  // Validate M-Pesa phone number using the imported mpesaUtils
  const validateMpesaPhone = useCallback((phoneNumber) => {
    return mpesaUtils.validatePhoneNumber(phoneNumber);
  }, []);

  // Format phone number for M-Pesa using the imported mpesaUtils
  const formatMpesaPhone = useCallback((phoneNumber) => {
    return mpesaUtils.formatPhoneNumber(phoneNumber);
  }, []);

  const value = useMemo(() => ({
    // State
    payments,
    pagination, // CRITICAL: Added pagination here
    allocations,
    paymentNotifications,
    loading,
    error,
    selectedPayment,
    
    // Setters
    setSelectedPayment,
    
    // Payment functions
    fetchPayments,
    fetchTenantHistory, // Added for PaymentManagement component
    getPaymentsByTenant,
    getPaymentsByUnit,
    createPayment,
    updatePayment,
    deletePayment,
    confirmPayment,
    processMpesaPayment,
    checkPaymentStatus,
    pollPaymentStatus,
    
    // NEW: Paybill functions
    processPaybillPayment,
    getPaymentStatusByUnitCode,
    sendBalanceReminders,
    testSMSService,
    getPaybillStats,
    
    // Allocation functions
    getAllocationByTenantId,
    getUpcomingPayments,
    
    // Utility functions
    getPaymentSummary,
    getPaymentHistory, // This is the detailed one
    getFuturePaymentsStatus,
    getMonthlySummary,
    fetchPaymentStats,
    generatePaymentReport,
    validateMpesaPhone,
    formatMpesaPhone,
    formatPaymentMonthForBackend,
    clearError
  }), [
    payments,
    pagination, // CRITICAL: Added pagination to useMemo dependencies
    allocations,
    paymentNotifications,
    loading,
    error,
    selectedPayment,
    fetchPayments,
    fetchTenantHistory, // Dependency for useMemo
    getPaymentsByTenant,
    getPaymentsByUnit,
    createPayment,
    updatePayment,
    deletePayment,
    confirmPayment,
    processMpesaPayment,
    checkPaymentStatus,
    pollPaymentStatus,
    processPaybillPayment,
    getPaymentStatusByUnitCode,
    sendBalanceReminders,
    testSMSService,
    getPaybillStats,
    getAllocationByTenantId,
    getUpcomingPayments,
    getPaymentSummary,
    getPaymentHistory,
    getFuturePaymentsStatus,
    getMonthlySummary,
    fetchPaymentStats,
    generatePaymentReport,
    validateMpesaPhone,
    formatMpesaPhone,
    formatPaymentMonthForBackend,
    clearError
  ]);

  return (
    <PaymentContext.Provider value={value}>
      {children}
    </PaymentContext.Provider>
  );
};