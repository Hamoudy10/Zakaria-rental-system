import React, { useState } from 'react'
import TenantPayment from '../components/TenantPayment'
import TenantComplaints from '../components/TenantComplaints' // Updated to use TenantComplaints instead of ComplaintManagement

const TenantDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { id: 'overview', name: 'Overview' },
    { id: 'payments', name: 'Rent Payments' },
    { id: 'complaints', name: 'Complaints' },
    { id: 'profile', name: 'My Profile' }
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'payments':
        return <TenantPayment />
      case 'complaints':
        return <TenantComplaints />
      case 'profile':
        return <ProfileManagement />
      case 'overview':
      default:
        return <TenantOverview setActiveTab={setActiveTab} />
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

// Tenant Overview Component
const TenantOverview = ({ setActiveTab }) => {
  const [tenantStats, setTenantStats] = useState({
    nextPayment: 'KSh 15,000',
    dueDate: '2024-01-05',
    paymentStatus: 'Pending',
    complaintsCount: 2,
    unitInfo: 'Studio Apartment - Unit 4B'
  })

  const recentActivities = [
    { type: 'payment', description: 'Rent payment for December', amount: 'KSh 15,000', date: '2024-12-01', status: 'completed' },
    { type: 'complaint', description: 'Plumbing issue in bathroom', date: '2024-11-28', status: 'in_progress' },
    { type: 'payment', description: 'Rent payment for November', amount: 'KSh 15,000', date: '2024-11-01', status: 'completed' },
    { type: 'complaint', description: 'Broken window', date: '2024-10-15', status: 'resolved' },
  ]

  const getActivityIcon = (type) => {
    switch (type) {
      case 'payment': return '💰'
      case 'complaint': return '🛠️'
      default: return '📝'
    }
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      in_progress: { color: 'bg-blue-100 text-blue-800', label: 'In Progress' },
      resolved: { color: 'bg-gray-100 text-gray-800', label: 'Resolved' }
    }
    
    const config = statusConfig[status] || statusConfig.pending
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tenant Dashboard</h1>
        <p className="text-gray-600">Welcome to your rental management portal</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Next Payment</p>
              <p className="text-2xl font-bold text-green-600">{tenantStats.nextPayment}</p>
              <p className="text-xs text-gray-500">Due {new Date(tenantStats.dueDate).toLocaleDateString()}</p>
            </div>
            <div className="text-lg">💰</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Payment Status</p>
              <div className="mt-1">
                {getStatusBadge(tenantStats.paymentStatus)}
              </div>
            </div>
            <div className="text-lg">📊</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Complaints</p>
              <p className="text-2xl font-bold text-orange-600">{tenantStats.complaintsCount}</p>
              <p className="text-xs text-gray-500">Issues being resolved</p>
            </div>
            <div className="text-lg">🛠️</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Your Unit</p>
              <p className="text-lg font-bold text-purple-600">{tenantStats.unitInfo}</p>
            </div>
            <div className="text-lg">🏠</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => setActiveTab('payments')}
              className="bg-blue-600 text-white py-4 px-6 rounded-lg flex flex-col items-center hover:bg-blue-700 transition-colors"
            >
              <span className="text-2xl mb-2">💰</span>
              <span className="text-lg">Make Payment</span>
            </button>
            <button 
              onClick={() => setActiveTab('complaints')}
              className="bg-gray-600 text-white py-4 px-6 rounded-lg flex flex-col items-center hover:bg-gray-700 transition-colors"
            >
              <span className="text-2xl mb-2">🛠️</span>
              <span className="text-lg">Submit Complaint</span>
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
                      {new Date(activity.date).toLocaleDateString()}
                      {activity.amount && ` • ${activity.amount}`}
                    </p>
                    {getStatusBadge(activity.status)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment History Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Payment History</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">December 2024</p>
              <p className="text-sm text-gray-500">Due date: 5th December</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-green-600">KSh 15,000</p>
              {getStatusBadge('pending')}
            </div>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">November 2024</p>
              <p className="text-sm text-gray-500">Paid on: 1st November</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-green-600">KSh 15,000</p>
              {getStatusBadge('completed')}
            </div>
          </div>

          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">October 2024</p>
              <p className="text-sm text-gray-500">Paid on: 2nd October</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-green-600">KSh 15,000</p>
              {getStatusBadge('completed')}
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => setActiveTab('payments')}
          className="w-full mt-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          View Full Payment History
        </button>
      </div>
    </div>
  )
}

// Profile Management Component
const ProfileManagement = () => {
  const [profile, setProfile] = useState({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phoneNumber: '+254712345678',
    nationalId: '12345678',
    emergencyContact: '+254798765432'
  })

  const [isEditing, setIsEditing] = useState(false)

  const handleSave = () => {
    // In a real app, you would make an API call here
    setIsEditing(false)
    alert('Profile updated successfully!')
  }

  const handleChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-600">Manage your personal information and contact details</p>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {isEditing ? 'Cancel' : 'Edit Profile'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={profile.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.firstName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={profile.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.lastName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">National ID</label>
              {isEditing ? (
                <input
                  type="text"
                  value={profile.nationalId}
                  onChange={(e) => handleChange('nationalId', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.nationalId}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              {isEditing ? (
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              {isEditing ? (
                <input
                  type="tel"
                  value={profile.phoneNumber}
                  onChange={(e) => handleChange('phoneNumber', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.phoneNumber}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
              {isEditing ? (
                <input
                  type="tel"
                  value={profile.emergencyContact}
                  onChange={(e) => handleChange('emergencyContact', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-gray-900">{profile.emergencyContact}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => setIsEditing(false)}
            className="bg-gray-300 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Save Changes
          </button>
        </div>
      )}

      {/* Document Upload Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Documents</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">ID Front Image</p>
              <p className="text-sm text-gray-500">Upload a clear photo of your ID front</p>
            </div>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm">
              Upload
            </button>
          </div>

          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">ID Back Image</p>
              <p className="text-sm text-gray-500">Upload a clear photo of your ID back</p>
            </div>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm">
              Upload
            </button>
          </div>

          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Lease Agreement</p>
              <p className="text-sm text-gray-500">Upload your signed lease agreement</p>
            </div>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm">
              Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TenantDashboard