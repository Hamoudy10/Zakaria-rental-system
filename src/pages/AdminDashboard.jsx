// src/pages/AdminDashboard.jsx
import React, { useState, useEffect, Suspense, lazy } from 'react'

// Lazy load admin components
const UserManagement = lazy(() => import('../components/UserManagement'))
const PropertyManagement = lazy(() => import('../components/PropertyManagement'))
const Reports = lazy(() => import('../components/ReportsPage'))
const SalaryPayment = lazy(() => import('../components/SalaryPayment'))
const SystemSettings = lazy(() => import('../components/SystemSettings'))
const TenantAllocation = lazy(() => import('../components/TenantAllocation'))
const PaymentManagement = lazy(() => import('../components/PaymentManagement'))
const ComplaintManagement = lazy(() => import('../components/ComplaintManagement'))
const UnitManagement = lazy(() => import('../components/UnitManagement'))
const AgentAllocation = lazy(() => import('../components/AgentAllocation'))

// Loading spinner
const TabLoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
  </div>
)

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')
  const [adminStats, setAdminStats] = useState(null)
  const [recentActivities, setRecentActivities] = useState([])
  const [topProperties, setTopProperties] = useState([])

  // --------------------
  // Fetch dashboard data
  // --------------------
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Admin stats
       const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

        const statsRes = await fetch(`${API_BASE}/api/admin/dashboard/stats`);
        const statsJson = await statsRes.json();
        setAdminStats(statsJson.data);

        const activitiesRes = await fetch(`${API_BASE}/api/admin/dashboard/recent-activities`);
        const activitiesJson = await activitiesRes.json();
        setRecentActivities(activitiesJson.data);

        const topPropsRes = await fetch(`${API_BASE}/api/admin/dashboard/top-properties`);
        const topPropsJson = await topPropsRes.json();
        setTopProperties(topPropsJson.data);

      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      }
    }

    fetchData()
  }, [])

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
      case 'users': return <Suspense fallback={<TabLoadingSpinner />}><UserManagement /></Suspense>
      case 'properties': return <Suspense fallback={<TabLoadingSpinner />}><PropertyManagement /></Suspense>
      case 'units': return <Suspense fallback={<TabLoadingSpinner />}><UnitManagement /></Suspense>
      case 'allocations': return <Suspense fallback={<TabLoadingSpinner />}><TenantAllocation /></Suspense>
      case 'agentAllocation': return <Suspense fallback={<TabLoadingSpinner />}><AgentAllocation /></Suspense>
      case 'payments': return <Suspense fallback={<TabLoadingSpinner />}><PaymentManagement /></Suspense>
      case 'salaries': return <Suspense fallback={<TabLoadingSpinner />}><SalaryPayment /></Suspense>
      case 'complaints': return <Suspense fallback={<TabLoadingSpinner />}><ComplaintManagement /></Suspense>
      case 'reports': return <Suspense fallback={<TabLoadingSpinner />}><Reports /></Suspense>
      case 'settings': return <Suspense fallback={<TabLoadingSpinner />}><SystemSettings /></Suspense>
      case 'overview':
      default:
        return (
          <DashboardOverview
            setActiveTab={setActiveTab}
            adminStats={adminStats}
            recentActivities={recentActivities}
            topProperties={topProperties}
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 mobile-optimized no-horizontal-scroll">
      <div className="responsive-container py-4">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-1 xs:space-x-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            {tabs.map(tab => (
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

        {/* Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-3 sm:p-4 md:p-6">{renderContent()}</div>
        </div>
      </div>
    </div>
  )
}

// --------------------
// DashboardOverview
// --------------------
// --------------------
// DashboardOverview
// --------------------
const DashboardOverview = ({ setActiveTab, adminStats, recentActivities, topProperties }) => {
  if (!adminStats) return <TabLoadingSpinner />

  return (
    <div className="space-y-6">

      {/* =====================
          STATISTICS OVERVIEW
      ===================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Properties</p>
          <p className="text-2xl font-semibold text-gray-800">
            {adminStats.totalProperties}
          </p>
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-xs text-gray-500">Occupancy Rate</p>
          <p className="text-2xl font-semibold text-gray-800">
            {adminStats.occupancyRate}
          </p>
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-xs text-gray-500">Active Tenants</p>
          <p className="text-2xl font-semibold text-gray-800">
            {adminStats.activeTenants}
          </p>
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Revenue</p>
          <p className="text-2xl font-semibold text-gray-800">
            KES {adminStats.totalRevenue}
          </p>
        </div>
      </div>

      {/* =====================
          RECENT ACTIVITIES
      ===================== */}
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Recent Activities
        </h3>

        {recentActivities.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activities available.</p>
        ) : (
          <div className="space-y-2">
            {recentActivities.map((activity, index) => (
              <div
                key={index}
                className="flex justify-between items-center border rounded-md p-3"
              >
                <span className="text-sm text-gray-700">
                  {activity.description}
                </span>
                <span className="text-xs text-gray-500">
                  {activity.time}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =====================
          TOP PROPERTIES
      ===================== */}
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Top Performing Properties
        </h3>

        {topProperties.length === 0 ? (
          <p className="text-sm text-gray-500">No property performance data.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {topProperties.map((property, index) => (
              <div
                key={index}
                className="border rounded-md p-4 hover:shadow-sm transition"
              >
                <p className="font-medium text-gray-800">
                  {property.name}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Occupancy: <span className="font-medium">{property.occupancy}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Revenue: <span className="font-medium">KES {property.revenue}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}


// --------------------
// PendingActionCard
// --------------------
const PendingActionCard = ({ title, count, color, onClick }) => {
  const colorMap = {
    orange: 'bg-orange-500 text-white',
    yellow: 'bg-yellow-500 text-white',
    indigo: 'bg-indigo-500 text-white',
    blue: 'bg-blue-500 text-white',
  }
  return (
    <button
      onClick={onClick}
      className={`flex justify-between items-center p-3 rounded-lg shadow-sm ${colorMap[color]} hover:opacity-90 transition-opacity touch-target w-full`}
    >
      <span className="font-medium text-sm sm:text-base">{title}</span>
      <span className="font-bold text-sm sm:text-base">{count}</span>
    </button>
  )
}

export default AdminDashboard
