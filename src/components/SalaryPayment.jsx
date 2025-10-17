import React, { useState, useEffect } from 'react';
import { useSalaryPayment } from '../context/SalaryPaymentContext';
import { useUser } from '../context/UserContext';
import { useAuth } from '../context/AuthContext';

const SalaryPayment = () => {
  const { users } = useUser();
  const { user: currentUser } = useAuth();
  const {
    salaryPayments,
    loading,
    error,
    fetchSalaryPayments,
    createSalaryPayment,
    updateSalaryPayment,
    deleteSalaryPayment,
    markAsCompleted,
    getAgentPayments,
    getPaymentsByStatus,
    getMonthlySummary,
    clearError
  } = useSalaryPayment();

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_month: '',
    phone_number: '',
    mpesa_transaction_id: '',
    mpesa_receipt_number: ''
  });
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // SAFE CHECK: Ensure data is always arrays
  const safeUsers = Array.isArray(users) ? users : [];
  const safeSalaryPayments = Array.isArray(salaryPayments) ? salaryPayments : [];

  // Get available agents (users with role 'agent')
  const availableAgents = safeUsers.filter(user => user.role === 'agent' && user.is_active);

  // Filter payments based on selected filters
  const filteredPayments = safeSalaryPayments.filter(payment => {
    const matchesMonth = !filterMonth || payment.payment_month?.includes(filterMonth);
    const matchesStatus = !filterStatus || payment.status === filterStatus;
    return matchesMonth && matchesStatus;
  });

  // Get current month for default value (YYYY-MM format)
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Load salary payments on component mount
  useEffect(() => {
    fetchSalaryPayments();
  }, [fetchSalaryPayments]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!showPaymentModal) {
      setSelectedAgent('');
      setPaymentData({
        amount: '',
        payment_month: currentMonth,
        phone_number: '',
        mpesa_transaction_id: '',
        mpesa_receipt_number: ''
      });
    }
  }, [showPaymentModal, currentMonth]);

  // When agent is selected, auto-fill phone number
  useEffect(() => {
    if (selectedAgent) {
      const agent = availableAgents.find(a => a.id === selectedAgent);
      if (agent) {
        setPaymentData(prev => ({
          ...prev,
          phone_number: agent.phone_number || ''
        }));
      }
    }
  }, [selectedAgent, availableAgents]);

  const handleCreatePayment = async (e) => {
    e.preventDefault();
    clearError();
    
    try {
      const agent = availableAgents.find(a => a.id === selectedAgent);

      if (!agent) {
        alert('Please select an agent');
        return
      }

      await createSalaryPayment({
        agent_id: selectedAgent,
        paid_by: currentUser?.id,
        ...paymentData,
        amount: parseFloat(paymentData.amount) || 0,
        payment_month: paymentData.payment_month ? `${paymentData.payment_month}-01` : `${currentMonth}-01`
      });

      alert('Salary payment recorded successfully!');
      setShowPaymentModal(false);
    } catch (error) {
      console.error('Error creating salary payment:', error);
      // Error is already set in context
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete this salary payment record?')) {
      try {
        await deleteSalaryPayment(paymentId);
        alert('Salary payment record deleted successfully!');
      } catch (error) {
        console.error('Error deleting salary payment:', error);
      }
    }
  };

  const handleMarkAsCompleted = async (paymentId) => {
    try {
      await markAsCompleted(paymentId);
      alert('Payment marked as completed!');
    } catch (error) {
      console.error('Error marking payment as completed:', error);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'long'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const formatPaymentDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-KE');
    } catch {
      return 'Invalid Date';
    }
  };

  // Get current month summary
  const currentDate = new Date();
  const currentMonthSummary = getMonthlySummary(currentDate.getFullYear(), currentDate.getMonth() + 1);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading salary payments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Salary Payments</h2>
          <p className="text-gray-600">Manage agent salary payments and records</p>
        </div>
        <button
          onClick={() => setShowPaymentModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={availableAgents.length === 0}
        >
          Record Salary Payment
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button 
            onClick={clearError}
            className="float-right text-red-800 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{safeSalaryPayments.length}</div>
            <div className="text-sm text-gray-600">Total Payments</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{currentMonthSummary.completedPayments}</div>
            <div className="text-sm text-gray-600">Completed This Month</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{availableAgents.length}</div>
            <div className="text-sm text-gray-600">Active Agents</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(currentMonthSummary.totalAmount)}
            </div>
            <div className="text-sm text-gray-600">Paid This Month</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-md">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Month</label>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setFilterMonth('');
                setFilterStatus('');
              }}
              className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 h-[42px]"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Record Salary Payment</h3>
            <form onSubmit={handleCreatePayment} className="space-y-4">
              {/* Agent Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Agent *</label>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Choose an agent</option>
                  {availableAgents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.first_name || ''} {agent.last_name || ''} - {agent.phone_number || ''}
                    </option>
                  ))}
                </select>
                {availableAgents.length === 0 && (
                  <p className="text-sm text-red-600 mt-1">No active agents found. Please add agents first.</p>
                )}
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount (KES) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Payment Month *</label>
                  <input
                    type="month"
                    value={paymentData.payment_month}
                    onChange={(e) => setPaymentData({...paymentData, payment_month: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* M-Pesa Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone Number *</label>
                  <input
                    type="text"
                    placeholder="254712345678"
                    value={paymentData.phone_number}
                    onChange={(e) => setPaymentData({...paymentData, phone_number: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">M-Pesa Transaction ID</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={paymentData.mpesa_transaction_id}
                    onChange={(e) => setPaymentData({...paymentData, mpesa_transaction_id: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">M-Pesa Receipt Number</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={paymentData.mpesa_receipt_number}
                  onChange={(e) => setPaymentData({...paymentData, mpesa_receipt_number: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex space-x-4 pt-4">
                <button 
                  type="submit" 
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex-1"
                >
                  Record Payment
                </button>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Payments List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            Salary Payments ({filteredPayments.length})
            {(filterMonth || filterStatus) && ' (Filtered)'}
          </h3>
          <div className="text-sm text-gray-500">
            {filterMonth && `Month: ${filterMonth}`}
            {filterMonth && filterStatus && ' • '}
            {filterStatus && `Status: ${filterStatus}`}
          </div>
        </div>
        
        {filteredPayments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">💰</div>
            <p>No salary payments found</p>
            <p className="text-sm">
              {filterMonth || filterStatus ? 'Try changing your filters' : 'Record salary payments to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Agent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Payment Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    M-Pesa Info
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                          {(payment.agent?.first_name?.[0] || 'A')}{(payment.agent?.last_name?.[0] || 'G')}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
                            {payment.agent?.first_name || 'Unknown'} {payment.agent?.last_name || 'Agent'}
                          </div>
                          <div className="text-sm text-gray-500 whitespace-nowrap">
                            {payment.agent?.phone_number || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
                        {formatCurrency(payment.amount)}
                      </div>
                      <div className="text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(payment.payment_month)}
                      </div>
                      <div className="text-xs text-gray-400 whitespace-nowrap">
                        Paid by: {payment.paid_by_user?.first_name || 'Admin'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 whitespace-nowrap">
                        {payment.mpesa_transaction_id || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-500 whitespace-nowrap">
                        {payment.mpesa_receipt_number || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-400 whitespace-nowrap">
                        {formatPaymentDate(payment.payment_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${payment.status === 'completed' ? 'bg-green-100 text-green-800' : 
                          payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-red-100 text-red-800'}`}>
                        {payment.status?.charAt(0).toUpperCase() + payment.status?.slice(1) || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {payment.status !== 'completed' && (
                        <button
                          onClick={() => handleMarkAsCompleted(payment.id)}
                          className="text-green-600 hover:text-green-900 whitespace-nowrap"
                        >
                          Mark Complete
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletePayment(payment.id)}
                        className="text-red-600 hover:text-red-900 whitespace-nowrap"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Available Agents */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Active Agents ({availableAgents.length})</h3>
        {availableAgents.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No active agents found</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableAgents.map(agent => {
              const agentPayments = getAgentPayments(agent.id);
              const totalPaid = agentPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
              
              return (
                <div key={agent.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900 whitespace-nowrap">
                        {agent.first_name} {agent.last_name}
                      </div>
                      <div className="text-sm text-gray-500 whitespace-nowrap">{agent.phone_number}</div>
                      <div className="text-sm text-gray-500 whitespace-nowrap">{agent.email}</div>
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">
                      {agentPayments.length} payments
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    Total paid: {formatCurrency(totalPaid)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalaryPayment;