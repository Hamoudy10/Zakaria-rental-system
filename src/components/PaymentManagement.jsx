import React, { useState, useEffect } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useAllocation } from '../context/TenantAllocationContext';
import { useUser } from '../context/UserContext';
import { useProperty } from '../context/PropertyContext';

const PaymentManagement = () => {
  const {
    payments,
    loading,
    error,
    fetchPayments,
    createPayment,
    confirmPayment,
    deletePayment,
    getMonthlySummary,
    clearError
  } = usePayment();

  const { allocations } = useAllocation();
  const { users, fetchUsers } = useUser();
  const { properties, fetchProperties, getUnitsByProperty } = useProperty(); // Updated: removed fetchUnits

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedAllocation, setSelectedAllocation] = useState('');
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_month: '',
    mpesa_transaction_id: '',
    mpesa_receipt_number: '',
    phone_number: ''
  });
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // SAFE CHECK: Ensure data is always arrays
  const safePayments = Array.isArray(payments) ? payments : [];
  const safeAllocations = Array.isArray(allocations) ? allocations : [];
  const safeUsers = Array.isArray(users) ? users : [];
  const safeProperties = Array.isArray(properties) ? properties : [];

  // Get all units from all properties
  const getAllUnits = () => {
    return safeProperties.flatMap(property => property.units || []);
  };

  const safeUnits = getAllUnits();

  // Get active allocations for payment
  const activeAllocations = safeAllocations.filter(allocation => allocation.is_active);

  // Filter payments based on selected filters
  const filteredPayments = safePayments.filter(payment => {
    const matchesMonth = !filterMonth || payment.payment_month?.includes(filterMonth);
    const matchesStatus = !filterStatus || payment.status === filterStatus;
    return matchesMonth && matchesStatus;
  });

  // Current month for default value
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Load payments, users, and properties on component mount
  useEffect(() => {
    fetchPayments();
    fetchUsers();
    fetchProperties(); // This will fetch properties with their units
  }, [fetchPayments, fetchUsers, fetchProperties]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!showPaymentModal) {
      setSelectedAllocation('');
      setPaymentData({
        amount: '',
        payment_month: currentMonth,
        mpesa_transaction_id: '',
        mpesa_receipt_number: '',
        phone_number: ''
      });
    }
  }, [showPaymentModal, currentMonth]);

  // When allocation is selected, auto-fill amount and phone
  useEffect(() => {
    if (selectedAllocation) {
      const allocation = activeAllocations.find(a => a.id === selectedAllocation);
      if (allocation) {
        // Find tenant details from users
        const tenant = safeUsers.find(user => user.id === allocation.tenant_id);
        setPaymentData(prev => ({
          ...prev,
          amount: allocation.monthly_rent || '',
          phone_number: tenant?.phone_number || ''
        }));
      }
    }
  }, [selectedAllocation, activeAllocations, safeUsers]);

  // Function to get tenant name by ID
  const getTenantName = (tenantId) => {
    if (!tenantId || !safeUsers.length) return 'Unknown Tenant';
    
    const tenant = safeUsers.find(user => user.id === tenantId);
    return tenant ? `${tenant.first_name} ${tenant.last_name}` : 'Unknown Tenant';
  };

  // Function to get unit details by ID
  const getUnitDetails = (unitId) => {
    if (!unitId || !safeUnits.length) return 'Unknown Unit';
    
    const unit = safeUnits.find(unit => unit.id === unitId);
    if (!unit) return 'Unknown Unit';
    
    return `${unit.unit_code} - ${unit.unit_number}`;
  };

  // Function to get property name by unit ID
  const getPropertyName = (unitId) => {
    if (!unitId || !safeUnits.length || !safeProperties.length) return '';
    
    const unit = safeUnits.find(unit => unit.id === unitId);
    if (!unit) return '';
    
    const property = safeProperties.find(prop => prop.id === unit.property_id);
    return property ? property.name : '';
  };

  // SAFE VERSION: Get current month summary with fallback
  const getCurrentMonthSummary = () => {
    const currentDate = new Date();
    
    // Check if getMonthlySummary function exists
    if (typeof getMonthlySummary === 'function') {
      return getMonthlySummary(currentDate.getFullYear(), currentDate.getMonth() + 1);
    }
    
    // Fallback: Calculate manually from payments
    const currentMonthPayments = safePayments.filter(payment => {
      if (!payment.payment_month || payment.status !== 'completed') return false;
      return payment.payment_month.startsWith(currentMonth);
    });

    return {
      completedPayments: currentMonthPayments.length,
      totalAmount: currentMonthPayments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0)
    };
  };

  const currentMonthSummary = getCurrentMonthSummary();

  const handleCreatePayment = async (e) => {
    e.preventDefault();
    clearError();
    
    try {
      const allocation = activeAllocations.find(a => a.id === selectedAllocation);

      if (!allocation) {
        alert('Please select a tenant allocation');
        return;
      }

      await createPayment({
        tenant_id: allocation.tenant_id,
        unit_id: allocation.unit_id,
        ...paymentData,
        amount: parseFloat(paymentData.amount) || 0,
        payment_month: paymentData.payment_month ? `${paymentData.payment_month}-01` : `${currentMonth}-01`
      });

      alert('Payment recorded successfully!');
      setShowPaymentModal(false);
    } catch (error) {
      console.error('Error creating payment:', error);
    }
  };

  const handleConfirmPayment = async (paymentId) => {
    try {
      await confirmPayment(paymentId);
      alert('Payment confirmed successfully!');
    } catch (error) {
      console.error('Error confirming payment:', error);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete this payment record?')) {
      try {
        await deletePayment(paymentId);
        alert('Payment record deleted successfully!');
      } catch (error) {
        console.error('Error deleting payment:', error);
      }
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading payments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payment Management</h2>
          <p className="text-gray-600">Manage tenant rent payments and records</p>
        </div>
        <button
          onClick={() => setShowPaymentModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={activeAllocations.length === 0}
        >
          Record Payment
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
            <div className="text-2xl font-bold text-blue-600">{safePayments.length}</div>
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
            <div className="text-2xl font-bold text-purple-600">{activeAllocations.length}</div>
            <div className="text-sm text-gray-600">Active Tenants</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(currentMonthSummary.totalAmount)}
            </div>
            <div className="text-sm text-gray-600">Collected This Month</div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Record Rent Payment</h3>
            <form onSubmit={handleCreatePayment} className="space-y-4">
              {/* Tenant Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Tenant *</label>
                <select
                  value={selectedAllocation}
                  onChange={(e) => setSelectedAllocation(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Choose a tenant</option>
                  {activeAllocations.map(allocation => {
                    const tenant = safeUsers.find(user => user.id === allocation.tenant_id);
                    const unit = safeUnits.find(unit => unit.id === allocation.unit_id);
                    return (
                      <option key={allocation.id} value={allocation.id}>
                        {tenant ? `${tenant.first_name} ${tenant.last_name}` : 'Unknown Tenant'} - 
                        {unit ? `${unit.unit_code} - ${unit.unit_number}` : 'Unknown Unit'} - 
                        {formatCurrency(allocation.monthly_rent)}
                      </option>
                    );
                  })}
                </select>
                {activeAllocations.length === 0 && (
                  <p className="text-sm text-red-600 mt-1">No active tenant allocations found.</p>
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

      {/* Payments List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h3 className="text-lg font-semibold">
            Payment Records ({filteredPayments.length})
            {(filterMonth || filterStatus) && ' (Filtered)'}
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full sm:w-40 p-2 border border-gray-300 rounded-md text-sm"
              placeholder="Filter by month"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full sm:w-32 p-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
            <button
              onClick={() => { setFilterMonth(''); setFilterStatus(''); }}
              className="w-full sm:w-auto bg-gray-500 text-white px-3 py-2 rounded-md text-sm hover:bg-gray-600 whitespace-nowrap"
            >
              Clear Filters
            </button>
          </div>
        </div>
        
        {filteredPayments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">💳</div>
            <p>No payment records found</p>
            <p className="text-sm">
              {filterMonth || filterStatus ? 'Try changing your filters' : 'Record payments to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Added scrollable container with max height */}
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 bg-gray-50">
                      Tenant & Unit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 bg-gray-50">
                      Payment Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 bg-gray-50">
                      M-Pesa Info
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 bg-gray-50">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 bg-gray-50">
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
                            {getTenantName(payment.tenant_id).split(' ').map(n => n[0]).join('').toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
                              {getTenantName(payment.tenant_id)}
                            </div>
                            <div className="text-sm text-gray-500 whitespace-nowrap">
                              {getUnitDetails(payment.unit_id)}
                            </div>
                            {getPropertyName(payment.unit_id) && (
                              <div className="text-xs text-gray-400 whitespace-nowrap">
                                {getPropertyName(payment.unit_id)}
                              </div>
                            )}
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
                        {payment.payment_date && (
                          <div className="text-xs text-gray-400 whitespace-nowrap">
                            Paid: {new Date(payment.payment_date).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 whitespace-nowrap">
                          {payment.mpesa_transaction_id || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500 whitespace-nowrap">
                          {payment.mpesa_receipt_number || 'N/A'}
                        </div>
                        {payment.phone_number && (
                          <div className="text-xs text-gray-400 whitespace-nowrap">
                            {payment.phone_number}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                          ${payment.status === 'completed' ? 'bg-green-100 text-green-800' : 
                            'bg-yellow-100 text-yellow-800'}`}>
                          {payment.status?.charAt(0).toUpperCase() + payment.status?.slice(1) || 'Unknown'}
                        </span>
                        {payment.is_late_payment && (
                          <div className="mt-1">
                            <span className="px-1 inline-flex text-xs leading-4 font-semibold rounded-full bg-red-100 text-red-800">
                              Late
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        {payment.status !== 'completed' && (
                          <button
                            onClick={() => handleConfirmPayment(payment.id)}
                            className="text-green-600 hover:text-green-900 whitespace-nowrap"
                          >
                            Confirm
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
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentManagement;