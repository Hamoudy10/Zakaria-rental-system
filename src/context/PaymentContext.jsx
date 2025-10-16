import React, { createContext, useState, useContext, useCallback } from 'react'

const PaymentContext = createContext(undefined)

export const usePayment = () => {
  const context = useContext(PaymentContext)
  if (context === undefined) {
    throw new Error('usePayment must be used within a PaymentProvider')
  }
  return context
}

export const PaymentProvider = ({ children }) => {
  const [payments, setPayments] = useState([])
  const [paymentNotifications, setPaymentNotifications] = useState([])
  const [loading, setLoading] = useState(false)

  // Mock data - in real app, this would come from API
  const mockPayments = [
    {
      id: '1',
      tenant_id: '3',
      unit_id: '1-2',
      mpesa_transaction_id: 'RI704K5F6G',
      mpesa_receipt_number: 'RI704K5F6G',
      phone_number: '254722222222',
      amount: 65000,
      payment_month: '2024-03-01',
      payment_date: new Date('2024-03-05').toISOString(),
      status: 'completed',
      confirmed_by: '1',
      confirmed_at: new Date('2024-03-05').toISOString(),
      tenant: {
        first_name: 'Mary',
        last_name: 'Wanjiku'
      },
      unit: {
        unit_code: 'WL001-102',
        property: {
          name: 'Westlands Apartments'
        }
      }
    }
  ]

  // Initialize with mock data
  React.useEffect(() => {
    setPayments(mockPayments)
  }, [])

  // Simulate M-Pesa payment processing
  const processMpesaPayment = useCallback(async (paymentData) => {
    setLoading(true)
    try {
      // Simulate API call to M-Pesa
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Generate mock M-Pesa response
      const mpesaTransactionId = 'RI' + Math.random().toString(36).substr(2, 8).toUpperCase()
      const mpesaReceiptNumber = mpesaTransactionId
      
      const newPayment = {
        id: Math.random().toString(36).substr(2, 9),
        ...paymentData,
        mpesa_transaction_id: mpesaTransactionId,
        mpesa_receipt_number: mpesaReceiptNumber,
        payment_date: new Date().toISOString(),
        status: 'completed',
        confirmed_by: null,
        confirmed_at: null
      }
      
      setPayments(prev => [newPayment, ...prev])
      
      // Create payment notification
      const notification = {
        id: Math.random().toString(36).substr(2, 9),
        payment_id: newPayment.id,
        recipient_id: paymentData.tenant_id,
        message_type: 'payment_confirmation',
        message_content: `Payment of KSh ${paymentData.amount.toLocaleString()} for ${new Date(paymentData.payment_month).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })} received. M-Pesa Code: ${mpesaReceiptNumber}`,
        mpesa_code: mpesaReceiptNumber,
        amount: paymentData.amount,
        payment_date: new Date().toISOString(),
        property_info: 'Westlands Apartments - WL001-102',
        unit_info: 'Unit WL001-102',
        is_sent: true,
        sent_at: new Date().toISOString()
      }
      
      setPaymentNotifications(prev => [notification, ...prev])
      
      return {
        success: true,
        payment: newPayment,
        mpesa_receipt: mpesaReceiptNumber,
        message: 'Payment processed successfully'
      }
    } catch (error) {
      return {
        success: false,
        error: 'Payment processing failed. Please try again.'
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const confirmPayment = useCallback((paymentId, confirmedBy) => {
    setPayments(prev => prev.map(payment => 
      payment.id === paymentId 
        ? { 
            ...payment, 
            status: 'completed',
            confirmed_by: confirmedBy,
            confirmed_at: new Date().toISOString()
          }
        : payment
    ))
  }, [])

  const getPaymentsByTenant = useCallback((tenantId) => {
    return payments.filter(payment => payment.tenant_id === tenantId)
  }, [payments])

  const getPendingPayments = useCallback(() => {
    return payments.filter(payment => payment.status === 'pending')
  }, [payments])

  const getPaymentStats = useCallback(() => {
    const totalPayments = payments.length
    const completedPayments = payments.filter(p => p.status === 'completed').length
    const pendingPayments = payments.filter(p => p.status === 'pending').length
    const totalRevenue = payments
      .filter(p => p.status === 'completed')
      .reduce((sum, payment) => sum + payment.amount, 0)
    
    return {
      totalPayments,
      completedPayments,
      pendingPayments,
      totalRevenue
    }
  }, [payments])

  const getUpcomingPayments = useCallback((allocations) => {
    const currentDate = new Date()
    const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    
    return allocations.map(allocation => {
      const paidThisMonth = payments.some(payment => 
        payment.tenant_id === allocation.tenant_id &&
        payment.unit_id === allocation.unit_id &&
        new Date(payment.payment_month).getTime() === currentMonth.getTime() &&
        payment.status === 'completed'
      )
      
      return {
        ...allocation,
        paidThisMonth,
        dueDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), allocation.rent_due_day)
      }
    })
  }, [payments])

  const value = React.useMemo(() => ({
    payments,
    paymentNotifications,
    loading,
    processMpesaPayment,
    confirmPayment,
    getPaymentsByTenant,
    getPendingPayments,
    getPaymentStats,
    getUpcomingPayments
  }), [
    payments,
    paymentNotifications,
    loading,
    processMpesaPayment,
    confirmPayment,
    getPaymentsByTenant,
    getPendingPayments,
    getPaymentStats,
    getUpcomingPayments
  ])

  return <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>
}