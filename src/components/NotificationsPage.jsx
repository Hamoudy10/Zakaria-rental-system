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
        return 'border-green-200 bg-green-25';
      case 'payment_received':
        return 'border-blue-200 bg-blue-25';
      case 'salary_paid':
      case 'salary_processed':
        return 'border-purple-200 bg-purple-25';
      case 'complaint_created':
        return 'border-red-200 bg-red-25';
      case 'complaint_resolved':
        return 'border-green-200 bg-green-25';
      case 'announcement':
        return 'border-yellow-200 bg-yellow-25';
      case 'maintenance':
        return 'border-orange-200 bg-orange-25';
      default:
        return 'border-gray-200 bg-gray-25';
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
      <div className="flex justify-center items-center py-8 xs:py-12">
        <div className="animate-spin rounded-full h-6 w-6 xs:h-8 xs:w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 xs:space-y-4 sm:space-y-6 px-2 xs:px-3 sm:px-4 max-w-full overflow-x-hidden">
      {/* Header - Mobile Optimized */}
      <div className="bg-white rounded-lg shadow-sm p-3 xs:p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 xs:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-gray-900 truncate">Notifications</h1>
            <p className="text-xs xs:text-sm sm:text-base text-gray-600 mt-0.5">
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              {notifications.length > 0 && ` out of ${notifications.length} total`}
            </p>
          </div>
          
          {/* Button Group - Mobile Responsive */}
          <div className="flex flex-col xs:flex-row gap-2 w-full lg:w-auto mt-2 xs:mt-0">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="bg-green-600 text-white px-3 xs:px-4 py-2.5 xs:py-3 rounded-md hover:bg-green-700 text-xs xs:text-sm sm:text-base whitespace-nowrap min-h-[44px] touch-manipulation transition-colors active:bg-green-800"
              >
                Mark All as Read
              </button>
            )}
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowBroadcastModal(true)}
                className="bg-blue-600 text-white px-3 xs:px-4 py-2.5 xs:py-3 rounded-md hover:bg-blue-700 text-xs xs:text-sm sm:text-base whitespace-nowrap min-h-[44px] touch-manipulation transition-colors active:bg-blue-800"
              >
                Send Broadcast
              </button>
            )}
            <button
              onClick={handleClearRead}
              className="bg-gray-600 text-white px-3 xs:px-4 py-2.5 xs:py-3 rounded-md hover:bg-gray-700 text-xs xs:text-sm sm:text-base whitespace-nowrap min-h-[44px] touch-manipulation transition-colors active:bg-gray-800"
            >
              Clear Read
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards - Mobile Responsive */}
      <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 xs:gap-3 sm:gap-4">
        <div className="bg-white p-2 xs:p-3 sm:p-4 rounded-lg shadow border text-center">
          <div className="text-base xs:text-lg sm:text-xl md:text-2xl font-bold text-gray-900">{dynamicStats.total}</div>
          <div className="text-xs xs:text-sm text-gray-600">Total</div>
        </div>
        <div className="bg-white p-2 xs:p-3 sm:p-4 rounded-lg shadow border text-center">
          <div className="text-base xs:text-lg sm:text-xl md:text-2xl font-bold text-orange-600">{dynamicStats.unread}</div>
          <div className="text-xs xs:text-sm text-gray-600">Unread</div>
        </div>
        <div className="bg-white p-2 xs:p-3 sm:p-4 rounded-lg shadow border text-center">
          <div className="text-base xs:text-lg sm:text-xl md:text-2xl font-bold text-green-600">{dynamicStats.paymentCount}</div>
          <div className="text-xs xs:text-sm text-gray-600">Payments</div>
        </div>
        <div className="bg-white p-2 xs:p-3 sm:p-4 rounded-lg shadow border text-center">
          <div className="text-base xs:text-lg sm:text-xl md:text-2xl font-bold text-blue-600">{dynamicStats.recentCount}</div>
          <div className="text-xs xs:text-sm text-gray-600">Last 7 Days</div>
        </div>
      </div>

      {/* Filters - Mobile Responsive */}
      <div className="bg-white rounded-lg shadow-sm p-3 xs:p-4 sm:p-6">
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-2 xs:gap-3 sm:gap-4 mb-3 xs:mb-4">
          <div>
            <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 xs:px-3 py-2.5 xs:py-3 text-xs xs:text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
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
            <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 xs:px-3 py-2.5 xs:py-3 text-xs xs:text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
            />
          </div>

          <div>
            <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 xs:px-3 py-2.5 xs:py-3 text-xs xs:text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => setFilters({ type: '', start_date: '', end_date: '' })}
              className="w-full bg-gray-500 text-white px-3 xs:px-4 py-2.5 xs:py-3 rounded-md hover:bg-gray-600 text-xs xs:text-sm sm:text-base min-h-[44px] touch-manipulation transition-colors active:bg-gray-700"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Tabs - Mobile Optimized */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-1 xs:space-x-2 sm:space-x-4 md:space-x-8 overflow-x-auto pb-0.5">
            {['all', 'unread', 'read'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap py-2.5 xs:py-3 sm:py-4 px-2 xs:px-3 border-b-2 font-medium text-xs xs:text-sm capitalize min-w-14 xs:min-w-16 min-h-[44px] touch-manipulation transition-colors ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab} 
                {tab === 'unread' && unreadCount > 0 && (
                  <span className="ml-1 text-xs">({unreadCount})</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-3 xs:mt-4 bg-red-50 border border-red-200 text-red-700 px-3 xs:px-4 py-2.5 xs:py-3 rounded text-xs xs:text-sm">
            <div className="flex justify-between items-center">
              <span className="break-words flex-1">{error}</span>
              <button 
                onClick={clearError} 
                className="font-bold text-base xs:text-lg ml-2 min-h-[32px] min-w-[32px] flex items-center justify-center"
                aria-label="Close error"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Notifications List - Mobile Optimized */}
        <div className="mt-3 xs:mt-4 sm:mt-6 space-y-2 xs:space-y-3">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-6 xs:py-8 sm:py-12">
              <div className="text-gray-400 text-2xl xs:text-3xl sm:text-6xl mb-2 xs:mb-3 sm:mb-4">🔔</div>
              <h3 className="text-sm xs:text-base sm:text-lg font-medium text-gray-900 mb-1 xs:mb-2">
                No {activeTab !== 'all' ? activeTab : ''} notifications
              </h3>
              <p className="text-gray-500 text-xs xs:text-sm sm:text-base px-2">
                {activeTab === 'all' 
                  ? "You're all caught up! New notifications will appear here."
                  : `No ${activeTab} notifications at the moment.`
                }
              </p>
              {(filters.type || filters.start_date || filters.end_date) && (
                <button
                  onClick={() => setFilters({ type: '', start_date: '', end_date: '' })}
                  className="mt-2 xs:mt-3 text-blue-600 hover:text-blue-800 text-xs xs:text-sm transition-colors"
                >
                  Clear filters to see all notifications
                </button>
              )}
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-2 xs:p-3 sm:p-4 rounded-lg border ${getNotificationColor(notification.type)} ${
                  !notification.is_read ? 'ring-1 ring-blue-500' : ''
                } transition-colors duration-150 hover:shadow-sm`}
              >
                <div className="flex items-start justify-between gap-2 xs:gap-3">
                  <div className="flex items-start gap-2 xs:gap-3 flex-1 min-w-0">
                    <div className="text-base xs:text-lg sm:text-2xl mt-0.5 flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col xs:flex-row xs:items-center xs:gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 text-xs xs:text-sm sm:text-base truncate">
                          {notification.title || 'No Title'}
                        </h3>
                        {!notification.is_read && (
                          <span className="bg-blue-500 text-white text-xs px-1.5 xs:px-2 py-0.5 xs:py-1 rounded-full whitespace-nowrap self-start xs:self-center mt-0.5 xs:mt-0">
                            New
                          </span>
                        )}
                      </div>
                      
                      <p className="text-gray-700 text-xs xs:text-sm sm:text-base mb-1 xs:mb-2 break-words leading-relaxed">
                        {notification.message || 'No message content'}
                      </p>
                      
                      <div className="flex flex-col xs:flex-row xs:items-center xs:gap-3 xs:gap-4 text-xs text-gray-500">
                        <span className="break-all xs:break-normal">{formatDate(notification.created_at)}</span>
                        {notification.related_entity_type && (
                          <span className="capitalize mt-0.5 xs:mt-0">
                            {notification.related_entity_type.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 xs:gap-2 ml-1 xs:ml-2 flex-shrink-0">
                    {!notification.is_read && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap min-h-[32px] touch-manipulation px-1 xs:px-2 transition-colors"
                      >
                        Mark Read
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notification.id)}
                      className="text-red-600 hover:text-red-800 text-xs font-medium whitespace-nowrap min-h-[32px] touch-manipulation px-1 xs:px-2 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination - Mobile Responsive */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex flex-col xs:flex-row justify-center items-center gap-2 xs:gap-3 mt-3 xs:mt-4 sm:mt-6">
            <button
              onClick={() => fetchNotifications({ page: pagination.currentPage - 1, ...filters })}
              disabled={!pagination.hasPrev}
              className="px-2 xs:px-3 sm:px-4 py-2 border rounded-md disabled:opacity-50 text-xs xs:text-sm sm:text-base min-h-[44px] touch-manipulation transition-colors w-full xs:w-auto active:bg-gray-100"
            >
              Previous
            </button>
            
            <span className="px-2 xs:px-3 sm:px-4 py-2 text-xs xs:text-sm sm:text-base text-center">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            
            <button
              onClick={() => fetchNotifications({ page: pagination.currentPage + 1, ...filters })}
              disabled={!pagination.hasNext}
              className="px-2 xs:px-3 sm:px-4 py-2 border rounded-md disabled:opacity-50 text-xs xs:text-sm sm:text-base min-h-[44px] touch-manipulation transition-colors w-full xs:w-auto active:bg-gray-100"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Broadcast Modal (Admin Only) - Mobile Optimized */}
      {showBroadcastModal && user?.role === 'admin' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 xs:p-3 sm:p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-xs xs:max-w-sm sm:max-w-md mx-auto max-h-[90vh] overflow-y-auto">
            <div className="p-3 xs:p-4 sm:p-6">
              <div className="flex justify-between items-start mb-3 xs:mb-4">
                <h3 className="text-base xs:text-lg sm:text-xl font-bold text-gray-900">Send Broadcast</h3>
                <button
                  onClick={() => setShowBroadcastModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-base xs:text-lg min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation transition-colors"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={handleBroadcastSubmit} className="space-y-3 xs:space-y-4">
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={broadcastData.title}
                    onChange={(e) => setBroadcastData({ ...broadcastData, title: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-2 xs:px-3 py-2.5 xs:py-3 text-xs xs:text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
                    placeholder="Enter notification title"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                    Message *
                  </label>
                  <textarea
                    value={broadcastData.message}
                    onChange={(e) => setBroadcastData({ ...broadcastData, message: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-2 xs:px-3 py-2.5 xs:py-3 text-xs xs:text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical touch-manipulation"
                    rows="3"
                    placeholder="Enter notification message"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-2">
                    Target Roles *
                  </label>
                  <div className="space-y-1 xs:space-y-2">
                    {['tenant', 'agent', 'admin'].map((role) => (
                      <label key={role} className="flex items-center min-h-[44px] touch-manipulation cursor-pointer">
                        <input
                          type="checkbox"
                          checked={broadcastData.target_roles.includes(role)}
                          onChange={(e) => {
                            const newRoles = e.target.checked
                              ? [...broadcastData.target_roles, role]
                              : broadcastData.target_roles.filter(r => r !== role);
                            setBroadcastData({ ...broadcastData, target_roles: newRoles });
                          }}
                          className="mr-2 w-4 h-4"
                        />
                        <span className="capitalize text-xs xs:text-sm sm:text-base">{role}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="flex flex-col xs:flex-row gap-2 xs:gap-3 pt-3 xs:pt-4">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-3 xs:px-4 py-2.5 xs:py-3 rounded-md hover:bg-blue-700 flex-1 text-xs xs:text-sm sm:text-base min-h-[44px] touch-manipulation transition-colors active:bg-blue-800"
                  >
                    Send Broadcast
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBroadcastModal(false)}
                    className="bg-gray-600 text-white px-3 xs:px-4 py-2.5 xs:py-3 rounded-md hover:bg-gray-700 flex-1 text-xs xs:text-sm sm:text-base min-h-[44px] touch-manipulation transition-colors active:bg-gray-800"
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