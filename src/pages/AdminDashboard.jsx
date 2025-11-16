// src/pages/AdminDashboard.jsx
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
const AgentAllocation = lazy(() => import('../components/AgentAllocation'));

// Loading component for Suspense fallback
const TabLoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
  </div>
);

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { id: 'overview', name: 'Overview', shortName: 'Overview' },
    { id: 'users', name: 'User Management', shortName: 'Users' },
    { id: 'properties', name: 'Properties', shortName: 'Properties' },
    { id: 'units', name: 'Unit Management', shortName: 'Units' },
    { id: 'allocations', name: 'Tenant Allocation', shortName: 'Allocations' },
    { id: 'agentAllocation', name: 'Agent Allocation', shortName: 'Agents' },
    { id: 'payments', name: 'Payment Management', shortName: 'Payments' }, 
    { id: 'salaries', name: 'Salary Payments', shortName: 'Salaries' },
    { id: 'complaints', name: 'Complaint Management', shortName: 'Complaints' },
    { id: 'reports', name: 'Reports', shortName: 'Reports' },
    { id: 'settings', name: 'System Settings', shortName: 'Settings' },
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
      case 'agentAllocation':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <AgentAllocation />
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
    <div className="min-h-screen bg-gray-50 mobile-optimized no-horizontal-scroll">
      <div className="responsive-container py-4">
        {/* Tab Navigation - Improved for Mobile */}
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
                {/* Show short name on mobile, full name on larger screens */}
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
    monthlyGrowth: '+12%',
    assignedAgents: 15,
    unassignedProperties: 3
  })

  const recentActivities = [
    { type: 'registration', user: 'John Doe', time: '5 minutes ago', description: 'New tenant registration' },
    { type: 'payment', user: 'Mary Wanjiku', time: '1 hour ago', description: 'Rent payment received - KSh 45,000' },
    { type: 'complaint', user: 'James Kariuki', time: '2 hours ago', description: 'New complaint submitted - Plumbing issue' },
    { type: 'maintenance', user: 'Agent Smith', time: '3 hours ago', description: 'Maintenance request completed' },
    { type: 'payment', user: 'Sarah Johnson', time: '4 hours ago', description: 'Rent payment received - KSh 38,000' },
  ]

  const topProperties = [
    { name: 'Kilimani Towers', revenue: 'KSh 450,000', occupancy: '95%', complaints: 2, units: 24, agent: 'John Smith' },
    { name: 'Westlands Apartments', revenue: 'KSh 380,000', occupancy: '92%', complaints: 1, units: 18, agent: 'Mary Johnson' },
    { name: 'Kileleshwa Gardens', revenue: 'KSh 320,000', occupancy: '88%', complaints: 3, units: 16, agent: 'David Kimani' },
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
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 text-sm mt-1">Welcome to Zakaria Rental System - Complete overview of your rental business</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-lg sm:text-xl font-bold text-green-600">{adminStats.totalRevenue}</p>
              <p className="text-xs text-gray-500">{adminStats.monthlyGrowth} this month</p>
            </div>
            <div className="text-lg sm:text-xl text-green-600">💰</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Total Properties</p>
              <p className="text-lg sm:text-xl font-bold text-blue-600">{adminStats.totalProperties}</p>
              <p className="text-xs text-gray-500">Managed properties</p>
            </div>
            <div className="text-lg sm:text-xl text-blue-600">🏠</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Assigned Agents</p>
              <p className="text-lg sm:text-xl font-bold text-purple-600">{adminStats.assignedAgents}</p>
              <p className="text-xs text-gray-500">Active agents</p>
            </div>
            <div className="text-lg sm:text-xl text-purple-600">👥</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Occupancy Rate</p>
              <p className="text-lg sm:text-xl font-bold text-orange-600">{adminStats.occupancyRate}</p>
              <p className="text-xs text-gray-500">{adminStats.activeTenants} active tenants</p>
            </div>
            <div className="text-lg sm:text-xl text-orange-600">📊</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <button 
              onClick={() => setActiveTab('users')}
              className="bg-blue-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-blue-700 transition-colors touch-target"
            >
              <span className="text-sm sm:text-lg mb-1">👤</span>
              <span className="text-xs sm:text-sm">Manage Users</span>
            </button>
            <button 
              onClick={() => setActiveTab('properties')}
              className="bg-gray-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-gray-700 transition-colors touch-target"
            >
              <span className="text-sm sm:text-lg mb-1">🏠</span>
              <span className="text-xs sm:text-sm">Properties</span>
            </button>
            <button 
              onClick={() => setActiveTab('agentAllocation')}
              className="bg-indigo-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-indigo-700 transition-colors touch-target"
            >
              <span className="text-sm sm:text-lg mb-1">👥</span>
              <span className="text-xs sm:text-sm">Assign Agents</span>
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className="bg-green-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-green-700 transition-colors touch-target"
            >
              <span className="text-sm sm:text-lg mb-1">💰</span>
              <span className="text-xs sm:text-sm">Payment Mgmt</span>
            </button>
            <button 
              onClick={() => setActiveTab('complaints')}
              className="bg-orange-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-orange-700 transition-colors touch-target"
            >
              <span className="text-sm sm:text-lg mb-1">🛠️</span>
              <span className="text-xs sm:text-sm">Complaints</span>
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className="bg-purple-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-purple-700 transition-colors touch-target"
            >
              <span className="text-sm sm:text-lg mb-1">📊</span>
              <span className="text-xs sm:text-sm">View Reports</span>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Recent Activity</h3>
          <div className="space-y-2 sm:space-y-3">
            {recentActivities.map((activity, index) => (
              <div key={index} className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg">
                <div className={`text-base ${getActivityColor(activity.type)}`}>
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                    {activity.description}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    By {activity.user} • {activity.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Performing Properties */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex justify-between items-center mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold">Top Performing Properties</h3>
          <button 
            onClick={() => setActiveTab('agentAllocation')}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            Manage Agents
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {topProperties.map((property, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-3 sm:p-4">
              <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{property.name}</h4>
              <p className="text-xs text-gray-600">Assigned to: {property.agent}</p>
              <div className="mt-2 space-y-1 sm:space-y-2">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span>Monthly Revenue:</span>
                  <span className="font-semibold text-green-600">{property.revenue}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span>Occupancy Rate:</span>
                  <span className="font-semibold text-blue-600">{property.occupancy}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span>Total Units:</span>
                  <span className="font-semibold text-purple-600">{property.units}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span>Active Complaints:</span>
                  <span className="font-semibold text-orange-600">{property.complaints}</span>
                </div>
              </div>
              <div className="flex space-x-2 mt-3">
                <button 
                  onClick={() => setActiveTab('properties')}
                  className="flex-1 bg-blue-600 text-white py-2 px-2 sm:px-3 rounded-md hover:bg-blue-700 text-xs touch-target"
                >
                  View Property
                </button>
                <button 
                  onClick={() => setActiveTab('agentAllocation')}
                  className="flex-1 bg-indigo-600 text-white py-2 px-2 sm:px-3 rounded-md hover:bg-indigo-700 text-xs touch-target"
                >
                  Reassign Agent
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Pending Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Pending Actions</h3>
          <div className="space-y-2 sm:space-y-3">
            <div className="flex justify-between items-center p-2 sm:p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-orange-900 text-sm">Pending Complaints</p>
                <p className="text-xs text-orange-700 truncate">{adminStats.pendingComplaints} complaints need attention</p>
              </div>
              <button 
                onClick={() => setActiveTab('complaints')}
                className="bg-orange-600 text-white px-2 sm:px-3 py-1 rounded text-xs hover:bg-orange-700 touch-target ml-2 flex-shrink-0"
              >
                Resolve
              </button>
            </div>
            
            <div className="flex justify-between items-center p-2 sm:p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-yellow-900 text-sm">Pending Payments</p>
                <p className="text-xs text-yellow-700 truncate">{adminStats.pendingPayments} payments awaiting confirmation</p>
              </div>
              <button 
                onClick={() => setActiveTab('payments')}
                className="bg-yellow-600 text-white px-2 sm:px-3 py-1 rounded text-xs hover:bg-yellow-700 touch-target ml-2 flex-shrink-0"
              >
                Review
              </button>
            </div>
            
            <div className="flex justify-between items-center p-2 sm:p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-indigo-900 text-sm">Agent Allocation</p>
                <p className="text-xs text-indigo-700 truncate">{adminStats.unassignedProperties} properties need agent assignment</p>
              </div>
              <button 
                onClick={() => setActiveTab('agentAllocation')}
                className="bg-indigo-600 text-white px-2 sm:px-3 py-1 rounded text-xs hover:bg-indigo-700 touch-target ml-2 flex-shrink-0"
              >
                Assign
              </button>
            </div>

            <div className="flex justify-between items-center p-2 sm:p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-blue-900 text-sm">Salary Payments</p>
                <p className="text-xs text-blue-700 truncate">Process agent salaries for this month</p>
              </div>
              <button 
                onClick={() => setActiveTab('salaries')}
                className="bg-blue-600 text-white px-2 sm:px-3 py-1 rounded text-xs hover:bg-blue-700 touch-target ml-2 flex-shrink-0"
              >
                Process
              </button>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">System Health</h3>
          <div className="space-y-3 sm:space-y-4">
            <div>
              <div className="flex justify-between text-xs sm:text-sm mb-1">
                <span className="text-gray-600">Server Status</span>
                <span className="font-medium text-green-600">Online</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                <div className="bg-green-600 h-1.5 sm:h-2 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-xs sm:text-sm mb-1">
                <span className="text-gray-600">Database</span>
                <span className="font-medium text-green-600">Healthy</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                <div className="bg-green-600 h-1.5 sm:h-2 rounded-full" style={{ width: '95%' }}></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-xs sm:text-sm mb-1">
                <span className="text-gray-600">Agent Allocation</span>
                <span className="font-medium text-blue-600">{adminStats.assignedAgents} Active</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                <div className="bg-blue-600 h-1.5 sm:h-2 rounded-full" style={{ width: '90%' }}></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-xs sm:text-sm mb-1">
                <span className="text-gray-600">Active Users</span>
                <span className="font-medium text-purple-600">24 Online</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                <div className="bg-purple-600 h-1.5 sm:h-2 rounded-full" style={{ width: '80%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Financial Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          <div className="text-center p-3 sm:p-4 border border-gray-200 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-green-600">KSh 1.23M</p>
            <p className="text-xs text-gray-600">This Month</p>
          </div>
          <div className="text-center p-3 sm:p-4 border border-gray-200 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-blue-600">KSh 4.85M</p>
            <p className="text-xs text-gray-600">This Quarter</p>
          </div>
          <div className="text-center p-3 sm:p-4 border border-gray-200 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-purple-600">KSh 14.2M</p>
            <p className="text-xs text-gray-600">This Year</p>
          </div>
          <div className="text-center p-3 sm:p-4 border border-gray-200 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-orange-600">+12.5%</p>
            <p className="text-xs text-gray-600">Growth Rate</p>
          </div>
        </div>
        
        <div className="mt-4 flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-4">
          <button 
            onClick={() => setActiveTab('reports')}
            className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded-md hover:bg-blue-700 text-sm touch-target"
          >
            View Detailed Reports
          </button>
          <button 
            onClick={() => setActiveTab('agentAllocation')}
            className="bg-indigo-600 text-white px-4 sm:px-6 py-2 rounded-md hover:bg-indigo-700 text-sm touch-target"
          >
            Manage Agent Allocation
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard