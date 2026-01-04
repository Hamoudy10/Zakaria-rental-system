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

  const [activeTab, setActiveTab] = useState('appearance');
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
    const original = safeSettings.find(s => s.setting_key === key)?.setting_value;

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
      settingsUpdates[setting.setting_key] ?? setting.setting_value;

    switch (setting.setting_key) {
      case 'primary_color':
      case 'secondary_color':
        return (
          <input
            type="color"
            value={currentValue}
            onChange={(e) =>
              handleSettingChange(setting.setting_key, e.target.value)
            }
            className="w-12 h-12 border rounded"
          />
        );

      case 'sms_enabled':
      case 'auto_confirm_payments':
        return (
          <label className="inline-flex items-center gap-3">
            <input
              type="checkbox"
              checked={currentValue === 'true'}
              onChange={(e) =>
                handleSettingChange(
                  setting.setting_key,
                  e.target.checked.toString()
                )
              }
            />
            <span className="text-sm text-gray-600">
              {currentValue === 'true' ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        );

      case 'default_rent_due_day':
        return (
          <select
            value={currentValue}
            onChange={(e) =>
              handleSettingChange(setting.setting_key, e.target.value)
            }
            className="border rounded p-2"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        );

      default:
        return (
          <input
            type="text"
            value={currentValue || ''}
            onChange={(e) =>
              handleSettingChange(setting.setting_key, e.target.value)
            }
            className="w-full border rounded p-2"
          />
        );
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading settings…</div>;
  }

  /* ---------------- UI ---------------- */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">System Settings</h2>
          <p className="text-gray-600">Manage application configuration</p>
        </div>

        <button
          onClick={handleResetDefaults}
          className="text-sm text-red-600 hover:underline"
        >
          Reset to defaults
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-300 text-red-700 p-3 rounded">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded shadow">
        <div className="border-b flex gap-6 px-6">
          {['appearance', 'payments', 'notifications', 'contact'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 text-sm font-medium border-b-2 ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsByCategory[activeTab]?.map(setting => (
            <div key={setting.setting_key}>
              <label className="block text-sm font-medium mb-1">
                {setting.description || setting.setting_key}
              </label>
              {renderSettingField(setting)}
            </div>
          ))}
        </div>
      </div>

      {/* Sticky save bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-6 py-4 flex justify-between items-center">
          <span className="text-sm text-gray-600">
            You have unsaved changes
          </span>
          <div className="flex gap-3">
            <button
              onClick={handleDiscardChanges}
              className="px-4 py-2 border rounded"
            >
              Discard
            </button>
            <button
              onClick={handleSaveSettings}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemSettings;
