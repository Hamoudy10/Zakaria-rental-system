import React, { useState, Suspense, lazy, useEffect } from 'react'
import agentService from '../services/AgentService';
import { useAuth } from '../context/AuthContext';
import AgentWaterBills from '../components/AgentWaterBills';
import { 
  RefreshCw, 
  TrendingUp, 
  Wallet, 
  Clock, 
  ArrowRight, 
  Receipt 
} from 'lucide-react';

// Lazy load agent components
const ComplaintManagement = lazy(() => import('../components/ComplaintManagement'));
const PaymentManagement = lazy(() => import('../components/PaymentManagement'));
const NotificationManagement = lazy(() => import('../components/NotificationManagement'));
const ProfilePage = lazy(() => import('../components/ProfilePage'));
const TenantManagement = lazy(() => import('../components/TenantManagement'));
const AgentSMSManagement = lazy(() => import('../components/AgentSMSManagement'));
const AgentReports = lazy(() => import('../components/AgentReports'));
const AgentPropertyShowcase = lazy(() => import('../components/AgentPropertyShowcase'));
const AgentExpenseManagement = lazy(() => import('../components/AgentExpenseManagement'));

// Loading component for Suspense fallback
const TabLoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
  </div>
);

const AgentDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')
  const { user } = useAuth(); // main user context

  // Force re-render to show badge when window.expensePendingCount changes
  const [, setTick] = useState(0);

  useEffect(() => {
    // Simple interval to check for global state updates
    const interval = setInterval(() => {
      if (window.expensePendingCount !== undefined) setTick(t => t + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

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
    { id: 'expenses', name: 'Expense Tracking', shortName: 'Expenses' },
    { id: 'notifications', name: 'Send Notifications', shortName: 'Notify' },
    { id: 'reports', name: 'Reports', shortName: 'Reports' }, 
    { id: 'profile', name: 'My Profile', shortName: 'Profile' }
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'showcase':
        return <Suspense fallback={<TabLoadingSpinner />}><AgentPropertyShowcase /></Suspense>;
      case 'tenant-management':
        return <Suspense fallback={<TabLoadingSpinner />}><TenantManagement /></Suspense>;
      case 'smsManagement':
        return <Suspense fallback={<TabLoadingSpinner />}><AgentSMSManagement /></Suspense>;
      case 'complaints':
        return <Suspense fallback={<TabLoadingSpinner />}><ComplaintManagement /></Suspense>;
      case 'payments':
        return <Suspense fallback={<TabLoadingSpinner />}><PaymentManagement /></Suspense>;
      case 'water-bills':
        return <Suspense fallback={<TabLoadingSpinner />}><AgentWaterBills /></Suspense>;
      case 'expenses':
        return <Suspense fallback={<TabLoadingSpinner />}><AgentExpenseManagement /></Suspense>;
      case 'notifications':
        return <Suspense fallback={<TabLoadingSpinner />}><NotificationManagement /></Suspense>;
      case 'reports':
        return <Suspense fallback={<TabLoadingSpinner />}><AgentReports /></Suspense>;
      case 'profile':
        return <Suspense fallback={<TabLoadingSpinner />}><ProfilePage /></Suspense>;
      case 'overview':
      default:
        return <AgentOverview setActiveTab={setActiveTab} user={user} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 mobile-optimized no-horizontal-scroll">
      <div className="responsive-container py-4">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-4 sticky top-0 bg-gray-50 z-10">
          <nav className="-mb-px flex space-x-1 xs:space-x-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-shrink-0 py-2.5 px-2 xs:px-3 border-b-2 font-medium text-xs xs:text-sm touch-target transition-all duration-200 min-w-[70px] xs:min-w-[80px] text-center ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
                title={tab.name}
              >
                <span className="hidden sm:block">{tab.name}</span>
                <span className="sm:hidden">{tab.shortName}</span>
                
                {/* Badge for Pending Expenses */}
                {tab.id === 'expenses' && window.expensePendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] animate-pulse">
                    {window.expensePendingCount}
                  </span>
                )}
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

// Agent Overview Component
const AgentOverview = ({ setActiveTab, user }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    stats: {},
    recentComplaints: [],
    paymentAlerts: [],
    assignedProperties: [],
    expenseStats: null,
    recentExpenses: [] // Added for the list
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      
      const [statsResponse, propertiesResponse, complaintsResponse, paymentsResponse] = await Promise.all([
        agentService.getDashboardStats(),
        agentService.getAssignedProperties(),
        agentService.getAssignedComplaints('open'),
        agentService.getTenantsWithPaymentStatus()
      ]);

      // Fetch expense stats and recent expenses
      let expenseStats = null;
      let recentExpenses = [];
      try {
        const { expenseAPI } = await import('../services/api');
        
        const [statsRes, listRes] = await Promise.all([
          expenseAPI.getStats(),
          expenseAPI.getExpenses({ limit: 3, page: 1 }) // Fetch top 3 latest
        ]);

        if (statsRes.data.success) {
          expenseStats = statsRes.data.data;
          // Set global variable for tab badge
          window.expensePendingCount = expenseStats.totals?.pending?.count || 0;
        }
        
        if (listRes.data.success) {
          recentExpenses = listRes.data.data;
        }
      } catch (expenseErr) {
        console.log('Expense stats not available yet');
      }

      const paymentAlertsData = paymentsResponse.data?.data || paymentsResponse.data || [];
      const pendingPayments = Array.isArray(paymentAlertsData) 
        ? paymentAlertsData.filter((tenant) => {
            const totalDue = Number(tenant.total_due);
            const balanceDue = Number(tenant.balance_due);
            return tenant.payment_status === 'pending' || totalDue > 0 || balanceDue > 0;
          })
        : [];

      setDashboardData({
        stats: statsResponse.data?.data || statsResponse.data || {},
        assignedProperties: propertiesResponse.data?.data || propertiesResponse.data || [],
        recentComplaints: complaintsResponse.data?.data || complaintsResponse.data || [],
        paymentAlerts: pendingPayments,
        expenseStats,
        recentExpenses
      });
      
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchDashboardData(true);
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
      resolved: { color: 'bg-green-100 text-green-800', label: 'Resolved' },
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      approved: { color: 'bg-green-100 text-green-800', label: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' }
    };
    const config = statusConfig[status] || statusConfig.open;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Unknown';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const getAlertDueAmount = (alert) => {
    const parsedTotalDue = Number(alert?.total_due);
    if (Number.isFinite(parsedTotalDue) && parsedTotalDue > 0) return parsedTotalDue;

    const parsedBalance = Number(alert?.balance_due);
    if (Number.isFinite(parsedBalance) && parsedBalance > 0) return parsedBalance;

    const parsedAmountDue = Number(alert?.amount_due);
    if (Number.isFinite(parsedAmountDue) && parsedAmountDue > 0) return parsedAmountDue;

    const parsedRentPaid = Number(alert?.rent_paid);
    const parsedMonthlyRent = Number(alert?.monthly_rent);
    if (Number.isFinite(parsedMonthlyRent) && Number.isFinite(parsedRentPaid)) {
      return Math.max(0, parsedMonthlyRent - parsedRentPaid);
    }

    return Number.isFinite(parsedMonthlyRent) ? parsedMonthlyRent : 0;
  };

  const getAlertBreakdown = (alert) => {
    const rentDue = Math.max(0, Number(alert?.rent_due) || 0);
    const waterDue = Math.max(0, Number(alert?.water_due) || 0);
    if (rentDue <= 0 && waterDue <= 0) return null;

    return `Rent: ${formatCurrency(rentDue)} • Water: ${formatCurrency(waterDue)}`;
  };

  const formatExactDueDate = (alert) => {
    const parsedDirect = alert?.due_date ? new Date(alert.due_date) : null;
    if (parsedDirect && !Number.isNaN(parsedDirect.getTime())) {
      return parsedDirect.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }

    const dueDay = Math.min(28, Math.max(1, Number(alert?.rent_due_day) || 1));
    const fallback = new Date(new Date().getFullYear(), new Date().getMonth(), dueDay);
    return fallback.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (loading && !dashboardData.stats) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) return (
    <div className="text-center py-8">
      <div className="text-red-600 mb-4">{error}</div>
      <button
        onClick={() => fetchDashboardData()}
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header with Refresh Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agent Dashboard</h1>
          <p className="text-gray-600 text-sm mt-1">
            Welcome back, {user?.first_name}! Manage complaints and daily operations
            {lastUpdated && (
              <span className="ml-2 text-gray-400">
                • Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 self-start sm:self-auto shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 xs:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Assigned Properties</p>
              <p className="text-lg sm:text-xl font-bold text-blue-600">
                {dashboardData.assignedProperties.length || 0}
              </p>
              <p className="text-xs text-gray-500">Managed</p>
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
              <p className="text-xs text-gray-500">Attention needed</p>
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
              <p className="text-xs text-gray-500">Unpaid balance</p>
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
              <p className="text-xs text-gray-500">Closed</p>
            </div>
            <div className="text-lg sm:text-xl text-green-600">✅</div>
          </div>
        </div>

        {/* Total Expenses Today - Highlight Card */}
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-purple-700">Expenses Today</p>
              <p className="text-lg sm:text-xl font-bold text-purple-900">
                {formatCurrency(dashboardData.expenseStats?.todayTotal || 0)}
              </p>
              <p className="text-xs text-purple-600">
                {dashboardData.expenseStats?.todayCount || 0} entries
              </p>
            </div>
            <div className="text-lg sm:text-xl text-purple-600">📝</div>
          </div>
        </div>
      </div>

      {/* Accumulated portfolio performance (all-time) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Revenue (All Time)</p>
              <p className="text-lg sm:text-xl font-bold text-green-700">
                {formatCurrency(dashboardData.stats.revenueAllTime || 0)}
              </p>
              <p className="text-xs text-gray-500">
                {dashboardData.stats.paymentCountAllTime || 0} payments
              </p>
            </div>
            <div className="text-lg sm:text-xl text-green-600">💳</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Expenses (All Time)</p>
              <p className="text-lg sm:text-xl font-bold text-orange-700">
                {formatCurrency(dashboardData.stats.expensesAllTime || 0)}
              </p>
              <p className="text-xs text-gray-500">
                {dashboardData.stats.expenseCountAllTime || 0} approved
              </p>
            </div>
            <div className="text-lg sm:text-xl text-orange-600">🧾</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Profit/Loss (All Time)</p>
              <p
                className={`text-lg sm:text-xl font-bold ${
                  Number(dashboardData.stats.netProfitAllTime || 0) >= 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {formatCurrency(dashboardData.stats.netProfitAllTime || 0)}
              </p>
              <p className="text-xs text-gray-500">Portfolio accumulated</p>
            </div>
            <div
              className={`text-lg sm:text-xl ${
                Number(dashboardData.stats.netProfitAllTime || 0) >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {Number(dashboardData.stats.netProfitAllTime || 0) >= 0 ? "📈" : "📉"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <button 
              onClick={() => setActiveTab('showcase')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:from-blue-700 hover:to-purple-700 transition-all touch-target active:opacity-90"
            >
              <span className="text-sm sm:text-lg mb-1">🏘️</span>
              <span className="text-xs sm:text-sm text-center">Showcase</span>
            </button>
            <button 
              onClick={() => setActiveTab('complaints')}
              className="bg-blue-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-blue-700 transition-colors touch-target active:bg-blue-800"
            >
              <span className="text-sm sm:text-lg mb-1">🛠️</span>
              <span className="text-xs sm:text-sm text-center">Complaints</span>
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className="bg-green-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-green-700 transition-colors touch-target active:bg-green-800"
            >
              <span className="text-sm sm:text-lg mb-1">💰</span>
              <span className="text-xs sm:text-sm text-center">Payments</span>
            </button>
            <button 
              onClick={() => setActiveTab('expenses')}
              className="bg-purple-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-purple-700 transition-colors touch-target active:bg-purple-800 relative"
            >
              <span className="text-sm sm:text-lg mb-1">📝</span>
              <span className="text-xs sm:text-sm text-center">Expenses</span>
              {dashboardData.expenseStats?.totals?.pending?.count > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px]">
                  {dashboardData.expenseStats.totals.pending.count}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('water-bills')}
              className="bg-cyan-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-cyan-700 transition-colors touch-target active:bg-cyan-800"
            >
              <span className="text-sm sm:text-lg mb-1">🚰</span>
              <span className="text-xs sm:text-sm text-center">Water Bills</span>
            </button>
            <button 
              onClick={() => setActiveTab('notifications')}
              className="bg-orange-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-orange-700 transition-colors touch-target active:bg-orange-800"
            >
              <span className="text-sm sm:text-lg mb-1">📢</span>
              <span className="text-xs sm:text-sm text-center">Notify</span>
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

      {/* Payment Alerts and Expense Summary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
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
                    {getAlertBreakdown(alert) && (
                      <p className="text-xs text-gray-500">
                        {getAlertBreakdown(alert)}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs sm:text-sm font-semibold text-red-600">
                      {formatCurrency(getAlertDueAmount(alert))}
                    </p>
                    <p className="text-xs text-gray-500">
                      Due {formatExactDueDate(alert)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Expense Summary - REDESIGNED */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm flex flex-col h-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Expense Summary</h3>
            <button 
              onClick={() => setActiveTab('expenses')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
            >
              View All <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          
          <div className="flex-1 flex flex-col gap-4">
            {/* Today's Total - Prominent */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-4 text-white shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1 opacity-90">
                  <Wallet className="h-4 w-4" />
                  <span className="text-sm font-medium">Spent Today</span>
                </div>
                <div className="flex items-end gap-2">
                  <h2 className="text-3xl font-bold">
                    {formatCurrency(dashboardData.expenseStats?.todayTotal || 0)}
                  </h2>
                </div>
                <p className="text-xs mt-1 opacity-80">
                  {dashboardData.expenseStats?.todayCount || 0} transaction{dashboardData.expenseStats?.todayCount !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
                <TrendingUp className="h-24 w-24" />
              </div>
            </div>

            {/* Recent Activity List */}
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Recent Activity
              </h4>
              
              {dashboardData.recentExpenses && dashboardData.recentExpenses.length > 0 ? (
                <div className="space-y-3">
                  {dashboardData.recentExpenses.map((expense) => (
                    <div key={expense.id} className="flex justify-between items-center group">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          expense.status === 'approved' ? 'bg-green-100 text-green-600' :
                          expense.status === 'rejected' ? 'bg-red-100 text-red-600' :
                          'bg-yellow-100 text-yellow-600'
                        }`}>
                          <Receipt className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 line-clamp-1">{expense.category}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {formatTimeAgo(expense.expense_date)}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(expense.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  <p className="text-sm text-gray-500">No recent expenses</p>
                </div>
              )}
            </div>

            {/* Quick Add Button */}
            <button
              onClick={() => setActiveTab('expenses')}
              className="w-full py-2.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-100 transition-colors flex items-center justify-center gap-2 mt-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Record New Expense
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;
