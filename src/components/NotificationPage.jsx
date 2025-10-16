import React, { useState } from 'react';
import { useNotification } from '../context/NotificationContext';

const NotificationsPage = () => {
  const {
    notifications,
    unreadCount,
    loading,
    preferences,
    markAsRead,
    markAllAsRead,
    updatePreferences,
    sendTestNotification
  } = useNotification();

  const [activeTab, setActiveTab] = useState('all');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [testSending, setTestSending] = useState(false);

  const filteredNotifications = notifications.filter(notification => {
    if (activeTab === 'unread') return !notification.is_read;
    if (activeTab === 'read') return notification.is_read;
    return true;
  });

  const handlePreferenceChange = async (key, value) => {
    const newPreferences = { ...preferences, [key]: value };
    try {
      await updatePreferences(newPreferences);
    } catch (error) {
      alert('Failed to update preferences: ' + error.message);
    }
  };

  const handleTestNotification = async (type) => {
    setTestSending(true);
    try {
      await sendTestNotification(type);
      alert('Test notification sent successfully!');
    } catch (error) {
      alert('Failed to send test notification: ' + error.message);
    } finally {
      setTestSending(false);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'payment': return '💰';
      case 'maintenance': return '🛠️';
      case 'announcement': return '📢';
      case 'reminder': return '⏰';
      default: return '📄';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-gray-600">
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex space-x-4">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Mark All as Read
              </button>
            )}
            <button
              onClick={() => setPreferencesOpen(true)}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
            >
              Notification Settings
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {['all', 'unread', 'read'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab} {tab === 'unread' && unreadCount > 0 && `(${unreadCount})`}
              </button>
            ))}
          </nav>
        </div>

        {/* Notifications List */}
        <div className="mt-6 space-y-4">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">🔔</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No {activeTab !== 'all' ? activeTab : ''} notifications
              </h3>
              <p className="text-gray-500">
                {activeTab === 'all' 
                  ? "You're all caught up! New notifications will appear here."
                  : `No ${activeTab} notifications at the moment.`
                }
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-start space-x-4 p-4 border border-gray-200 rounded-lg ${
                  !notification.is_read ? 'bg-blue-50 border-blue-200' : ''
                }`}
              >
                <div className="text-2xl">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {notification.title}
                    </h3>
                    {!notification.is_read && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                  <p className="text-gray-600 mt-1">{notification.message}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-gray-500">
                      {formatDate(notification.created_at)}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      notification.type === 'payment' ? 'bg-green-100 text-green-800' :
                      notification.type === 'maintenance' ? 'bg-orange-100 text-orange-800' :
                      notification.type === 'announcement' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {notification.type}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Notification Preferences Modal */}
      {preferencesOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-gray-900">
                  Notification Settings
                </h3>
                <button
                  onClick={() => setPreferencesOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Channel Preferences */}
                <div>
                  <h4 className="text-lg font-semibold mb-3">Notification Channels</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">SMS Notifications</p>
                        <p className="text-sm text-gray-500">Receive notifications via SMS</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences.smsEnabled}
                          onChange={(e) => handlePreferenceChange('smsEnabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Email Notifications</p>
                        <p className="text-sm text-gray-500">Receive notifications via email</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences.emailEnabled}
                          onChange={(e) => handlePreferenceChange('emailEnabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Type Preferences */}
                <div>
                  <h4 className="text-lg font-semibold mb-3">Notification Types</h4>
                  <div className="space-y-3">
                    {[
                      { key: 'paymentAlerts', label: 'Payment Alerts', description: 'Rent payments and reminders' },
                      { key: 'maintenanceAlerts', label: 'Maintenance Alerts', description: 'Complaint updates and resolutions' },
                      { key: 'announcementAlerts', label: 'Announcements', description: 'Property announcements and news' },
                      { key: 'reminderAlerts', label: 'Reminders', description: 'Payment and maintenance reminders' }
                    ].map((type) => (
                      <div key={type.key} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{type.label}</p>
                          <p className="text-sm text-gray-500">{type.description}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={preferences[type.key]}
                            onChange={(e) => handlePreferenceChange(type.key, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Test Notifications */}
                <div>
                  <h4 className="text-lg font-semibold mb-3">Test Notifications</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Send test notifications to verify your settings
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {['payment', 'maintenance', 'announcement', 'reminder'].map((type) => (
                      <button
                        key={type}
                        onClick={() => handleTestNotification(type)}
                        disabled={testSending}
                        className="bg-gray-600 text-white py-2 px-3 rounded text-sm hover:bg-gray-700 disabled:opacity-50"
                      >
                        Test {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-4">
                  <button
                    onClick={() => setPreferencesOpen(false)}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;