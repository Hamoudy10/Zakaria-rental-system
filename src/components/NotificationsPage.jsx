import React, { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const NotificationsPage = () => {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    stats,
    pagination,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    createBroadcastNotification,
    refreshNotifications,
    getNotificationsByType,
    clearError
  } = useNotification();

  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('all');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastData, setBroadcastData] = useState({
    title: '',
    message: '',
    target_roles: ['tenant', 'agent']
  });
  const [filters, setFilters] = useState({
    type: '',
    start_date: '',
    end_date: ''
  });

  // Load notifications on component mount
  useEffect(() => {
    fetchNotifications({ page: 1 });
  }, [fetchNotifications]);

  // Apply filters when they change
  useEffect(() => {
    fetchNotifications({ page: 1, ...filters });
  }, [filters, fetchNotifications]);

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      refreshNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleClearRead = async () => {
    try {
      await clearReadNotifications();
      refreshNotifications();
    } catch (error) {
      console.error('Error clearing read notifications:', error);
    }
  };

  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    try {
      await createBroadcastNotification(broadcastData);
      setShowBroadcastModal(false);
      setBroadcastData({ title: '', message: '', target_roles: ['tenant', 'agent'] });
      refreshNotifications();
      alert('Broadcast notification sent successfully!');
    } catch (error) {
      alert('Failed to send broadcast: ' + error.message);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'payment_success': return '💰';
      case 'payment_received': return '💳';
      case 'salary_paid': return '💵';
      case 'salary_processed': return '🏦';
      case 'complaint_created': return '🚨';
      case 'complaint_resolved': return '✅';
      case 'announcement': return '📢';
      case 'payment': return '💰';
      case 'maintenance': return '🛠️';
      case 'reminder': return '⏰';
      default: return '📄';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'payment_success':
      case 'payment':
        return 'border-green-200 bg-green-50';
      case 'payment_received':
        return 'border-blue-200 bg-blue-50';
      case 'salary_paid':
      case 'salary_processed':
        return 'border-purple-200 bg-purple-50';
      case 'complaint_created':
        return 'border-red-200 bg-red-50';
      case 'complaint_resolved':
        return 'border-green-200 bg-green-50';
      case 'announcement':
        return 'border-yellow-200 bg-yellow-50';
      case 'maintenance':
        return 'border-orange-200 bg-orange-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  };

  // Filter notifications based on active tab
  const filteredNotifications = notifications.filter(notification => {
    if (activeTab === 'unread') return !notification.is_read;
    if (activeTab === 'read') return notification.is_read;
    return true;
  });

  // Dynamic statistics calculation
  const dynamicStats = {
    total: stats?.total || notifications.length,
    unread: unreadCount,
    paymentCount: stats?.byType?.payment_success || notifications.filter(n => 
      n.type.includes('payment') || n.type.includes('salary')
    ).length,
    recentCount: stats?.recent || notifications.filter(n => {
      try {
        return new Date(n.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      } catch {
        return false;
      }
    }).length
  };

  if (loading && notifications.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header - Updated with responsive button layout */}
      <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-gray-600">
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              {notifications.length > 0 && ` out of ${notifications.length} total`}
            </p>
          </div>
          
          {/* Button Group - Responsive layout */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full lg:w-auto">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="bg-green-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-green-700 text-sm sm:text-base whitespace-nowrap"
              >
                Mark All as Read
              </button>
            )}
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowBroadcastModal(true)}
                className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-blue-700 text-sm sm:text-base whitespace-nowrap"
              >
                Send Broadcast
              </button>
            )}
            <button
              onClick={handleClearRead}
              className="bg-gray-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-gray-700 text-sm sm:text-base whitespace-nowrap"
            >
              Clear Read
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards - Dynamic data */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-3 sm:p-4 rounded-lg shadow border text-center">
          <div className="text-xl sm:text-2xl font-bold text-gray-900">{dynamicStats.total}</div>
          <div className="text-xs sm:text-sm text-gray-600">Total</div>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-lg shadow border text-center">
          <div className="text-xl sm:text-2xl font-bold text-orange-600">{dynamicStats.unread}</div>
          <div className="text-xs sm:text-sm text-gray-600">Unread</div>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-lg shadow border text-center">
          <div className="text-xl sm:text-2xl font-bold text-green-600">{dynamicStats.paymentCount}</div>
          <div className="text-xs sm:text-sm text-gray-600">Payments</div>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-lg shadow border text-center">
          <div className="text-xl sm:text-2xl font-bold text-blue-600">{dynamicStats.recentCount}</div>
          <div className="text-xs sm:text-sm text-gray-600">Last 7 Days</div>
        </div>
      </div>

      {/* Filters - Responsive grid */}
      <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Types</option>
              <option value="payment_success">Payment Success</option>
              <option value="payment_received">Payment Received</option>
              <option value="salary_paid">Salary Paid</option>
              <option value="salary_processed">Salary Processed</option>
              <option value="announcement">Announcement</option>
              <option value="complaint_created">Complaint Created</option>
              <option value="complaint_resolved">Complaint Resolved</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => setFilters({ type: '', start_date: '', end_date: '' })}
              className="w-full bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 text-sm"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto">
            {['all', 'unread', 'read'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-sm capitalize min-w-16 ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab} 
                {tab === 'unread' && unreadCount > 0 && (
                  <span className="ml-1">({unreadCount})</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            <div className="flex justify-between items-center">
              <span>{error}</span>
              <button onClick={clearError} className="font-bold text-lg">×</button>
            </div>
          </div>
        )}

        {/* Notifications List */}
        <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <div className="text-gray-400 text-4xl sm:text-6xl mb-3 sm:mb-4">🔔</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No {activeTab !== 'all' ? activeTab : ''} notifications
              </h3>
              <p className="text-gray-500 text-sm sm:text-base">
                {activeTab === 'all' 
                  ? "You're all caught up! New notifications will appear here."
                  : `No ${activeTab} notifications at the moment.`
                }
              </p>
              {(filters.type || filters.start_date || filters.end_date) && (
                <button
                  onClick={() => setFilters({ type: '', start_date: '', end_date: '' })}
                  className="mt-3 text-blue-600 hover:text-blue-800 text-sm"
                >
                  Clear filters to see all notifications
                </button>
              )}
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 sm:p-4 rounded-lg border ${getNotificationColor(notification.type)} ${
                  !notification.is_read ? 'ring-1 sm:ring-2 ring-blue-500' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2 sm:space-x-3 flex-1 min-w-0">
                    <div className="text-xl sm:text-2xl mt-0.5 sm:mt-1 flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mb-1">
                        <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                          {notification.title || 'No Title'}
                        </h3>
                        {!notification.is_read && (
                          <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap self-start sm:self-center mt-1 sm:mt-0">
                            New
                          </span>
                        )}
                      </div>
                      
                      <p className="text-gray-700 text-sm sm:text-base mb-2 break-words">
                        {notification.message || 'No message content'}
                      </p>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 text-xs sm:text-sm text-gray-500">
                        <span>{formatDate(notification.created_at)}</span>
                        {notification.related_entity_type && (
                          <span className="capitalize mt-1 sm:mt-0">
                            {notification.related_entity_type.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2 ml-2 sm:ml-4 flex-shrink-0">
                    {!notification.is_read && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium whitespace-nowrap"
                      >
                        Mark Read
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notification.id)}
                      className="text-red-600 hover:text-red-800 text-xs sm:text-sm font-medium whitespace-nowrap"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination - Only show if we have multiple pages */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center space-x-2 mt-6">
            <button
              onClick={() => fetchNotifications({ page: pagination.currentPage - 1, ...filters })}
              disabled={!pagination.hasPrev}
              className="px-3 sm:px-4 py-2 border rounded-md disabled:opacity-50 text-sm sm:text-base"
            >
              Previous
            </button>
            
            <span className="px-3 sm:px-4 py-2 text-sm sm:text-base">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            
            <button
              onClick={() => fetchNotifications({ page: pagination.currentPage + 1, ...filters })}
              disabled={!pagination.hasNext}
              className="px-3 sm:px-4 py-2 border rounded-md disabled:opacity-50 text-sm sm:text-base"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Broadcast Modal (Admin Only) */}
      {showBroadcastModal && user?.role === 'admin' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md mx-4">
            <div className="p-4 sm:p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Send Broadcast Notification</h3>
                <button
                  onClick={() => setShowBroadcastModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={handleBroadcastSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={broadcastData.title}
                    onChange={(e) => setBroadcastData({ ...broadcastData, title: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Enter notification title"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message *
                  </label>
                  <textarea
                    value={broadcastData.message}
                    onChange={(e) => setBroadcastData({ ...broadcastData, message: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm h-24"
                    placeholder="Enter notification message"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Roles *
                  </label>
                  <div className="space-y-2">
                    {['tenant', 'agent', 'admin'].map((role) => (
                      <label key={role} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={broadcastData.target_roles.includes(role)}
                          onChange={(e) => {
                            const newRoles = e.target.checked
                              ? [...broadcastData.target_roles, role]
                              : broadcastData.target_roles.filter(r => r !== role);
                            setBroadcastData({ ...broadcastData, target_roles: newRoles });
                          }}
                          className="mr-2"
                        />
                        <span className="capitalize text-sm">{role}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex-1 text-sm sm:text-base"
                  >
                    Send Broadcast
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBroadcastModal(false)}
                    className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 flex-1 text-sm sm:text-base"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;