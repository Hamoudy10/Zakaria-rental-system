import React, { createContext, useState, useContext, useCallback } from 'react';
import { paymentAPI } from '../services/api';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);

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

  // Create new payment
  const createPayment = useCallback(async (paymentData) => {
    setLoading(true);
    setError(null);
    try {
      // Simulate API call until backend is implemented
      const newPayment = {
        id: Math.random().toString(36).substr(2, 9),
        ...paymentData,
        status: 'completed',
        payment_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        tenant: {
          id: paymentData.tenant_id,
          first_name: 'Tenant',
          last_name: 'User'
        },
        unit: {
          id: paymentData.unit_id,
          unit_code: 'UNIT001',
          property: {
            name: 'Sample Property'
          }
        }
      };
      
      setPayments(prev => [...prev, newPayment]);
      return newPayment;
    } catch (err) {
      console.error('Error creating payment:', err);
      setError('Failed to create payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update payment
  const updatePayment = useCallback(async (paymentId, updates) => {
    setLoading(true);
    setError(null);
    try {
      setPayments(prev => prev.map(payment => 
        payment.id === paymentId ? { ...payment, ...updates } : payment
      ));
    } catch (err) {
      console.error('Error updating payment:', err);
      setError('Failed to update payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete payment
  const deletePayment = useCallback(async (paymentId) => {
    setLoading(true);
    setError(null);
    try {
      setPayments(prev => prev.filter(payment => payment.id !== paymentId));
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
      setPayments(prev => prev.map(payment => 
        payment.id === paymentId 
          ? { ...payment, status: 'completed', confirmed_at: new Date().toISOString() }
          : payment
      ));
    } catch (err) {
      console.error('Error confirming payment:', err);
      setError('Failed to confirm payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get payments by tenant
  const getTenantPayments = useCallback((tenantId) => {
    return payments.filter(payment => payment.tenant_id === tenantId);
  }, [payments]);

  // Get payments by property
  const getPropertyPayments = useCallback((propertyId) => {
    return payments.filter(payment => payment.unit?.property_id === propertyId);
  }, [payments]);

  // Get monthly summary
  const getMonthlySummary = useCallback((year, month) => {
    const monthPayments = payments.filter(payment => {
      const paymentDate = new Date(payment.payment_month);
      return paymentDate.getFullYear() === year && paymentDate.getMonth() + 1 === month;
    });
    
    const totalAmount = monthPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const completedPayments = monthPayments.filter(p => p.status === 'completed').length;
    
    return {
      totalPayments: monthPayments.length,
      completedPayments,
      pendingPayments: monthPayments.length - completedPayments,
      totalAmount
    };
  }, [payments]);

  const value = React.useMemo(() => ({
    payments,
    loading,
    error,
    selectedPayment,
    setSelectedPayment,
    fetchPayments,
    createPayment,
    updatePayment,
    deletePayment,
    confirmPayment,
    getTenantPayments,
    getPropertyPayments,
    getMonthlySummary,
    clearError: () => setError(null)
  }), [
    payments,
    loading,
    error,
    selectedPayment,
    fetchPayments,
    createPayment,
    updatePayment,
    deletePayment,
    confirmPayment,
    getTenantPayments,
    getPropertyPayments,
    getMonthlySummary
  ]);

  return (
    <PaymentContext.Provider value={value}>
      {children}
    </PaymentContext.Provider>
  );
};