import React, { createContext, useState, useContext, useCallback } from 'react';
import { enhancedPaymentAPI, mpesaUtils, mockMpesaAPI } from '../services/api';

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

  // Fetch all payments
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await enhancedPaymentAPI.getPayments();
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
      const response = await enhancedPaymentAPI.getTenantPayments(tenantId);
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
      const response = await enhancedPaymentAPI.getTenantAllocations(tenantId);
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
      // Format phone number for M-Pesa
      const formattedPaymentData = {
        ...paymentData,
        phone_number: mpesaUtils.formatPhoneNumber(paymentData.phone_number),
        amount: mpesaUtils.formatAmount(paymentData.amount)
      };

      // Check if we're in development mode (mock API) or production (real API)
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      let result;
      
      if (isDevelopment) {
        // Use mock API for development
        console.log('Using mock M-Pesa API for development');
        result = await processMockMpesaPayment(formattedPaymentData);
      } else {
        // Use real M-Pesa API for production
        console.log('Using real M-Pesa API for production');
        result = await enhancedPaymentAPI.processMpesaPayment(formattedPaymentData);
      }

      if (result.success) {
        // Refresh payments list
        await fetchPayments();
        return {
          success: true,
          mpesa_receipt: result.mpesa_receipt || result.payment?.mpesa_receipt_number,
          transactionId: result.transactionId || result.checkoutRequestId,
          message: result.message || 'Payment initiated successfully'
        };
      } else {
        throw new Error(result.error || result.message || 'Payment processing failed');
      }
      
    } catch (err) {
      console.error('Error processing M-Pesa payment:', err);
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
      // Simulate M-Pesa STK push
      const stkResponse = await mockMpesaAPI.stkPush(paymentData);
      
      // Simulate payment confirmation after delay
      return new Promise((resolve) => {
        setTimeout(async () => {
          // Create payment record with completed status for mock
          const paymentRecord = {
            ...paymentData,
            mpesa_transaction_id: stkResponse.data.CheckoutRequestID,
            mpesa_receipt_number: `RC${Date.now()}`,
            status: 'completed',
            payment_date: new Date().toISOString()
          };

          try {
            const response = await enhancedPaymentAPI.createPayment(paymentRecord);
            resolve({
              success: true,
              mpesa_receipt: paymentRecord.mpesa_receipt_number,
              transactionId: paymentRecord.mpesa_transaction_id,
              message: 'Mock payment completed successfully',
              payment: response.data
            });
          } catch (error) {
            resolve({
              success: false,
              error: 'Failed to create payment record'
            });
          }
        }, 3000);
      });
    } catch (err) {
      return {
        success: false,
        error: 'Mock payment simulation failed'
      };
    }
  }, []);

  // Check M-Pesa payment status
  const checkMpesaPaymentStatus = useCallback(async (checkoutRequestId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await enhancedPaymentAPI.checkPaymentStatus(checkoutRequestId);
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
      const response = await enhancedPaymentAPI.createPayment(paymentData);
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
      const response = await enhancedPaymentAPI.updatePayment(paymentId, updates);
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
      const response = await enhancedPaymentAPI.deletePayment(paymentId);
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
      const response = await enhancedPaymentAPI.confirmPayment(paymentId);
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
      const response = await enhancedPaymentAPI.getPaymentStats();
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
      const response = await enhancedPaymentAPI.getUnitPayments(unitId);
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
      const response = await enhancedPaymentAPI.generateReport(reportData);
      return response.data;
    } catch (err) {
      console.error('Error generating payment report:', err);
      setError('Failed to generate payment report');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Validate M-Pesa phone number
  const validateMpesaPhone = useCallback((phoneNumber) => {
    return mpesaUtils.isValidMpesaPhone(phoneNumber);
  }, []);

  // Format phone number for M-Pesa
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
    deletePayment, // ADDED: Now included
    confirmPayment,
    processMpesaPayment,
    checkMpesaPaymentStatus,
    
    // Allocation functions
    getAllocationByTenantId,
    getUpcomingPayments,
    
    // Utility functions
    getPaymentSummary,
    getMonthlySummary, // ADDED: Now included
    fetchPaymentStats, // ADDED: Now included
    generatePaymentReport, // ADDED: Now included
    validateMpesaPhone,
    formatMpesaPhone,
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
    createPayment,
    updatePayment,
    deletePayment, // ADDED: Now included
    confirmPayment,
    processMpesaPayment,
    checkMpesaPaymentStatus,
    getAllocationByTenantId,
    getUpcomingPayments,
    getPaymentSummary,
    getMonthlySummary, // ADDED: Now included
    validateMpesaPhone,
    formatMpesaPhone
  ]);

  return (
    <PaymentContext.Provider value={value}>
      {children}
    </PaymentContext.Provider>
  );
};