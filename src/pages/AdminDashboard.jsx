import React, { useState } from 'react'
import UserManagement from '../components/UserManagement'
import PropertyManagement from '../components/PropertyManagement'
import Reports from '../components/Reports'
import SalaryPayments from '../components/SalaryPayments'
import SystemSettings from '../components/SystemSettings'
import TenantAllocation from '../components/TenantAllocation' // Add this import


const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { id: 'overview', name: 'Overview' },
    { id: 'users', name: 'User Management' },
    { id: 'properties', name: 'Properties' },
    { id: 'allocations', name: 'Tenant Allocation' },
    { id: 'payments', name: 'Payment Management' }, 
    { id: 'payments', name: 'Salary Payments' },
    { id: 'reports', name: 'Reports' },
    { id: 'settings', name: 'System Settings' },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return <UserManagement />
      case 'properties':
        return <PropertyManagement />
      case 'allocations':
        return <TenantAllocation />
      case 'payments':
        return <PaymentManagement />
      case 'payments':
        return <SalaryPayments />
      case 'reports':
        return <Reports />
      case 'settings':
        return <SystemSettings />
      case 'overview':
      default:
        return <DashboardOverview />
    }
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
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

      {/* Content */}
      {renderContent()}
    </div>
  )
}

// Dashboard Overview Component
const DashboardOverview = () => {
  const stats = [
    { name: 'Total Revenue', value: 'KSh 1,234,567', change: '+12%', changeType: 'positive', color: 'text-green-600' },
    { name: 'Total Users', value: '156', change: '+8%', changeType: 'positive', color: 'text-blue-600' },
    { name: 'Properties', value: '24', change: '+2', changeType: 'positive', color: 'text-purple-600' },
    { name: 'Occupancy Rate', value: '85%', change: '+5%', changeType: 'positive', color: 'text-orange-600' },
  ]

  const recentActivities = [
    { type: 'registration', user: 'John Doe', time: '5 minutes ago', color: 'bg-green-500' },
    { type: 'payment', user: 'Mary Wanjiku', time: '1 hour ago', color: 'bg-blue-500' },
    { type: 'complaint', user: 'James Kariuki', time: '2 hours ago', color: 'bg-orange-500' },
    { type: 'maintenance', user: 'Agent Smith', time: '3 hours ago', color: 'bg-purple-500' },
  ]

  const getActivityIcon = (type) => {
    switch (type) {
      case 'registration': return '👤'
      case 'payment': return '💰'
      case 'complaint': return '⚠️'
      case 'maintenance': return '🔧'
      default: return '📝'
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here's what's happening with your properties today.</p>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
              <div className={`text-sm font-semibold ${
                stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
              }`}>
                {stat.change}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivities.map((activity, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-lg">{getActivityIcon(activity.type)}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {activity.type === 'registration' && 'New tenant registration'}
                    {activity.type === 'payment' && 'Rent payment received'}
                    {activity.type === 'complaint' && 'New complaint submitted'}
                    {activity.type === 'maintenance' && 'Maintenance request'}
                  </p>
                  <p className="text-xs text-gray-500">By {activity.user} • {activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setActiveTab('users')}
              className="btn-primary py-3 flex flex-col items-center"
            >
              <span className="text-lg mb-1">👤</span>
              <span>Manage Users</span>
            </button>
            <button 
              onClick={() => setActiveTab('properties')}
              className="btn-secondary py-3 flex flex-col items-center"
            >
              <span className="text-lg mb-1">🏠</span>
              <span>Properties</span>
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className="btn-primary py-3 flex flex-col items-center"
            >
              <span className="text-lg mb-1">💰</span>
              <span>Pay Salaries</span>
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className="btn-secondary py-3 flex flex-col items-center"
            >
              <span className="text-lg mb-1">📊</span>
              <span>View Reports</span>
            </button>
          </div>
        </div>
      </div>

      {/* Property Performance */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Property Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Westlands Apartments', 'Kilimani Towers', 'Kileleshwa Gardens'].map((property, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900">{property}</h4>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Occupancy:</span>
                  <span className="font-semibold">92%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Monthly Revenue:</span>
                  <span className="font-semibold text-green-600">KSh 450,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Maintenance:</span>
                  <span className="font-semibold text-orange-600">2 pending</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard