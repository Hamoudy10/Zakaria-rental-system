import React, { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';
import { useAuth } from '../context/AuthContext';
import { paymentAPI, paymentUtils } from '../services/api';

const SalaryPayment = () => {
  const { users, fetchUsers } = useUser();
  const { user: currentUser } = useAuth();
  const { refreshNotifications } = useNotification();

  const [salaryPayments, setSalaryPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_month: '',
    phone_number: '',
    description: 'Monthly Salary Payment'
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

  // Load salary payments and users on component mount
  useEffect(() => {
    fetchSalaryPayments();
    fetchUsers();
  }, []);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!showPaymentModal) {
      setSelectedAgent('');
      setPaymentData({
        amount: '',
        payment_month: currentMonth,
        phone_number: '',
        description: 'Monthly Salary Payment'
      });
      setError('');
      setSuccess('');
    }
  }, [showPaymentModal, currentMonth]);

  // When agent is selected, auto-fill phone number
  useEffect(() => {
    if (selectedAgent) {
      const agent = availableAgents.find(a => a.id === selectedAgent);
      if (agent) {
        setPaymentData(prev => ({
          ...prev,
          phone_number: agent.phone_number || '',
          amount: agent.salary_amount || ''
        }));
      }
    }
  }, [selectedAgent, availableAgents]);

  // Fetch salary payments
  const fetchSalaryPayments = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await paymentAPI.getSalaryPayments();
      if (response.data.success) {
        setSalaryPayments(response.data.data?.payments || []);
      } else {
        setError(response.data.message || 'Failed to fetch salary payments');
      }
    } catch (error) {
      console.error('Error fetching salary payments:', error);
      setError(error.response?.data?.message || 'Failed to fetch salary payments');
    } finally {
      setLoading(false);
    }
  };

  // Process salary payment with M-Pesa
  const processSalaryPayment = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setError('');
    setSuccess('');

    try {
      const agent = availableAgents.find(a => a.id === selectedAgent);

      if (!agent) {
        setError('Please select an agent');
        return;
      }

      // Validate phone number
      if (!paymentUtils.isValidMpesaPhone(paymentData.phone_number)) {
        setError('Please enter a valid Kenyan phone number (e.g., 0712345678)');
        return;
      }

      // Validate amount
      if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
        setError('Please enter a valid amount');
        return;
      }

      // Format phone number for M-Pesa
      const formattedPhone = paymentUtils.formatMpesaPhone(paymentData.phone_number);

      const salaryData = {
        agentId: selectedAgent,
        amount: parseFloat(paymentData.amount),
        paymentMonth: paymentData.payment_month,
        phone: formattedPhone
      };

      console.log('Processing salary payment:', salaryData);

      const response = await paymentAPI.processSalaryPayment(salaryData);

      if (response.data.success) {
        setSuccess('Salary payment initiated successfully! The agent will receive an M-Pesa prompt.');
        
        // Refresh data
        await fetchSalaryPayments();
        
        // Refresh notifications to show the new payment notification
        await refreshNotifications();
        
        // Close modal after short delay
        setTimeout(() => {
          setShowPaymentModal(false);
        }, 2000);
      } else {
        setError(response.data.message || 'Failed to process salary payment');
      }
    } catch (error) {
      console.error('Error processing salary payment:', error);
      setError(error.response?.data?.message || 'Failed to process salary payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete this salary payment record?')) {
      try {
        setLoading(true);
        await paymentAPI.deletePayment(paymentId);
        setSuccess('Salary payment record deleted successfully!');
        await fetchSalaryPayments();
      } catch (error) {
        console.error('Error deleting salary payment:', error);
        setError(error.response?.data?.message || 'Failed to delete salary payment');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleMarkAsCompleted = async (paymentId) => {
    try {
      setLoading(true);
      await paymentAPI.updatePayment(paymentId, { status: 'completed' });
      setSuccess('Payment marked as completed!');
      await fetchSalaryPayments();
    } catch (error) {
      console.error('Error marking payment as completed:', error);
      setError(error.response?.data?.message || 'Failed to update payment status');
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
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
      return new Date(dateString).toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  // Get current month summary
  const getCurrentMonthSummary = () => {
    const currentMonthPayments = safeSalaryPayments.filter(payment => 
      payment.payment_month?.startsWith(currentMonth)
    );
    
    return {
      completedPayments: currentMonthPayments.filter(p => p.status === 'completed').length,
      totalAmount: currentMonthPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0),
      pendingPayments: currentMonthPayments.filter(p => p.status === 'pending').length
    };
  };

  const currentMonthSummary = getCurrentMonthSummary();

  if (loading && salaryPayments.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 md:h-12 md:w-12 border-b-2 border-blue-500 mx-auto"></div>
          <div className="text-gray-500 mt-2 text-sm md:text-base">Loading salary payments...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">Salary Payments</h2>
          <p className="text-sm md:text-base text-gray-600">Process agent salary payments with M-Pesa integration</p>
        </div>
        <button
          onClick={() => setShowPaymentModal(true)}
          disabled={processing}
          className="bg-green-600 text-white px-4 py-3 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 text-sm md:text-base min-h-[44px] touch-manipulation w-full sm:w-auto"
        >
          Process Salary Payment
        </button>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 text-sm">
          <div className="flex justify-between items-center">
            <span>{success}</span>
            <button 
              onClick={clearMessages}
              className="text-green-800 font-bold hover:text-green-900 text-lg"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
          <div className="flex justify-between items-center">
            <span>{error}</span>
            <button 
              onClick={clearMessages}
              className="text-red-800 font-bold hover:text-red-900 text-lg"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards - Mobile Responsive */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md border border-gray-200">
          <div className="text-center">
            <div className="text-lg md:text-2xl font-bold text-blue-600">{safeSalaryPayments.length}</div>
            <div className="text-xs md:text-sm text-gray-600">Total Payments</div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md border border-gray-200">
          <div className="text-center">
            <div className="text-lg md:text-2xl font-bold text-green-600">{currentMonthSummary.completedPayments}</div>
            <div className="text-xs md:text-sm text-gray-600">Completed This Month</div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md border border-gray-200">
          <div className="text-center">
            <div className="text-lg md:text-2xl font-bold text-purple-600">{availableAgents.length}</div>
            <div className="text-xs md:text-sm text-gray-600">Active Agents</div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-lg shadow-md border border-gray-200">
          <div className="text-center">
            <div className="text-lg md:text-2xl font-bold text-orange-600">
              {formatCurrency(currentMonthSummary.totalAmount)}
            </div>
            <div className="text-xs md:text-sm text-gray-600">Paid This Month</div>
          </div>
        </div>
      </div>

      {/* Filters - Mobile Responsive */}
      <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Month</label>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full p-2 md:p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] touch-manipulation"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full p-2 md:p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] touch-manipulation"
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
              className="bg-gray-500 text-white px-4 py-3 rounded-md hover:bg-gray-600 min-h-[44px] touch-manipulation transition-colors duration-200 w-full md:w-auto text-sm md:text-base"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal - Mobile Optimized */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-50">
          <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-2">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg md:text-xl font-bold text-gray-900">Process Salary Payment</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={processing}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50 min-h-[44px] min-w-[44px] touch-manipulation flex items-center justify-center"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={processSalaryPayment} className="space-y-4">
              {/* Agent Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Agent *</label>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] touch-manipulation"
                  required
                  disabled={processing}
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

              {/* Payment Details - Responsive Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount (KES) *</label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
                    className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] touch-manipulation"
                    required
                    disabled={processing}
                    placeholder="Enter amount"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Month *</label>
                  <input
                    type="month"
                    value={paymentData.payment_month}
                    onChange={(e) => setPaymentData({...paymentData, payment_month: e.target.value})}
                    className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] touch-manipulation"
                    required
                    disabled={processing}
                  />
                </div>
              </div>

              {/* M-Pesa Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Agent's M-Pesa Phone Number *</label>
                <input
                  type="tel"
                  placeholder="0712345678"
                  value={paymentData.phone_number}
                  onChange={(e) => setPaymentData({...paymentData, phone_number: e.target.value})}
                  className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] touch-manipulation"
                  required
                  disabled={processing}
                />
                <p className="text-xs md:text-sm text-gray-500 mt-1">
                  Enter the agent's M-Pesa registered phone number
                </p>
              </div>

              {/* Payment Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2 text-sm md:text-base">Payment Summary</h4>
                <div className="space-y-1 text-xs md:text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-700">Agent:</span>
                    <span className="font-medium">
                      {availableAgents.find(a => a.id === selectedAgent)?.first_name || 'Not selected'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700">Amount:</span>
                    <span className="font-medium">{formatCurrency(paymentData.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700">Payment Month:</span>
                    <span className="font-medium">{formatDate(paymentData.payment_month + '-01')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700">Phone Number:</span>
                    <span className="font-medium">{paymentData.phone_number}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 pt-4">
                <button 
                  type="submit" 
                  disabled={processing}
                  className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex-1 transition-colors duration-200 flex items-center justify-center text-sm md:text-base min-h-[44px] touch-manipulation"
                >
                  {processing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 md:h-5 md:w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    'Process with M-Pesa'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  disabled={processing}
                  className="bg-gray-500 text-white px-6 py-3 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex-1 transition-colors duration-200 text-sm md:text-base min-h-[44px] touch-manipulation"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Payments List - Mobile Responsive */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-4 gap-2">
          <h3 className="text-base md:text-lg font-semibold text-gray-900">
            Salary Payments ({filteredPayments.length})
            {(filterMonth || filterStatus) && ' (Filtered)'}
          </h3>
          <div className="text-xs md:text-sm text-gray-500">
            {filterMonth && `Month: ${filterMonth}`}
            {filterMonth && filterStatus && ' • '}
            {filterStatus && `Status: ${filterStatus}`}
          </div>
        </div>
        
        {filteredPayments.length === 0 ? (
          <div className="text-center py-8 md:py-12 text-gray-500">
            <div className="text-3xl md:text-4xl mb-3">💰</div>
            <p className="text-base md:text-lg font-medium">No salary payments found</p>
            <p className="text-xs md:text-sm mt-1">
              {filterMonth || filterStatus ? 'Try changing your filters' : 'Process salary payments to get started'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredPayments.map((payment) => (
                <div key={payment.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                        {(payment.agent?.first_name?.[0] || 'A')}{(payment.agent?.last_name?.[0] || 'G')}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {payment.agent?.first_name || 'Unknown'} {payment.agent?.last_name || 'Agent'}
                        </div>
                        <div className="text-xs text-gray-500">{payment.agent?.phone_number || 'N/A'}</div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${payment.status === 'completed' ? 'bg-green-100 text-green-800' : 
                        payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'}`}>
                      {payment.status?.charAt(0).toUpperCase() + payment.status?.slice(1) || 'Unknown'}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Amount:</span>
                      <span className="font-medium">{formatCurrency(payment.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Month:</span>
                      <span className="font-medium">{formatDate(payment.payment_month)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">M-Pesa ID:</span>
                      <span className="font-medium text-xs">{payment.mpesa_transaction_id || 'Pending...'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Receipt:</span>
                      <span className="font-medium text-xs">{payment.mpesa_receipt_number || 'Pending...'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Date:</span>
                      <span className="font-medium text-xs">{formatPaymentDate(payment.payment_date)}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-gray-200 flex space-x-2">
                    {payment.status !== 'completed' && (
                      <button
                        onClick={() => handleMarkAsCompleted(payment.id)}
                        disabled={loading}
                        className="flex-1 bg-green-600 text-white py-2 px-3 rounded-md hover:bg-green-700 disabled:opacity-50 text-xs font-medium min-h-[44px] touch-manipulation transition-colors"
                      >
                        Mark Complete
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePayment(payment.id)}
                      disabled={loading}
                      className="flex-1 bg-red-600 text-white py-2 px-3 rounded-md hover:bg-red-700 disabled:opacity-50 text-xs font-medium min-h-[44px] touch-manipulation transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Agent
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Payment Details
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      M-Pesa Info
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-4 py-4 whitespace-nowrap">
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
                      <td className="px-4 py-4 whitespace-nowrap">
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
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 whitespace-nowrap">
                          {payment.mpesa_transaction_id || 'Pending...'}
                        </div>
                        <div className="text-sm text-gray-500 whitespace-nowrap">
                          {payment.mpesa_receipt_number || 'Pending...'}
                        </div>
                        <div className="text-xs text-gray-400 whitespace-nowrap">
                          {formatPaymentDate(payment.payment_date)}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                          ${payment.status === 'completed' ? 'bg-green-100 text-green-800' : 
                            payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'}`}>
                          {payment.status?.charAt(0).toUpperCase() + payment.status?.slice(1) || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        {payment.status !== 'completed' && (
                          <button
                            onClick={() => handleMarkAsCompleted(payment.id)}
                            disabled={loading}
                            className="text-green-600 hover:text-green-900 whitespace-nowrap disabled:opacity-50 min-h-[44px] px-3 touch-manipulation"
                          >
                            Mark Complete
                          </button>
                        )}
                        <button
                          onClick={() => handleDeletePayment(payment.id)}
                          disabled={loading}
                          className="text-red-600 hover:text-red-900 whitespace-nowrap disabled:opacity-50 min-h-[44px] px-3 touch-manipulation"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Available Agents - Mobile Responsive */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold mb-4 text-gray-900">Active Agents ({availableAgents.length})</h3>
        {availableAgents.length === 0 ? (
          <p className="text-gray-500 text-center py-4 text-sm md:text-base">No active agents found</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {availableAgents.map(agent => {
              const agentPayments = safeSalaryPayments.filter(payment => payment.agent_id === agent.id);
              const totalPaid = agentPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
              const lastPayment = agentPayments.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))[0];
              
              return (
                <div key={agent.id} className="border border-gray-200 rounded-lg p-3 md:p-4 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs md:text-base mr-2 md:mr-3">
                        {agent.first_name?.[0]}{agent.last_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 text-sm md:text-base truncate">
                          {agent.first_name} {agent.last_name}
                        </div>
                        <div className="text-xs md:text-sm text-gray-500 truncate">{agent.phone_number}</div>
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">
                      {agentPayments.length} payments
                    </span>
                  </div>
                  <div className="space-y-1 text-xs md:text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Total paid:</span>
                      <span className="font-medium">{formatCurrency(totalPaid)}</span>
                    </div>
                    {lastPayment && (
                      <div className="flex justify-between">
                        <span>Last payment:</span>
                        <span className="font-medium">{formatDate(lastPayment.payment_month)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Email:</span>
                      <span className="font-medium truncate ml-2 text-xs">{agent.email}</span>
                    </div>
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