import React, { useState, useEffect } from 'react';
import { useSystemSettings } from '../context/SystemSettingsContext';

const SystemSettings = () => {
  const {
    settings,
    loading,
    error,
    fetchSettings,
    updateSetting,
    updateMultipleSettings,
    resetToDefaults,
    getSettingsByCategory,
    clearError
  } = useSystemSettings();

  const [activeTab, setActiveTab] = useState('appearance');
  const [settingsUpdates, setSettingsUpdates] = useState({});
  const [saveStatus, setSaveStatus] = useState('');

  // SAFE CHECK: Ensure data is always arrays
  const safeSettings = Array.isArray(settings) ? settings : [];

  // Load settings on component mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Initialize default settings if empty
  useEffect(() => {
    if (safeSettings.length === 0) {
      const defaultSettings = {
        primary_color: '#3B82F6',
        secondary_color: '#1E40AF',
        company_name: 'Zakaria Rental System',
        default_rent_due_day: '5',
        default_grace_period: '7',
        mpesa_paybill_number: '123456',
        sms_enabled: 'true',
        auto_confirm_payments: 'true',
        maintenance_email: 'maintenance@zakariarentals.com',
        support_phone: '+254700000000'
      };
      setSettingsUpdates(defaultSettings);
    }
  }, [safeSettings]);

  const handleSettingChange = (key, value) => {
    setSettingsUpdates(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveSettings = async () => {
    clearError();
    setSaveStatus('saving');
    
    try {
      await updateMultipleSettings(settingsUpdates);
      setSaveStatus('saved');
      setSettingsUpdates({});
      
      setTimeout(() => {
        setSaveStatus('');
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
    }
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      clearError();
      try {
        await resetToDefaults();
        setSettingsUpdates({});
        alert('Settings reset to defaults successfully!');
      } catch (error) {
        console.error('Error resetting settings:', error);
      }
    }
  };

  // Get settings organized by category
  const settingsByCategory = getSettingsByCategory();

  const renderSettingField = (setting) => {
    const currentValue = settingsUpdates[setting.setting_key] !== undefined 
      ? settingsUpdates[setting.setting_key] 
      : setting.setting_value;

    switch (setting.setting_key) {
      case 'primary_color':
      case 'secondary_color':
        return (
          <div className="flex items-center space-x-3">
            <input
              type="color"
              value={currentValue || '#3B82F6'}
              onChange={(e) => handleSettingChange(setting.setting_key, e.target.value)}
              className="w-12 h-12 rounded border border-gray-300"
            />
            <span className="text-sm text-gray-600">{currentValue}</span>
          </div>
        );
      
      case 'sms_enabled':
      case 'auto_confirm_payments':
        return (
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={currentValue === 'true'}
              onChange={(e) => handleSettingChange(setting.setting_key, e.target.checked.toString())}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-3 text-sm text-gray-600">
              {currentValue === 'true' ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        );
      
      case 'default_rent_due_day':
        return (
          <select
            value={currentValue || '5'}
            onChange={(e) => handleSettingChange(setting.setting_key, e.target.value)}
            className="w-32 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        );
      
      case 'default_grace_period':
        return (
          <select
            value={currentValue || '7'}
            onChange={(e) => handleSettingChange(setting.setting_key, e.target.value)}
            className="w-32 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 15 }, (_, i) => i).map(days => (
              <option key={days} value={days}>{days} days</option>
            ))}
          </select>
        );
      
      default:
        return (
          <input
            type="text"
            value={currentValue || ''}
            onChange={(e) => handleSettingChange(setting.setting_key, e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter ${setting.setting_key.replace(/_/g, ' ')}`}
          />
        );
    }
  };

  if (loading && safeSettings.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">System Settings</h2>
          <p className="text-gray-600">Configure system preferences and behavior</p>
        </div>
        <div className="flex space-x-4">
          <button
            onClick={handleResetDefaults}
            className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSaveSettings}
            disabled={Object.keys(settingsUpdates).length === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button 
            onClick={clearError}
            className="float-right text-red-800 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {saveStatus === 'saved' && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          Settings saved successfully!
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error saving settings. Please try again.
        </div>
      )}

      {/* Settings Tabs */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {[
              { id: 'appearance', name: 'Appearance', icon: '🎨' },
              { id: 'payments', name: 'Payments', icon: '💳' },
              { id: 'notifications', name: 'Notifications', icon: '🔔' },
              { id: 'contact', name: 'Contact Info', icon: '📞' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-4 px-6 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Appearance Settings */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Appearance Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {settingsByCategory.appearance.map(setting => (
                  <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {setting.description || setting.setting_key.replace(/_/g, ' ')}
                    </label>
                    {renderSettingField(setting)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Settings */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Payment Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {settingsByCategory.payments.map(setting => (
                  <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {setting.description || setting.setting_key.replace(/_/g, ' ')}
                    </label>
                    {renderSettingField(setting)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notification Settings */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Notification Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {settingsByCategory.notifications.map(setting => (
                  <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {setting.description || setting.setting_key.replace(/_/g, ' ')}
                    </label>
                    {renderSettingField(setting)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact Settings */}
          {activeTab === 'contact' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {settingsByCategory.contact.map(setting => (
                  <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {setting.description || setting.setting_key.replace(/_/g, ' ')}
                    </label>
                    {renderSettingField(setting)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* System Information */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600">Total Settings</div>
            <div className="text-2xl font-bold text-blue-600">{safeSettings.length}</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600">Modified Settings</div>
            <div className="text-2xl font-bold text-orange-600">{Object.keys(settingsUpdates).length}</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600">Last Updated</div>
            <div className="text-lg font-semibold text-gray-900">
              {safeSettings.length > 0 
                ? new Date(Math.max(...safeSettings.map(s => new Date(s.updated_at || s.created_at)))).toLocaleDateString()
                : 'Never'
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;