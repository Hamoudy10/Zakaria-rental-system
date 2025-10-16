import React, { useState } from 'react'

const SystemSettings = () => {
  const [settings, setSettings] = useState({
    company_name: 'Abdallah Rental System',
    primary_color: '#0ea5e9',
    mpesa_paybill: '123456',
    rent_due_day: 5,
    grace_period: 7,
    sms_notifications: true,
    auto_confirm_payments: true
  })

  const handleSaveSettings = (e) => {
    e.preventDefault()
    // TODO: Save settings to backend
    console.log('Saving settings:', settings)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">System Settings</h2>
        <p className="text-gray-600">Configure system-wide settings and preferences</p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">General Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Company Name</label>
              <input
                type="text"
                value={settings.company_name}
                onChange={(e) => setSettings({...settings, company_name: e.target.value})}
                className="input-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Primary Color</label>
              <input
                type="color"
                value={settings.primary_color}
                onChange={(e) => setSettings({...settings, primary_color: e.target.value})}
                className="input-primary h-10"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Payment Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">M-Pesa Paybill Number</label>
              <input
                type="text"
                value={settings.mpesa_paybill}
                onChange={(e) => setSettings({...settings, mpesa_paybill: e.target.value})}
                className="input-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Rent Due Day</label>
              <input
                type="number"
                min="1"
                max="28"
                value={settings.rent_due_day}
                onChange={(e) => setSettings({...settings, rent_due_day: parseInt(e.target.value)})}
                className="input-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Grace Period (Days)</label>
              <input
                type="number"
                min="0"
                max="15"
                value={settings.grace_period}
                onChange={(e) => setSettings({...settings, grace_period: parseInt(e.target.value)})}
                className="input-primary"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Notification Settings</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">SMS Notifications</label>
                <p className="text-sm text-gray-500">Send SMS notifications for payments and updates</p>
              </div>
              <input
                type="checkbox"
                checked={settings.sms_notifications}
                onChange={(e) => setSettings({...settings, sms_notifications: e.target.checked})}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Auto-confirm Payments</label>
                <p className="text-sm text-gray-500">Automatically confirm M-Pesa payments</p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_confirm_payments}
                onChange={(e) => setSettings({...settings, auto_confirm_payments: e.target.checked})}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary">
            Save Settings
          </button>
        </div>
      </form>
    </div>
  )
}

export default SystemSettings