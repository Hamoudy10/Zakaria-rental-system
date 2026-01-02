// src/pages/AdminDashboard.jsx
import React, { useState, useEffect, Suspense, lazy } from 'react'

// Lazy load admin components
const UserManagement = lazy(() => import('../components/UserManagement'))
const PropertyManagement = lazy(() => import('../components/PropertyManagement'))
const Reports = lazy(() => import('../components/Reports'))
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
const DashboardOverview = ({ setActiveTab, adminStats, recentActivities, topProperties }) => {
  if (!adminStats) return <TabLoadingSpinner />

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
      {/* Copy all your previous DashboardOverview JSX here */}
      {/* Stats, Recent Activities, Top Properties, Pending Actions */}
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
