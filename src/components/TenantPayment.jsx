import React, { useState, useEffect } from 'react'
import { usePayment } from '../context/PaymentContext'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'

const TenantPayment = ({ allocation, payments, onPaymentSuccess }) => {
  const { user } = useAuth()
  const { 
    loading, 
    error,
    processMpesaPayment, 
    checkPaymentStatus,
    pollPaymentStatus,
    getPaymentsByTenant,
    getPaymentSummary,
    getPaymentHistory,
    getFuturePaymentsStatus,
    validateMpesaPhone,
    formatMpesaPhone,
    clearError
  } = usePayment()

  const { refreshNotifications } = useNotification()
  
  const [tenantPayments, setTenantPayments] = useState(payments || [])
  const [paymentSummary, setPaymentSummary] = useState(null)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [futurePayments, setFuturePayments] = useState([])
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showFuturePayments, setShowFuturePayments] = useState(false)
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_month: '',
    phone_number: ''
  })
  const [paymentStatus, setPaymentStatus] = useState(null)
  const [phoneError, setPhoneError] = useState('')
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [futurePaymentsLoading, setFuturePaymentsLoading] = useState(false)
  const [isPolling, setIsPolling] = useState(false) // Track if we're polling for status
  const [currentCheckoutRequestId, setCurrentCheckoutRequestId] = useState(null) // Track current payment being polled

  // Update tenant payments when prop changes
  useEffect(() => {
    if (payments) {
      setTenantPayments(payments)
    }
  }, [payments])

  // Load payment summary, history, and future payments
  useEffect(() => {
    const loadPaymentData = async () => {
      if (user?.id && allocation?.unit_id) {
        setSummaryLoading(true);
        setFuturePaymentsLoading(true);
        try {
          // Load payment summary
          const summary = await getPaymentSummary(user.id, allocation.unit_id);
          setPaymentSummary(summary);
          
          // Load payment history
          const history = await getPaymentHistory(user.id, allocation.unit_id);
          setPaymentHistory(history.payments || []);
          
          // Load future payments status
          const future = await getFuturePaymentsStatus(user.id, allocation.unit_id);
          setFuturePayments(future.futurePayments || []);
        } catch (err) {
          console.error('Error loading payment data:', err);
        } finally {
          setSummaryLoading(false);
          setFuturePaymentsLoading(false);
        }
      }
    }

    loadPaymentData();
  }, [user, allocation, getPaymentSummary, getPaymentHistory, getFuturePaymentsStatus]);

  // NEW: Effect to handle payment status polling
  useEffect(() => {
    let pollingInterval;
    
    if (isPolling && currentCheckoutRequestId) {
      console.log('🔄 Starting payment status polling for:', currentCheckoutRequestId);
      
      pollingInterval = setInterval(async () => {
        try {
          console.log('🔍 Polling payment status...');
          const statusResult = await checkPaymentStatus(currentCheckoutRequestId);
          const payment = statusResult.payment;
          
          console.log('📊 Current payment status:', payment.status);
          
          if (payment.status === 'completed') {
            console.log('✅ Payment completed via M-Pesa!');
            setIsPolling(false);
            setCurrentCheckoutRequestId(null);
            clearInterval(pollingInterval);
            
            setPaymentStatus({ 
              type: 'success', 
              message: 'Payment confirmed successfully! Your rent payment has been processed.',
              receipt: payment.mpesa_receipt_number,
              transactionId: payment.mpesa_transaction_id
            });
            
            // Refresh data
            await refreshPaymentData();
            
          } else if (payment.status === 'failed') {
            console.log('❌ Payment failed via M-Pesa');
            setIsPolling(false);
            setCurrentCheckoutRequestId(null);
            clearInterval(pollingInterval);
            
            setPaymentStatus({ 
              type: 'error', 
              message: `Payment failed: ${payment.failure_reason || 'M-Pesa transaction failed'}` 
            });
          }
          // If still pending, continue polling...
        } catch (error) {
          console.error('❌ Error during status polling:', error);
          // Continue polling on error (network issues, etc.)
        }
      }, 3000); // Poll every 3 seconds
      
      // Stop polling after 3 minutes (180 seconds)
      setTimeout(() => {
        if (isPolling) {
          console.log('⏰ Polling timeout after 3 minutes');
          setIsPolling(false);
          setCurrentCheckoutRequestId(null);
          clearInterval(pollingInterval);
          
          setPaymentStatus({ 
            type: 'error', 
            message: 'Payment confirmation timeout. Please check your M-Pesa messages and refresh the page to see the payment status.' 
          });
        }
      }, 180000);
    }
    
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [isPolling, currentCheckoutRequestId, checkPaymentStatus]);

  // NEW: Function to refresh all payment data
  const refreshPaymentData = async () => {
    try {
      // Refresh payments list
      const updatedPayments = await getPaymentsByTenant(user.id)
      setTenantPayments(updatedPayments || [])
      
      // Refresh payment summary
      const summary = await getPaymentSummary(user.id, allocation.unit_id);
      setPaymentSummary(summary);
      
      // Refresh future payments
      const future = await getFuturePaymentsStatus(user.id, allocation.unit_id);
      setFuturePayments(future.futurePayments || []);
      
      // Call parent callback to refresh dashboard data
      if (onPaymentSuccess) {
        onPaymentSuccess()
      }

      // Refresh notifications
      await refreshNotifications()
      console.log('✅ All data refreshed after payment confirmation')
    } catch (err) {
      console.error('Error refreshing data:', err)
    }
  };

  // Fallback phone validation functions
  const isValidMpesaPhone = (phone) => {
    try {
      if (validateMpesaPhone && typeof validateMpesaPhone === 'function') {
        return validateMpesaPhone(phone);
      }
    } catch (error) {
      console.warn('Context validateMpesaPhone failed, using fallback');
    }
    
    if (!phone) return false;
    const cleaned = phone.replace(/\D/g, '');
    const regex = /^(07\d{8}|2547\d{8}|\+2547\d{8})$/;
    return regex.test(cleaned);
  }

  const formatMpesaPhoneNumber = (phone) => {
    try {
      if (formatMpesaPhone && typeof formatMpesaPhone === 'function') {
        return formatMpesaPhone(phone);
      }
    } catch (error) {
      console.warn('Context formatMpesaPhone failed, using fallback');
    }
    
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('07') && cleaned.length === 10) {
      return '254' + cleaned.slice(1);
    } else if (cleaned.startsWith('2547') && cleaned.length === 12) {
      return cleaned;
    } else if (cleaned.startsWith('254') && cleaned.length === 12) {
      return cleaned;
    } else if (cleaned.startsWith('7') && cleaned.length === 9) {
      return '254' + cleaned;
    }
    
    return cleaned;
  }

  // Load tenant payments if not provided
  useEffect(() => {
    const loadPayments = async () => {
      if (user?.id && (!payments || payments.length === 0)) {
        setPaymentsLoading(true);
        try {
          const paymentsData = await getPaymentsByTenant(user.id);
          setTenantPayments(paymentsData || []);
        } catch (err) {
          console.error('Error loading payments:', err);
          setTenantPayments([]);
        } finally {
          setPaymentsLoading(false);
        }
      }
    }

    loadPayments();
  }, [user, getPaymentsByTenant, payments]);

  // Update payment data when allocation changes
  useEffect(() => {
    if (allocation) {
      const currentDate = new Date()
      const currentMonth = currentDate.toISOString().slice(0, 7) // YYYY-MM
      
      // Set amount to remaining balance or monthly rent
      const remainingBalance = paymentSummary?.balance || allocation.monthly_rent;
      
      setPaymentData(prev => ({
        ...prev,
        amount: remainingBalance > 0 ? remainingBalance.toString() : allocation.monthly_rent?.toString() || '',
        phone_number: user?.phone_number || '',
        payment_month: currentMonth
      }))
    }
  }, [allocation, user, paymentSummary])

  // Validate phone number on change
  useEffect(() => {
    if (paymentData.phone_number) {
      const formattedPhone = formatMpesaPhoneNumber(paymentData.phone_number)
      if (!isValidMpesaPhone(formattedPhone)) {
        setPhoneError('Please enter a valid Kenyan phone number (e.g., 0712345678)')
      } else {
        setPhoneError('')
      }
    } else {
      setPhoneError('')
    }
  }, [paymentData.phone_number])

  // UPDATED: Handle M-Pesa payment with proper status polling
  const handleMpesaPayment = async (e) => {
    e.preventDefault()
    
    // Validate phone number
    const formattedPhone = formatMpesaPhoneNumber(paymentData.phone_number)
    if (!isValidMpesaPhone(formattedPhone)) {
      setPhoneError('Please enter a valid Kenyan phone number')
      return
    }

    // Validate allocation exists
    if (!allocation) {
      setPaymentStatus({ 
        type: 'error', 
        message: 'No active allocation found. Please contact administrator.' 
      })
      return
    }

    setPaymentStatus({ type: 'processing', message: 'Initiating M-Pesa payment...' })
    if (clearError && typeof clearError === 'function') {
      clearError()
    }
    setPhoneError('')
    
    try {
      const paymentPayload = {
        phone_number: formattedPhone,
        amount: parseFloat(paymentData.amount),
        unit_id: allocation.unit_id,
        payment_month: paymentData.payment_month
      }

      console.log('📦 Processing payment with data:', paymentPayload)

      const result = await processMpesaPayment(paymentPayload)
      
      if (result && result.success) {
        if (result.requiresPolling && result.checkoutRequestId) {
          // Real M-Pesa payment - start polling
          console.log('🔄 Starting payment status polling for:', result.checkoutRequestId);
          setCurrentCheckoutRequestId(result.checkoutRequestId);
          setIsPolling(true);
          
          setPaymentStatus({ 
            type: 'pending', 
            message: 'Payment initiated! Please check your phone and enter your M-Pesa PIN. Waiting for confirmation...',
            checkoutRequestId: result.checkoutRequestId
          });
        } else {
          // Mock payment or payment that doesn't require polling
          setPaymentStatus({ 
            type: 'success', 
            message: result.message || 'Payment processed successfully!',
            receipt: result.mpesa_receipt,
            transactionId: result.transactionId
          });
          
          // Refresh data for mock payments
          await refreshPaymentData();
          
          // Reset form on success
          setPaymentData(prev => ({
            ...prev,
            phone_number: user?.phone_number || ''
          }))
          
          setTimeout(() => {
            setShowPaymentModal(false)
            setPaymentStatus(null)
          }, 5000)
        }
      } else {
        setPaymentStatus({ 
          type: 'error', 
          message: (result && result.error) || 'Payment failed. Please try again.' 
        })
      }
    } catch (error) {
      setPaymentStatus({ 
        type: 'error', 
        message: error.message || 'Payment processing failed. Please try again.' 
      })
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  const formatDate = (dateString) => {
    try {
      if (!dateString) return 'N/A';
      return new Date(dateString).toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'long'
      })
    } catch {
      return 'Invalid date'
    }
  }

  const getPaymentStatus = (payment) => {
    if (!payment || !payment.status) {
      return { color: 'text-gray-600', bg: 'bg-gray-100', text: 'Unknown' }
    }
    
    switch (payment.status.toLowerCase()) {
      case 'completed':
        return { color: 'text-green-600', bg: 'bg-green-100', text: 'Completed' }
      case 'pending':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', text: 'Pending' }
      case 'failed':
        return { color: 'text-red-600', bg: 'bg-red-100', text: 'Failed' }
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', text: 'Unknown' }
    }
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value
    setPaymentData(prev => ({ ...prev, phone_number: value }))
  }

  const handleAmountChange = (e) => {
    const value = e.target.value
    setPaymentData(prev => ({ ...prev, amount: value }))
  }

  const handleCloseModal = () => {
    // Only allow closing if we're not polling
    if (!isPolling) {
      setShowPaymentModal(false)
      setPaymentStatus(null)
      setPhoneError('')
      setIsPolling(false)
      setCurrentCheckoutRequestId(null)
      if (clearError && typeof clearError === 'function') {
        clearError()
      }
    }
  }

  const currentMonthPaid = paymentSummary?.isFullyPaid || false
  const isDevelopment = import.meta.env.MODE === 'development'
  const remainingBalance = paymentSummary?.balance || 0

  // Calculate total advance payments
  const totalAdvance = paymentSummary?.advanceAmount || 0
  const advanceCount = paymentSummary?.advanceCount || 0

  if (paymentsLoading || summaryLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!allocation) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 text-center py-8 sm:py-12">
        <div className="text-gray-400 text-4xl sm:text-6xl mb-3 sm:mb-4">🏠</div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Active Allocation</h3>
        <p className="text-gray-600 text-sm">You need to be allocated to a unit before you can make payments.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Error Display */}
      {error && !error.includes('Failed to fetch tenant payments') && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded text-xs sm:text-sm">
          {error}
          <button onClick={clearError} className="float-right font-bold">×</button>
        </div>
      )}

      {/* Development Mode Banner */}
      {isDevelopment && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
          <div className="flex items-center">
            <div className="text-yellow-600 mr-2 text-sm">🛠️</div>
            <div className="text-xs sm:text-sm text-yellow-800">
              <strong>Development Mode:</strong> Using mock M-Pesa API. No real payments will be processed.
            </div>
          </div>
        </div>
      )}

      {/* Payment Summary Card */}
      {paymentSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 text-center">
            <div className="text-lg sm:text-xl font-bold text-gray-900">
              {formatCurrency(paymentSummary.monthlyRent || allocation.monthly_rent)}
            </div>
            <div className="text-xs text-gray-600">Monthly Rent</div>
          </div>
          
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 text-center">
            <div className="text-lg sm:text-xl font-bold text-blue-600">
              {formatCurrency(paymentSummary.totalPaid)}
            </div>
            <div className="text-xs text-gray-600">Paid This Month</div>
          </div>
          
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 text-center">
            <div className={`text-lg sm:text-xl font-bold ${remainingBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {formatCurrency(remainingBalance)}
            </div>
            <div className="text-xs text-gray-600">Remaining Balance</div>
          </div>
          
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200 text-center">
            <div className={`text-lg sm:text-xl font-bold ${currentMonthPaid ? 'text-green-600' : 'text-orange-600'}`}>
              {currentMonthPaid ? 'Paid' : 'Pending'}
            </div>
            <div className="text-xs text-gray-600">Status</div>
          </div>
        </div>
      )}

      {/* Advance Payments Summary */}
      {totalAdvance > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-3 sm:p-4 bg-blue-50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center">
              <div className="text-blue-600 text-lg sm:text-xl mr-2 sm:mr-3">💰</div>
              <div>
                <h4 className="font-semibold text-blue-900 text-sm sm:text-base">Advance Payments</h4>
                <p className="text-blue-700 text-xs sm:text-sm">
                  You have {formatCurrency(totalAdvance)} in advance payments across {advanceCount} future month(s)
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowFuturePayments(true)}
              className="bg-gray-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-gray-700 text-xs sm:text-sm font-medium transition-colors touch-target w-full sm:w-auto"
            >
              View Future Payments
            </button>
          </div>
        </div>
      )}

      {/* Quick Payment Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Make Payment</h3>
            <p className="text-gray-600 text-xs sm:text-sm">Pay your rent via M-Pesa</p>
          </div>
          <div className="text-right">
            <div className="text-xs sm:text-sm text-gray-600">Due Date</div>
            <div className="font-semibold text-sm">
              {new Date(new Date().getFullYear(), new Date().getMonth(), allocation.rent_due_day || 5).toLocaleDateString('en-KE')}
            </div>
          </div>
        </div>

        {currentMonthPaid ? (
          <div className="text-center py-4 sm:py-6">
            <div className="text-green-500 text-3xl sm:text-4xl mb-2">✓</div>
            <h4 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Rent Paid for This Month</h4>
            <p className="text-gray-600 text-sm">Your payment for {formatDate(paymentData.payment_month)} has been received.</p>
            {totalAdvance > 0 && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs sm:text-sm text-blue-800">
                  <strong>Advance Payment:</strong> You have {formatCurrency(totalAdvance)} carried forward to future months.
                </p>
              </div>
            )}
            <button
              onClick={() => setShowPaymentModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-xs sm:text-sm font-medium transition-colors touch-target mt-4"
            >
              Make Additional Payment
            </button>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            <div className="p-3 sm:p-4 bg-blue-50 rounded-lg">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-gray-900 text-sm sm:text-base">
                    {allocation.property_name || 'Property'} - {allocation.unit_code || allocation.unit_number || 'Unit'}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600">
                    Rent for {formatDate(paymentData.payment_month)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base sm:text-lg font-bold text-gray-900">
                    {formatCurrency(allocation.monthly_rent)}
                  </div>
                  {remainingBalance > 0 && remainingBalance < allocation.monthly_rent && (
                    <div className="text-xs sm:text-sm text-orange-600">
                      Balance: {formatCurrency(remainingBalance)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Payment amount selection */}
            <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                Payment Amount
              </label>
              <div className="space-y-2">
                <div className="flex flex-col xs:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentData(prev => ({ ...prev, amount: remainingBalance.toString() }))}
                    className={`flex-1 py-2 px-2 sm:px-3 text-xs sm:text-sm border rounded-md transition-colors touch-target ${
                      parseFloat(paymentData.amount) === remainingBalance 
                        ? 'bg-blue-100 border-blue-500 text-blue-700' 
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Pay Balance ({formatCurrency(remainingBalance)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentData(prev => ({ ...prev, amount: allocation.monthly_rent.toString() }))}
                    className={`flex-1 py-2 px-2 sm:px-3 text-xs sm:text-sm border rounded-md transition-colors touch-target ${
                      parseFloat(paymentData.amount) === allocation.monthly_rent 
                        ? 'bg-blue-100 border-blue-500 text-blue-700' 
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Full Rent ({formatCurrency(allocation.monthly_rent)})
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={paymentData.amount}
                    onChange={handleAmountChange}
                    className="w-full pl-10 sm:pl-12 pr-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 touch-target"
                    placeholder="Enter custom amount"
                    min="1"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 font-medium text-xs sm:text-sm mr-2">KES</span>
                  </div>
                </div>
              </div>
              
              {/* Carry-forward information */}
              {parseFloat(paymentData.amount) > remainingBalance && remainingBalance > 0 && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-xs text-green-700">
                    <strong>Note:</strong> {formatCurrency(parseFloat(paymentData.amount) - remainingBalance)} will be carried forward to future months as advance payment.
                  </p>
                </div>
              )}

              {/* Future month payment notice */}
              {paymentData.payment_month > new Date().toISOString().slice(0, 7) && (
                <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded-md">
                  <p className="text-xs text-purple-700">
                    <strong>Future Payment:</strong> You are making a payment for {formatDate(paymentData.payment_month)}. This will be recorded as an advance payment.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowPaymentModal(true)}
              className="bg-blue-600 text-white w-full py-2 sm:py-3 rounded-md hover:bg-blue-700 text-sm sm:text-base font-medium transition-colors touch-target disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || !paymentData.amount || parseFloat(paymentData.amount) <= 0}
            >
              {loading ? 'Processing...' : `Pay ${formatCurrency(parseFloat(paymentData.amount) || 0)} with M-Pesa`}
            </button>

            <div className="text-center text-xs sm:text-sm text-gray-500">
              <p>You will receive a prompt on your phone to enter your M-Pesa PIN</p>
            </div>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Payment History</h3>
          <div className="text-xs sm:text-sm text-gray-600">
            {tenantPayments.length} payment{tenantPayments.length !== 1 ? 's' : ''}
          </div>
        </div>
        
        {tenantPayments.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-gray-500">
            <div className="text-3xl sm:text-4xl mb-2">💰</div>
            <p className="text-sm">No payment history yet</p>
            <p className="text-xs sm:text-sm">Make your first payment to see it here</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Date
                  </th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Period
                  </th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Amount
                  </th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden xs:table-cell">
                    M-Pesa Code
                  </th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">
                    Type
                  </th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tenantPayments.map((payment, index) => {
                  const status = getPaymentStatus(payment)
                  return (
                    <tr key={payment.id || index} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-KE') : 'N/A'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {formatDate(payment.payment_month)}
                        {payment.payment_month > new Date().toISOString().slice(0, 7) && (
                          <span className="ml-1 text-xs text-purple-600">(Future)</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {formatCurrency(payment.amount)}
                        {payment.is_advance_payment && (
                          <span className="ml-1 text-xs text-blue-600">(Advance)</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 hidden xs:table-cell">
                        {payment.mpesa_receipt_number || 'N/A'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 hidden sm:table-cell">
                        {payment.is_advance_payment ? (
                          <span className="text-blue-600">Carry Forward</span>
                        ) : (
                          <span className="text-gray-600">Regular</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${status.bg} ${status.color}`}>
                          {status.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* M-Pesa Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-md my-4 sm:my-8 mx-auto max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="border-b border-gray-200 px-4 sm:px-6 py-3 flex-shrink-0 flex justify-between items-center">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Pay with M-Pesa</h3>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Complete your rent payment securely</p>
              </div>
              {!isPolling && (
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600 transition-colors touch-target p-1"
                  onClick={handleCloseModal}
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 sm:p-6">
                {paymentStatus ? (
                  <div className={`text-center py-4 sm:py-6 ${
                    paymentStatus.type === 'success' ? 'text-green-600' :
                    paymentStatus.type === 'error' ? 'text-red-600' :
                    paymentStatus.type === 'pending' ? 'text-blue-600' :
                    'text-blue-600'
                  }`}>
                    {paymentStatus.type === 'processing' && (
                      <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600 mx-auto mb-3 sm:mb-4"></div>
                    )}
                    {paymentStatus.type === 'pending' && (
                      <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600 mx-auto mb-3 sm:mb-4"></div>
                    )}
                    {paymentStatus.type === 'success' && (
                      <div className="text-3xl sm:text-4xl mb-2">✓</div>
                    )}
                    {paymentStatus.type === 'error' && (
                      <div className="text-3xl sm:text-4xl mb-2">✗</div>
                    )}
                    <p className="text-sm sm:text-lg font-semibold mb-2">
                      {paymentStatus.type === 'processing' ? 'Processing Payment...' :
                      paymentStatus.type === 'pending' ? 'Waiting for M-Pesa Confirmation...' :
                      paymentStatus.type === 'success' ? 'Payment Confirmed!' :
                      'Payment Failed'}
                    </p>
                    <p className="text-xs sm:text-sm mb-3 sm:mb-4">{paymentStatus.message}</p>
                    
                    {paymentStatus.type === 'pending' && (
                      <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center justify-center mb-2">
                          <div className="animate-pulse bg-blue-200 rounded-full h-2 w-2 sm:h-3 sm:w-3 mr-2"></div>
                          <p className="text-xs sm:text-sm text-blue-700">Listening for M-Pesa callback...</p>
                        </div>
                        <p className="text-xs text-blue-600">
                          Please check your phone and enter your M-Pesa PIN to complete the payment.
                        </p>
                      </div>
                    )}

                    {paymentStatus.type === 'success' && paymentStatus.receipt && (
                      <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-green-50 rounded-lg">
                        <p className="text-xs sm:text-sm font-semibold">Transaction Details:</p>
                        <p className="text-xs">Receipt: {paymentStatus.receipt}</p>
                        {paymentStatus.transactionId && (
                          <p className="text-xs">Transaction ID: {paymentStatus.transactionId}</p>
                        )}
                      </div>
                    )}

                    {!isPolling && (
                      <button
                        onClick={handleCloseModal}
                        className="bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-md hover:bg-gray-700 text-xs sm:text-sm font-medium transition-colors touch-target mt-3 sm:mt-4"
                      >
                        {paymentStatus.type === 'success' ? 'Done' : 'Close'}
                      </button>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleMpesaPayment} className="space-y-4 sm:space-y-5">
                    <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-xs sm:text-sm">Property:</span>
                        <span className="text-xs sm:text-sm">{allocation.property_name || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-xs sm:text-sm">Unit:</span>
                        <span className="text-xs sm:text-sm">{allocation.unit_code || allocation.unit_number || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-xs sm:text-sm">Month:</span>
                        <span className="text-xs sm:text-sm">{formatDate(paymentData.payment_month)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-xs sm:text-sm">Amount:</span>
                        <span className="text-base sm:text-lg font-bold">{formatCurrency(paymentData.amount)}</span>
                      </div>
                      
                      {/* Carry-forward notice */}
                      {parseFloat(paymentData.amount) > remainingBalance && remainingBalance > 0 && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                          <p className="text-xs text-blue-700">
                            <strong>Note:</strong> {formatCurrency(parseFloat(paymentData.amount) - remainingBalance)} will be carried forward to future months.
                          </p>
                        </div>
                      )}

                      {/* Future month notice */}
                      {paymentData.payment_month > new Date().toISOString().slice(0, 7) && (
                        <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded-md">
                          <p className="text-xs text-purple-700">
                            <strong>Future Payment:</strong> This payment will be recorded as an advance for {formatDate(paymentData.payment_month)}.
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={paymentData.phone_number}
                        onChange={handlePhoneChange}
                        className={`w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 touch-target ${phoneError ? 'border-red-500' : ''}`}
                        placeholder="0712345678"
                        required
                      />
                      {phoneError && (
                        <p className="text-red-500 text-xs mt-1">{phoneError}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Format: 0712345678 or 254712345678
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                        Payment Month
                      </label>
                      <input
                        type="month"
                        value={paymentData.payment_month}
                        onChange={(e) => setPaymentData({...paymentData, payment_month: e.target.value})}
                        className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 touch-target"
                        required
                        min={new Date().toISOString().slice(0, 7)}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        You can pay for current or future months
                      </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3">
                      <div className="flex items-start">
                        <div className="text-blue-600 mr-2 mt-0.5 text-xs">ℹ️</div>
                        <div className="text-xs text-blue-800">
                          <strong className="text-xs sm:text-sm">M-Pesa Instructions:</strong> 
                          <p className="mt-1">You will receive a prompt on your phone to enter your M-Pesa PIN. Ensure your phone is nearby and has sufficient signal.</p>
                          <p className="mt-1 font-semibold">The payment will only be confirmed after you enter your PIN and M-Pesa processes the transaction.</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col xs:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4">
                      <button
                        type="submit"
                        disabled={loading || phoneError || !paymentData.amount}
                        className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-medium transition-colors touch-target flex-1"
                      >
                        {loading ? 'Processing...' : `Pay ${formatCurrency(parseFloat(paymentData.amount) || 0)}`}
                      </button>
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="bg-gray-500 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-gray-600 text-xs sm:text-sm font-medium transition-colors touch-target flex-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Future Payments Modal */}
      {showFuturePayments && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-2xl my-4 sm:my-8 mx-auto max-h-[85vh] flex flex-col">
            <div className="border-b border-gray-200 px-4 sm:px-6 py-3 flex-shrink-0 flex justify-between items-center">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Future Payments Status</h3>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Your advance payments and future rent status</p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 transition-colors touch-target p-1"
                onClick={() => setShowFuturePayments(false)}
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {futurePaymentsLoading ? (
                <div className="flex justify-center items-center h-24 sm:h-32">
                  <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : futurePayments.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-gray-500">
                  <div className="text-3xl sm:text-4xl mb-2">📅</div>
                  <p className="text-sm">No future payments recorded</p>
                  <p className="text-xs sm:text-sm">Make advance payments to see them here</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {futurePayments.map((future, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2">
                        <h4 className="font-semibold text-gray-900 text-sm sm:text-base">
                          {formatDate(future.month + '-01')}
                        </h4>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          future.isFullyPaid 
                            ? 'bg-green-100 text-green-800'
                            : future.totalPaid > 0
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {future.isFullyPaid ? 'Paid' : future.totalPaid > 0 ? 'Partial' : 'Pending'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                        <div>
                          <span className="text-gray-600">Monthly Rent:</span>
                          <div className="font-semibold">{formatCurrency(future.monthlyRent)}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Paid:</span>
                          <div className="font-semibold">{formatCurrency(future.totalPaid)}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Balance:</span>
                          <div className={`font-semibold ${
                            future.balance > 0 ? 'text-orange-600' : 'text-green-600'
                          }`}>
                            {formatCurrency(future.balance)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-600">Status:</span>
                          <div className="font-semibold">
                            {future.isAdvance ? 'Advance Payment' : 'Not Paid'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TenantPayment