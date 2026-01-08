import React, { useState, useEffect, useMemo } from 'react';
import { useSystemSettings } from '../context/SystemSettingsContext';

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

  const [activeTab, setActiveTab] = useState('billing'); // Default to billing tab
  const [settingsUpdates, setSettingsUpdates] = useState({});
  const [saveStatus, setSaveStatus] = useState('');

  const safeSettings = Array.isArray(settings) ? settings : [];

  /* ---------------- Load settings ---------------- */
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /* ---------------- Dirty state ---------------- */
  const isDirty = useMemo(
    () => Object.keys(settingsUpdates).length > 0,
    [settingsUpdates]
  );

  /* ---------------- Handlers ---------------- */
  const handleSettingChange = (key, value) => {
    const original = safeSettings.find(s => s.key === key)?.value;

    setSettingsUpdates(prev => {
      // If value matches original, remove from updates
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

  const settingsByCategory = getSettingsByCategory();

  /* ---------------- Field renderer ---------------- */
  const renderSettingField = (setting) => {
    const currentValue =
      settingsUpdates[setting.key] ?? setting.value;

    switch (setting.key) {
      // Color settings
      case 'primary_color':
      case 'secondary_color':
        return (
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={currentValue || '#3B82F6'}
              onChange={(e) =>
                handleSettingChange(setting.key, e.target.value)
              }
              className="w-12 h-12 border rounded cursor-pointer"
            />
            <span className="text-sm text-gray-600">{currentValue || '#3B82F6'}</span>
          </div>
        );

      // Boolean settings
      case 'sms_enabled':
      case 'auto_confirm_payments':
      case 'auto_billing_enabled':
        return (
          <label className="inline-flex items-center gap-3">
            <input
              type="checkbox"
              checked={currentValue === true || currentValue === 'true'}
              onChange={(e) =>
                handleSettingChange(
                  setting.key,
                  e.target.checked.toString()
                )
              }
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">
              {currentValue === true || currentValue === 'true' ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        );

      // Number settings with validation
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

      // Paybill number with validation
      case 'paybill_number':
      case 'mpesa_paybill_number':
        return (
          <div className="space-y-2">
            <input
              type="text"
              value={currentValue || ''}
              onChange={(e) => {
                // Only allow digits
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
                : 'M-Pesa paybill number'}
            </p>
          </div>
        );

      // Textarea for SMS template
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

      // M-Pesa secret fields (masked)
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  /* ---------------- UI ---------------- */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">System Settings</h2>
          <p className="text-gray-600">Manage application configuration and billing system</p>
        </div>

        <button
          onClick={handleResetDefaults}
          className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
        >
          Reset to defaults
        </button>
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
            {['billing', 'sms', 'mpesa', 'appearance', 'general'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {settingsByCategory[activeTab]?.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {settingsByCategory[activeTab].map(setting => (
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
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No settings found for this category.</p>
            </div>
          )}
        </div>
      </div>

      {/* Sticky save bar */}
      {isDirty && (
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

      {saveStatus === 'saved' && (
        <div className="fixed bottom-4 right-4 bg-green-100 border border-green-300 text-green-700 px-4 py-2 rounded-lg shadow-lg animate-fade-in-out">
          ✓ Settings saved successfully
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg shadow-lg">
          ✗ Failed to save settings
        </div>
      )}
    </div>
  );
};

export default SystemSettings;