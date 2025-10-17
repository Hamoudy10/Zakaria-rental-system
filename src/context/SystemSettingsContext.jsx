import React, { createContext, useState, useContext, useCallback } from 'react';
import { settingsAPI } from '../services/api';

const SystemSettingsContext = createContext(undefined);

export const useSystemSettings = () => {
  const context = useContext(SystemSettingsContext);
  if (context === undefined) {
    throw new Error('useSystemSettings must be used within a SystemSettingsProvider');
  }
  return context;
};

export const SystemSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch all settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await settingsAPI.getSettings();
      setSettings(response.data.settings || []);
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('Failed to fetch settings');
      setSettings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update setting
  const updateSetting = useCallback(async (settingKey, newValue) => {
    setLoading(true);
    setError(null);
    try {
      // Simulate API call until backend is implemented
      setSettings(prev => prev.map(setting => 
        setting.setting_key === settingKey 
          ? { ...setting, setting_value: newValue, updated_at: new Date().toISOString() }
          : setting
      ));
      
      // In real app: await settingsAPI.updateSetting(settingKey, newValue);
      return { success: true, message: 'Setting updated successfully' };
    } catch (err) {
      console.error('Error updating setting:', err);
      setError('Failed to update setting');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update multiple settings
  const updateMultipleSettings = useCallback(async (settingsUpdates) => {
    setLoading(true);
    setError(null);
    try {
      Object.entries(settingsUpdates).forEach(([key, value]) => {
        setSettings(prev => prev.map(setting => 
          setting.setting_key === key 
            ? { ...setting, setting_value: value, updated_at: new Date().toISOString() }
            : setting
        ));
      });
      
      return { success: true, message: 'Settings updated successfully' };
    } catch (err) {
      console.error('Error updating settings:', err);
      setError('Failed to update settings');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset settings to defaults
  const resetToDefaults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const defaultSettings = [
        { setting_key: 'primary_color', setting_value: '#3B82F6', description: 'Primary brand color' },
        { setting_key: 'secondary_color', setting_value: '#1E40AF', description: 'Secondary brand color' },
        { setting_key: 'company_name', setting_value: 'Zakaria Rental System', description: 'Company name' },
        { setting_key: 'default_rent_due_day', setting_value: '5', description: 'Default rent due day' },
        { setting_key: 'default_grace_period', setting_value: '7', description: 'Default grace period in days' },
        { setting_key: 'mpesa_paybill_number', setting_value: '123456', description: 'M-Pesa paybill number' },
        { setting_key: 'sms_enabled', setting_value: 'true', description: 'Enable SMS notifications' },
        { setting_key: 'auto_confirm_payments', setting_value: 'true', description: 'Auto-confirm M-Pesa payments' },
        { setting_key: 'maintenance_email', setting_value: 'maintenance@zakariarentals.com', description: 'Maintenance email' },
        { setting_key: 'support_phone', setting_value: '+254700000000', description: 'Support phone number' }
      ];
      
      setSettings(defaultSettings);
      return { success: true, message: 'Settings reset to defaults' };
    } catch (err) {
      console.error('Error resetting settings:', err);
      setError('Failed to reset settings');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get setting value by key
  const getSetting = useCallback((key) => {
    const setting = settings.find(s => s.setting_key === key);
    return setting ? setting.setting_value : null;
  }, [settings]);

  // Get settings by category
  const getSettingsByCategory = useCallback(() => {
    const categories = {
      appearance: settings.filter(s => 
        s.setting_key.includes('color') || 
        s.setting_key.includes('company')
      ),
      payments: settings.filter(s => 
        s.setting_key.includes('rent') || 
        s.setting_key.includes('mpesa') || 
        s.setting_key.includes('payment')
      ),
      notifications: settings.filter(s => 
        s.setting_key.includes('sms') || 
        s.setting_key.includes('email') || 
        s.setting_key.includes('auto')
      ),
      contact: settings.filter(s => 
        s.setting_key.includes('email') || 
        s.setting_key.includes('phone') || 
        s.setting_key.includes('support')
      )
    };
    
    return categories;
  }, [settings]);

  const value = React.useMemo(() => ({
    settings,
    loading,
    error,
    fetchSettings,
    updateSetting,
    updateMultipleSettings,
    resetToDefaults,
    getSetting,
    getSettingsByCategory,
    clearError: () => setError(null)
  }), [
    settings,
    loading,
    error,
    fetchSettings,
    updateSetting,
    updateMultipleSettings,
    resetToDefaults,
    getSetting,
    getSettingsByCategory
  ]);

  return (
    <SystemSettingsContext.Provider value={value}>
      {children}
    </SystemSettingsContext.Provider>
  );
};