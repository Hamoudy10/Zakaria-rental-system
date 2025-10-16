import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const SalaryPayments = () => {
  const { users } = useAuth()
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_month: '',
    phone_number: '',
    mpesa_receipt_number: ''
  })

  const agents = users.filter(user => user.role === 'agent')

  const handlePayment = (agent) => {
    setSelectedAgent(agent)
    setPaymentData({
      amount: '25000', // Default salary
      payment_month: new Date().toISOString().slice(0, 7),
      phone_number: agent.phone_number,
      mpesa_receipt_number: ''
    })
    setShowPaymentModal(true)
  }

  const processPayment = async (e) => {
    e.preventDefault()
    // TODO: Process M-Pesa payment
    console.log('Processing salary payment:', { agent: selectedAgent, ...paymentData })
    setShowPaymentModal(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Salary Payments</h2>
          <p className="text-gray-600">Manage agent salary payments via M-Pesa</p>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Process Salary Payment</h3>
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="font-semibold">{selectedAgent.first_name} {selectedAgent.last_name}</p>
              <p className="text-sm text-gray-600">{selectedAgent.phone_number}</p>
            </div>
            <form onSubmit={processPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount (KSh)</label>
                <input
                  type="number"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
                  className="input-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Month</label>
                <input
                  type="month"
                  value={paymentData.payment_month}
                  onChange={(e) => setPaymentData({...paymentData, payment_month: e.target.value})}
                  className="input-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">M-Pesa Receipt Number</label>
                <input
                  type="text"
                  value={paymentData.mpesa_receipt_number}
                  onChange={(e) => setPaymentData({...paymentData, mpesa_receipt_number: e.target.value})}
                  className="input-primary"
                  placeholder="Enter M-Pesa receipt number"
                  required
                />
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  Confirm Payment
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
          </div>
        </div>
      )}

      {/* Agents List */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Agent List</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Payment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                        {agent.first_name[0]}{agent.last_name[0]}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {agent.first_name} {agent.last_name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {agent.phone_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    March 2024
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handlePayment(agent)}
                      className="btn-primary text-sm"
                    >
                      Pay Salary
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default SalaryPayments