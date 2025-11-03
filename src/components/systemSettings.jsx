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
              className="w-10 h-10 md:w-12 md:h-12 rounded border border-gray-300 touch-manipulation"
            />
            <span className="text-sm text-gray-600 truncate">{currentValue}</span>
          </div>
        );
      
      case 'sms_enabled':
      case 'auto_confirm_payments':
        return (
          <label className="relative inline-flex items-center cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={currentValue === 'true'}
              onChange={(e) => handleSettingChange(setting.setting_key, e.target.checked.toString())}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 touch-manipulation"></div>
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
            className="w-full md:w-32 p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
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
            className="w-full md:w-32 p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
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
            className="w-full p-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
            placeholder={`Enter ${setting.setting_key.replace(/_/g, ' ')}`}
          />
        );
    }
  };

  if (loading && safeSettings.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500 text-sm md:text-base">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">System Settings</h2>
          <p className="text-sm md:text-base text-gray-600">Configure system preferences and behavior</p>
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
          <button
            onClick={handleResetDefaults}
            className="bg-gray-500 text-white px-4 py-3 rounded-md hover:bg-gray-600 text-sm md:text-base min-h-[44px] touch-manipulation transition-colors w-full sm:w-auto"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSaveSettings}
            disabled={Object.keys(settingsUpdates).length === 0}
            className="bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base min-h-[44px] touch-manipulation transition-colors w-full sm:w-auto"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Error and Success Messages */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
          {error}
          <button 
            onClick={clearError}
            className="float-right text-red-800 font-bold text-lg"
          >
            ×
          </button>
        </div>
      )}

      {saveStatus === 'saved' && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 text-sm">
          Settings saved successfully!
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
          Error saving settings. Please try again.
        </div>
      )}

      {/* Settings Tabs - Mobile Optimized */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="border-b border-gray-200">
          <div className="overflow-x-auto">
            <nav className="flex space-x-4 md:space-x-8 min-w-max px-3 md:px-4">
              {[
                { id: 'appearance', name: 'Appearance', icon: '🎨' },
                { id: 'payments', name: 'Payments', icon: '💳' },
                { id: 'notifications', name: 'Notifications', icon: '🔔' },
                { id: 'contact', name: 'Contact Info', icon: '📞' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap flex items-center py-3 md:py-4 px-2 md:px-1 border-b-2 font-medium text-xs md:text-sm min-h-[44px] touch-manipulation ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-1 md:mr-2 text-sm md:text-base">{tab.icon}</span>
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="p-4 md:p-6">
          {/* Appearance Settings */}
          {activeTab === 'appearance' && (
            <div className="space-y-4 md:space-y-6">
              <h3 className="text-base md:text-lg font-semibold">Appearance Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {settingsByCategory.appearance?.map(setting => (
                  <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {setting.description || setting.setting_key.replace(/_/g, ' ')}
                    </label>
                    {renderSettingField(setting)}
                  </div>
                )) || (
                  <div className="col-span-2 text-center py-4 text-gray-500">
                    No appearance settings found
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Settings */}
          {activeTab === 'payments' && (
            <div className="space-y-4 md:space-y-6">
              <h3 className="text-base md:text-lg font-semibold">Payment Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {settingsByCategory.payments?.map(setting => (
                  <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {setting.description || setting.setting_key.replace(/_/g, ' ')}
                    </label>
                    {renderSettingField(setting)}
                  </div>
                )) || (
                  <div className="col-span-2 text-center py-4 text-gray-500">
                    No payment settings found
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notification Settings */}
          {activeTab === 'notifications' && (
            <div className="space-y-4 md:space-y-6">
              <h3 className="text-base md:text-lg font-semibold">Notification Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {settingsByCategory.notifications?.map(setting => (
                  <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {setting.description || setting.setting_key.replace(/_/g, ' ')}
                    </label>
                    {renderSettingField(setting)}
                  </div>
                )) || (
                  <div className="col-span-2 text-center py-4 text-gray-500">
                    No notification settings found
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Contact Settings */}
          {activeTab === 'contact' && (
            <div className="space-y-4 md:space-y-6">
              <h3 className="text-base md:text-lg font-semibold">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {settingsByCategory.contact?.map(setting => (
                  <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {setting.description || setting.setting_key.replace(/_/g, ' ')}
                    </label>
                    {renderSettingField(setting)}
                  </div>
                )) || (
                  <div className="col-span-2 text-center py-4 text-gray-500">
                    No contact settings found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* System Information - Mobile Responsive */}
      <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold mb-4">System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600">Total Settings</div>
            <div className="text-xl md:text-2xl font-bold text-blue-600">{safeSettings.length}</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600">Modified Settings</div>
            <div className="text-xl md:text-2xl font-bold text-orange-600">{Object.keys(settingsUpdates).length}</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600">Last Updated</div>
            <div className="text-base md:text-lg font-semibold text-gray-900">
              {safeSettings.length > 0 
                ? new Date(Math.max(...safeSettings.map(s => new Date(s.updated_at || s.created_at)))).toLocaleDateString()
                : 'Never'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Warning */}
      {Object.keys(settingsUpdates).length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:bottom-4 md:w-80 bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                Unsaved Changes
              </h3>
              <div className="mt-1 text-sm text-yellow-700">
                You have {Object.keys(settingsUpdates).length} unsaved setting{Object.keys(settingsUpdates).length !== 1 ? 's' : ''}. 
                Don't forget to save your changes.
              </div>
              <div className="mt-2">
                <button
                  onClick={handleSaveSettings}
                  className="bg-yellow-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-yellow-700 transition-colors min-h-[32px] touch-manipulation"
                >
                  Save Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemSettings;