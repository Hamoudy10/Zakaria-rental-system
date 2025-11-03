// src/pages/AgentDashboard.jsx
import React, { useState, Suspense, lazy, useEffect } from 'react'
import agentService from '../services/agentService';
import { useAuth } from '../context/AuthContext';

// Lazy load agent components - only complaints and salary payments
const ComplaintManagement = lazy(() => import('../components/ComplaintManagement'));
const SalaryPayment = lazy(() => import('../components/SalaryPayment'));

// Loading component for Suspense fallback
const TabLoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
  </div>
);

const AgentDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')
  const { user } = useAuth();

  const tabs = [
    { id: 'overview', name: 'Overview', shortName: 'Overview' },
    { id: 'complaints', name: 'Complaint Management', shortName: 'Complaints' },
    { id: 'properties', name: 'My Properties', shortName: 'Properties' },
    { id: 'tenants', name: 'Tenant Management', shortName: 'Tenants' },
    { id: 'salaries', name: 'Salary Payments', shortName: 'Salaries' }
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'complaints':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <ComplaintManagement />
          </Suspense>
        )
      case 'salaries':
        return (
          <Suspense fallback={<TabLoadingSpinner />}>
            <SalaryPayment />
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

// Agent Overview Component (Updated with real data)
const AgentOverview = ({ setActiveTab }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    stats: {},
    recentActivities: [],
    assignedProperties: [],
    performanceMetrics: {}
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [statsResponse, propertiesResponse, activitiesResponse, metricsResponse] = await Promise.all([
        agentService.getDashboardStats(),
        agentService.getAssignedProperties(),
        agentService.getRecentActivities(),
        agentService.getPerformanceMetrics()
      ]);

      setDashboardData({
        stats: statsResponse.data || {},
        assignedProperties: propertiesResponse.data || [],
        recentActivities: activitiesResponse.data || [],
        performanceMetrics: metricsResponse.data || {}
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'complaint': return '🛠️'
      case 'maintenance': return '🔧'
      case 'inspection': return '📋'
      case 'payment': return '💰'
      case 'registration': return '👤'
      default: return '📝'
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
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
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agent Dashboard</h1>
        <p className="text-gray-600 text-sm mt-1">Welcome back, {user?.first_name}! Manage complaints and view assigned properties</p>
      </div>

      {/* Stats Grid - Real data from database */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Assigned Properties</p>
              <p className="text-lg sm:text-xl font-bold text-blue-600">
                {dashboardData.stats.assignedProperties || 0}
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
                {dashboardData.stats.activeComplaints || 0}
              </p>
              <p className="text-xs text-gray-500">Needing attention</p>
            </div>
            <div className="text-lg sm:text-xl text-orange-600">🛠️</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Resolved This Month</p>
              <p className="text-lg sm:text-xl font-bold text-green-600">
                {dashboardData.stats.resolvedThisMonth || 0}
              </p>
              <p className="text-xs text-gray-500">Complaints closed</p>
            </div>
            <div className="text-lg sm:text-xl text-green-600">✅</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Pending Tasks</p>
              <p className="text-lg sm:text-xl font-bold text-purple-600">
                {dashboardData.stats.pendingTasks || 0}
              </p>
              <p className="text-xs text-gray-500">To complete</p>
            </div>
            <div className="text-lg sm:text-xl text-purple-600">📋</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Quick Actions - Limited to complaints and basic management */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button 
              onClick={() => setActiveTab('complaints')}
              className="bg-blue-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-blue-700 transition-colors touch-target active:bg-blue-800"
            >
              <span className="text-sm sm:text-lg mb-1">🛠️</span>
              <span className="text-xs sm:text-sm text-center">Manage Complaints</span>
            </button>
            <button 
              onClick={() => setActiveTab('properties')}
              className="bg-gray-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-gray-700 transition-colors touch-target active:bg-gray-800"
            >
              <span className="text-sm sm:text-lg mb-1">🏠</span>
              <span className="text-xs sm:text-sm text-center">View Properties</span>
            </button>
            <button 
              onClick={() => setActiveTab('tenants')}
              className="bg-green-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-green-700 transition-colors touch-target active:bg-green-800"
            >
              <span className="text-sm sm:text-lg mb-1">👥</span>
              <span className="text-xs sm:text-sm text-center">View Tenants</span>
            </button>
            <button 
              onClick={() => setActiveTab('salaries')}
              className="bg-purple-600 text-white py-2 sm:py-3 px-2 sm:px-4 rounded-lg flex flex-col items-center hover:bg-purple-700 transition-colors touch-target active:bg-purple-800"
            >
              <span className="text-sm sm:text-lg mb-1">💰</span>
              <span className="text-xs sm:text-sm text-center">Salary History</span>
            </button>
          </div>
        </div>

        {/* Recent Activity - Real data from database */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Recent Activity</h3>
          <div className="space-y-2 sm:space-y-3">
            {dashboardData.recentActivities.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No recent activities
              </div>
            ) : (
              dashboardData.recentActivities.slice(0, 4).map((activity, index) => (
                <div key={index} className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg">
                  <div className="text-base sm:text-lg">{getActivityIcon(activity.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                      {activity.description}
                    </p>
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-xs text-gray-500 truncate">
                        {activity.property_name} • {formatTimeAgo(activity.created_at)}
                      </p>
                      {activity.priority && getPriorityBadge(activity.priority)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Assigned Properties - Real data from database */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Assigned Properties</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {dashboardData.assignedProperties.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-500">
              No properties assigned
            </div>
          ) : (
            dashboardData.assignedProperties.slice(0, 3).map((property, index) => (
              <div key={property.id || index} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{property.name}</h4>
                <p className="text-xs text-gray-600 mt-1">{property.address}</p>
                <div className="mt-2 space-y-1 sm:space-y-2">
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span>Units:</span>
                    <span className="font-semibold">{property.occupied_units || 0}/{property.total_units || 0} occupied</span>
                  </div>
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span>Occupancy:</span>
                    <span className="font-semibold text-green-600">
                      {property.total_units ? Math.round(((property.occupied_units || 0) / property.total_units) * 100) : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span>Active Complaints:</span>
                    <span className="font-semibold text-orange-600">{property.active_complaints || 0}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('complaints')}
                  className="w-full mt-3 bg-blue-600 text-white py-2 px-3 rounded-md hover:bg-blue-700 text-xs sm:text-sm touch-target active:bg-blue-800"
                >
                  Manage Issues
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Performance Metrics - Real data from database */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          <div className="text-center p-3 sm:p-4 border border-gray-200 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-green-600">
              {dashboardData.performanceMetrics.satisfactionRate || '0'}%
            </p>
            <p className="text-xs text-gray-600">Satisfaction Rate</p>
          </div>
          <div className="text-center p-3 sm:p-4 border border-gray-200 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-blue-600">
              {dashboardData.performanceMetrics.avgResolutionTime || '0'} days
            </p>
            <p className="text-xs text-gray-600">Avg. Resolution Time</p>
          </div>
          <div className="text-center p-3 sm:p-4 border border-gray-200 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-purple-600">
              {dashboardData.performanceMetrics.onTimeCompletion || '0'}%
            </p>
            <p className="text-xs text-gray-600">On-time Completion</p>
          </div>
          <div className="text-center p-3 sm:p-4 border border-gray-200 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-orange-600">
              {dashboardData.performanceMetrics.monthlyTasks || '0'}
            </p>
            <p className="text-xs text-gray-600">This Month's Tasks</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Property Management Component (View only - real data)
const PropertyManagement = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const response = await agentService.getAssignedProperties();
      setProperties(response.data || []);
    } catch (err) {
      console.error('Error fetching properties:', err);
      setError('Failed to load properties. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4">{error}</div>
        <button
          onClick={fetchProperties}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Properties</h1>
        <p className="text-gray-600 text-sm mt-1">View your assigned properties - Read Only Access</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {properties.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">
            No properties assigned to you
          </div>
        ) : (
          properties.map(property => (
            <div key={property.id} className="border border-gray-200 rounded-lg p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">{property.name}</h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-4">{property.address}</p>
              
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs sm:text-sm text-gray-600">Units:</span>
                  <span className="text-xs sm:text-sm font-medium">
                    {property.occupied_units || 0}/{property.total_units || 0} occupied
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-xs sm:text-sm text-gray-600">Occupancy Rate:</span>
                  <span className="text-xs sm:text-sm font-medium text-green-600">
                    {property.total_units ? Math.round(((property.occupied_units || 0) / property.total_units) * 100) : 0}%
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-xs sm:text-sm text-gray-600">Active Complaints:</span>
                  <span className="text-xs sm:text-sm font-medium text-orange-600">
                    {property.active_complaints || 0}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                <button 
                  onClick={() => {/* View property details */}}
                  className="w-full bg-blue-600 text-white py-2 px-2 sm:px-3 rounded-md text-xs sm:text-sm hover:bg-blue-700 touch-target active:bg-blue-800"
                >
                  View Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Tenant Management Component (View only - real data)
const TenantManagement = () => {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const response = await agentService.getTenantsWithPaymentStatus();
      setTenants(response.data || []);
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setError('Failed to load tenants. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      paid: { color: 'bg-green-100 text-green-800', label: 'Paid' },
      due: { color: 'bg-yellow-100 text-yellow-800', label: 'Due' },
      overdue: { color: 'bg-red-100 text-red-800', label: 'Overdue' }
    };
    
    const config = statusConfig[status?.toLowerCase()] || statusConfig.due;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4">{error}</div>
        <button
          onClick={fetchTenants}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Tenant Management</h1>
        <p className="text-gray-600 text-sm mt-1">View tenant information and payment status - Read Only Access</p>
      </div>

      <div className="table-container overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Status</th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Complaints</th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tenants.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-3 sm:px-6 py-4 text-center text-gray-500">
                  No tenants found
                </td>
              </tr>
            ) : (
              tenants.map(tenant => (
                <tr key={tenant.id} className="hover:bg-gray-50">
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                    <div className="text-xs sm:text-sm font-medium text-gray-900">
                      {tenant.first_name} {tenant.last_name}
                    </div>
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                    {tenant.unit_name || 'N/A'}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                    {tenant.phone_number}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                    {getStatusBadge(tenant.payment_status)}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                    {tenant.active_complaints || 0}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                    <button className="text-blue-600 hover:text-blue-900 mr-2 sm:mr-3 touch-target active:text-blue-700">
                      Contact
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Status Legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">Payment Status Legend</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="flex items-center">
            <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
            <span>Paid - Rent payment completed for current period</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></span>
            <span>Due - Payment expected within current period</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
            <span>Overdue - Payment past due date</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;