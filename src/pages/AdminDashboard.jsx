// src/pages/AdminDashboard.jsx
import React, { useState, useEffect, Suspense, lazy } from 'react';
import api from '../services/api';
import { expenseAPI } from '../services/api';
import {
  Building2,
  Users,
  Home,
  Wallet,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  UserCheck,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Droplets,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Activity,
  PieChart,
  FileText,
  Send,
  XCircle,
  Loader2,
  Receipt,
  TrendingDown,
  CreditCard
} from 'lucide-react';

// Lazy load admin components
const UserManagement = lazy(() => import('../components/UserManagement'));
const PropertyManagement = lazy(() => import('../components/PropertyManagement'));
const SystemSettings = lazy(() => import('../components/SystemSettings'));
const PaymentManagement = lazy(() => import('../components/PaymentManagement'));
const ComplaintManagement = lazy(() => import('../components/ComplaintManagement'));
const UnitManagement = lazy(() => import('../components/UnitManagement'));
const AgentAllocation = lazy(() => import('../components/AgentAllocation'));
const AgentReports = lazy(() => import('../components/AgentReports'));
const AdminExpenseManagement = lazy(() => import('../components/AdminExpenseManagement'));
const TenantHub = lazy(() => import('../components/TenantHub'));

// Loading spinner component
const TabLoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
);

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [comprehensiveStats, setComprehensiveStats] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [topProperties, setTopProperties] = useState([]);
  const [expenseStats, setExpenseStats] = useState(null);
  const [netProfitData, setNetProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, activitiesRes, topPropsRes] = await Promise.all([
        api.get('/admin/dashboard/comprehensive-stats'),
        api.get('/admin/dashboard/recent-activities'),
        api.get('/admin/dashboard/top-properties')
      ]);

      if (statsRes.data.success) {
        setComprehensiveStats(statsRes.data.data);
      }
      if (activitiesRes.data.success) {
        setRecentActivities(activitiesRes.data.data || []);
      }
      if (topPropsRes.data.success) {
        setTopProperties(topPropsRes.data.data || []);
      }

      // Fetch expense stats separately (optional - won't fail main dashboard)
      try {
        const [expenseStatsRes, netProfitRes] = await Promise.all([
          expenseAPI.getStats(),
          expenseAPI.getNetProfitReport()
        ]);
        
        if (expenseStatsRes.data.success) {
          setExpenseStats(expenseStatsRes.data.data);
        }
        if (netProfitRes.data.success) {
          setNetProfitData(netProfitRes.data.data);
        }
      } catch (expenseErr) {
        console.log('Expense stats not available:', expenseErr.message);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const tabs = [
    { id: 'overview', name: 'Overview', shortName: 'Overview' },
    { id: 'users', name: 'User Management', shortName: 'Users' },
    { id: 'properties', name: 'Properties', shortName: 'Properties' },
    { id: 'units', name: 'Unit Management', shortName: 'Units' },
    { id: 'tenants', name: 'Tenant Hub', shortName: 'Tenants' },
    { id: 'agentAllocation', name: 'Agent Allocation', shortName: 'Agents' },
    { id: 'payments', name: 'Payment Management', shortName: 'Payments' },
    { id: 'complaints', name: 'Complaint Management', shortName: 'Complaints' },
    { id: 'expenses', name: 'Expense Approval', shortName: 'Expenses' },
    { id: 'reports', name: 'Reports', shortName: 'Reports' },
    { id: 'settings', name: 'System Settings', shortName: 'Settings' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return <Suspense fallback={<TabLoadingSpinner />}><UserManagement /></Suspense>;
      case 'properties':
        return <Suspense fallback={<TabLoadingSpinner />}><PropertyManagement /></Suspense>;
      case 'units':
        return <Suspense fallback={<TabLoadingSpinner />}><UnitManagement /></Suspense>;
      case 'tenants':
        return <Suspense fallback={<TabLoadingSpinner />}><TenantHub /></Suspense>;
      case 'agentAllocation':
        return <Suspense fallback={<TabLoadingSpinner />}><AgentAllocation /></Suspense>;
      case 'payments':
        return <Suspense fallback={<TabLoadingSpinner />}><PaymentManagement /></Suspense>;
      case 'complaints':
        return <Suspense fallback={<TabLoadingSpinner />}><ComplaintManagement /></Suspense>;
      case 'reports':
        return <Suspense fallback={<TabLoadingSpinner />}><AgentReports /></Suspense>;
      case 'settings':
        return <Suspense fallback={<TabLoadingSpinner />}><SystemSettings /></Suspense>;
      case 'expenses':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <AdminExpenseManagement />
          </Suspense>
        );
      case 'overview':
      default:
        return (
          <DashboardOverview
            stats={comprehensiveStats}
            recentActivities={recentActivities}
            topProperties={topProperties}
            expenseStats={expenseStats}
            netProfitData={netProfitData}
            loading={loading}
            error={error}
            onRefresh={fetchDashboardData}
            lastUpdated={lastUpdated}
            setActiveTab={setActiveTab}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-1 overflow-x-auto pb-2 scrollbar-thin">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-shrink-0 py-2.5 px-3 border-b-2 font-medium text-sm transition-all duration-200 min-w-[80px] text-center whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="hidden sm:block">{tab.name}</span>
                <span className="sm:hidden">{tab.shortName}</span>
                {/* Badge for pending expenses */}
                {tab.id === 'expenses' && expenseStats?.totals?.pending?.count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px]">
                    {expenseStats.totals.pending.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-3 sm:p-4 md:p-6">{renderContent()}</div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD OVERVIEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const DashboardOverview = ({
  stats,
  recentActivities,
  topProperties,
  expenseStats,
  netProfitData,
  loading,
  error,
  onRefresh,
  lastUpdated,
  setActiveTab
}) => {
  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  // Format number with commas
  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-KE').format(num || 0);
  };

  // Loading state
  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <p className="text-gray-500">Loading dashboard data...</p>
      </div>
    );
  }

  // Error state
  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-gray-700">{error}</p>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const { property, tenant, financial, agent, complaint, sms, payment, unitTypeBreakdown, monthlyTrend } = stats;

  // Calculate net profit
  const totalRevenue = financial?.revenueThisMonth || 0;
  const totalExpenses = expenseStats?.totals?.approved?.amount || netProfitData?.expenses?.total || 0;
  const netProfit = netProfitData?.netProfit ?? (totalRevenue - totalExpenses);
  const profitMargin = netProfitData?.profitMargin ?? (totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0);

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard Overview</h1>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* NET PROFIT BANNER - New prominent section */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className={`rounded-xl p-4 sm:p-6 ${netProfit >= 0 ? 'bg-gradient-to-r from-green-600 to-emerald-600' : 'bg-gradient-to-r from-red-600 to-rose-600'} text-white`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {netProfit >= 0 ? (
                <TrendingUp className="h-6 w-6" />
              ) : (
                <TrendingDown className="h-6 w-6" />
              )}
              <h2 className="text-lg font-semibold">Net Profit This Month</h2>
            </div>
            <p className="text-3xl sm:text-4xl font-bold">{formatCurrency(netProfit)}</p>
            <p className="text-sm mt-1 opacity-90">
              {profitMargin}% profit margin
            </p>
          </div>
          
          <div className="grid grid-cols-3 gap-4 lg:gap-8">
            <div className="text-center">
              <p className="text-sm opacity-80">Revenue</p>
              <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
              <p className="text-xs opacity-70">{payment?.paymentsThisMonth || 0} payments</p>
            </div>
            <div className="text-center">
              <p className="text-sm opacity-80">Expenses</p>
              <p className="text-xl font-bold">{formatCurrency(totalExpenses)}</p>
              <p className="text-xs opacity-70">{expenseStats?.totals?.approved?.count || 0} approved</p>
            </div>
            <div className="text-center">
              <p className="text-sm opacity-80">Pending</p>
              <p className="text-xl font-bold">{expenseStats?.totals?.pending?.count || 0}</p>
              <p className="text-xs opacity-70">expenses</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* KEY METRICS - Primary Stats Row */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Total Revenue (This Month)"
          value={formatCurrency(financial?.revenueThisMonth || 0)}
          subtitle={`Collection Rate: ${financial?.collectionRate || 0}%`}
          icon={DollarSign}
          color="green"
          trend={parseFloat(financial?.collectionRate || 0) >= 80 ? 'up' : 'down'}
        />
        <StatCard
          title="Active Tenants"
          value={formatNumber(tenant?.activeTenants || 0)}
          subtitle={`${tenant?.newThisMonth || 0} new this month`}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Occupancy Rate"
          value={`${property?.occupancyRate || 0}%`}
          subtitle={`${property?.occupiedUnits || 0}/${property?.totalUnits || 0} units`}
          icon={Home}
          color="purple"
          trend={parseFloat(property?.occupancyRate || 0) >= 85 ? 'up' : 'down'}
        />
        <StatCard
          title="Total Arrears"
          value={formatCurrency(tenant?.totalArrears || 0)}
          subtitle={`${tenant?.tenantsWithArrears || 0} tenants`}
          icon={AlertTriangle}
          color={(tenant?.totalArrears || 0) > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* EXPENSE OVERVIEW - New Section */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Expense Stats Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">Expense Overview</h3>
            </div>
            <button
              onClick={() => setActiveTab('expenses')}
              className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
            >
              Manage <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-sm text-purple-600 font-medium">Today's Expenses</p>
              <p className="text-xl font-bold text-purple-900">
                {formatCurrency(expenseStats?.todayTotal || 0)}
              </p>
              <p className="text-xs text-purple-600">{expenseStats?.todayCount || 0} entries</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <p className="text-sm text-yellow-600 font-medium">Pending Approval</p>
              <p className="text-xl font-bold text-yellow-900">
                {expenseStats?.totals?.pending?.count || 0}
              </p>
              <p className="text-xs text-yellow-600">
                {formatCurrency(expenseStats?.totals?.pending?.amount || 0)}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-sm text-green-600 font-medium">Approved (Month)</p>
              <p className="text-xl font-bold text-green-900">
                {formatCurrency(expenseStats?.totals?.approved?.amount || 0)}
              </p>
              <p className="text-xs text-green-600">{expenseStats?.totals?.approved?.count || 0} expenses</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-sm text-red-600 font-medium">Rejected</p>
              <p className="text-xl font-bold text-red-900">
                {expenseStats?.totals?.rejected?.count || 0}
              </p>
              <p className="text-xs text-red-600">This month</p>
            </div>
          </div>

          {/* Quick action for pending */}
          {(expenseStats?.totals?.pending?.count || 0) > 0 && (
            <button
              onClick={() => setActiveTab('expenses')}
              className="w-full py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm font-medium hover:bg-yellow-200 transition-colors flex items-center justify-center gap-2"
            >
              <Clock className="h-4 w-4" />
              Review {expenseStats.totals.pending.count} Pending Expense{expenseStats.totals.pending.count !== 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Top Expense Categories */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="h-5 w-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Top Expense Categories</h3>
          </div>

          {expenseStats?.byCategory && expenseStats.byCategory.length > 0 ? (
            <div className="space-y-3">
              {expenseStats.byCategory.slice(0, 5).map((cat, index) => {
                const percentage = expenseStats.totals?.approved?.amount > 0 
                  ? ((parseFloat(cat.total_amount) / expenseStats.totals.approved.amount) * 100).toFixed(0)
                  : 0;
                return (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{cat.category}</span>
                        <span className="text-gray-600">{formatCurrency(cat.total_amount)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 w-10 text-right">{percentage}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">No expense data available</p>
          )}
        </div>

        {/* Expense Trend (if available) */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-cyan-600" />
            <h3 className="font-semibold text-gray-900">Expense Trend</h3>
          </div>

          {expenseStats?.monthlyTrend && expenseStats.monthlyTrend.length > 0 ? (
            <div className="space-y-3">
              {expenseStats.monthlyTrend.slice(-5).map((month, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{month.month}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-cyan-500 rounded-full"
                        style={{ 
                          width: `${Math.min((parseFloat(month.total_amount) / (expenseStats.monthlyTrend.reduce((max, m) => Math.max(max, parseFloat(m.total_amount)), 0) || 1)) * 100, 100)}%` 
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-20 text-right">
                      {formatCurrency(month.total_amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Expense trends will appear here</p>
            </div>
          )}

          {/* Top Properties by Expense */}
          {expenseStats?.topProperties && expenseStats.topProperties.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-2">Top Properties by Expense</p>
              {expenseStats.topProperties.slice(0, 3).map((prop, index) => (
                <div key={index} className="flex justify-between text-sm py-1">
                  <span className="text-gray-600">{prop.name}</span>
                  <span className="font-medium text-gray-900">{formatCurrency(prop.total_amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FINANCIAL OVERVIEW */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 sm:p-6 text-white">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Financial Overview</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <FinanceMetric
            label="Expected Rent"
            value={formatCurrency(financial?.expectedMonthlyRent || 0)}
          />
          <FinanceMetric
            label="Collected (Month)"
            value={formatCurrency(financial?.revenueThisMonth || 0)}
          />
          <FinanceMetric
            label="YTD Revenue"
            value={formatCurrency(financial?.revenueThisYear || 0)}
          />
          <FinanceMetric
            label="Unpaid Total"
            value={formatCurrency(financial?.pendingPaymentsAmount || 0)}
            subValue={`${financial?.pendingPaymentsCount || 0} tenants due • Rent: ${formatCurrency(financial?.pendingRentAmount || 0)} • Water: ${formatCurrency(financial?.pendingWaterAmount || 0)}`}
          />
          <FinanceMetric
            label="Outstanding Water"
            value={formatCurrency(financial?.outstandingWater || 0)}
          />
          <FinanceMetric
            label="Total Expenses"
            value={formatCurrency(totalExpenses)}
            subValue="Approved"
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PROPERTY & PAYMENT STATS */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Property Statistics */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Property Statistics</h3>
            </div>
            <button
              onClick={() => setActiveTab('properties')}
              className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
            >
              View All <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-sm text-blue-600 font-medium">Total Properties</p>
              <p className="text-2xl font-bold text-blue-900">{property?.totalProperties || 0}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-sm text-green-600 font-medium">Total Units</p>
              <p className="text-2xl font-bold text-green-900">{property?.totalUnits || 0}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-sm text-purple-600 font-medium">Occupied</p>
              <p className="text-2xl font-bold text-purple-900">{property?.occupiedUnits || 0}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3">
              <p className="text-sm text-orange-600 font-medium">Vacant</p>
              <p className="text-2xl font-bold text-orange-900">{property?.vacantUnits || 0}</p>
            </div>
          </div>

          {/* Unit Type Breakdown */}
          {unitTypeBreakdown && unitTypeBreakdown.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-3">Unit Type Breakdown</p>
              <div className="space-y-2">
                {unitTypeBreakdown.map((type, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 capitalize">
                      {type.unitType?.replace(/_/g, ' ') || 'Other'}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-green-600">{type.occupied} occupied</span>
                      <span className="text-orange-600">{type.vacant} vacant</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Payment Statistics */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold text-gray-900">Payment Activity</h3>
            </div>
            <button
              onClick={() => setActiveTab('payments')}
              className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
            >
              View All <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-sm text-green-600 font-medium">Today</p>
              <p className="text-xl font-bold text-green-900">{payment?.paymentsToday || 0}</p>
              <p className="text-xs text-green-700">{formatCurrency(payment?.amountToday || 0)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-sm text-blue-600 font-medium">This Week</p>
              <p className="text-xl font-bold text-blue-900">{payment?.paymentsThisWeek || 0}</p>
              <p className="text-xs text-blue-700">{formatCurrency(payment?.amountThisWeek || 0)}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-sm text-purple-600 font-medium">This Month</p>
              <p className="text-xl font-bold text-purple-900">{payment?.paymentsThisMonth || 0}</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <p className="text-sm text-yellow-600 font-medium">Pending</p>
              <p className="text-xl font-bold text-yellow-900">{payment?.pendingPayments || 0}</p>
            </div>
          </div>

          {(payment?.failedPayments || 0) > 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-sm text-red-700">
                {payment.failedPayments} failed payment(s) need attention
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* OPERATIONS ROW - Agents, Complaints, SMS */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Agent Overview */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-indigo-600" />
              <h3 className="font-semibold text-gray-900">Agents</h3>
            </div>
            <button
              onClick={() => setActiveTab('agentAllocation')}
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              Manage
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Agents</span>
              <span className="font-semibold text-gray-900">{agent?.totalAgents || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Active Agents</span>
              <span className="font-semibold text-green-600">{agent?.activeAgents || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Assigned Properties</span>
              <span className="font-semibold text-gray-900">{agent?.assignedProperties || 0}</span>
            </div>
            {(agent?.unassignedProperties || 0) > 0 && (
              <div className="flex justify-between items-center p-2 bg-yellow-50 rounded-lg">
                <span className="text-sm text-yellow-700">Unassigned Properties</span>
                <span className="font-semibold text-yellow-600">{agent.unassignedProperties}</span>
              </div>
            )}
          </div>
        </div>

        {/* Complaint Overview */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-orange-600" />
              <h3 className="font-semibold text-gray-900">Complaints</h3>
            </div>
            <button
              onClick={() => setActiveTab('complaints')}
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              View All
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Open
              </span>
              <span className="font-semibold text-red-600">{complaint?.openComplaints || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                In Progress
              </span>
              <span className="font-semibold text-yellow-600">{complaint?.inProgressComplaints || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Resolved (Month)
              </span>
              <span className="font-semibold text-green-600">{complaint?.resolvedThisMonth || 0}</span>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total</span>
                <span className="font-semibold text-gray-900">{complaint?.totalComplaints || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* SMS Overview */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Send className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">SMS Status</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Sent Today</span>
              <span className="font-semibold text-green-600">{sms?.sentToday || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Sent</span>
              <span className="font-semibold text-gray-900">{sms?.totalSent || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Pending</span>
              <span className="font-semibold text-yellow-600">{sms?.pendingCount || 0}</span>
            </div>
            {(sms?.failedCount || 0) > 0 && (
              <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
                <span className="text-sm text-red-700">Failed (Retry needed)</span>
                <span className="font-semibold text-red-600">{sms.failedCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* QUICK ACTIONS */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <QuickActionButton
            label="Add Tenant"
            icon={Users}
            onClick={() => setActiveTab('tenants')}
            color="blue"
          />
          <QuickActionButton
            label="View Payments"
            icon={DollarSign}
            onClick={() => setActiveTab('payments')}
            color="green"
          />
          <QuickActionButton
            label="Handle Complaints"
            icon={MessageSquare}
            onClick={() => setActiveTab('complaints')}
            color="orange"
            badge={(complaint?.openComplaints || 0) > 0 ? complaint.openComplaints : null}
          />
          <QuickActionButton
            label="Review Expenses"
            icon={Receipt}
            onClick={() => setActiveTab('expenses')}
            color="purple"
            badge={(expenseStats?.totals?.pending?.count || 0) > 0 ? expenseStats.totals.pending.count : null}
          />
          <QuickActionButton
            label="Generate Reports"
            icon={FileText}
            onClick={() => setActiveTab('reports')}
            color="cyan"
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MONTHLY TREND */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {monthlyTrend && monthlyTrend.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold text-gray-900">Revenue Trend (Last 6 Months)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {monthlyTrend.map((month, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-600">{month.month}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {formatCurrency(month.revenue)}
                </p>
                <p className="text-xs text-gray-500">{month.paymentCount} payments</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BOTTOM SECTION - Recent Activities & Top Properties */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Activities */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Recent Activities</h3>
          </div>
          {recentActivities.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No recent activities</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {recentActivities.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                    activity.type === 'payment' ? 'bg-green-500' :
                    activity.type === 'complaint' ? 'bg-orange-500' :
                    activity.type === 'allocation' ? 'bg-purple-500' :
                    activity.type === 'expense' ? 'bg-pink-500' :
                    'bg-blue-500'
                  }`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{activity.description}</p>
                    <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Properties */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold text-gray-900">Top Performing Properties</h3>
            </div>
            <button
              onClick={() => setActiveTab('properties')}
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              View All
            </button>
          </div>
          {topProperties.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No property data available</p>
          ) : (
            <div className="space-y-3">
              {topProperties.map((property, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                >
                  <div>
                    <p className="font-medium text-gray-900">{property.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">Occupancy: {property.occupancy}</span>
                      <span className="text-xs text-gray-500">Agent: {property.agent}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{property.revenue}</p>
                    <p className="text-xs text-gray-500">{property.units} units</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const StatCard = ({ title, value, subtitle, icon: Icon, color, trend }) => {
  const colorClasses = {
    green: 'bg-green-50 text-green-600 border-green-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    gray: 'bg-gray-50 text-gray-600 border-gray-100',
  };

  const iconColorClasses = {
    green: 'text-green-500 bg-green-100',
    blue: 'text-blue-500 bg-blue-100',
    purple: 'text-purple-500 bg-purple-100',
    red: 'text-red-500 bg-red-100',
    orange: 'text-orange-500 bg-orange-100',
    gray: 'text-gray-500 bg-gray-100',
  };

  return (
    <div className={`rounded-xl p-4 border ${colorClasses[color] || colorClasses.gray}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${iconColorClasses[color] || iconColorClasses.gray}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
            {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          </div>
        )}
      </div>
      <p className="text-xl sm:text-2xl font-bold mt-3 text-gray-900">{value}</p>
      <p className="text-xs text-gray-600 mt-1">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
};

const FinanceMetric = ({ label, value, subValue }) => (
  <div className="text-center">
    <p className="text-blue-200 text-xs uppercase tracking-wide">{label}</p>
    <p className="text-lg sm:text-xl font-bold mt-1">{value}</p>
    {subValue && <p className="text-blue-200 text-xs mt-0.5">{subValue}</p>}
  </div>
);

const QuickActionButton = ({ label, icon: Icon, onClick, color, badge }) => {
  const colorClasses = {
    blue: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200',
    orange: 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200',
    purple: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200',
    cyan: 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border-cyan-200',
  };

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition ${colorClasses[color] || colorClasses.blue}`}
    >
      <Icon className="h-6 w-6" />
      <span className="text-sm font-medium">{label}</span>
      {badge && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px]">
          {badge}
        </span>
      )}
    </button>
  );
};

export default AdminDashboard;
