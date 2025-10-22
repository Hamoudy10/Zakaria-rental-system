import React, { useState, Suspense, lazy } from 'react'

// Lazy load all admin components
const UserManagement = lazy(() => import('../components/UserManagement'));
const PropertyManagement = lazy(() => import('../components/PropertyManagement'));
const Reports = lazy(() => import('../components/Reports'));
const SalaryPayment = lazy(() => import('../components/SalaryPayment'));
const SystemSettings = lazy(() => import('../components/SystemSettings'));
const TenantAllocation = lazy(() => import('../components/TenantAllocation'));
const PaymentManagement = lazy(() => import('../components/PaymentManagement'));
const ComplaintManagement = lazy(() => import('../components/ComplaintManagement'));
const UnitManagement = lazy(() => import('../components/UnitManagement'));

// Loading component for Suspense fallback
const TabLoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
);

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { id: 'overview', name: 'Overview' },
    { id: 'users', name: 'User Management' },
    { id: 'properties', name: 'Properties' },
    { id: 'units', name: 'Unit Management' },
    { id: 'allocations', name: 'Tenant Allocation' },
    { id: 'payments', name: 'Payment Management' }, 
    { id: 'salaries', name: 'Salary Payments' },
    { id: 'complaints', name: 'Complaint Management' },
    { id: 'reports', name: 'Reports' },
    { id: 'settings', name: 'System Settings' },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <UserManagement />
          </Suspense>
        )
      case 'properties':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <PropertyManagement />
          </Suspense>
        )
      case 'units':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <UnitManagement />
          </Suspense>
        )
      case 'allocations':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <TenantAllocation />
          </Suspense>
        )
      case 'payments':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <PaymentManagement />
          </Suspense>
        )
      case 'salaries':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <SalaryPayment />
          </Suspense>
        )
      case 'complaints':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <ComplaintManagement />
          </Suspense>
        )
      case 'reports':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <Reports />
          </Suspense>
        )
      case 'settings':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <SystemSettings />
          </Suspense>
        )
      case 'overview':
      default:
        return <DashboardOverview setActiveTab={setActiveTab} />
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

// Dashboard Overview Component (Keep this as it's lightweight)
const DashboardOverview = ({ setActiveTab }) => {
  const [adminStats, setAdminStats] = useState({
    totalRevenue: 'KSh 1,234,567',
    totalUsers: 156,
    totalProperties: 24,
    totalUnits: 142,
    occupancyRate: '85%',
    pendingComplaints: 8,
    pendingPayments: 12,
    activeTenants: 120,
    monthlyGrowth: '+12%'
  })

  const recentActivities = [
    { type: 'registration', user: 'John Doe', time: '5 minutes ago', description: 'New tenant registration' },
    { type: 'payment', user: 'Mary Wanjiku', time: '1 hour ago', description: 'Rent payment received - KSh 45,000' },
    { type: 'complaint', user: 'James Kariuki', time: '2 hours ago', description: 'New complaint submitted - Plumbing issue' },
    { type: 'maintenance', user: 'Agent Smith', time: '3 hours ago', description: 'Maintenance request completed' },
    { type: 'payment', user: 'Sarah Johnson', time: '4 hours ago', description: 'Rent payment received - KSh 38,000' },
  ]

  const topProperties = [
    { name: 'Kilimani Towers', revenue: 'KSh 450,000', occupancy: '95%', complaints: 2, units: 24 },
    { name: 'Westlands Apartments', revenue: 'KSh 380,000', occupancy: '92%', complaints: 1, units: 18 },
    { name: 'Kileleshwa Gardens', revenue: 'KSh 320,000', occupancy: '88%', complaints: 3, units: 16 },
  ]

  const getActivityIcon = (type) => {
    switch (type) {
      case 'registration': return '👤'
      case 'payment': return '💰'
      case 'complaint': return '🛠️'
      case 'maintenance': return '🔧'
      default: return '📝'
    }
  }

  const getActivityColor = (type) => {
    switch (type) {
      case 'registration': return 'text-blue-600'
      case 'payment': return 'text-green-600'
      case 'complaint': return 'text-orange-600'
      case 'maintenance': return 'text-purple-600'
      default: return 'text-gray-600'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">Welcome to Zakaria Rental System - Complete overview of your rental business</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">{adminStats.totalRevenue}</p>
              <p className="text-xs text-gray-500">{adminStats.monthlyGrowth} this month</p>
            </div>
            <div className="text-2xl text-green-600">💰</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Properties</p>
              <p className="text-2xl font-bold text-blue-600">{adminStats.totalProperties}</p>
              <p className="text-xs text-gray-500">Managed properties</p>
            </div>
            <div className="text-2xl text-blue-600">🏠</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Units</p>
              <p className="text-2xl font-bold text-purple-600">{adminStats.totalUnits}</p>
              <p className="text-xs text-gray-500">Available units</p>
            </div>
            <div className="text-2xl text-purple-600">🏢</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Occupancy Rate</p>
              <p className="text-2xl font-bold text-orange-600">{adminStats.occupancyRate}</p>
              <p className="text-xs text-gray-500">{adminStats.activeTenants} active tenants</p>
            </div>
            <div className="text-2xl text-orange-600">📊</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setActiveTab('users')}
              className="bg-blue-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-blue-700 transition-colors"
            >
              <span className="text-lg mb-1">👤</span>
              <span className="text-sm">Manage Users</span>
            </button>
            <button 
              onClick={() => setActiveTab('properties')}
              className="bg-gray-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-gray-700 transition-colors"
            >
              <span className="text-lg mb-1">🏠</span>
              <span className="text-sm">Properties</span>
            </button>
            <button 
              onClick={() => setActiveTab('units')}
              className="bg-purple-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-purple-700 transition-colors"
            >
              <span className="text-lg mb-1">🏢</span>
              <span className="text-sm">Unit Mgmt</span>
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className="bg-green-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-green-700 transition-colors"
            >
              <span className="text-lg mb-1">💰</span>
              <span className="text-sm">Payment Mgmt</span>
            </button>
            <button 
              onClick={() => setActiveTab('complaints')}
              className="bg-orange-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-orange-700 transition-colors"
            >
              <span className="text-lg mb-1">🛠️</span>
              <span className="text-sm">Complaints</span>
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className="bg-indigo-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-indigo-700 transition-colors"
            >
              <span className="text-lg mb-1">📊</span>
              <span className="text-sm">View Reports</span>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivities.map((activity, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className={`text-lg ${getActivityColor(activity.type)}`}>
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {activity.description}
                  </p>
                  <p className="text-xs text-gray-500">
                    By {activity.user} • {activity.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Performing Properties */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Top Performing Properties</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topProperties.map((property, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900">{property.name}</h4>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Monthly Revenue:</span>
                  <span className="font-semibold text-green-600">{property.revenue}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Occupancy Rate:</span>
                  <span className="font-semibold text-blue-600">{property.occupancy}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Units:</span>
                  <span className="font-semibold text-purple-600">{property.units}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Active Complaints:</span>
                  <span className="font-semibold text-orange-600">{property.complaints}</span>
                </div>
              </div>
              <div className="flex space-x-2 mt-3">
                <button 
                  onClick={() => setActiveTab('properties')}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-sm"
                >
                  View Property
                </button>
                <button 
                  onClick={() => setActiveTab('units')}
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 text-sm"
                >
                  Manage Units
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pending Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Pending Actions</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div>
                <p className="font-medium text-orange-900">Pending Complaints</p>
                <p className="text-sm text-orange-700">{adminStats.pendingComplaints} complaints need attention</p>
              </div>
              <button 
                onClick={() => setActiveTab('complaints')}
                className="bg-orange-600 text-white px-3 py-1 rounded text-sm hover:bg-orange-700"
              >
                Resolve
              </button>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div>
                <p className="font-medium text-yellow-900">Pending Payments</p>
                <p className="text-sm text-yellow-700">{adminStats.pendingPayments} payments awaiting confirmation</p>
              </div>
              <button 
                onClick={() => setActiveTab('payments')}
                className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
              >
                Review
              </button>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div>
                <p className="font-medium text-blue-900">Salary Payments</p>
                <p className="text-sm text-blue-700">Process agent salaries for this month</p>
              </div>
              <button 
                onClick={() => setActiveTab('salaries')}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
              >
                Process
              </button>
            </div>

            <div className="flex justify-between items-center p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div>
                <p className="font-medium text-purple-900">Unit Management</p>
                <p className="text-sm text-purple-700">Manage property units and availability</p>
              </div>
              <button 
                onClick={() => setActiveTab('units')}
                className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700"
              >
                Manage
              </button>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">System Health</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Server Status</span>
                <span className="font-medium text-green-600">Online</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Database</span>
                <span className="font-medium text-green-600">Healthy</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full" style={{ width: '95%' }}></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Storage</span>
                <span className="font-medium text-yellow-600">65% Used</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Active Users</span>
                <span className="font-medium text-blue-600">24 Online</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '80%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Financial Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 border border-gray-200 rounded-lg">
            <p className="text-2xl font-bold text-green-600">KSh 1.23M</p>
            <p className="text-sm text-gray-600">This Month</p>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">KSh 4.85M</p>
            <p className="text-sm text-gray-600">This Quarter</p>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">KSh 14.2M</p>
            <p className="text-sm text-gray-600">This Year</p>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded-lg">
            <p className="text-2xl font-bold text-orange-600">+12.5%</p>
            <p className="text-sm text-gray-600">Growth Rate</p>
          </div>
        </div>
        
        <div className="mt-4 flex justify-center space-x-4">
          <button 
            onClick={() => setActiveTab('reports')}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
          >
            View Detailed Reports
          </button>
          <button 
            onClick={() => setActiveTab('units')}
            className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700"
          >
            Manage All Units
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard