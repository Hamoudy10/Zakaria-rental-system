import React, { useState, Suspense, lazy, useEffect } from 'react'
import agentService from '../services/AgentService';
import { useAuth } from '../context/AuthContext';
import AgentWaterBills from '../components/AgentWaterBills';

// Lazy load agent components
const ComplaintManagement = lazy(() => import('../components/ComplaintManagement'));
const PaymentManagement = lazy(() => import('../components/PaymentManagement'));
const NotificationManagement = lazy(() => import('../components/NotificationManagement'));
const ProfilePage = lazy(() => import('../components/ProfilePage'));
const TenantManagement = lazy(() => import('../components/TenantManagement'));
const AgentSMSManagement = lazy(() => import('../components/AgentSMSManagement'));
const AgentReports = lazy(() => import('../components/AgentReports'));
const AgentPropertyShowcase = lazy(() => import('../components/AgentPropertyShowcase'));

// Loading component for Suspense fallback
const TabLoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
  </div>
);

const AgentDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')
  const { user } = useAuth(); // main user context

  if (!user) return null; // avoid rendering if auth not ready

  // Simplified tabs focusing on core agent functions
  const tabs = [
    { id: 'overview', name: 'Overview', shortName: 'Overview' },
    { id: 'showcase', name: 'Property Showcase', shortName: 'Showcase' },
    { id: 'tenant-management', name: 'Tenant Management', shortName: 'Tenants' },
    { id: 'smsManagement', name: 'SMS Management', shortName: 'SMS Mngmnt' },
    { id: 'complaints', name: 'Complaint Management', shortName: 'Complaints' },
    { id: 'payments', name: 'Payment Tracking', shortName: 'Payments' },
    { id: 'water-bills', name: 'Water Bills', shortName: 'Water Bills' },
    { id: 'notifications', name: 'Send Notifications', shortName: 'Notify' },
    { id: 'reports', name: 'Reports', shortName: 'Reports' }, 
    { id: 'profile', name: 'My Profile', shortName: 'Profile' }
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'showcase':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <AgentPropertyShowcase />
          </Suspense>
        );
      case 'tenant-management':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <TenantManagement />
          </Suspense>
        );
        case 'smsManagement':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <AgentSMSManagement />
          </Suspense>
        );
      case 'complaints':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <ComplaintManagement />
          </Suspense>
        )
      case 'payments':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <PaymentManagement />
          </Suspense>
        )
      case 'water-bills':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <AgentWaterBills />
          </Suspense>
        )
      case 'notifications':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <NotificationManagement />
          </Suspense>
        )
        case 'reports':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <AgentReports />
          </Suspense>
        )
      case 'profile':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <ProfilePage />
          </Suspense>
        )
      case 'overview':
      default:
        return <AgentOverview setActiveTab={setActiveTab} user={user} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 mobile-optimized no-horizontal-scroll">
      <div className="responsive-container py-4">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-1 xs:space-x-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 py-2.5 px-2 xs:px-3 border-b-2 font-medium text-xs xs:text-sm touch-target transition-all duration-200 min-w-[70px] xs:min-w-[80px] text-center ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
                title={tab.name}
              >
                <span className="hidden sm:block">{tab.name}</span>
                <span className="sm:hidden">{tab.shortName}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-3 sm:p-4 md:p-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

// Agent Overview Component (Simplified)
const AgentOverview = ({ setActiveTab, user }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    stats: {},
    recentComplaints: [],
    paymentAlerts: [],
    assignedProperties: []
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [statsResponse, propertiesResponse, complaintsResponse, paymentsResponse] = await Promise.all([
        agentService.getDashboardStats(),
        agentService.getAssignedProperties(),
        agentService.getAssignedComplaints('open'),
        agentService.getTenantsWithPaymentStatus()
      ]);

      const paymentAlertsData = paymentsResponse.data?.data || paymentsResponse.data || [];
      const pendingPayments = Array.isArray(paymentAlertsData) 
        ? paymentAlertsData.filter(tenant => tenant.payment_status === 'pending' || tenant.balance_due > 0)
        : [];

      setDashboardData({
        stats: statsResponse.data?.data || statsResponse.data || {},
        assignedProperties: propertiesResponse.data?.data || propertiesResponse.data || [],
        recentComplaints: complaintsResponse.data?.data || complaintsResponse.data || [],
        paymentAlerts: pendingPayments
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (priority) => {
    const priorityConfig = {
      high: { color: 'bg-red-100 text-red-800', label: 'High' },
      medium: { color: 'bg-orange-100 text-orange-800', label: 'Medium' },
      low: { color: 'bg-green-100 text-green-800', label: 'Low' }
    };
    const config = priorityConfig[priority] || priorityConfig.medium;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      open: { color: 'bg-red-100 text-red-800', label: 'Open' },
      'in-progress': { color: 'bg-yellow-100 text-yellow-800', label: 'In Progress' },
      resolved: { color: 'bg-green-100 text-green-800', label: 'Resolved' }
    };
    const config = statusConfig[status] || statusConfig.open;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Unknown time';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    </div>
  );

  if (error) return (
    <div className="text-center py-8">
      <div className="text-red-600 mb-4">{error}</div>
      <button
        onClick={fetchDashboardData}
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agent Dashboard</h1>
        <p className="text-gray-600 text-sm mt-1">Welcome back, {user?.first_name}! Manage complaints and tenant communications</p>
        {dashboardData.assignedProperties.length > 0 && (
          <p className="text-sm text-blue-600 mt-1">
            You are managing {dashboardData.assignedProperties.length} properties
          </p>
        )}
      </div>

      {/* Stats Grid - Focused on core metrics */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Assigned Properties</p>
              <p className="text-lg sm:text-xl font-bold text-blue-600">
                {dashboardData.assignedProperties.length || 0}
              </p>
              <p className="text-xs text-gray-500">Properties managed</p>
            </div>
            <div className="text-lg sm:text-xl text-blue-600">🏠</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Active Complaints</p>
              <p className="text-lg sm:text-xl font-bold text-orange-600">
                {dashboardData.recentComplaints.length || 0}
              </p>
              <p className="text-xs text-gray-500">Needing attention</p>
            </div>
            <div className="text-lg sm:text-xl text-orange-600">🛠️</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Pending Payments</p>
              <p className="text-lg sm:text-xl font-bold text-red-600">
                {dashboardData.paymentAlerts.length || 0}
              </p>
              <p className="text-xs text-gray-500">Tenants with balance</p>
            </div>
            <div className="text-lg sm:text-xl text-red-600">💰</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Resolved This Week</p>
              <p className="text-lg sm:text-xl font-bold text-green-600">
                {dashboardData.stats.resolvedThisWeek || 0}
              </p>
              <p className="text-xs text-gray-500">Complaints closed</p>
            </div>
            <div className="text-lg sm:text-xl text-green-600">✅</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Quick Actions - Focused on core functions */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button 
              onClick={() => setActiveTab('showcase')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:from-blue-700 hover:to-purple-700 transition-all touch-target active:opacity-90"
            >
              <span className="text-sm sm:text-lg mb-1">🏘️</span>
              <span className="text-xs sm:text-sm text-center">Showcase Properties</span>
            </button>
            <button 
              onClick={() => setActiveTab('complaints')}
              className="bg-blue-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-blue-700 transition-colors touch-target active:bg-blue-800"
            >
              <span className="text-sm sm:text-lg mb-1">🛠️</span>
              <span className="text-xs sm:text-sm text-center">Manage Complaints</span>
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className="bg-green-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-green-700 transition-colors touch-target active:bg-green-800"
            >
              <span className="text-sm sm:text-lg mb-1">💰</span>
              <span className="text-xs sm:text-sm text-center">Track Payments</span>
            </button>
            <button 
              onClick={() => setActiveTab('notifications')}
              className="bg-purple-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-purple-700 transition-colors touch-target active:bg-purple-800"
            >
              <span className="text-sm sm:text-lg mb-1">📢</span>
              <span className="text-xs sm:text-sm text-center">Send Notices</span>
            </button>
            <button
              onClick={() => setActiveTab('water-bills')}
              className="bg-cyan-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-cyan-700 transition-colors touch-target active:bg-cyan-800"
            >
              <span className="text-sm sm:text-lg mb-1">🚰</span>
              <span className="text-xs sm:text-sm text-center">Water Bills</span>
            </button>
            <button 
              onClick={() => setActiveTab('profile')}
              className="bg-gray-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-gray-700 transition-colors touch-target active:bg-gray-800"
            >
              <span className="text-sm sm:text-lg mb-1">👤</span>
              <span className="text-xs sm:text-sm text-center">My Profile</span>
            </button>
          </div>
        </div>

        {/* Recent Complaints */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <div className="flex justify-between items-center mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-semibold">Recent Complaints</h3>
            <button 
              onClick={() => setActiveTab('complaints')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View All
            </button>
          </div>
          <div className="space-y-2 sm:space-y-3">
            {dashboardData.recentComplaints.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No recent complaints
              </div>
            ) : (
              dashboardData.recentComplaints.slice(0, 4).map((complaint, index) => (
                <div key={complaint.id || index} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                      {complaint.title}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      <p className="text-xs text-gray-500 truncate">
                        {complaint.property_name} • {formatTimeAgo(complaint.raised_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-1 ml-2">
                    {getPriorityBadge(complaint.priority)}
                    {getStatusBadge(complaint.status)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Payment Alerts */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex justify-between items-center mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold">Payment Alerts</h3>
          <button 
            onClick={() => setActiveTab('payments')}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View All
          </button>
        </div>
        <div className="space-y-2 sm:space-y-3">
          {dashboardData.paymentAlerts.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              No payment alerts
            </div>
          ) : (
            dashboardData.paymentAlerts.slice(0, 5).map((alert, index) => (
              <div key={alert.tenant_id || index} className="flex items-center justify-between p-2 sm:p-3 bg-red-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-900">
                    {alert.tenant_name || alert.first_name + ' ' + alert.last_name}
                  </p>
                  <p className="text-xs text-gray-600">
                    {alert.property_name} • {alert.unit_number || alert.unit_code}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs sm:text-sm font-semibold text-red-600">
                    {formatCurrency(alert.balance_due || alert.amount_due)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Due {alert.due_date || 'This month'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;