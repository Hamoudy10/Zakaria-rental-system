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
  const [companyInfo, setCompanyInfo] = useState({
    name: 'Zakaria Housing Agency Limited',
    email: '',
    phone: '',
    address: '',
    logo: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch all settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await API.settings.getSettings();
      const settingsData = response.data.settings || response.data.data || [];
      setSettings(settingsData);
      
      // Also extract company info from settings
      const companySettings = settingsData.filter(s => s.key.startsWith('company_'));
      if (companySettings.length > 0) {
        const info = {};
        companySettings.forEach(s => {
          const cleanKey = s.key.replace('company_', '');
          info[cleanKey] = s.value || '';
        });
        setCompanyInfo(prev => ({ ...prev, ...info }));
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('Failed to fetch settings. Please check your connection.');
      setSettings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch company info specifically
  const fetchCompanyInfo = useCallback(async () => {
    try {
      const response = await API.settings.getCompanyInfo();
      if (response.data.success) {
        setCompanyInfo(response.data.data);
      }
      return response.data;
    } catch (err) {
      console.error('Error fetching company info:', err);
      throw err;
    }
  }, []);

  // Update company info (with optional logo)
  const updateCompanyInfo = useCallback(async (formData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await API.settings.updateCompanyInfo(formData);
      if (response.data.success) {
        setCompanyInfo(response.data.data);
      }
      return response.data;
    } catch (err) {
      console.error('Error updating company info:', err);
      const errorMsg = err.response?.data?.message || 'Failed to update company info';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete company logo
  const deleteCompanyLogo = useCallback(async () => {
    setLoading(true);
    try {
      const response = await API.settings.deleteCompanyLogo();
      if (response.data.success) {
        setCompanyInfo(prev => ({ ...prev, logo: '' }));
      }
      return response.data;
    } catch (err) {
      console.error('Error deleting company logo:', err);
      throw err;
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
    if (!Array.isArray(settings)) return {};
    
    const categories = {
      company: settings.filter(s => s.key.startsWith('company_')),
      billing: settings.filter(s => 
        s.key === 'billing_day' || 
        s.key === 'paybill_number' || 
        s.key === 'late_fee_percentage' ||
        s.key === 'grace_period_days' ||
        s.key === 'auto_billing_enabled' ||
        s.key === 'sms_enabled' ||
        s.key === 'sms_billing_template'
      ),
      mpesa: settings.filter(s => s.key.includes('mpesa_')),
      profile: [],
      appearance: []
    };
    
    return categories;
  }, [settings]);

  const value = React.useMemo(() => ({
    settings,
    companyInfo,
    loading,
    error,
    fetchSettings,
    fetchCompanyInfo,
    updateCompanyInfo,
    deleteCompanyLogo,
    updateSetting,
    updateMultipleSettings,
    resetToDefaults,
    getSetting,
    getSettingsByCategory,
    clearError: () => setError(null)
  }), [
    settings,
    companyInfo,
    loading,
    error,
    fetchSettings,
    fetchCompanyInfo,
    updateCompanyInfo,
    deleteCompanyLogo,
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