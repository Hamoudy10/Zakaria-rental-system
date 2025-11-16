// src/components/NotificationBell.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const NotificationBell = () => {
  const { 
    notifications, 
    unreadCount, 
    loading, 
    markAsRead, 
    markAllAsRead, 
    refreshNotifications
  } = useNotification();
  
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (isOpen && !loading) {
      console.log('🔔 Fetching notifications for dropdown...');
      refreshNotifications();
    }
  }, [isOpen, loading, refreshNotifications]);

  const handleNotificationClick = async (notification) => {
    try {
      if (!notification.is_read) {
        await markAsRead(notification.id);
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setIsMarkingAll(true);
      await markAllAsRead();
    } catch (error) {
      console.error('Error marking all as read:', error);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshNotifications();
    } catch (error) {
      console.error('Error refreshing notifications:', error);
    }
  };

  const getPriorityColor = (type) => {
    switch (type) {
      case 'payment_failed':
      case 'system_alert':
        return 'border-l-2 border-l-red-500';
      case 'payment_success':
      case 'salary_paid':
        return 'border-l-2 border-l-green-500';
      case 'payment_received':
      case 'salary_processed':
        return 'border-l-2 border-l-blue-500';
      case 'announcement':
        return 'border-l-2 border-l-yellow-500';
      default:
        return 'border-l-2 border-l-gray-300';
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'payment_success':
      case 'payment_received':
        return '💰';
      case 'salary_paid':
      case 'salary_processed':
        return '💵';
      case 'payment_failed':
        return '❌';
      case 'complaint_updated':
        return '🔧';
      case 'announcement':
        return '📢';
      case 'system_alert':
        return '⚠️';
      default:
        return '🔔';
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString();
    } catch {
      return 'Unknown time';
    }
  };

  // Don't render if no user
  if (!user) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell - Mobile Optimized */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className={`relative p-1.5 rounded-full transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center ${
          loading 
            ? 'text-gray-400 cursor-not-allowed' 
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        } ${unreadCount > 0 ? 'animate-pulse' : ''}`}
        title={loading ? "Loading notifications..." : "Notifications"}
        aria-label="Notifications"
      >
        {/* Bell Icon - Responsive Sizing */}
        <svg 
          className="w-5 h-5 xs:w-6 xs:h-6" 
          fill="currentColor" 
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        
        {/* Unread Count Badge - Responsive Sizing */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] xs:text-xs rounded-full h-4 w-4 xs:h-5 xs:w-5 flex items-center justify-center border border-white font-medium shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}

        {/* Loading Indicator */}
        {loading && (
          <span className="absolute -bottom-0.5 -right-0.5">
            <div className="w-1.5 h-1.5 xs:w-2 xs:h-2 bg-blue-500 rounded-full animate-ping"></div>
          </span>
        )}
      </button>

      {/* Dropdown - Fixed to stay within screen boundaries */}
      {isOpen && (
        <div className="absolute right-0 mt-1 w-[90vw] max-w-sm bg-white rounded-lg shadow-xl border border-gray-200 z-50 transform transition-all duration-200 ease-in-out max-h-[80vh] flex flex-col">
          {/* Header - Mobile Optimized */}
          <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
            <div className="flex justify-between items-center gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-gray-900 truncate">Notifications</h3>
                <p className="text-sm text-gray-500 mt-0.5 truncate">
                  {unreadCount > 0 
                    ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                    : 'All caught up!'
                  }
                </p>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Refresh Button */}
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors duration-150 rounded-full min-h-[32px] min-w-[32px] flex items-center justify-center"
                  title="Refresh notifications"
                  aria-label="Refresh notifications"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                {/* Mark All as Read Button */}
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    disabled={isMarkingAll || loading}
                    className={`text-xs px-2 py-1 rounded-md transition-colors duration-150 whitespace-nowrap min-h-[32px] ${
                      isMarkingAll || loading
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                  >
                    {isMarkingAll ? 'Marking...' : 'Mark all'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Notifications List - Scrollable */}
          <div className="flex-1 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              // Loading State
              <div className="p-6 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              // Empty State
              <div className="p-6 text-center">
                <div className="text-gray-400 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 font-medium">No notifications</p>
                <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
              </div>
            ) : (
              // Notifications List
              notifications.slice(0, 8).map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-3 border-b border-gray-100 cursor-pointer transition-all duration-150 hover:bg-gray-50 active:bg-gray-100 group min-h-[70px] ${
                    !notification.is_read ? 'bg-blue-25' : ''
                  } ${getPriorityColor(notification.type)}`}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleNotificationClick(notification);
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Notification Icon */}
                    <div className={`text-lg flex-shrink-0 mt-0.5 ${
                      !notification.is_read ? 'text-blue-500' : 'text-gray-400'
                    }`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    {/* Notification Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium truncate ${
                          !notification.is_read ? 'text-gray-900' : 'text-gray-600'
                        }`}>
                          {notification.title}
                        </p>
                        <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
                          {formatTimestamp(notification.created_at)}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-600 mt-0.5 line-clamp-2 leading-relaxed break-words">
                        {notification.message}
                      </p>
                      
                      {/* Notification Metadata */}
                      <div className="flex items-center justify-between mt-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          notification.type === 'payment_success' || notification.type === 'salary_paid'
                            ? 'bg-green-100 text-green-800'
                            : notification.type === 'payment_failed'
                            ? 'bg-red-100 text-red-800'
                            : notification.type === 'announcement'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {notification.type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    
                    {/* Unread Indicator */}
                    {!notification.is_read && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="flex justify-between items-center gap-2">
                <a
                  href={`/${user?.role}/notifications`}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors duration-150 flex items-center whitespace-nowrap min-h-[32px] items-center justify-center"
                  onClick={() => setIsOpen(false)}
                >
                  View all
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
                
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {Math.min(notifications.length, 8)} of {notifications.length}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;