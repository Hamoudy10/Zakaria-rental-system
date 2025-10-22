import React, { useState, Suspense, lazy } from 'react'

// Lazy load agent components
const ComplaintManagement = lazy(() => import('../components/ComplaintManagement'));

// Loading component for Suspense fallback
const TabLoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
);

const AgentDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { id: 'overview', name: 'Overview' },
    { id: 'complaints', name: 'Complaint Management' },
    { id: 'properties', name: 'My Properties' },
    { id: 'tenants', name: 'Tenant Management' }
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'complaints':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <ComplaintManagement />
          </Suspense>
        )
      case 'properties':
        return <PropertyManagement />
      case 'tenants':
        return <TenantManagement />
      case 'overview':
      default:
        return <AgentOverview setActiveTab={setActiveTab} />
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

// Agent Overview Component (Keep as is - lightweight)
const AgentOverview = ({ setActiveTab }) => {
  const [agentStats, setAgentStats] = useState({
    assignedProperties: 3,
    activeComplaints: 8,
    resolvedThisMonth: 12,
    pendingTasks: 4,
    totalTenants: 45,
    occupancyRate: '92%'
  })

  const recentActivities = [
    { type: 'complaint', description: 'Plumbing issue at Kilimani Towers', property: 'Kilimani Towers', time: '2 hours ago', priority: 'high' },
    { type: 'complaint', description: 'Electrical problem in Unit 4B', property: 'Westlands Apartments', time: '4 hours ago', priority: 'medium' },
    { type: 'maintenance', description: 'Routine maintenance completed', property: 'Kileleshwa Gardens', time: '1 day ago', priority: 'low' },
    { type: 'inspection', description: 'Property inspection scheduled', property: 'Kilimani Towers', time: '2 days ago', priority: 'medium' },
  ]

  const assignedProperties = [
    { name: 'Kilimani Towers', units: 20, occupied: 18, complaints: 3, revenue: 'KSh 850,000' },
    { name: 'Westlands Apartments', units: 15, occupied: 14, complaints: 2, revenue: 'KSh 650,000' },
    { name: 'Kileleshwa Gardens', units: 12, occupied: 11, complaints: 1, revenue: 'KSh 520,000' },
  ]

  const getActivityIcon = (type) => {
    switch (type) {
      case 'complaint': return '🛠️'
      case 'maintenance': return '🔧'
      case 'inspection': return '📋'
      default: return '📝'
    }
  }

  const getPriorityBadge = (priority) => {
    const priorityConfig = {
      high: { color: 'bg-red-100 text-red-800', label: 'High' },
      medium: { color: 'bg-orange-100 text-orange-800', label: 'Medium' },
      low: { color: 'bg-green-100 text-green-800', label: 'Low' }
    }
    
    const config = priorityConfig[priority] || priorityConfig.medium
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Agent Dashboard</h1>
        <p className="text-gray-600">Manage your assigned properties and tenant requests</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Assigned Properties</p>
              <p className="text-2xl font-bold text-blue-600">{agentStats.assignedProperties}</p>
              <p className="text-xs text-gray-500">Properties managed</p>
            </div>
            <div className="text-lg">🏠</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Complaints</p>
              <p className="text-2xl font-bold text-orange-600">{agentStats.activeComplaints}</p>
              <p className="text-xs text-gray-500">Needing attention</p>
            </div>
            <div className="text-lg">🛠️</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Resolved This Month</p>
              <p className="text-2xl font-bold text-green-600">{agentStats.resolvedThisMonth}</p>
              <p className="text-xs text-gray-500">Complaints closed</p>
            </div>
            <div className="text-lg">✅</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Tasks</p>
              <p className="text-2xl font-bold text-purple-600">{agentStats.pendingTasks}</p>
              <p className="text-xs text-gray-500">To complete</p>
            </div>
            <div className="text-lg">📋</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setActiveTab('complaints')}
              className="bg-blue-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-blue-700 transition-colors"
            >
              <span className="text-lg mb-1">🛠️</span>
              <span className="text-sm">Manage Complaints</span>
            </button>
            <button 
              onClick={() => setActiveTab('properties')}
              className="bg-gray-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-gray-700 transition-colors"
            >
              <span className="text-lg mb-1">🏠</span>
              <span className="text-sm">View Properties</span>
            </button>
            <button 
              onClick={() => setActiveTab('tenants')}
              className="bg-green-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-green-700 transition-colors"
            >
              <span className="text-lg mb-1">👥</span>
              <span className="text-sm">Tenant Management</span>
            </button>
            <button 
              onClick={() => {/* Add inspection functionality */}}
              className="bg-purple-600 text-white py-3 px-4 rounded-lg flex flex-col items-center hover:bg-purple-700 transition-colors"
            >
              <span className="text-lg mb-1">📋</span>
              <span className="text-sm">Schedule Inspection</span>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivities.map((activity, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-lg">{getActivityIcon(activity.type)}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {activity.description}
                  </p>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-gray-500">
                      {activity.property} • {activity.time}
                    </p>
                    {getPriorityBadge(activity.priority)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assigned Properties */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Assigned Properties</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {assignedProperties.map((property, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900">{property.name}</h4>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Units:</span>
                  <span className="font-semibold">{property.occupied}/{property.units} occupied</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Occupancy:</span>
                  <span className="font-semibold text-green-600">
                    {Math.round((property.occupied / property.units) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Active Complaints:</span>
                  <span className="font-semibold text-orange-600">{property.complaints}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Monthly Revenue:</span>
                  <span className="font-semibold text-blue-600">{property.revenue}</span>
                </div>
              </div>
              <button 
                onClick={() => setActiveTab('complaints')}
                className="w-full mt-3 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-sm"
              >
                Manage Issues
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center p-4 border border-gray-200 rounded-lg">
            <p className="text-2xl font-bold text-green-600">94%</p>
            <p className="text-sm text-gray-600">Satisfaction Rate</p>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">2.1 days</p>
            <p className="text-sm text-gray-600">Avg. Resolution Time</p>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">98%</p>
            <p className="text-sm text-gray-600">On-time Completion</p>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded-lg">
            <p className="text-2xl font-bold text-orange-600">15</p>
            <p className="text-sm text-gray-600">This Month's Tasks</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Property Management Component (Keep as is - lightweight)
const PropertyManagement = () => {
  const [properties] = useState([
    {
      id: 1,
      name: 'Kilimani Towers',
      address: 'Kilimani Road, Nairobi',
      units: 20,
      occupied: 18,
      complaints: 3,
      revenue: 'KSh 850,000'
    },
    {
      id: 2,
      name: 'Westlands Apartments',
      address: 'Westlands, Nairobi',
      units: 15,
      occupied: 14,
      complaints: 2,
      revenue: 'KSh 650,000'
    },
    {
      id: 3,
      name: 'Kileleshwa Gardens',
      address: 'Kileleshwa, Nairobi',
      units: 12,
      occupied: 11,
      complaints: 1,
      revenue: 'KSh 520,000'
    }
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Properties</h1>
        <p className="text-gray-600">Manage your assigned properties and view performance metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map(property => (
          <div key={property.id} className="border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{property.name}</h3>
            <p className="text-sm text-gray-600 mb-4">{property.address}</p>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Units:</span>
                <span className="text-sm font-medium">{property.occupied}/{property.units} occupied</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Occupancy Rate:</span>
                <span className="text-sm font-medium text-green-600">
                  {Math.round((property.occupied / property.units) * 100)}%
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Active Complaints:</span>
                <span className="text-sm font-medium text-orange-600">{property.complaints}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Monthly Revenue:</span>
                <span className="text-sm font-medium text-blue-600">{property.revenue}</span>
              </div>
            </div>

            <div className="mt-4 flex space-x-2">
              <button className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-md text-sm hover:bg-blue-700">
                View Details
              </button>
              <button className="flex-1 bg-gray-600 text-white py-2 px-3 rounded-md text-sm hover:bg-gray-700">
                Manage
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Tenant Management Component (Keep as is - lightweight)
const TenantManagement = () => {
  const [tenants] = useState([
    {
      id: 1,
      name: 'John Doe',
      unit: 'Kilimani Towers - 4B',
      phone: '+254712345678',
      rent: 'KSh 45,000',
      status: 'Current',
      complaints: 2
    },
    {
      id: 2,
      name: 'Mary Wanjiku',
      unit: 'Westlands Apartments - 2A',
      phone: '+254723456789',
      rent: 'KSh 38,000',
      status: 'Current',
      complaints: 0
    },
    {
      id: 3,
      name: 'James Kariuki',
      unit: 'Kileleshwa Gardens - 5C',
      phone: '+254734567890',
      rent: 'KSh 52,000',
      status: 'Overdue',
      complaints: 1
    }
  ])

  const getStatusBadge = (status) => {
    const statusConfig = {
      current: { color: 'bg-green-100 text-green-800', label: 'Current' },
      overdue: { color: 'bg-red-100 text-red-800', label: 'Overdue' },
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' }
    }
    
    const config = statusConfig[status.toLowerCase()] || statusConfig.pending
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tenant Management</h1>
        <p className="text-gray-600">Manage tenant information and communication</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monthly Rent</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Complaints</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tenants.map(tenant => (
              <tr key={tenant.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tenant.unit}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tenant.phone}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tenant.rent}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(tenant.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tenant.complaints}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button className="text-blue-600 hover:text-blue-900 mr-3">
                    Contact
                  </button>
                  <button className="text-green-600 hover:text-green-900">
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AgentDashboard