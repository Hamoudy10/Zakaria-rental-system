import React, { useState } from 'react'
import TenantPayment from '../components/TenantPayment'
import ComplaintManagement from '../components/ComplaintManagement'

const TenantDashboard = () => {
  const [activeTab, setActiveTab] = useState('payments')

  const tabs = [
    { id: 'payments', name: 'Rent Payments' },
    { id: 'complaints', name: 'Complaints' },
    { id: 'profile', name: 'My Profile' }
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'complaints':
        return <ComplaintManagement />
      case 'profile':
        return <ProfileManagement />
      case 'payments':
      default:
        return <TenantPayment />
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tenant Dashboard</h1>
        <p className="text-gray-600">Manage your rent payments and maintenance requests</p>
      </div>

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

// Placeholder components
const ProfileManagement = () => (
  <div className="card">
    <h3 className="text-lg font-semibold mb-4">My Profile</h3>
    <p className="text-gray-600">Profile management will be implemented here.</p>
  </div>
)

export default TenantDashboard