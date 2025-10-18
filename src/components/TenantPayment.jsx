import React, { useState, useEffect } from 'react'
import { usePayment } from '../context/PaymentContext'
import { useAuth } from '../context/AuthContext'

const TenantPayment = () => {
  const { user } = useAuth()
  const { 
    payments, 
    paymentNotifications,
    loading, 
    error,
    processMpesaPayment, 
    getPaymentsByTenant,
    getAllocationByTenantId,
    getUpcomingPayments,
    validateMpesaPhone,
    formatMpesaPhone,
    clearError
  } = usePayment()
  
  const [allocation, setAllocation] = useState(null)
  const [tenantPayments, setTenantPayments] = useState([])
  const [upcomingPayments, setUpcomingPayments] = useState([])
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_month: '',
    phone_number: ''
  })
  const [paymentStatus, setPaymentStatus] = useState(null)
  const [phoneError, setPhoneError] = useState('')

  // Load allocation and payments when component mounts
  useEffect(() => {
    const loadData = async () => {
      if (user?.id) {
        try {
          const allocationData = await getAllocationByTenantId(user.id)
          setAllocation(allocationData)
          
          const paymentsData = await getPaymentsByTenant(user.id)
          setTenantPayments(paymentsData)
          
          if (allocationData) {
            const upcoming = getUpcomingPayments([allocationData])
            setUpcomingPayments(upcoming)
          }
        } catch (err) {
          console.error('Error loading payment data:', err)
        }
      }
    }

    loadData()
  }, [user, getAllocationByTenantId, getPaymentsByTenant, getUpcomingPayments])

  // Update payment data when allocation changes
  useEffect(() => {
    if (allocation) {
      const currentDate = new Date()
      const currentMonth = currentDate.toISOString().slice(0, 7) // YYYY-MM
      
      setPaymentData(prev => ({
        ...prev,
        amount: allocation.monthly_rent?.toString() || '',
        phone_number: user?.phone_number || '',
        payment_month: currentMonth
      }))
    }
  }, [allocation, user])

  // Validate phone number on change
  useEffect(() => {
    if (paymentData.phone_number) {
      const formattedPhone = formatMpesaPhone(paymentData.phone_number)
      if (!validateMpesaPhone(formattedPhone)) {
        setPhoneError('Please enter a valid Kenyan phone number (e.g., 0712345678)')
      } else {
        setPhoneError('')
      }
    } else {
      setPhoneError('')
    }
  }, [paymentData.phone_number, validateMpesaPhone, formatMpesaPhone])

  const handleMpesaPayment = async (e) => {
    e.preventDefault()
    
    // Validate phone number
    const formattedPhone = formatMpesaPhone(paymentData.phone_number)
    if (!validateMpesaPhone(formattedPhone)) {
      setPhoneError('Please enter a valid Kenyan phone number')
      return
    }

    setPaymentStatus({ type: 'processing', message: 'Initiating M-Pesa payment...' })
    clearError()
    setPhoneError('')
    
    try {
      const paymentPayload = {
        tenant_id: user.id,
        unit_id: allocation.unit_id,
        amount: parseFloat(paymentData.amount),
        payment_month: `${paymentData.payment_month}-01`,
        phone_number: formattedPhone,
        property_name: allocation.property_name,
        unit_number: allocation.unit_number
      }

      const result = await processMpesaPayment(paymentPayload)
      
      if (result.success) {
        setPaymentStatus({ 
          type: 'success', 
          message: result.message || 'Payment initiated successfully! Check your phone for M-Pesa prompt.',
          receipt: result.mpesa_receipt,
          transactionId: result.transactionId
        })
        
        // Refresh payments data
        const updatedPayments = await getPaymentsByTenant(user.id)
        setTenantPayments(updatedPayments)
        
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
          message: result.error || 'Payment failed. Please try again.' 
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
      return new Date(dateString).toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'long'
      })
    } catch {
      return 'Invalid date'
    }
  }

  const getPaymentStatus = (payment) => {
    switch (payment.status) {
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

  const currentMonthPaid = upcomingPayments[0]?.paidThisMonth || false
  const isDevelopment = process.env.NODE_ENV === 'development'

  if (loading && !allocation) {
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
      {error && (
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

      {/* Payment Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(allocation.monthly_rent)}
            </div>
            <div className="text-sm text-gray-600">Monthly Rent</div>
          </div>
        </div>
        
        <div className="card">
          <div className="text-center">
            <div className={`text-2xl font-bold ${currentMonthPaid ? 'text-green-600' : 'text-orange-600'}`}>
              {currentMonthPaid ? 'Paid' : 'Pending'}
            </div>
            <div className="text-sm text-gray-600">Current Month</div>
          </div>
        </div>
        
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {tenantPayments.length}
            </div>
            <div className="text-sm text-gray-600">Total Payments</div>
          </div>
        </div>
      </div>

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
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">
                    {allocation.property_name} - {allocation.unit_number}
                  </div>
                  <div className="text-sm text-gray-600">
                    Rent for {formatDate(paymentData.payment_month)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(allocation.monthly_rent)}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowPaymentModal(true)}
              className="btn-primary w-full py-3 text-lg"
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Pay with M-Pesa'}
            </button>

            <div className="text-center text-sm text-gray-500">
              <p>You will receive an M-Pesa prompt on your phone</p>
            </div>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Payment History</h3>
        
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
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tenantPayments.map((payment) => {
                  const status = getPaymentStatus(payment)
                  return (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-KE') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(payment.payment_month)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {payment.mpesa_receipt_number || 'N/A'}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Pay with M-Pesa</h3>
            
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
                <p className="text-sm">{paymentStatus.message}</p>
                
                {paymentStatus.type === 'success' && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg">
                    <p className="text-sm font-semibold">Transaction Details:</p>
                    <p className="text-xs">Receipt: {paymentStatus.receipt}</p>
                    <p className="text-xs">Transaction ID: {paymentStatus.transactionId}</p>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleMpesaPayment} className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Property:</span>
                    <span>{allocation.property_name}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Unit:</span>
                    <span>{allocation.unit_number}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Amount:</span>
                    <span className="text-lg font-bold">{formatCurrency(paymentData.amount)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={paymentData.phone_number}
                    onChange={handlePhoneChange}
                    className={`input-primary ${phoneError ? 'border-red-500' : ''}`}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Month
                  </label>
                  <input
                    type="month"
                    value={paymentData.payment_month}
                    onChange={(e) => setPaymentData({...paymentData, payment_month: e.target.value})}
                    className="input-primary"
                    required
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="text-blue-600 mr-2">ℹ️</div>
                    <div className="text-sm text-blue-800">
                      <strong>M-Pesa Instructions:</strong> You will receive a prompt on your phone to enter your M-Pesa PIN.
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 pt-4">
                  <button
                    type="submit"
                    disabled={loading || phoneError}
                    className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : 'Confirm Payment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentModal(false)
                      setPaymentStatus(null)
                      setPhoneError('')
                      clearError()
                    }}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TenantPayment