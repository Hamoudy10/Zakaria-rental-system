import React, { createContext, useState, useContext, useCallback } from 'react';
import { paymentAPI, mpesaUtils, mockMpesaAPI } from '../services/api';

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
  const [allocations, setAllocations] = useState([]);
  const [paymentNotifications, setPaymentNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  // FIXED: Function to format payment month to proper format
  const formatPaymentMonthForBackend = (paymentMonth) => {
    console.log('📅 Formatting payment month in frontend:', paymentMonth);
    
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
  };

  // Fetch all payments
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getPayments();
      setPayments(response.data.payments || []);
    } catch (err) {
      console.error('Error fetching payments:', err);
      setError('Failed to fetch payments');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Get payments by tenant ID
  const getPaymentsByTenant = useCallback(async (tenantId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getTenantPayments(tenantId);
      return response.data.payments || [];
    } catch (err) {
      console.error('Error fetching tenant payments:', err);
      setError('Failed to fetch tenant payments');
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
      const response = await paymentAPI.getTenantAllocations(tenantId);
      const allocations = response.data.allocations || [];
      // Return the first active allocation
      return allocations.find(allocation => allocation.is_active) || allocations[0] || null;
    } catch (err) {
      console.error('Error fetching allocation:', err);
      setError('Failed to fetch allocation details');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Process M-Pesa payment with real API integration
  const processMpesaPayment = useCallback(async (paymentData) => {
    setLoading(true);
    setError(null);
    try {
      console.log('📦 Original payment data from form:', paymentData);
      
      // FIXED: Format payment month before sending to backend
      const formattedPaymentMonth = formatPaymentMonthForBackend(paymentData.payment_month);
      console.log('📅 Formatted payment month for backend:', formattedPaymentMonth);
      
      // CORRECTED: Map frontend field names to backend expected field names
      const formattedPaymentData = {
        phone: mpesaUtils.formatPhoneNumber(paymentData.phone_number),
        amount: Math.round(parseFloat(paymentData.amount)), // M-Pesa requires whole numbers
        unitId: paymentData.unit_id,
        paymentMonth: formattedPaymentMonth // FIXED: Use formatted date
        // Remove tenant_id, property_name, unit_number as backend uses req.user.id
      };

      console.log('📤 Formatted payment data for backend:', formattedPaymentData);

      // Validate all required fields are present
      if (!formattedPaymentData.phone || !formattedPaymentData.amount || 
          !formattedPaymentData.unitId || !formattedPaymentData.paymentMonth) {
        throw new Error('Missing required payment fields after formatting');
      }

      // FIXED: Use import.meta.env for Vite instead of process.env
      const isDevelopment = import.meta.env.MODE === 'development';
      const useRealMpesa = import.meta.env.VITE_USE_REAL_MPESA === 'true';
      
      console.log('🔧 Environment settings:', { isDevelopment, useRealMpesa });
      
      let result;
      
      if (isDevelopment && !useRealMpesa) {
        // Use mock API for development unless explicitly set to use real M-Pesa
        console.log('🔄 Using mock M-Pesa API for development');
        result = await processMockMpesaPayment(formattedPaymentData);
      } else {
        // Use real M-Pesa API for production or when explicitly set
        console.log('🔄 Using real M-Pesa API');
        result = await paymentAPI.processMpesaPayment(formattedPaymentData);
      }

      console.log('📥 Backend response:', result);

      // FIXED: More flexible success checking
      if (result.success || result.data?.success) {
        console.log('✅ Payment successful, refreshing payments...');
        // Refresh payments list
        await fetchPayments();
        return {
          success: true,
          mpesa_receipt: result.mpesa_receipt || 
                         result.payment?.mpesa_receipt_number || 
                         result.data?.mpesa_receipt_number ||
                         'Pending',
          transactionId: result.transactionId || 
                         result.checkoutRequestId || 
                         result.checkoutRequestID ||
                         result.payment?.mpesa_transaction_id,
          message: result.message || 
                   result.data?.message || 
                   'Payment processed successfully'
        };
      } else {
        console.log('❌ Backend returned success: false');
        throw new Error(result.error || result.message || 'Payment processing failed');
      }
      
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
        error: errorMsg
      };
    } finally {
      setLoading(false);
    }
  }, [fetchPayments]);

  // Process mock M-Pesa payment for development
  const processMockMpesaPayment = useCallback(async (paymentData) => {
    try {
      console.log('🔄 Processing mock M-Pesa payment:', paymentData);
      
      // FIXED: Use the actual backend endpoint instead of creating a separate mock
      console.log('🔄 Calling backend mock endpoint...');
      const response = await paymentAPI.processMpesaPayment(paymentData);
      
      console.log('📥 Mock backend response:', response.data);
      
      // Return the response from the backend
      return response.data;
      
    } catch (err) {
      console.error('❌ Mock payment simulation failed:', err);
      // If backend call fails, create a local mock response
      return {
        success: true,
        message: 'Mock payment completed successfully',
        payment: {
          id: `mock-${Date.now()}`,
          mpesa_receipt_number: `RC${Date.now()}`,
          mpesa_transaction_id: `MOCK${Date.now()}`,
          status: 'completed',
          amount: paymentData.amount
        },
        checkoutRequestId: `MOCK${Date.now()}`
      };
    }
  }, []);

  // Check M-Pesa payment status
  const checkMpesaPaymentStatus = useCallback(async (checkoutRequestId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.checkPaymentStatus(checkoutRequestId);
      return response.data;
    } catch (err) {
      console.error('Error checking payment status:', err);
      setError('Failed to check payment status');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get upcoming payments
  const getUpcomingPayments = useCallback((allocations) => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    
    return allocations.map(allocation => {
      const paidThisMonth = payments.some(payment => 
        payment.unit_id === allocation.unit_id &&
        new Date(payment.payment_month).getFullYear() === currentYear &&
        new Date(payment.payment_month).getMonth() === currentMonth &&
        payment.status === 'completed'
      );
      
      return {
        ...allocation,
        paidThisMonth
      };
    });
  }, [payments]);

  // Create payment (for other payment methods)
  const createPayment = useCallback(async (paymentData) => {
    setLoading(true);
    setError(null);
    try {
      // FIXED: Format payment month before sending
      const formattedData = {
        ...paymentData,
        payment_month: formatPaymentMonthForBackend(paymentData.payment_month)
      };
      
      const response = await paymentAPI.createPayment(formattedData);
      if (response.success) {
        await fetchPayments();
        return response.data;
      }
      throw new Error(response.message || 'Failed to create payment');
    } catch (err) {
      console.error('Error creating payment:', err);
      setError('Failed to create payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPayments]);

  // Update payment
  const updatePayment = useCallback(async (paymentId, updates) => {
    setLoading(true);
    setError(null);
    try {
      // FIXED: Format payment month if present
      const formattedUpdates = { ...updates };
      if (updates.payment_month) {
        formattedUpdates.payment_month = formatPaymentMonthForBackend(updates.payment_month);
      }
      
      const response = await paymentAPI.updatePayment(paymentId, formattedUpdates);
      if (response.success) {
        await fetchPayments();
        return response.data;
      }
      throw new Error(response.message || 'Failed to update payment');
    } catch (err) {
      console.error('Error updating payment:', err);
      setError('Failed to update payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPayments]);

  // ADDED: Delete payment function
  const deletePayment = useCallback(async (paymentId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.deletePayment(paymentId);
      if (response.success) {
        // Remove payment from local state
        setPayments(prev => prev.filter(payment => payment.id !== paymentId));
        return response.data;
      }
      throw new Error(response.message || 'Failed to delete payment');
    } catch (err) {
      console.error('Error deleting payment:', err);
      setError('Failed to delete payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Confirm payment
  const confirmPayment = useCallback(async (paymentId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.confirmPayment(paymentId);
      if (response.success) {
        await fetchPayments();
        return response.data;
      }
      throw new Error(response.message || 'Failed to confirm payment');
    } catch (err) {
      console.error('Error confirming payment:', err);
      setError('Failed to confirm payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPayments]);

  // Get payment summary
  const getPaymentSummary = useCallback((tenantId) => {
    const tenantPayments = payments.filter(payment => payment.tenant_id === tenantId);
    const totalPaid = tenantPayments
      .filter(p => p.status === 'completed')
      .reduce((sum, payment) => sum + (payment.amount || 0), 0);
    
    const pendingPayments = tenantPayments.filter(p => p.status === 'pending');
    
    return {
      totalPayments: tenantPayments.length,
      completedPayments: tenantPayments.filter(p => p.status === 'completed').length,
      pendingPayments: pendingPayments.length,
      totalAmount: totalPaid
    };
  }, [payments]);

  // ADDED: Get monthly summary function
  const getMonthlySummary = useCallback((year, month) => {
    const currentMonthPayments = payments.filter(payment => {
      if (!payment.payment_month) return false;
      
      const paymentDate = new Date(payment.payment_month);
      return (
        paymentDate.getFullYear() === year &&
        paymentDate.getMonth() + 1 === month &&
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
          paymentDate.getMonth() + 1 === month &&
          payment.status === 'pending'
        );
      }).length
    };
  }, [payments]);

  // ADDED: Fetch payment statistics from API
  const fetchPaymentStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getPaymentStats();
      return response.data;
    } catch (err) {
      console.error('Error fetching payment statistics:', err);
      setError('Failed to fetch payment statistics');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ADDED: Get payments by unit ID
  const getPaymentsByUnit = useCallback(async (unitId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.getUnitPayments(unitId);
      return response.data.payments || [];
    } catch (err) {
      console.error('Error fetching unit payments:', err);
      setError('Failed to fetch unit payments');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ADDED: Generate payment report
  const generatePaymentReport = useCallback(async (reportData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentAPI.generateReport(reportData);
      return response.data;
    } catch (err) {
      console.error('Error generating payment report:', err);
      setError('Failed to generate payment report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Validate M-Pesa phone number using the imported mpesaUtils
  const validateMpesaPhone = useCallback((phoneNumber) => {
    return mpesaUtils.validatePhoneNumber(phoneNumber);
  }, []);

  // Format phone number for M-Pesa using the imported mpesaUtils
  const formatMpesaPhone = useCallback((phoneNumber) => {
    return mpesaUtils.formatPhoneNumber(phoneNumber);
  }, []);

  const value = React.useMemo(() => ({
    // State
    payments,
    allocations,
    paymentNotifications,
    loading,
    error,
    selectedPayment,
    
    // Setters
    setSelectedPayment,
    
    // Payment functions
    fetchPayments,
    getPaymentsByTenant,
    getPaymentsByUnit,
    createPayment,
    updatePayment,
    deletePayment,
    confirmPayment,
    processMpesaPayment,
    checkMpesaPaymentStatus,
    
    // Allocation functions
    getAllocationByTenantId,
    getUpcomingPayments,
    
    // Utility functions
    getPaymentSummary,
    getMonthlySummary,
    fetchPaymentStats,
    generatePaymentReport,
    validateMpesaPhone,
    formatMpesaPhone,
    formatPaymentMonthForBackend, // FIXED: Export for components to use
    clearError
  }), [
    payments,
    allocations,
    paymentNotifications,
    loading,
    error,
    selectedPayment,
    fetchPayments,
    getPaymentsByTenant,
    getPaymentsByUnit,
    createPayment,
    updatePayment,
    deletePayment,
    confirmPayment,
    processMpesaPayment,
    checkMpesaPaymentStatus,
    getAllocationByTenantId,
    getUpcomingPayments,
    getPaymentSummary,
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