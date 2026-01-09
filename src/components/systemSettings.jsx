import React, { useState, useEffect, useMemo } from 'react';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { useAuth } from '../context/AuthContext';
import { API } from '../services/api';

const SystemSettings = () => {
  const {
    settings,
    loading,
    error,
    fetchSettings,
    updateMultipleSettings,
    resetToDefaults,
    getSettingsByCategory,
    clearError
  } = useSystemSettings();

  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('billing');
  const [settingsUpdates, setSettingsUpdates] = useState({});
  const [saveStatus, setSaveStatus] = useState('');

  // Profile form state
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: ''
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [profileSaveStatus, setProfileSaveStatus] = useState('');

  const safeSettings = Array.isArray(settings) ? settings : [];

  /* ---------------- Load settings and profile ---------------- */
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (user) {
      setProfileData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        phone_number: user.phone_number || ''
      });
    }
  }, [user]);

  /* ---------------- Dirty state ---------------- */
  const isDirty = useMemo(
    () => Object.keys(settingsUpdates).length > 0,
    [settingsUpdates]
  );

  /* ---------------- Settings Handlers ---------------- */
  const handleSettingChange = (key, value) => {
    const original = safeSettings.find(s => s.key === key)?.value;

    setSettingsUpdates(prev => {
      if (value === original) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: value };
    });
  };

  const handleSaveSettings = async () => {
    if (!isDirty) return;

    clearError();
    setSaveStatus('saving');

    try {
      await updateMultipleSettings(settingsUpdates);
      setSettingsUpdates({});
      setSaveStatus('saved');

      setTimeout(() => setSaveStatus(''), 2500);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
  };

  const handleDiscardChanges = () => {
    if (window.confirm('Discard all unsaved changes?')) {
      setSettingsUpdates({});
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('Reset all settings to system defaults?')) return;

    clearError();
    await resetToDefaults();
    setSettingsUpdates({});
  };

  /* ---------------- Profile Handlers ---------------- */
  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async () => {
    setProfileSaveStatus('saving');

    try {
      await API.users.updateProfile({
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        email: profileData.email,
        phone_number: profileData.phone_number
      });

      setProfileSaveStatus('saved');
      setTimeout(() => setProfileSaveStatus(''), 2500);
    } catch (err) {
      console.error('Profile update error:', err);
      setProfileSaveStatus('error');
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match!');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      alert('Password must be at least 6 characters!');
      return;
    }

    setProfileSaveStatus('saving');

    try {
      await API.users.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });

      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      setProfileSaveStatus('saved');
      setTimeout(() => setProfileSaveStatus(''), 2500);
    } catch (err) {
      console.error('Password change error:', err);
      setProfileSaveStatus('error');
      alert(err.response?.data?.message || 'Failed to change password');
    }
  };

  const settingsByCategory = getSettingsByCategory();

  /* ---------------- Field renderer ---------------- */
  const renderSettingField = (setting) => {
    const currentValue = settingsUpdates[setting.key] ?? setting.value;

    switch (setting.key) {
      // Boolean settings
      case 'sms_enabled':
      case 'auto_billing_enabled':
        return (
          <label className="inline-flex items-center gap-3">
            <input
              type="checkbox"
              checked={currentValue === true || currentValue === 'true'}
              onChange={(e) =>
                handleSettingChange(setting.key, e.target.checked.toString())
              }
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">
              {currentValue === true || currentValue === 'true' ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        );

      // Billing day dropdown
      case 'billing_day':
        return (
          <div className="space-y-2">
            <select
              value={currentValue || 28}
              onChange={(e) =>
                handleSettingChange(setting.key, parseInt(e.target.value))
              }
              className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500">Day of month for automatic billing (1-28)</p>
          </div>
        );

      // Late fee percentage
      case 'late_fee_percentage':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={currentValue || 5}
                onChange={(e) =>
                  handleSettingChange(setting.key, parseFloat(e.target.value))
                }
                className="w-24 border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-gray-600">%</span>
            </div>
            <p className="text-xs text-gray-500">Percentage applied to overdue payments (0-50%)</p>
          </div>
        );

      // Grace period days
      case 'grace_period_days':
        return (
          <div className="space-y-2">
            <input
              type="number"
              min="0"
              max="30"
              value={currentValue || 5}
              onChange={(e) =>
                handleSettingChange(setting.key, parseInt(e.target.value))
              }
              className="w-24 border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500">Days before late fee is applied (0-30)</p>
          </div>
        );

      // Paybill numbers
      case 'paybill_number':
      case 'mpesa_paybill_number':
        return (
          <div className="space-y-2">
            <input
              type="text"
              value={currentValue || ''}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                if (value.length <= 10) {
                  handleSettingChange(setting.key, value);
                }
              }}
              placeholder="e.g., 123456"
              className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500">
              {setting.key === 'paybill_number' 
                ? 'Business paybill number (5-10 digits)' 
                : 'M-Pesa paybill number (5-10 digits)'}
            </p>
          </div>
        );

      // SMS template
      case 'sms_billing_template':
        return (
          <div className="space-y-2">
            <textarea
              value={currentValue || ''}
              onChange={(e) =>
                handleSettingChange(setting.key, e.target.value)
              }
              rows={6}
              className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
            <div className="text-xs text-gray-500">
              <p className="font-medium mb-1">Available variables:</p>
              <div className="grid grid-cols-2 gap-1">
                <code className="bg-gray-100 px-2 py-1 rounded">{"{tenantName}"}</code>
                <code className="bg-gray-100 px-2 py-1 rounded">{"{month}"}</code>
                <code className="bg-gray-100 px-2 py-1 rounded">{"{unitCode}"}</code>
                <code className="bg-gray-100 px-2 py-1 rounded">{"{rent}"}</code>
                <code className="bg-gray-100 px-2 py-1 rounded">{"{water}"}</code>
                <code className="bg-gray-100 px-2 py-1 rounded">{"{arrears}"}</code>
                <code className="bg-gray-100 px-2 py-1 rounded">{"{total}"}</code>
                <code className="bg-gray-100 px-2 py-1 rounded">{"{paybill}"}</code>
              </div>
            </div>
          </div>
        );

      // M-Pesa secret fields
      case 'mpesa_passkey':
      case 'mpesa_consumer_secret':
        return (
          <div className="space-y-2">
            <div className="relative">
              <input
                type="password"
                value={currentValue || ''}
                onChange={(e) =>
                  handleSettingChange(setting.key, e.target.value)
                }
                placeholder="••••••••••"
                className="w-full border rounded p-2 pr-10 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={(e) => {
                  const input = e.target.previousElementSibling;
                  input.type = input.type === 'password' ? 'text' : 'password';
                }}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                👁
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {setting.key === 'mpesa_passkey' 
                ? 'M-Pesa Lipa Na M-Pesa passkey' 
                : 'M-Pesa consumer secret for API access'}
            </p>
          </div>
        );

      // Default text input
      default:
        return (
          <input
            type="text"
            value={currentValue || ''}
            onChange={(e) =>
              handleSettingChange(setting.key, e.target.value)
            }
            className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        );
    }
  };

  /* ---------------- Render Tab Content ---------------- */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'billing':
      case 'mpesa':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {settingsByCategory[activeTab]?.length > 0 ? (
              settingsByCategory[activeTab].map(setting => (
                <div 
                  key={setting.key} 
                  className="space-y-2 p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <label className="block text-sm font-medium text-gray-900">
                    {setting.description || setting.key.replace(/_/g, ' ')}
                  </label>
                  {renderSettingField(setting)}
                  {setting.updated_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      Last updated: {new Date(setting.updated_at).toLocaleString()}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-2 text-center py-12">
                <p className="text-gray-500">No settings found for this category.</p>
              </div>
            )}
          </div>
        );

      case 'profile':
        return (
          <div className="max-w-2xl space-y-8">
            {/* Profile Information */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Profile Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={profileData.first_name}
                    onChange={handleProfileChange}
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={profileData.last_name}
                    onChange={handleProfileChange}
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={profileData.email}
                    onChange={handleProfileChange}
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone_number"
                    value={profileData.phone_number}
                    onChange={handleProfileChange}
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={profileSaveStatus === 'saving'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
              >
                {profileSaveStatus === 'saving' ? 'Saving...' : 'Save Profile'}
              </button>
            </div>

            {/* Change Password */}
            <div className="space-y-6 pt-6 border-t">
              <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleChangePassword}
                disabled={profileSaveStatus === 'saving' || !passwordData.currentPassword || !passwordData.newPassword}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
              >
                {profileSaveStatus === 'saving' ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="text-center py-16">
            <div className="inline-block p-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border-2 border-dashed border-blue-300">
              <div className="text-6xl mb-4">🎨</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Appearance Settings</h3>
              <p className="text-gray-600 mb-4">Coming Soon</p>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Customize your system's look and feel with themes, colors, and branding options.
                This feature is currently under development.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  /* ---------------- Main UI ---------------- */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">System Settings</h2>
          <p className="text-gray-600">Manage application configuration and preferences</p>
        </div>

        {activeTab !== 'profile' && activeTab !== 'appearance' && (
          <button
            onClick={handleResetDefaults}
            className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            Reset to defaults
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-300 text-red-700 p-4 rounded-lg">
          <div className="flex justify-between items-start">
            <span className="font-medium">Error: {error}</span>
            <button
              onClick={clearError}
              className="text-red-600 hover:text-red-800"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b px-6">
          <div className="flex gap-6 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300">
            {[
              { id: 'billing', name: 'Billing & Payments' },
              { id: 'mpesa', name: 'M-Pesa Integration' },
              { id: 'profile', name: 'Admin Profile' },
              { id: 'appearance', name: 'Appearance' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {renderTabContent()}
        </div>
      </div>

      {/* Sticky save bar for settings tabs only */}
      {isDirty && (activeTab === 'billing' || activeTab === 'mpesa') && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 z-50">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-gray-700">
              You have unsaved changes
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDiscardChanges}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={saveStatus === 'saving'}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                saveStatus === 'saving'
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Success notifications */}
      {saveStatus === 'saved' && (
        <div className="fixed bottom-4 right-4 bg-green-100 border border-green-300 text-green-700 px-4 py-2 rounded-lg shadow-lg animate-fade-in-out">
          ✓ Settings saved successfully
        </div>
      )}

      {profileSaveStatus === 'saved' && (
        <div className="fixed bottom-4 right-4 bg-green-100 border border-green-300 text-green-700 px-4 py-2 rounded-lg shadow-lg animate-fade-in-out">
          ✓ Profile updated successfully
        </div>
      )}

      {/* Error notifications */}
      {saveStatus === 'error' && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg shadow-lg">
          ✗ Failed to save settings
        </div>
      )}

      {profileSaveStatus === 'error' && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg shadow-lg">
          ✗ Failed to update profile
        </div>
      )}
    </div>
  );
};

export default SystemSettings;