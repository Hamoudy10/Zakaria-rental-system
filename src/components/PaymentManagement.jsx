import React, { useState } from 'react'
import { usePayment } from '../context/PaymentContext'
import { useAuth } from '../context/AuthContext'

const PaymentManagement = () => {
  const { user } = useAuth()
  const { 
    payments, 
    paymentNotifications,
    loading, 
    confirmPayment,
    getPendingPayments,
    getPaymentStats 
  } = usePayment()

  const [filter, setFilter] = useState('all')
  const [selectedPayment, setSelectedPayment] = useState(null)

  const pendingPayments = getPendingPayments()
  const stats = getPaymentStats()

  const filteredPayments = payments.filter(payment => {
    if (filter === 'all') return true
    if (filter === 'pending') return payment.status === 'pending'
    if (filter === 'completed') return payment.status === 'completed'
    return true
  })

  const handleConfirmPayment = (paymentId) => {
    if (window.confirm('Are you sure you want to confirm this payment?')) {
      confirmPayment(paymentId, user.id)
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
    return new Date(dateString).toLocaleDateString('en-KE')
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payment Management</h2>
          <p className="text-gray-600">Manage and track rent payments from tenants</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.totalPayments}</div>
            <div className="text-sm text-gray-600">Total Payments</div>
          </div>
        </div>
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completedPayments}</div>
            <div className="text-sm text-gray-600">Completed</div>
          </div>
        </div>
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.pendingPayments}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
        </div>
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(stats.totalRevenue)}
            </div>
            <div className="text-sm text-gray-600">Total Revenue</div>
          </div>
        </div>
      </div>

      {/* Pending Payments Alert */}
      {pendingPayments.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="text-yellow-600 mr-2">⚠️</div>
              <div>
                <span className="font-semibold">{pendingPayments.length} payments pending confirmation</span>
                <p className="text-sm text-yellow-700">Review and confirm pending payments</p>
              </div>
            </div>
            <button
              onClick={() => setFilter('pending')}
              className="btn-primary text-sm"
            >
              Review Payments
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex space-x-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'all' 
              ? 'bg-primary-600 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All Payments
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'pending' 
              ? 'bg-yellow-600 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'completed' 
              ? 'bg-green-600 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Completed
        </button>
      </div>

      {/* Payments List */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">
          {filter === 'all' ? 'All Payments' :
           filter === 'pending' ? 'Pending Payments' :
           'Completed Payments'} ({filteredPayments.length})
        </h3>
        
        {filteredPayments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">💰</div>
            <p>No payments found</p>
            <p className="text-sm">No payments match your current filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    M-Pesa Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPayments.map((payment) => {
                  const status = getPaymentStatus(payment)
                  return (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {payment.tenant?.first_name} {payment.tenant?.last_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {payment.phone_number}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payment.unit?.property.name} - {payment.unit?.unit_code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {payment.mpesa_receipt_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(payment.payment_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${status.bg} ${status.color}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {payment.status === 'pending' && (
                          <button
                            onClick={() => handleConfirmPayment(payment.id)}
                            className="text-green-600 hover:text-green-900 mr-3"
                          >
                            Confirm
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedPayment(payment)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Payment Details</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium">Tenant:</span>
                <span>{selectedPayment.tenant?.first_name} {selectedPayment.tenant?.last_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Property:</span>
                <span>{selectedPayment.unit?.property.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Unit:</span>
                <span>{selectedPayment.unit?.unit_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Amount:</span>
                <span className="font-bold">{formatCurrency(selectedPayment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">M-Pesa Code:</span>
                <span>{selectedPayment.mpesa_receipt_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Phone Number:</span>
                <span>{selectedPayment.phone_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Payment Date:</span>
                <span>{formatDate(selectedPayment.payment_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Status:</span>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  getPaymentStatus(selectedPayment).bg
                } ${getPaymentStatus(selectedPayment).color}`}>
                  {getPaymentStatus(selectedPayment).text}
                </span>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelectedPayment(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentManagement