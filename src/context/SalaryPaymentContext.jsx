import React, { createContext, useState, useContext, useCallback } from 'react';
import { salaryPaymentAPI } from '../services/api.jsx';

const SalaryPaymentContext = createContext(undefined);

export const useSalaryPayment = () => {
  const context = useContext(SalaryPaymentContext);
  if (context === undefined) {
    throw new Error('useSalaryPayment must be used within a SalaryPaymentProvider');
  }
  return context;
};

export const SalaryPaymentProvider = ({ children }) => {
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);

  // Fetch all salary payments
  const fetchSalaryPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await salaryPaymentAPI.getSalaryPayments();
      setSalaryPayments(response.data.salaryPayments || []);
    } catch (err) {
      console.error('Error fetching salary payments:', err);
      setError('Failed to fetch salary payments');
      setSalaryPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new salary payment
  const createSalaryPayment = useCallback(async (paymentData) => {
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
        agent: {
          id: paymentData.agent_id,
          first_name: 'Agent',
          last_name: 'User',
          phone_number: paymentData.phone_number
        },
        paid_by_user: {
          first_name: 'Admin',
          last_name: 'User'
        }
      };
      
      setSalaryPayments(prev => [...prev, newPayment]);
      return newPayment;
    } catch (err) {
      console.error('Error creating salary payment:', err);
      setError('Failed to create salary payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update salary payment
  const updateSalaryPayment = useCallback(async (paymentId, updates) => {
    setLoading(true);
    setError(null);
    try {
      setSalaryPayments(prev => prev.map(payment => 
        payment.id === paymentId ? { ...payment, ...updates } : payment
      ));
    } catch (err) {
      console.error('Error updating salary payment:', err);
      setError('Failed to update salary payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete salary payment
  const deleteSalaryPayment = useCallback(async (paymentId) => {
    setLoading(true);
    setError(null);
    try {
      setSalaryPayments(prev => prev.filter(payment => payment.id !== paymentId));
    } catch (err) {
      console.error('Error deleting salary payment:', err);
      setError('Failed to delete salary payment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Mark payment as completed
  const markAsCompleted = useCallback(async (paymentId) => {
    setLoading(true);
    setError(null);
    try {
      setSalaryPayments(prev => prev.map(payment => 
        payment.id === paymentId 
          ? { ...payment, status: 'completed', payment_date: new Date().toISOString() }
          : payment
      ));
    } catch (err) {
      console.error('Error marking payment as completed:', err);
      setError('Failed to mark payment as completed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get payments by agent
  const getAgentPayments = useCallback((agentId) => {
    return salaryPayments.filter(payment => payment.agent_id === agentId);
  }, [salaryPayments]);

  // Get payments by status
  const getPaymentsByStatus = useCallback((status) => {
    return salaryPayments.filter(payment => payment.status === status);
  }, [salaryPayments]);

  // Get monthly summary
  const getMonthlySummary = useCallback((year, month) => {
    const payments = salaryPayments.filter(payment => {
      const paymentDate = new Date(payment.payment_month);
      return paymentDate.getFullYear() === year && paymentDate.getMonth() + 1 === month;
    });
    
    const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const completedPayments = payments.filter(p => p.status === 'completed').length;
    
    return {
      totalPayments: payments.length,
      completedPayments,
      pendingPayments: payments.length - completedPayments,
      totalAmount: totalPaid
    };
  }, [salaryPayments]);

  const value = React.useMemo(() => ({
    salaryPayments,
    loading,
    error,
    selectedPayment,
    setSelectedPayment,
    fetchSalaryPayments,
    createSalaryPayment,
    updateSalaryPayment,
    deleteSalaryPayment,
    markAsCompleted,
    getAgentPayments,
    getPaymentsByStatus,
    getMonthlySummary,
    clearError: () => setError(null)
  }), [
    salaryPayments,
    loading,
    error,
    selectedPayment,
    fetchSalaryPayments,
    createSalaryPayment,
    updateSalaryPayment,
    deleteSalaryPayment,
    markAsCompleted,
    getAgentPayments,
    getPaymentsByStatus,
    getMonthlySummary
  ]);

  return (
    <SalaryPaymentContext.Provider value={value}>
      {children}
    </SalaryPaymentContext.Provider>
  );
};