import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { notificationAPI } from '../services/api';
import { useAuth } from './AuthContext';

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

  const { user: authUser } = useAuth();

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

  // Enhanced polling with debouncing and pause functionality
  const startPolling = useCallback((interval = 60000) => {
    if (!isAuthenticated()) {
      return;
    }

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    if (isPollingPausedRef.current) {
      return;
    }

    pollingIntervalRef.current = setInterval(async () => {
      if (isMountedRef.current && !isPollingPausedRef.current && isAuthenticated()) {
        try {
          await fetchUnreadCount();
          
          const now = Date.now();
          if (now - lastFetchRef.current > 300000) {
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

  // Pause polling
  const pausePolling = useCallback(() => {
    isPollingPausedRef.current = true;
    stopPolling();
  }, [stopPolling]);

  // Resume polling
  const resumePolling = useCallback(() => {
    isPollingPausedRef.current = false;
    if (isAuthenticated()) {
      startPolling();
    }
  }, [isAuthenticated, startPolling]);

  // Debounced fetch function
  const debouncedFetch = useCallback((fn, delay = 1000) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }, []);

  // Fetch notifications with pagination and filters
  const fetchNotifications = useCallback(debouncedFetch(async (options = {}) => {
    if (!isAuthenticated()) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
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
        
        setNotifications(newNotifications || []);
        setPagination(paginationData || {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          hasNext: false,
          hasPrev: false
        });
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
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

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated()) {
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
      console.error('Error fetching unread count:', err);
    }
    return 0;
  }, [isAuthenticated]);

  // Fetch notification statistics
  const fetchNotificationStats = useCallback(async () => {
    if (!isAuthenticated()) {
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
      console.error('Error fetching notification stats:', err);
    }
    return {};
  }, [isAuthenticated]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    if (!notificationId) {
      console.error('Notification ID is required');
      return;
    }

    setError(null);
    
    try {
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

      const response = await notificationAPI.markAsRead(notificationId);
      
      if (!response.data.success) {
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        throw new Error(response.data.message || 'Failed to mark notification as read');
      }

      return response.data.data;
    } catch (err) {
      console.error('Error marking notification as read:', err);
      const errorMessage = err.response?.data?.message || 'Failed to mark notification as read';
      setError(errorMessage);
      throw err;
    }
  }, [notifications, unreadCount, isAuthenticated]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    setError(null);
    
    try {
      const previousNotifications = [...notifications];
      
      setNotifications(prev => 
        prev.map(notification => ({
          ...notification,
          is_read: true,
          read_at: notification.read_at || new Date().toISOString()
        }))
      );
      
      setUnreadCount(0);

      const response = await notificationAPI.markAllAsRead();
      
      if (!response.data.success) {
        setNotifications(previousNotifications);
        setUnreadCount(previousNotifications.filter(n => !n.is_read).length);
        throw new Error(response.data.message || 'Failed to mark all notifications as read');
      }

      return response.data.data;
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      const errorMessage = err.response?.data?.message || 'Failed to mark all notifications as read';
      setError(errorMessage);
      throw err;
    }
  }, [notifications, isAuthenticated]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    if (!notificationId) {
      console.error('Notification ID is required');
      return;
    }

    setError(null);
    
    try {
      const notificationToDelete = notifications.find(n => n.id === notificationId);
      const previousNotifications = [...notifications];
      
      setNotifications(prev => prev.filter(notification => notification.id !== notificationId));
      
      if (notificationToDelete && !notificationToDelete.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      const response = await notificationAPI.deleteNotification(notificationId);
      
      if (!response.data.success) {
        setNotifications(previousNotifications);
        setUnreadCount(previousNotifications.filter(n => !n.is_read).length);
        throw new Error(response.data.message || 'Failed to delete notification');
      }

      return response.data.data;
    } catch (err) {
      console.error('Error deleting notification:', err);
      const errorMessage = err.response?.data?.message || 'Failed to delete notification';
      setError(errorMessage);
      throw err;
    }
  }, [notifications, isAuthenticated]);

  // Clear all read notifications
  const clearReadNotifications = useCallback(async () => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    setError(null);
    
    try {
      const previousNotifications = [...notifications];
      
      setNotifications(prev => prev.filter(notification => !notification.is_read));

      const response = await notificationAPI.clearReadNotifications();
      
      if (!response.data.success) {
        setNotifications(previousNotifications);
        throw new Error(response.data.message || 'Failed to clear read notifications');
      }

      return response.data.data;
    } catch (err) {
      console.error('Error clearing read notifications:', err);
      const errorMessage = err.response?.data?.message || 'Failed to clear read notifications';
      setError(errorMessage);
      throw err;
    }
  }, [notifications, isAuthenticated]);

  // Create notification
  const createNotification = useCallback(async (notificationData) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    setError(null);
    
    try {
      const response = await notificationAPI.createNotification(notificationData);
      
      if (response.data.success) {
        const newNotification = response.data.data;
        
        setNotifications(prev => [newNotification, ...prev]);
        
        if (!newNotification.is_read) {
          setUnreadCount(prev => prev + 1);
        }

        return newNotification;
      } else {
        throw new Error(response.data.message || 'Failed to create notification');
      }
    } catch (err) {
      console.error('Error creating notification:', err);
      const errorMessage = err.response?.data?.message || 'Failed to create notification';
      setError(errorMessage);
      throw err;
    }
  }, [isAuthenticated]);

  // Create broadcast notification
  const createBroadcastNotification = useCallback(async (broadcastData) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    setError(null);
    
    try {
      const response = await notificationAPI.createBroadcastNotification(broadcastData);
      
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to create broadcast notification');
      }
    } catch (err) {
      console.error('Error creating broadcast notification:', err);
      const errorMessage = err.response?.data?.message || 'Failed to create broadcast notification';
      setError(errorMessage);
      throw err;
    }
  }, [isAuthenticated]);

  // Refresh all notification data
  const refreshNotifications = useCallback(debouncedFetch(async () => {
    if (!isAuthenticated()) {
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
    } catch (error) {
      console.error('Error refreshing notifications:', error);
    }
  }), [fetchNotifications, fetchUnreadCount, fetchNotificationStats, isAuthenticated]);

  // Filter notifications by type
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
        
        return typedNotifications;
      }
    } catch (err) {
      console.error(`Error fetching ${type} notifications:`, err);
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
      const localNotification = notifications.find(n => n.id === notificationId);
      if (localNotification) {
        return localNotification;
      }

      console.warn('Notification not found locally, API method not implemented');
      return null;
    } catch (error) {
      console.error('Error getting notification by ID:', error);
      return null;
    }
  }, [notifications]);

  // Load initial data
  useEffect(() => {
    const initializeNotifications = async () => {
      if (isAuthenticated()) {
        await refreshNotifications();
        startPolling(60000);
      } else {
        setNotifications([]);
        setUnreadCount(0);
        stopPolling();
      }
    };

    initializeNotifications();

    return () => {
      stopPolling();
    };
  }, [isAuthenticated]);

  // Listen for authentication changes
  useEffect(() => {
    if (!isAuthenticated()) {
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