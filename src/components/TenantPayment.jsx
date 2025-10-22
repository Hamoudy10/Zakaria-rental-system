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
    getPaymentsByTenant,
    getPaymentSummary,
    getPaymentHistory,
    validateMpesaPhone,
    formatMpesaPhone,
    clearError
  } = usePayment()

  const { refreshNotifications } = useNotification()
  
  const [tenantPayments, setTenantPayments] = useState(payments || [])
  const [paymentSummary, setPaymentSummary] = useState(null)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_month: '',
    phone_number: ''
  })
  const [paymentStatus, setPaymentStatus] = useState(null)
  const [phoneError, setPhoneError] = useState('')
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Update tenant payments when prop changes
  useEffect(() => {
    if (payments) {
      setTenantPayments(payments)
    }
  }, [payments])

  // Load payment summary and history
  useEffect(() => {
    const loadPaymentData = async () => {
      if (user?.id && allocation?.unit_id) {
        setSummaryLoading(true);
        try {
          // Load payment summary
          const summary = await getPaymentSummary(user.id, allocation.unit_id);
          setPaymentSummary(summary);
          
          // Load payment history
          const history = await getPaymentHistory(user.id, allocation.unit_id);
          setPaymentHistory(history.payments || []);
        } catch (err) {
          console.error('Error loading payment data:', err);
        } finally {
          setSummaryLoading(false);
        }
      }
    }

    loadPaymentData();
  }, [user, allocation, getPaymentSummary, getPaymentHistory]);

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
      
      // NEW: Set amount to remaining balance or monthly rent
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
        setPaymentStatus({ 
          type: 'success', 
          message: result.message || 'Payment initiated successfully! Check your phone for M-Pesa prompt.',
          receipt: result.mpesa_receipt,
          transactionId: result.transactionId
        })
        
        // Refresh payments data
        try {
          const updatedPayments = await getPaymentsByTenant(user.id)
          setTenantPayments(updatedPayments || [])
          
          // Refresh payment summary
          const summary = await getPaymentSummary(user.id, allocation.unit_id);
          setPaymentSummary(summary);
          
          // Call parent callback to refresh dashboard data
          if (onPaymentSuccess) {
            onPaymentSuccess()
          }
        } catch (err) {
          console.error('Error refreshing payments:', err)
        }

        // Refresh notifications to show the new payment notification
        try {
          await refreshNotifications()
          console.log('✅ Notifications refreshed after payment')
        } catch (err) {
          console.error('Error refreshing notifications:', err)
        }
        
        // Reset form on success
        setPaymentData(prev => ({
          ...prev,
          phone_number: user?.phone_number || ''
        }))
        
        setTimeout(() => {
          setShowPaymentModal(false)
          setPaymentStatus(null)
        }, 5000)
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
    setShowPaymentModal(false)
    setPaymentStatus(null)
    setPhoneError('')
    if (clearError && typeof clearError === 'function') {
      clearError()
    }
  }

  const currentMonthPaid = paymentSummary?.isFullyPaid || false
  const isDevelopment = process.env.NODE_ENV === 'development'
  const remainingBalance = paymentSummary?.balance || 0

  if (paymentsLoading || summaryLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!allocation) {
    return (
      <div className="card text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">🏠</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Allocation</h3>
        <p className="text-gray-600">You need to be allocated to a unit before you can make payments.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && !error.includes('Failed to fetch tenant payments') && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
          <button onClick={clearError} className="float-right font-bold">×</button>
        </div>
      )}

      {/* Development Mode Banner */}
      {isDevelopment && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-yellow-600 mr-2">🛠️</div>
            <div className="text-sm text-yellow-800">
              <strong>Development Mode:</strong> Using mock M-Pesa API. No real payments will be processed.
            </div>
          </div>
        </div>
      )}

      {/* Payment Summary Card */}
      {paymentSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(paymentSummary.monthlyRent)}
            </div>
            <div className="text-sm text-gray-600">Monthly Rent</div>
          </div>
          
          <div className="card text-center">
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(paymentSummary.totalPaid)}
            </div>
            <div className="text-sm text-gray-600">Paid This Month</div>
          </div>
          
          <div className="card text-center">
            <div className={`text-2xl font-bold ${remainingBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {formatCurrency(remainingBalance)}
            </div>
            <div className="text-sm text-gray-600">Remaining Balance</div>
          </div>
          
          <div className="card text-center">
            <div className={`text-2xl font-bold ${currentMonthPaid ? 'text-green-600' : 'text-orange-600'}`}>
              {currentMonthPaid ? 'Paid' : 'Pending'}
            </div>
            <div className="text-sm text-gray-600">Status</div>
          </div>
        </div>
      )}

      {/* Quick Payment Card */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Make Payment</h3>
            <p className="text-gray-600">Pay your rent via M-Pesa</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Due Date</div>
            <div className="font-semibold">
              {new Date(new Date().getFullYear(), new Date().getMonth(), allocation.rent_due_day || 5).toLocaleDateString('en-KE')}
            </div>
          </div>
        </div>

        {currentMonthPaid ? (
          <div className="text-center py-6">
            <div className="text-green-500 text-4xl mb-2">✓</div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Rent Paid for This Month</h4>
            <p className="text-gray-600">Your payment for {formatDate(paymentData.payment_month)} has been received.</p>
            {paymentSummary?.advanceAmount > 0 && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Advance Payment:</strong> You have {formatCurrency(paymentSummary.advanceAmount)} carried forward to next month.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">
                    {allocation.property_name || 'Property'} - {allocation.unit_code || allocation.unit_number || 'Unit'}
                  </div>
                  <div className="text-sm text-gray-600">
                    Rent for {formatDate(paymentData.payment_month)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(allocation.monthly_rent)}
                  </div>
                  {remainingBalance > 0 && remainingBalance < allocation.monthly_rent && (
                    <div className="text-sm text-orange-600">
                      Balance: {formatCurrency(remainingBalance)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* NEW: Payment amount selection */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Amount
              </label>
              <div className="space-y-2">
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setPaymentData(prev => ({ ...prev, amount: remainingBalance.toString() }))}
                    className={`flex-1 py-2 px-3 text-sm border rounded-md ${
                      parseFloat(paymentData.amount) === remainingBalance 
                        ? 'bg-blue-100 border-blue-500 text-blue-700' 
                        : 'bg-white border-gray-300 text-gray-700'
                    }`}
                  >
                    Pay Balance ({formatCurrency(remainingBalance)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentData(prev => ({ ...prev, amount: allocation.monthly_rent.toString() }))}
                    className={`flex-1 py-2 px-3 text-sm border rounded-md ${
                      parseFloat(paymentData.amount) === allocation.monthly_rent 
                        ? 'bg-blue-100 border-blue-500 text-blue-700' 
                        : 'bg-white border-gray-300 text-gray-700'
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
                    className="input-primary w-full pl-8"
                    placeholder="Enter custom amount"
                    min="1"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">KES</span>
                  </div>
                </div>
              </div>
              
              {/* NEW: Carry-forward information */}
              {parseFloat(paymentData.amount) > remainingBalance && remainingBalance > 0 && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-xs text-green-700">
                    <strong>Note:</strong> {formatCurrency(parseFloat(paymentData.amount) - remainingBalance)} will be carried forward to next month as advance payment.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowPaymentModal(true)}
              className="btn-primary w-full py-3 text-lg"
              disabled={loading || !paymentData.amount || parseFloat(paymentData.amount) <= 0}
            >
              {loading ? 'Processing...' : `Pay ${formatCurrency(parseFloat(paymentData.amount) || 0)} with M-Pesa`}
            </button>

            <div className="text-center text-sm text-gray-500">
              <p>You will receive a prompt on your phone to enter your M-Pesa PIN</p>
            </div>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
          <div className="text-sm text-gray-600">
            {tenantPayments.length} payment{tenantPayments.length !== 1 ? 's' : ''}
          </div>
        </div>
        
        {tenantPayments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">💰</div>
            <p>No payment history yet</p>
            <p className="text-sm">Make your first payment to see it here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    M-Pesa Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tenantPayments.map((payment, index) => {
                  const status = getPaymentStatus(payment)
                  return (
                    <tr key={payment.id || index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-KE') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(payment.payment_month)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(payment.amount)}
                        {payment.is_advance_payment && (
                          <span className="ml-1 text-xs text-blue-600">(Advance)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {payment.mpesa_receipt_number || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {payment.is_advance_payment ? (
                          <span className="text-blue-600">Carry Forward</span>
                        ) : (
                          <span className="text-gray-600">Regular</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${status.bg} ${status.color}`}>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-md my-8 mx-auto max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="border-b border-gray-200 px-6 py-3 flex-shrink-0 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Pay with M-Pesa</h3>
                <p className="text-sm text-gray-600 mt-1">Complete your rent payment securely</p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 transition-colors"
                onClick={handleCloseModal}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6">
                {paymentStatus ? (
                  <div className={`text-center py-6 ${
                    paymentStatus.type === 'success' ? 'text-green-600' :
                    paymentStatus.type === 'error' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    {paymentStatus.type === 'processing' && (
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    )}
                    {paymentStatus.type === 'success' && (
                      <div className="text-4xl mb-2">✓</div>
                    )}
                    {paymentStatus.type === 'error' && (
                      <div className="text-4xl mb-2">✗</div>
                    )}
                    <p className="text-lg font-semibold mb-2">
                      {paymentStatus.type === 'processing' ? 'Processing Payment...' :
                      paymentStatus.type === 'success' ? 'Payment Initiated!' :
                      'Payment Failed'}
                    </p>
                    <p className="text-sm mb-4">{paymentStatus.message}</p>
                    
                    {paymentStatus.type === 'success' && paymentStatus.receipt && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg">
                        <p className="text-sm font-semibold">Transaction Details:</p>
                        <p className="text-xs">Receipt: {paymentStatus.receipt}</p>
                        {paymentStatus.transactionId && (
                          <p className="text-xs">Transaction ID: {paymentStatus.transactionId}</p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleCloseModal}
                      className="btn-secondary mt-4 px-6 py-2 text-sm"
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleMpesaPayment} className="space-y-5">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-sm">Property:</span>
                        <span className="text-sm">{allocation.property_name || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-sm">Unit:</span>
                        <span className="text-sm">{allocation.unit_code || allocation.unit_number || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-sm">Month:</span>
                        <span className="text-sm">{formatDate(paymentData.payment_month)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">Amount:</span>
                        <span className="text-lg font-bold">{formatCurrency(paymentData.amount)}</span>
                      </div>
                      
                      {/* NEW: Carry-forward notice */}
                      {parseFloat(paymentData.amount) > remainingBalance && remainingBalance > 0 && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                          <p className="text-xs text-blue-700">
                            <strong>Note:</strong> {formatCurrency(parseFloat(paymentData.amount) - remainingBalance)} will be carried forward to next month.
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={paymentData.phone_number}
                        onChange={handlePhoneChange}
                        className={`input-primary w-full ${phoneError ? 'border-red-500' : ''}`}
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Payment Month
                      </label>
                      <input
                        type="month"
                        value={paymentData.payment_month}
                        onChange={(e) => setPaymentData({...paymentData, payment_month: e.target.value})}
                        className="input-primary w-full"
                        required
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-start">
                        <div className="text-blue-600 mr-2 mt-0.5 text-sm">ℹ️</div>
                        <div className="text-xs text-blue-800">
                          <strong className="text-sm">M-Pesa Instructions:</strong> 
                          <p className="mt-1">You will receive a prompt on your phone to enter your M-Pesa PIN. Ensure your phone is nearby and has sufficient signal.</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-3 pt-4">
                      <button
                        type="submit"
                        disabled={loading || phoneError || !paymentData.amount}
                        className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed py-3 text-sm font-medium"
                      >
                        {loading ? 'Processing...' : `Pay ${formatCurrency(parseFloat(paymentData.amount) || 0)}`}
                      </button>
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="btn-secondary flex-1 py-3 text-sm font-medium"
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
    </div>
  )
}

export default TenantPayment