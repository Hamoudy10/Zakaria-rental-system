import React, { useState, useEffect, Suspense, lazy } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAllocation } from '../context/TenantAllocationContext'
import { usePayment } from '../context/PaymentContext'

// Lazy load tenant components
const TenantPayment = lazy(() => import('../components/TenantPayment'));
const TenantComplaints = lazy(() => import('../components/TenantComplaints'));

// Loading component for Suspense fallback
const TabLoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
);

// Safe hook usage with error boundary
const useSafePayment = () => {
  try {
    return usePayment();
  } catch (error) {
    console.warn('Payment context not available:', error);
    return {
      getPaymentsByTenant: () => Promise.resolve([]),
      getPaymentSummary: () => ({})
    };
  }
};

const useSafeAllocation = () => {
  try {
    return useAllocation();
  } catch (error) {
    console.warn('Allocation context not available:', error);
    return {
      getTenantAllocations: () => Promise.resolve([])
    };
  }
};

const TenantDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')
  const { user } = useAuth()
  const { getTenantAllocations } = useSafeAllocation()
  const { getPaymentsByTenant, getPaymentSummary } = useSafePayment()

  const [tenantData, setTenantData] = useState({
    allocation: null,
    payments: [],
    paymentSummary: {},
    loading: true,
    error: null
  })

  // Fetch tenant data on component mount
  useEffect(() => {
    fetchTenantData()
  }, [user])

  const fetchTenantData = async () => {
    if (!user?.id) return

    try {
      setTenantData(prev => ({ ...prev, loading: true, error: null }))
      
      // Fetch allocation data
      const allocations = await getTenantAllocations(user.id)
      const activeAllocation = allocations.find(allocation => allocation.is_active) || null

      // Fetch payment data
      const payments = await getPaymentsByTenant(user.id)
      const paymentSummary = getPaymentSummary(user.id)

      console.log('📊 Tenant Dashboard Data:', {
        allocation: activeAllocation,
        paymentsCount: payments.length,
        paymentSummary
      })

      setTenantData({
        allocation: activeAllocation,
        payments: payments,
        paymentSummary: paymentSummary,
        loading: false,
        error: null
      })

    } catch (error) {
      console.error('Error fetching tenant data:', error)
      setTenantData(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load dashboard data'
      }))
    }
  }

  const tabs = [
    { id: 'overview', name: 'Overview' },
    { id: 'payments', name: 'Rent Payments' },
    { id: 'complaints', name: 'Complaints' },
    { id: 'profile', name: 'My Profile' }
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'payments':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <TenantPayment 
              allocation={tenantData.allocation} 
              payments={tenantData.payments}
              onPaymentSuccess={fetchTenantData}
            />
          </Suspense>
        )
      case 'complaints':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <TenantComplaints />
          </Suspense>
        )
      case 'profile':
        return <ProfileManagement />
      case 'overview':
      default:
        return <TenantOverview 
          setActiveTab={setActiveTab}
          tenantData={tenantData}
          onRefresh={fetchTenantData}
        />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

// Tenant Overview Component (Keep as is - lightweight)
const TenantOverview = ({ setActiveTab, tenantData, onRefresh }) => {
  const { allocation, payments, paymentSummary, loading, error } = tenantData

  // Calculate next payment info
  const getNextPaymentInfo = () => {
    if (!allocation) return { amount: 0, dueDate: 'N/A', status: 'No Allocation' }

    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    
    // Check if current month is paid
    const currentMonthPaid = payments.some(payment => {
      const paymentDate = new Date(payment.payment_month || payment.payment_date)
      return paymentDate.getMonth() === currentMonth && 
             paymentDate.getFullYear() === currentYear &&
             payment.status === 'completed'
    })

    // Calculate due date (rent_due_day of current month)
    const dueDate = new Date(currentYear, currentMonth, allocation.rent_due_day || 5)
    if (dueDate < now) {
      dueDate.setMonth(dueDate.getMonth() + 1) // Move to next month if due date passed
    }

    return {
      amount: allocation.monthly_rent || 0,
      dueDate: dueDate.toISOString().split('T')[0],
      status: currentMonthPaid ? 'Paid' : 'Pending',
      isPaid: currentMonthPaid
    }
  }

  const nextPayment = getNextPaymentInfo()

  // Get recent activities (payments and complaints)
  const recentActivities = payments.slice(0, 5).map(payment => ({
    type: 'payment',
    description: `Rent payment for ${new Date(payment.payment_month || payment.payment_date).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}`,
    amount: `KSh ${parseInt(payment.amount).toLocaleString()}`,
    date: payment.payment_date || payment.created_at,
    status: payment.status
  }))

  const getActivityIcon = (type) => {
    switch (type) {
      case 'payment': return '💰'
      case 'complaint': return '🛠️'
      default: return '📝'
    }
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
      paid: { color: 'bg-green-100 text-green-800', label: 'Paid' },
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      in_progress: { color: 'bg-blue-100 text-blue-800', label: 'In Progress' },
      resolved: { color: 'bg-gray-100 text-gray-800', label: 'Resolved' }
    }
    
    const config = statusConfig[status] || statusConfig.pending
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading your dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4">{error}</div>
        <button 
          onClick={onRefresh}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!allocation) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">🏠</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">No Active Allocation</h2>
        <p className="text-gray-600 mb-4">You don't have an active unit allocation yet.</p>
        <p className="text-sm text-gray-500">Please contact the property manager for assistance.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tenant Dashboard</h1>
        <p className="text-gray-600">Welcome to your rental management portal</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Next Payment</p>
              <p className="text-2xl font-bold text-green-600">
                KSh {parseInt(nextPayment.amount).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">
                Due {new Date(nextPayment.dueDate).toLocaleDateString('en-KE')}
              </p>
            </div>
            <div className="text-lg">💰</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Payment Status</p>
              <div className="mt-1">
                {getStatusBadge(nextPayment.status.toLowerCase())}
              </div>
            </div>
            <div className="text-lg">📊</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Paid</p>
              <p className="text-2xl font-bold text-purple-600">
                KSh {paymentSummary.totalAmount?.toLocaleString() || '0'}
              </p>
              <p className="text-xs text-gray-500">{paymentSummary.completedPayments || 0} payments</p>
            </div>
            <div className="text-lg">💳</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Your Unit</p>
              <p className="text-lg font-bold text-blue-600">
                {allocation.unit_code || allocation.unit_number || 'Your Unit'}
              </p>
              <p className="text-xs text-gray-500">
                {allocation.property_name || 'Property'}
              </p>
            </div>
            <div className="text-lg">🏠</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => setActiveTab('payments')}
              className="bg-blue-600 text-white py-4 px-6 rounded-lg flex flex-col items-center hover:bg-blue-700 transition-colors"
            >
              <span className="text-2xl mb-2">💰</span>
              <span className="text-lg">
                {nextPayment.isPaid ? 'View Payments' : 'Make Payment'}
              </span>
            </button>
            <button 
              onClick={() => setActiveTab('complaints')}
              className="bg-gray-600 text-white py-4 px-6 rounded-lg flex flex-col items-center hover:bg-gray-700 transition-colors"
            >
              <span className="text-2xl mb-2">🛠️</span>
              <span className="text-lg">Submit Complaint</span>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivities.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No recent activity</p>
            ) : (
              recentActivities.map((activity, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="text-lg">{getActivityIcon(activity.type)}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {activity.description}
                    </p>
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-xs text-gray-500">
                        {new Date(activity.date).toLocaleDateString('en-KE')}
                        {activity.amount && ` • ${activity.amount}`}
                      </p>
                      {getStatusBadge(activity.status)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Lease Information */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Lease Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-600">Lease Period</p>
            <p className="text-gray-900">
              {new Date(allocation.lease_start_date).toLocaleDateString('en-KE')} - {' '}
              {new Date(allocation.lease_end_date).toLocaleDateString('en-KE')}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Monthly Rent</p>
            <p className="text-gray-900">KSh {parseInt(allocation.monthly_rent).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Security Deposit</p>
            <p className="text-gray-900">KSh {parseInt(allocation.security_deposit || 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
          <div>
            <p className="text-sm font-medium text-gray-600">Property</p>
            <p className="text-gray-900">{allocation.property_name || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Unit</p>
            <p className="text-gray-900">
              {allocation.unit_code || allocation.unit_number || 'N/A'} 
              {allocation.unit_type && ` (${allocation.unit_type})`}
            </p>
          </div>
        </div>
      </div>

      {/* Payment History Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Payment History</h3>
        <div className="space-y-4">
          {payments.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No payment history found</p>
          ) : (
            payments.slice(0, 3).map((payment, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">
                    {new Date(payment.payment_month || payment.payment_date).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-sm text-gray-500">
                    Paid on: {new Date(payment.payment_date).toLocaleDateString('en-KE')}
                    {payment.mpesa_receipt_number && ` • Receipt: ${payment.mpesa_receipt_number}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">
                    KSh {parseInt(payment.amount).toLocaleString()}
                  </p>
                  {getStatusBadge(payment.status)}
                </div>
              </div>
            ))
          )}
        </div>
        
        {payments.length > 0 && (
          <button 
            onClick={() => setActiveTab('payments')}
            className="w-full mt-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            View Full Payment History
          </button>
        )}
      </div>
    </div>
  )
}

// Profile Management Component (Keep as is - lightweight)
const ProfileManagement = () => {
  const { user } = useAuth()
  const [profile, setProfile] = useState({
    firstName: user?.firstName || user?.first_name || '',
    lastName: user?.lastName || user?.last_name || '',
    email: user?.email || '',
    phoneNumber: user?.phone_number || '',
    nationalId: user?.national_id || '',
    emergencyContact: user?.emergency_contact || ''
  })

  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      // In a real app, you would make an API call here to update the profile
      // await userAPI.updateProfile(profile)
      
      setTimeout(() => {
        setIsEditing(false)
        setMessage('Profile updated successfully!')
        setLoading(false)
      }, 1000)
      
    } catch (error) {
      setMessage('Failed to update profile')
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-600">Manage your personal information and contact details</p>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        >
          {isEditing ? 'Cancel' : 'Edit Profile'}
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-md ${message.includes('success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={profile.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.firstName || 'Not set'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={profile.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.lastName || 'Not set'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">National ID</label>
              {isEditing ? (
                <input
                  type="text"
                  value={profile.nationalId}
                  onChange={(e) => handleChange('nationalId', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.nationalId || 'Not set'}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              {isEditing ? (
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.email || 'Not set'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              {isEditing ? (
                <input
                  type="tel"
                  value={profile.phoneNumber}
                  onChange={(e) => handleChange('phoneNumber', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.phoneNumber || 'Not set'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
              {isEditing ? (
                <input
                  type="tel"
                  value={profile.emergencyContact}
                  onChange={(e) => handleChange('emergencyContact', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.emergencyContact || 'Not set'}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => setIsEditing(false)}
            className="bg-gray-300 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}

export default TenantDashboard