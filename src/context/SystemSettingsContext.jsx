import React, { createContext, useState, useContext, useCallback } from 'react';
import { API } from '../services/api';

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
      const response = await API.settings.getSettings();
      // The backend returns settings in response.data.settings
      const settingsData = response.data.settings || [];
      setSettings(settingsData);
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('Failed to fetch settings. Please check your connection.');
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
      await API.settings.updateSetting(settingKey, newValue);
      
      // Update local state
      setSettings(prev => prev.map(setting => 
        setting.key === settingKey 
          ? { ...setting, value: newValue, updated_at: new Date().toISOString() }
          : setting
      ));
      
      return { success: true, message: 'Setting updated successfully' };
    } catch (err) {
      console.error('Error updating setting:', err);
      const errorMsg = err.response?.data?.message || 'Failed to update setting';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update multiple settings
  const updateMultipleSettings = useCallback(async (settingsUpdates) => {
    setLoading(true);
    setError(null);
    try {
      await API.settings.updateMultipleSettings(settingsUpdates);
      
      // Update local state
      setSettings(prev => prev.map(setting => {
        if (settingsUpdates[setting.key] !== undefined) {
          return { 
            ...setting, 
            value: settingsUpdates[setting.key], 
            updated_at: new Date().toISOString() 
          };
        }
        return setting;
      }));
      
      return { success: true, message: 'Settings updated successfully' };
    } catch (err) {
      console.error('Error updating settings:', err);
      const errorMsg = err.response?.data?.message || 'Failed to update settings';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset settings to defaults
  const resetToDefaults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await API.settings.resetToDefaults();
      // Refresh settings after reset
      await fetchSettings();
      return { success: true, message: 'Settings reset to defaults' };
    } catch (err) {
      console.error('Error resetting settings:', err);
      const errorMsg = err.response?.data?.message || 'Failed to reset settings';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [fetchSettings]);

  // Get setting value by key
  const getSetting = useCallback((key) => {
    const setting = settings.find(s => s.key === key);
    return setting ? setting.value : null;
  }, [settings]);

  // Get settings by category
  const getSettingsByCategory = useCallback(() => {
    // First, ensure settings is an array
    if (!Array.isArray(settings)) return {};
    
    const categories = {
      // Billing settings
      billing: settings.filter(s => 
        s.key === 'billing_day' || 
        s.key === 'paybill_number' || 
        s.key === 'company_name' ||
        s.key === 'late_fee_percentage' ||
        s.key === 'grace_period_days' ||
        s.key === 'auto_billing_enabled' ||
        s.key === 'sms_billing_template'
      ),
      
      // SMS settings
      sms: settings.filter(s => 
        s.key.includes('sms_') && 
        s.key !== 'sms_billing_template'
      ),
      
      // M-Pesa settings
      mpesa: settings.filter(s => s.key.includes('mpesa_')),
      
      // Fees settings
      fees: settings.filter(s => 
        s.key === 'late_fee_percentage' || 
        s.key === 'grace_period_days'
      ),
      
      // General settings
      general: settings.filter(s => 
        !s.key.includes('sms_') && 
        !s.key.includes('mpesa_') && 
        s.key !== 'billing_day' && 
        s.key !== 'paybill_number' &&
        s.key !== 'company_name' && 
        s.key !== 'late_fee_percentage' && 
        s.key !== 'grace_period_days' &&
        s.key !== 'auto_billing_enabled' &&
        s.key !== 'sms_billing_template'
      )
    };
    
    // Merge fees into billing for display
    categories.billing = [...categories.billing, ...categories.fees];
    
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