import React, { useState, useEffect } from 'react'
import { usePayment } from '../context/PaymentContext'
import { useAllocation } from '../context/TenantAllocationContext'
import { useAuth } from '../context/AuthContext'

const TenantPayment = () => {
  const { user } = useAuth()
  const { getAllocationByTenantId } = useAllocation()
  const { 
    payments, 
    paymentNotifications,
    loading, 
    processMpesaPayment, 
    getPaymentsByTenant,
    getUpcomingPayments 
  } = usePayment()
  
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_month: '',
    phone_number: ''
  })
  const [paymentStatus, setPaymentStatus] = useState(null)

  const allocation = getAllocationByTenantId(user?.id)
  const tenantPayments = getPaymentsByTenant(user?.id)
  const upcomingPayments = getUpcomingPayments(allocation ? [allocation] : [])

  useEffect(() => {
    if (allocation) {
      setPaymentData(prev => ({
        ...prev,
        amount: allocation.monthly_rent,
        phone_number: user?.phone_number || '',
        payment_month: new Date().toISOString().slice(0, 7) // Current month YYYY-MM
      }))
    }
  }, [allocation, user])

  const handleMpesaPayment = async (e) => {
    e.preventDefault()
    setPaymentStatus({ type: 'processing', message: 'Processing M-Pesa payment...' })
    
    try {
      const result = await processMpesaPayment({
        tenant_id: user.id,
        unit_id: allocation.unit_id,
        amount: parseFloat(paymentData.amount),
        payment_month: paymentData.payment_month + '-01', // First day of month
        phone_number: paymentData.phone_number
      })
      
      if (result.success) {
        setPaymentStatus({ 
          type: 'success', 
          message: `Payment successful! M-Pesa Receipt: ${result.mpesa_receipt}`,
          receipt: result.mpesa_receipt
        })
        setTimeout(() => {
          setShowPaymentModal(false)
          setPaymentStatus(null)
        }, 5000)
      } else {
        setPaymentStatus({ 
          type: 'error', 
          message: result.error 
        })
      }
    } catch (error) {
      setPaymentStatus({ 
        type: 'error', 
        message: 'Payment failed. Please try again.' 
      })
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'long'
    })
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

  if (!allocation) {
    return (
      <div className="card text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">🏠</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Allocation</h3>
        <p className="text-gray-600">You need to be allocated to a unit before you can make payments.</p>
      </div>
    )
  }

  const currentMonthPaid = upcomingPayments[0]?.paidThisMonth || false

  return (
    <div className="space-y-6">
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
              {new Date(new Date().getFullYear(), new Date().getMonth(), allocation.rent_due_day).toLocaleDateString('en-KE')}
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
                    {allocation.unit.property.name} - {allocation.unit.unit_code}
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
            >
              Pay with M-Pesa
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
                        {new Date(payment.payment_date).toLocaleDateString('en-KE')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(payment.payment_month)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {payment.mpesa_receipt_number}
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

      {/* Recent Notifications */}
      {paymentNotifications.filter(n => n.recipient_id === user.id).length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Recent Notifications</h3>
          <div className="space-y-3">
            {paymentNotifications
              .filter(n => n.recipient_id === user.id)
              .slice(0, 3)
              .map(notification => (
                <div key={notification.id} className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                  <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{notification.message_content}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(notification.sent_at).toLocaleDateString('en-KE', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

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
                   paymentStatus.type === 'success' ? 'Payment Successful!' :
                   'Payment Failed'}
                </p>
                <p className="text-sm">{paymentStatus.message}</p>
                
                {paymentStatus.type === 'processing' && (
                  <div className="mt-4 text-xs text-gray-500">
                    <p>Simulating M-Pesa payment processing...</p>
                    <p>In a real system, you would receive an M-Pesa prompt</p>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleMpesaPayment} className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Property:</span>
                    <span>{allocation.unit.property.name}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Unit:</span>
                    <span>{allocation.unit.unit_code}</span>
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
                    onChange={(e) => setPaymentData({...paymentData, phone_number: e.target.value})}
                    className="input-primary"
                    placeholder="254712345678"
                    required
                  />
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

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="text-yellow-600 mr-2">⚠️</div>
                    <div className="text-sm text-yellow-800">
                      <strong>Demo Mode:</strong> This simulates M-Pesa payment. No actual payment will be processed.
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex-1"
                  >
                    {loading ? 'Processing...' : 'Confirm Payment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
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