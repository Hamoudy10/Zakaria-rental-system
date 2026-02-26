import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

const SystemSettings = () => {
  const {
    settings,
    companyInfo,
    loading,
    error,
    fetchSettings,
    fetchCompanyInfo,
    updateCompanyInfo,
    deleteCompanyLogo,
    updateMultipleSettings,
    resetToDefaults,
    getSettingsByCategory,
    clearError
  } = useSystemSettings();

  const { user, updateUserProfile, refreshUser } = useAuth();

  const [activeTab, setActiveTab] = useState('company');
  const [settingsUpdates, setSettingsUpdates] = useState({});
  const [saveStatus, setSaveStatus] = useState('');

  // Company info form state
  const [companyFormData, setCompanyFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [selectedLogo, setSelectedLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [companyMessage, setCompanyMessage] = useState({ type: '', text: '' });
  const [companySaveStatus, setCompanySaveStatus] = useState('');
  const logoInputRef = useRef(null);

  // Profile form state
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: ''
  });
  const [selectedProfileImage, setSelectedProfileImage] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(null);
  const [isDraggingProfile, setIsDraggingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
  const [profileSaveStatus, setProfileSaveStatus] = useState('');
  const profileInputRef = useRef(null);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const safeSettings = Array.isArray(settings) ? settings : [];

  /* ---------------- Load settings and profile ---------------- */
  useEffect(() => {
    fetchSettings();
    if (fetchCompanyInfo) {
      fetchCompanyInfo().catch(console.error);
    }
  }, [fetchSettings, fetchCompanyInfo]);

  useEffect(() => {
    if (companyInfo) {
      setCompanyFormData({
        name: companyInfo.name || '',
        email: companyInfo.email || '',
        phone: companyInfo.phone || '',
        address: companyInfo.address || ''
      });
      setLogoPreview(companyInfo.logo || null);
    }
  }, [companyInfo]);

  useEffect(() => {
    if (user) {
      setProfileData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        phone_number: user.phone_number || ''
      });
      setProfileImagePreview(user.profile_image || null);
    }
  }, [user]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (companyMessage.text) {
      const timer = setTimeout(() => setCompanyMessage({ type: '', text: '' }), 5000);
      return () => clearTimeout(timer);
    }
  }, [companyMessage]);

  useEffect(() => {
    if (profileMessage.text) {
      const timer = setTimeout(() => setProfileMessage({ type: '', text: '' }), 5000);
      return () => clearTimeout(timer);
    }
  }, [profileMessage]);

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

  /* ---------------- Company Info Handlers ---------------- */
  const handleCompanyFormChange = (e) => {
    const { name, value } = e.target;
    setCompanyFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateLogo = (file) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      setCompanyMessage({ type: 'error', text: 'Invalid file type. Please upload JPEG, PNG, or WebP images only.' });
      return false;
    }

    if (file.size > maxSize) {
      setCompanyMessage({ type: 'error', text: 'File too large. Maximum size is 5MB.' });
      return false;
    }

    return true;
  };

  const handleLogoSelect = (file) => {
    if (!file) return;
    if (!validateLogo(file)) return;

    setSelectedLogo(file);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result);
    };
    reader.readAsDataURL(file);
    
    setCompanyMessage({ type: 'info', text: 'Logo selected. Click "Save Company Info" to upload.' });
  };

  const handleLogoInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleLogoSelect(file);
  };

  const handleLogoDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingLogo(true);
  }, []);

  const handleLogoDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingLogo(false);
  }, []);

  const handleLogoDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleLogoDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingLogo(false);

    const file = e.dataTransfer.files?.[0];
    if (file) handleLogoSelect(file);
  }, []);

  const removeSelectedLogo = () => {
    setSelectedLogo(null);
    setLogoPreview(companyInfo?.logo || null);
    if (logoInputRef.current) logoInputRef.current.value = '';
    setCompanyMessage({ type: '', text: '' });
  };

  const handleDeleteCompanyLogo = async () => {
    if (!companyInfo?.logo) {
      setCompanyMessage({ type: 'error', text: 'No logo to delete.' });
      return;
    }

    if (!window.confirm('Are you sure you want to delete the company logo?')) return;

    setCompanySaveStatus('deleting');
    try {
      await deleteCompanyLogo();
      setLogoPreview(null);
      setSelectedLogo(null);
      setCompanyMessage({ type: 'success', text: 'Company logo deleted successfully!' });
    } catch (error) {
      setCompanyMessage({ type: 'error', text: error.message || 'Failed to delete logo.' });
    } finally {
      setCompanySaveStatus('');
    }
  };

  const handleSaveCompanyInfo = async () => {
    setCompanySaveStatus('saving');
    setCompanyMessage({ type: '', text: '' });

    try {
      const formData = new FormData();
      formData.append('name', companyFormData.name);
      formData.append('email', companyFormData.email);
      formData.append('phone', companyFormData.phone);
      formData.append('address', companyFormData.address);

      if (selectedLogo) {
        formData.append('company_logo', selectedLogo);
      }

      const response = await updateCompanyInfo(formData);

      if (response.success) {
        setCompanyMessage({ type: 'success', text: 'Company info updated successfully!' });
        setCompanySaveStatus('saved');
        setSelectedLogo(null);
        setTimeout(() => setCompanySaveStatus(''), 2500);
      } else {
        throw new Error(response.message || 'Failed to update company info');
      }
    } catch (err) {
      console.error('Company info update error:', err);
      setCompanySaveStatus('error');
      setCompanyMessage({ type: 'error', text: err.message || 'Failed to update company info.' });
    }
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

  const validateProfileImage = (file) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      setProfileMessage({ type: 'error', text: 'Invalid file type. Please upload JPEG, PNG, or WebP images only.' });
      return false;
    }

    if (file.size > maxSize) {
      setProfileMessage({ type: 'error', text: 'File too large. Maximum size is 5MB.' });
      return false;
    }

    return true;
  };

  const handleProfileImageSelect = (file) => {
    if (!file) return;
    if (!validateProfileImage(file)) return;

    setSelectedProfileImage(file);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfileImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
    
    setProfileMessage({ type: 'info', text: 'Image selected. Click "Save Profile" to upload.' });
  };

  const handleProfileImageInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleProfileImageSelect(file);
  };

  const handleProfileDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingProfile(true);
  }, []);

  const handleProfileDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingProfile(false);
  }, []);

  const handleProfileDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleProfileDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingProfile(false);

    const file = e.dataTransfer.files?.[0];
    if (file) handleProfileImageSelect(file);
  }, []);

  const removeSelectedProfileImage = () => {
    setSelectedProfileImage(null);
    setProfileImagePreview(user?.profile_image || null);
    if (profileInputRef.current) profileInputRef.current.value = '';
    setProfileMessage({ type: '', text: '' });
  };

  const handleSaveProfile = async () => {
    setProfileSaveStatus('saving');
    setProfileMessage({ type: '', text: '' });

    try {
      const formData = new FormData();
      formData.append('first_name', profileData.first_name);
      formData.append('last_name', profileData.last_name);
      formData.append('email', profileData.email);
      formData.append('phone_number', profileData.phone_number);

      if (selectedProfileImage) {
        formData.append('profile_image', selectedProfileImage);
      }

      const response = await updateUserProfile(formData);

      if (response.success) {
        setProfileMessage({ type: 'success', text: 'Profile updated successfully!' });
        setProfileSaveStatus('saved');
        setSelectedProfileImage(null);
        await refreshUser();
        setTimeout(() => setProfileSaveStatus(''), 2500);
      } else {
        throw new Error(response.message || 'Failed to update profile');
      }
    } catch (err) {
      console.error('Profile update error:', err);
      setProfileSaveStatus('error');
      setProfileMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
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
      await authAPI.changePassword({
        current_password: passwordData.currentPassword,
        new_password: passwordData.newPassword
      });

      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setProfileSaveStatus('saved');
      setProfileMessage({ type: 'success', text: 'Password changed successfully!' });
      setTimeout(() => setProfileSaveStatus(''), 2500);
    } catch (err) {
      console.error('Password change error:', err);
      setProfileSaveStatus('error');
      alert(err.response?.data?.message || 'Failed to change password');
    }
  };

  const settingsByCategory = getSettingsByCategory();

  // Get current paybill value from settings
  const getPaybillValue = () => {
    const paybillSetting = safeSettings.find(s => s.key === 'paybill_number');
    return settingsUpdates['paybill_number'] ?? paybillSetting?.value ?? '';
  };

  /* ---------------- Document Preview Component ---------------- */
  const DocumentPreview = () => (
    <div className="bg-white border-2 border-gray-300 rounded-lg p-6 shadow-inner max-w-md mx-auto">
      <div className="text-center border-b-2 border-gray-200 pb-4 mb-4">
        {/* Logo */}
        <div className="flex justify-center mb-3">
          {logoPreview ? (
            <img 
              src={logoPreview} 
              alt="Company Logo" 
              className="h-16 w-16 object-contain rounded-full border-2 border-gray-200"
            />
          ) : (
            <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
              {companyFormData.name?.charAt(0) || 'C'}
            </div>
          )}
        </div>
        
        {/* Company Name */}
        <h2 className="text-lg font-bold text-gray-900">
          {companyFormData.name || 'Company Name'}
        </h2>
        
        {/* Contact Info */}
        <div className="text-xs text-gray-600 mt-2 space-y-1">
          {companyFormData.address && <p>{companyFormData.address}</p>}
          <div className="flex justify-center gap-3 flex-wrap">
            {companyFormData.phone && <span>📞 {companyFormData.phone}</span>}
            {companyFormData.email && <span>✉️ {companyFormData.email}</span>}
          </div>
        </div>
      </div>
      
      {/* Sample Document Content */}
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-800 mb-2">OFFICIAL DOCUMENT</p>
        <div className="space-y-2">
          <div className="h-2 bg-gray-200 rounded w-3/4 mx-auto"></div>
          <div className="h-2 bg-gray-200 rounded w-1/2 mx-auto"></div>
          <div className="h-2 bg-gray-200 rounded w-2/3 mx-auto"></div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-200 text-center text-xs text-gray-400">
        <p>Generated by {companyFormData.name || 'Company'}</p>
        <p className="mt-1 italic">Preview of exported document header</p>
      </div>
    </div>
  );

  /* ---------------- Avatar Components ---------------- */
  const CompanyLogoDisplay = () => {
    const [imgError, setImgError] = useState(false);
    const hasLogo = logoPreview && !imgError;

    return (
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold overflow-hidden border-4 border-white shadow-lg">
        {hasLogo ? (
          <img 
            src={logoPreview} 
            alt="Company Logo" 
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span>{companyFormData.name?.charAt(0) || 'C'}</span>
        )}
      </div>
    );
  };

  const ProfileAvatarDisplay = () => {
    const [imgError, setImgError] = useState(false);
    const hasImage = profileImagePreview && !imgError;
    const initials = `${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`;

    return (
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold overflow-hidden border-4 border-white shadow-lg">
        {hasImage ? (
          <img 
            src={profileImagePreview} 
            alt="Profile" 
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span>{initials || 'AD'}</span>
        )}
      </div>
    );
  };

  /* ---------------- Message Alert Component ---------------- */
  const MessageAlert = ({ message }) => {
    if (!message.text) return null;

    const bgColor = message.type === 'success' 
      ? 'bg-green-50 border-green-200 text-green-800'
      : message.type === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : 'bg-blue-50 border-blue-200 text-blue-800';

    const icon = message.type === 'success' 
      ? '✓'
      : message.type === 'error'
      ? '✗'
      : 'ℹ';

    return (
      <div className={`p-4 rounded-lg border ${bgColor} mb-4`}>
        <div className="flex items-center space-x-2">
          <span className="text-lg">{icon}</span>
          <span>{message.text}</span>
        </div>
      </div>
    );
  };

  /* ---------------- Field renderer ---------------- */
  const renderSettingField = (setting) => {
    const currentValue = settingsUpdates[setting.key] ?? setting.value;

    switch (setting.key) {
      case 'sms_enabled':
      case 'auto_billing_enabled':
        return (
          <label className="inline-flex items-center gap-3">
            <input
              type="checkbox"
              checked={currentValue === true || currentValue === 'true'}
              onChange={(e) => handleSettingChange(setting.key, e.target.checked.toString())}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">
              {currentValue === true || currentValue === 'true' ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        );

      case 'billing_day':
        return (
          <div className="space-y-2">
            <select
              value={currentValue || 28}
              onChange={(e) => handleSettingChange(setting.key, parseInt(e.target.value))}
              className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500">Day of month for automatic billing (1-31). Note: Months with fewer days will bill on the last day.</p>
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
                onChange={(e) => handleSettingChange(setting.key, parseFloat(e.target.value))}
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
              onChange={(e) => handleSettingChange(setting.key, parseInt(e.target.value))}
              className="w-24 border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500">Days before late fee is applied (0-30)</p>
          </div>
        );

      case 'sms_billing_template':
      case 'whatsapp_billing_fallback_template':
        return (
          <div className="space-y-2">
            <textarea
              value={currentValue || ''}
              onChange={(e) => handleSettingChange(setting.key, e.target.value)}
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

      case 'whatsapp_billing_template_name':
        return (
          <div className="space-y-2">
            <input
              type="text"
              value={currentValue || ''}
              onChange={(e) => handleSettingChange(setting.key, e.target.value)}
              placeholder="monthly_bill_cron"
              className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
            <p className="text-xs text-gray-500">
              Must match an approved Meta WhatsApp template name.
            </p>
          </div>
        );

      // Skip sensitive M-Pesa fields - they should be in .env only
      case 'mpesa_passkey':
      case 'mpesa_consumer_secret':
      case 'mpesa_consumer_key':
        return null;

      default:
        return (
          <input
            type="text"
            value={currentValue || ''}
            onChange={(e) => handleSettingChange(setting.key, e.target.value)}
            className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        );
    }
  };

  /* ---------------- Render Tab Content ---------------- */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'company':
        return (
          <div className="space-y-8">
            <MessageAlert message={companyMessage} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Company Logo & Info Form */}
              <div className="space-y-6">
                {/* Logo Upload Section */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Logo</h3>
                  
                  <div className="flex flex-col items-center">
                    {/* Logo with Drag & Drop */}
                    <div 
                      className={`relative cursor-pointer group mb-4`}
                      onDragEnter={handleLogoDragEnter}
                      onDragLeave={handleLogoDragLeave}
                      onDragOver={handleLogoDragOver}
                      onDrop={handleLogoDrop}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <div className={`relative transition-all duration-200 ${
                        isDraggingLogo 
                          ? 'ring-4 ring-blue-400 ring-offset-2 scale-105' 
                          : 'group-hover:ring-2 group-hover:ring-blue-300'
                      } rounded-full`}>
                        <CompanyLogoDisplay />
                        
                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 rounded-full flex items-center justify-center transition-all duration-200">
                          <div className="opacity-0 group-hover:opacity-100 text-white text-center">
                            <svg className="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-xs font-medium">Change</span>
                          </div>
                        </div>

                        {/* Drag indicator */}
                        {isDraggingLogo && (
                          <div className="absolute inset-0 bg-blue-500 bg-opacity-20 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                          </div>
                        )}
                      </div>

                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleLogoInputChange}
                        className="hidden"
                      />
                    </div>

                    <p className="text-sm text-gray-600 mb-2">Click or drag & drop to upload</p>
                    <p className="text-xs text-gray-400 mb-4">JPEG, PNG, WebP • Max 5MB • 200x200 recommended</p>

                    {/* Logo Action Buttons */}
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Upload Logo
                      </button>
                      
                      {selectedLogo && (
                        <button
                          type="button"
                          onClick={removeSelectedLogo}
                          className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      
                      {companyInfo?.logo && !selectedLogo && (
                        <button
                          type="button"
                          onClick={handleDeleteCompanyLogo}
                          disabled={companySaveStatus === 'deleting'}
                          className="px-4 py-2 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                        >
                          {companySaveStatus === 'deleting' ? 'Deleting...' : 'Remove Logo'}
                        </button>
                      )}
                    </div>

                    {selectedLogo && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="truncate max-w-[200px]">{selectedLogo.name}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Company Info Fields */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
                    <input
                      type="text"
                      name="name"
                      value={companyFormData.name}
                      onChange={handleCompanyFormChange}
                      placeholder="Enter company name"
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={companyFormData.email}
                      onChange={handleCompanyFormChange}
                      placeholder="company@example.com"
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      name="phone"
                      value={companyFormData.phone}
                      onChange={handleCompanyFormChange}
                      placeholder="+254 XXX XXX XXX"
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                    <textarea
                      name="address"
                      value={companyFormData.address}
                      onChange={handleCompanyFormChange}
                      placeholder="Enter company address"
                      rows={3}
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <button
                    onClick={handleSaveCompanyInfo}
                    disabled={companySaveStatus === 'saving'}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center justify-center gap-2"
                  >
                    {companySaveStatus === 'saving' ? (
                      <>
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Save Company Info</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Document Preview */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Document Preview</h3>
                <p className="text-sm text-gray-600">This is how your company branding will appear on exported documents (PDF reports, receipts, etc.)</p>
                <DocumentPreview />
                
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-800">Where will this appear?</p>
                      <ul className="text-sm text-blue-700 mt-1 list-disc list-inside">
                        <li>PDF Reports (Tenants, Payments, etc.)</li>
                        <li>Payment Receipts</li>
                        <li>Excel Export Headers</li>
                        <li>SMS Signatures</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'billing':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {settingsByCategory[activeTab]?.length > 0 ? (
              settingsByCategory[activeTab]
                .filter(setting => !['mpesa_passkey', 'mpesa_consumer_secret', 'mpesa_consumer_key', 'paybill_number', 'mpesa_paybill_number'].includes(setting.key))
                .map(setting => (
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

      case 'mpesa':
        return (
          <div className="space-y-8">
            {/* How It Works Section */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-900 mb-2">How M-Pesa Paybill Works</h3>
                  <p className="text-sm text-green-800 mb-4">
                    Tenants pay rent using their M-Pesa on their phones. They select <strong>Lipa na M-Pesa → Pay Bill</strong>, 
                    enter your Paybill number and their Unit Code as the account number. The system automatically 
                    receives and processes the payment.
                  </p>
                  <div className="bg-white rounded-lg p-4 border border-green-200">
                    <p className="text-xs font-medium text-green-800 mb-2">Payment Flow:</p>
                    <div className="flex items-center gap-2 text-xs text-green-700 flex-wrap">
                      <span className="bg-green-100 px-2 py-1 rounded">1. Tenant opens M-Pesa</span>
                      <span>→</span>
                      <span className="bg-green-100 px-2 py-1 rounded">2. Lipa na M-Pesa</span>
                      <span>→</span>
                      <span className="bg-green-100 px-2 py-1 rounded">3. Pay Bill</span>
                      <span>→</span>
                      <span className="bg-green-100 px-2 py-1 rounded">4. Enter Paybill & Account</span>
                      <span>→</span>
                      <span className="bg-green-100 px-2 py-1 rounded">5. Confirm Payment</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Paybill Number Setting */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Paybill Configuration</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    M-Pesa Paybill Number
                  </label>
                  <input
                    type="text"
                    value={getPaybillValue()}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      if (value.length <= 10) {
                        handleSettingChange('paybill_number', value);
                      }
                    }}
                    placeholder="e.g., 522522"
                    className="w-full max-w-xs border rounded-lg p-3 text-lg font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Your registered M-Pesa Paybill number (5-10 digits). This is shown in SMS messages to tenants.
                  </p>
                </div>

                {/* Preview how it appears in SMS */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 max-w-md">
                  <p className="text-xs font-medium text-gray-600 mb-2">SMS Preview:</p>
                  <p className="text-sm text-gray-800 font-mono bg-white p-3 rounded border">
                    "...Pay via Paybill <strong className="text-green-600">{getPaybillValue() || '[Your Paybill]'}</strong>, Account: MJ-01"
                  </p>
                </div>
              </div>
            </div>

            {/* Security Note */}
            <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-900 mb-1">Security Information</h4>
                  <p className="text-sm text-amber-800">
                    M-Pesa API credentials (Consumer Key, Consumer Secret, and Passkey) are securely stored in environment 
                    variables on the server. For security reasons, they cannot be changed from this interface. 
                    Contact your system administrator to update API credentials.
                  </p>
                </div>
              </div>
            </div>

            {/* What Tenants See */}
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">What Tenants See on Their Phone</h4>
              
              <div className="max-w-xs mx-auto">
                {/* Mock Phone Screen */}
                <div className="bg-gray-900 rounded-3xl p-2">
                  <div className="bg-white rounded-2xl overflow-hidden">
                    {/* Status Bar */}
                    <div className="bg-green-600 text-white px-4 py-2 text-center text-sm font-medium">
                      M-PESA
                    </div>
                    
                    {/* Content */}
                    <div className="p-4 space-y-4">
                      <div className="text-center text-sm text-gray-600">Enter Details</div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-gray-500">Business Number</label>
                          <div className="border rounded p-2 bg-gray-50 font-mono text-lg">
                            {getPaybillValue() || '______'}
                          </div>
                        </div>
                        
                        <div>
                          <label className="text-xs text-gray-500">Account Number</label>
                          <div className="border rounded p-2 bg-gray-50 font-mono">
                            MJ-01 <span className="text-xs text-gray-400">(Unit Code)</span>
                          </div>
                        </div>
                        
                        <div>
                          <label className="text-xs text-gray-500">Amount</label>
                          <div className="border rounded p-2 bg-gray-50 font-mono">
                            KSh 15,000
                          </div>
                        </div>
                      </div>
                      
                      <button className="w-full bg-green-600 text-white py-3 rounded-lg font-medium">
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div className="max-w-3xl space-y-8">
            <MessageAlert message={profileMessage} />

            {/* Profile Image Section */}
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Photo</h3>
              
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Avatar with Drag & Drop */}
                <div 
                  className="relative cursor-pointer group"
                  onDragEnter={handleProfileDragEnter}
                  onDragLeave={handleProfileDragLeave}
                  onDragOver={handleProfileDragOver}
                  onDrop={handleProfileDrop}
                  onClick={() => profileInputRef.current?.click()}
                >
                  <div className={`relative transition-all duration-200 ${
                    isDraggingProfile 
                      ? 'ring-4 ring-blue-400 ring-offset-2 scale-105' 
                      : 'group-hover:ring-2 group-hover:ring-blue-300'
                  } rounded-full`}>
                    <ProfileAvatarDisplay />
                    
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 rounded-full flex items-center justify-center transition-all duration-200">
                      <div className="opacity-0 group-hover:opacity-100 text-white text-center">
                        <svg className="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-xs font-medium">Change</span>
                      </div>
                    </div>

                    {isDraggingProfile && (
                      <div className="absolute inset-0 bg-blue-500 bg-opacity-20 rounded-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <input
                    ref={profileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleProfileImageInputChange}
                    className="hidden"
                  />
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <h4 className="font-medium text-gray-900 mb-1">
                    {user?.first_name} {user?.last_name}
                  </h4>
                  <p className="text-sm text-gray-500 mb-3 capitalize">{user?.role} Account</p>
                  
                  <p className="text-sm text-gray-600 mb-2">Click or drag & drop to upload</p>
                  <p className="text-xs text-gray-400 mb-4">JPEG, PNG, WebP • Max 5MB</p>
                  
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => profileInputRef.current?.click()}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Upload Photo
                    </button>
                    
                    {selectedProfileImage && (
                      <button
                        type="button"
                        onClick={removeSelectedProfileImage}
                        className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {selectedProfileImage && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>New image selected</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Information */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Profile Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                  <input
                    type="text"
                    name="first_name"
                    value={profileData.first_name}
                    onChange={handleProfileChange}
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    value={profileData.last_name}
                    onChange={handleProfileChange}
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={profileData.email}
                    onChange={handleProfileChange}
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    name="phone_number"
                    value={profileData.phone_number}
                    onChange={handleProfileChange}
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={profileSaveStatus === 'saving'}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center gap-2"
              >
                {profileSaveStatus === 'saving' ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Save Profile</span>
                  </>
                )}
              </button>
            </div>

            {/* Change Password */}
            <div className="space-y-6 pt-6 border-t">
              <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
              
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
                  <input
                    type="password"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                  <input
                    type="password"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleChangePassword}
                disabled={profileSaveStatus === 'saving' || !passwordData.currentPassword || !passwordData.newPassword}
                className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:bg-gray-400 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span>Change Password</span>
              </button>
            </div>

            {/* Account Info */}
            <div className="space-y-4 pt-6 border-t">
              <h3 className="text-lg font-semibold text-gray-900">Account Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500 mb-1">Role</p>
                  <p className="font-medium text-gray-900 capitalize">{user?.role}</p>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500 mb-1">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    user?.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {user?.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500 mb-1">National ID</p>
                  <p className="font-medium text-gray-900">{user?.national_id || 'N/A'}</p>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500 mb-1">Member Since</p>
                  <p className="font-medium text-gray-900">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
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
          <p className="text-gray-600">Manage application configuration, company branding, and preferences</p>
        </div>

        {activeTab !== 'profile' && activeTab !== 'appearance' && activeTab !== 'company' && activeTab !== 'mpesa' && (
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
            <button onClick={clearError} className="text-red-600 hover:text-red-800">×</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b px-4 sm:px-6">
          <div className="flex gap-2 sm:gap-6 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 py-1">
            {[
              { id: 'company', name: 'Company Info', shortName: 'Company' },
              { id: 'billing', name: 'Billing & Payments', shortName: 'Billing' },
              { id: 'mpesa', name: 'M-Pesa Paybill', shortName: 'M-Pesa' },
              { id: 'profile', name: 'Admin Profile', shortName: 'Profile' },
              { id: 'appearance', name: 'Appearance', shortName: 'Theme' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 sm:py-4 px-2 sm:px-1 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="hidden sm:inline">{tab.name}</span>
                <span className="sm:hidden">{tab.shortName}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {renderTabContent()}
        </div>
      </div>

      {/* Sticky save bar for settings tabs only */}
      {isDirty && (activeTab === 'billing' || activeTab === 'mpesa') && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 z-50">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-gray-700">You have unsaved changes</span>
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
                  ? 'bg-blue-400 cursor-not-allowed text-white'
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
        <div className="fixed bottom-4 right-4 bg-green-100 border border-green-300 text-green-700 px-4 py-2 rounded-lg shadow-lg z-50">
          ✓ Settings saved successfully
        </div>
      )}

      {companySaveStatus === 'saved' && (
        <div className="fixed bottom-4 right-4 bg-green-100 border border-green-300 text-green-700 px-4 py-2 rounded-lg shadow-lg z-50">
          ✓ Company info saved successfully
        </div>
      )}

      {profileSaveStatus === 'saved' && (
        <div className="fixed bottom-4 right-4 bg-green-100 border border-green-300 text-green-700 px-4 py-2 rounded-lg shadow-lg z-50">
          ✓ Profile updated successfully
        </div>
      )}

      {/* Error notifications */}
      {saveStatus === 'error' && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg shadow-lg z-50">
          ✗ Failed to save settings
        </div>
      )}
    </div>
  );
};

export default SystemSettings;
