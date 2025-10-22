import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { notificationAPI } from '../services/api';
import { useAuth } from './AuthContext'; // ADD THIS IMPORT

const NotificationContext = createContext(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNext: false,
    hasPrev: false
  });
  const [stats, setStats] = useState({
    total: 0,
    unread: 0,
    byType: {},
    recent: 0
  });

  const { user: authUser } = useAuth(); // ADD AUTH CHECK

  // Refs for polling control
  const pollingIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef(0);
  const isPollingPausedRef = useRef(false);

  // Check if user is authenticated
  const isAuthenticated = useCallback(() => {
    return !!authUser;
  }, [authUser]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, []);

  // Enhanced polling with debouncing and pause functionality - ONLY WHEN AUTHENTICATED
  const startPolling = useCallback((interval = 60000) => {
    if (!isAuthenticated()) {
      console.log('🚫 NotificationContext: User not authenticated, skipping polling start');
      return;
    }

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Don't start polling if paused
    if (isPollingPausedRef.current) {
      return;
    }

    pollingIntervalRef.current = setInterval(async () => {
      if (isMountedRef.current && !isPollingPausedRef.current && isAuthenticated()) {
        try {
          // Only fetch unread count, not full notifications
          await fetchUnreadCount();
          
          // Refresh stats only every 5 minutes during polling
          const now = Date.now();
          if (now - lastFetchRef.current > 300000) { // 5 minutes
            await fetchNotificationStats();
            lastFetchRef.current = now;
          }
        } catch (error) {
          console.warn('Polling error:', error);
        }
      }
    }, interval);
  }, [isAuthenticated]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Pause polling (useful when user is inactive)
  const pausePolling = useCallback(() => {
    isPollingPausedRef.current = true;
    stopPolling();
  }, []);

  // Resume polling
  const resumePolling = useCallback(() => {
    isPollingPausedRef.current = false;
    if (isAuthenticated()) {
      startPolling();
    }
  }, [isAuthenticated, startPolling]);

  // Debounced fetch function to prevent rapid successive calls
  const debouncedFetch = useCallback((fn, delay = 1000) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }, []);

  // Fetch notifications with pagination and filters - with debouncing - ONLY WHEN AUTHENTICATED
  const fetchNotifications = useCallback(debouncedFetch(async (options = {}) => {
    if (!isAuthenticated()) {
      console.log('🚫 NotificationContext: User not authenticated, skipping notification fetch');
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const {
      page = 1,
      limit = 20,
      type,
      is_read,
      related_entity_type,
      start_date,
      end_date
    } = options;

    // Don't fetch if already loading
    if (loading) return;

    setLoading(true);
    setError(null);
    
    try {
      const response = await notificationAPI.getNotifications(
        limit,
        (page - 1) * limit,
        type,
        is_read,
        related_entity_type,
        start_date,
        end_date
      );

      if (response.data.success) {
        const { notifications: newNotifications, pagination: paginationData } = response.data.data;
        
        setNotifications(newNotifications);
        setPagination(paginationData);
        
        console.log(`✅ Loaded ${newNotifications.length} notifications`);
      }
    } catch (err) {
      console.error('❌ Error fetching notifications:', err);
      const errorMessage = err.response?.data?.message || 'Failed to fetch notifications';
      setError(errorMessage);
      
      if (isMountedRef.current) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }), [loading, isAuthenticated]);

  // Fetch unread count - optimized - ONLY WHEN AUTHENTICATED
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated()) {
      console.log('🚫 NotificationContext: User not authenticated, skipping unread count fetch');
      setUnreadCount(0);
      return 0;
    }

    try {
      const response = await notificationAPI.getUnreadCount();
      
      if (response.data.success) {
        const newUnreadCount = response.data.data.unreadCount;
        setUnreadCount(newUnreadCount);
        return newUnreadCount;
      }
    } catch (err) {
      console.error('❌ Error fetching unread count:', err);
    }
    return 0;
  }, [isAuthenticated]);

  // Fetch notification statistics - ONLY WHEN AUTHENTICATED
  const fetchNotificationStats = useCallback(async () => {
    if (!isAuthenticated()) {
      console.log('🚫 NotificationContext: User not authenticated, skipping stats fetch');
      setStats({
        total: 0,
        unread: 0,
        byType: {},
        recent: 0
      });
      return {};
    }

    try {
      const response = await notificationAPI.getNotificationStats();
      
      if (response.data.success) {
        setStats(response.data.data);
        return response.data.data;
      }
    } catch (err) {
      console.error('❌ Error fetching notification stats:', err);
    }
    return {};
  }, [isAuthenticated]);

  // Mark notification as read - ONLY WHEN AUTHENTICATED
  const markAsRead = useCallback(async (notificationId) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    if (!notificationId) {
      console.error('❌ Notification ID is required');
      return;
    }

    setError(null);
    
    try {
      // Optimistic update
      const previousNotifications = [...notifications];
      const previousUnreadCount = unreadCount;

      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { 
                ...notification, 
                is_read: true, 
                read_at: new Date().toISOString() 
              }
            : notification
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));

      // API call
      const response = await notificationAPI.markAsRead(notificationId);
      
      if (!response.data.success) {
        // Revert optimistic update on error
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        throw new Error(response.data.message || 'Failed to mark notification as read');
      }

      console.log('✅ Notification marked as read:', notificationId);
      return response.data.data;
    } catch (err) {
      console.error('❌ Error marking notification as read:', err);
      const errorMessage = err.response?.data?.message || 'Failed to mark notification as read';
      setError(errorMessage);
      throw err;
    }
  }, [notifications, unreadCount, isAuthenticated]);

  // Mark all notifications as read - ONLY WHEN AUTHENTICATED
  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    setError(null);
    
    try {
      // Optimistic update
      const previousNotifications = [...notifications];
      
      setNotifications(prev => 
        prev.map(notification => ({
          ...notification,
          is_read: true,
          read_at: notification.read_at || new Date().toISOString()
        }))
      );
      
      setUnreadCount(0);

      // API call
      const response = await notificationAPI.markAllAsRead();
      
      if (!response.data.success) {
        // Revert optimistic update on error
        setNotifications(previousNotifications);
        setUnreadCount(previousNotifications.filter(n => !n.is_read).length);
        throw new Error(response.data.message || 'Failed to mark all notifications as read');
      }

      console.log('✅ All notifications marked as read');
      return response.data.data;
    } catch (err) {
      console.error('❌ Error marking all notifications as read:', err);
      const errorMessage = err.response?.data?.message || 'Failed to mark all notifications as read';
      setError(errorMessage);
      throw err;
    }
  }, [notifications, isAuthenticated]);

  // Delete notification - ONLY WHEN AUTHENTICATED
  const deleteNotification = useCallback(async (notificationId) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    if (!notificationId) {
      console.error('❌ Notification ID is required');
      return;
    }

    setError(null);
    
    try {
      // Optimistic update
      const notificationToDelete = notifications.find(n => n.id === notificationId);
      const previousNotifications = [...notifications];
      
      setNotifications(prev => prev.filter(notification => notification.id !== notificationId));
      
      if (notificationToDelete && !notificationToDelete.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      // API call
      const response = await notificationAPI.deleteNotification(notificationId);
      
      if (!response.data.success) {
        // Revert optimistic update on error
        setNotifications(previousNotifications);
        setUnreadCount(previousNotifications.filter(n => !n.is_read).length);
        throw new Error(response.data.message || 'Failed to delete notification');
      }

      console.log('✅ Notification deleted:', notificationId);
      return response.data.data;
    } catch (err) {
      console.error('❌ Error deleting notification:', err);
      const errorMessage = err.response?.data?.message || 'Failed to delete notification';
      setError(errorMessage);
      throw err;
    }
  }, [notifications, isAuthenticated]);

  // Clear all read notifications - ONLY WHEN AUTHENTICATED
  const clearReadNotifications = useCallback(async () => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    setError(null);
    
    try {
      // Optimistic update
      const previousNotifications = [...notifications];
      
      setNotifications(prev => prev.filter(notification => !notification.is_read));

      // API call
      const response = await notificationAPI.clearReadNotifications();
      
      if (!response.data.success) {
        // Revert optimistic update on error
        setNotifications(previousNotifications);
        throw new Error(response.data.message || 'Failed to clear read notifications');
      }

      console.log('✅ Read notifications cleared');
      return response.data.data;
    } catch (err) {
      console.error('❌ Error clearing read notifications:', err);
      const errorMessage = err.response?.data?.message || 'Failed to clear read notifications';
      setError(errorMessage);
      throw err;
    }
  }, [notifications, isAuthenticated]);

  // Create notification - ONLY WHEN AUTHENTICATED
  const createNotification = useCallback(async (notificationData) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    setError(null);
    
    try {
      const response = await notificationAPI.createNotification(notificationData);
      
      if (response.data.success) {
        const newNotification = response.data.data;
        
        // Add to local state
        setNotifications(prev => [newNotification, ...prev]);
        
        if (!newNotification.is_read) {
          setUnreadCount(prev => prev + 1);
        }

        console.log('✅ Notification created:', newNotification.id);
        return newNotification;
      } else {
        throw new Error(response.data.message || 'Failed to create notification');
      }
    } catch (err) {
      console.error('❌ Error creating notification:', err);
      const errorMessage = err.response?.data?.message || 'Failed to create notification';
      setError(errorMessage);
      throw err;
    }
  }, [isAuthenticated]);

  // Create broadcast notification (admin only) - ONLY WHEN AUTHENTICATED
  const createBroadcastNotification = useCallback(async (broadcastData) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    setError(null);
    
    try {
      const response = await notificationAPI.createBroadcastNotification(broadcastData);
      
      if (response.data.success) {
        console.log('✅ Broadcast notification created');
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to create broadcast notification');
      }
    } catch (err) {
      console.error('❌ Error creating broadcast notification:', err);
      const errorMessage = err.response?.data?.message || 'Failed to create broadcast notification';
      setError(errorMessage);
      throw err;
    }
  }, [isAuthenticated]);

  // Refresh all notification data - with debouncing - ONLY WHEN AUTHENTICATED
  const refreshNotifications = useCallback(debouncedFetch(async () => {
    if (!isAuthenticated()) {
      console.log('🚫 NotificationContext: User not authenticated, skipping refresh');
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      await Promise.all([
        fetchNotifications({ page: 1 }),
        fetchUnreadCount(),
        fetchNotificationStats()
      ]);
      console.log('✅ All notification data refreshed');
    } catch (error) {
      console.error('❌ Error refreshing notifications:', error);
    }
  }), [fetchNotifications, fetchUnreadCount, fetchNotificationStats, isAuthenticated]);

  // Filter notifications by type - ONLY WHEN AUTHENTICATED
  const getNotificationsByType = useCallback(async (type, options = {}) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const { page = 1, limit = 20 } = options;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await notificationAPI.getNotificationsByType(type, page, limit);
      
      if (response.data.success) {
        const { notifications: typedNotifications, pagination: paginationData } = response.data.data;
        
        setNotifications(typedNotifications);
        setPagination(paginationData);
        
        console.log(`✅ Loaded ${typedNotifications.length} ${type} notifications`);
        return typedNotifications;
      }
    } catch (err) {
      console.error(`❌ Error fetching ${type} notifications:`, err);
      const errorMessage = err.response?.data?.message || `Failed to fetch ${type} notifications`;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Get specific notification by ID
  const getNotificationById = useCallback(async (notificationId) => {
    try {
      // First check if we have it locally
      const localNotification = notifications.find(n => n.id === notificationId);
      if (localNotification) {
        return localNotification;
      }

      // If not found locally, we'd need to fetch from API
      console.warn('Notification not found locally, API method not implemented');
      return null;
    } catch (error) {
      console.error('❌ Error getting notification by ID:', error);
      return null;
    }
  }, [notifications]);

  // Load initial data - only once and ONLY WHEN AUTHENTICATED
  useEffect(() => {
    const initializeNotifications = async () => {
      if (isAuthenticated()) {
        console.log('🔄 NotificationContext: User authenticated, initializing notifications...');
        await refreshNotifications();
        // Start polling for updates with longer interval
        startPolling(60000);
      } else {
        console.log('🚫 NotificationContext: User not authenticated, skipping initialization');
        setNotifications([]);
        setUnreadCount(0);
        stopPolling();
      }
    };

    initializeNotifications();

    return () => {
      stopPolling();
    };
  }, [isAuthenticated]); // Add isAuthenticated dependency

  // Listen for authentication changes
  useEffect(() => {
    if (!isAuthenticated()) {
      console.log('🚫 NotificationContext: User logged out, clearing notifications');
      setNotifications([]);
      setUnreadCount(0);
      stopPolling();
    }
  }, [authUser, isAuthenticated, stopPolling]);

  const value = React.useMemo(() => ({
    // State
    notifications,
    loading,
    error,
    unreadCount,
    pagination,
    stats,
    
    // Actions
    fetchNotifications,
    fetchUnreadCount,
    fetchNotificationStats,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    createNotification,
    createBroadcastNotification,
    refreshNotifications,
    getNotificationsByType,
    getNotificationById,
    
    // Polling control
    startPolling,
    stopPolling,
    pausePolling,
    resumePolling,
    
    // Utility
    clearError: () => setError(null),
    hasUnread: unreadCount > 0,
    hasNotifications: notifications.length > 0,
    isAuthenticated: isAuthenticated()
  }), [
    notifications,
    loading,
    error,
    unreadCount,
    pagination,
    stats,
    fetchNotifications,
    fetchUnreadCount,
    fetchNotificationStats,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    createNotification,
    createBroadcastNotification,
    refreshNotifications,
    getNotificationsByType,
    getNotificationById,
    startPolling,
    stopPolling,
    pausePolling,
    resumePolling,
    isAuthenticated
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};