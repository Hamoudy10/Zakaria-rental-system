// src/context/NotificationContext.jsx
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

  const { user: authUser } = useAuth();
  const isMountedRef = useRef(true);
  const lastUserIdRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset state when user changes
  useEffect(() => {
    if (authUser?.id !== lastUserIdRef.current) {
      console.log('👤 User changed, resetting notification state');
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setError(null);
      lastUserIdRef.current = authUser?.id;
    }
  }, [authUser?.id]);

  // Check if user is authenticated
  const isAuthenticated = useCallback(() => {
    return !!authUser && !!localStorage.getItem('token');
  }, [authUser]);

  // SIMPLIFIED fetchNotifications - FIXED VERSION
  const fetchNotifications = useCallback(async (options = {}) => {
    const { _retry = 0 } = options;
    if (!isAuthenticated()) return;
    try {
      console.log('🔄 Starting to fetch notifications...', options);
      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }
      
      const {
        page = 1,
        limit = 20,
        type,
        is_read
      } = options;

      // Use the API call with proper parameters
      const response = await notificationAPI.getNotifications(limit, (page - 1) * limit, type, is_read);
      
      console.log('📨 API Response received:', response.data);

      if (response.data && response.data.success) {
        const { notifications: newNotifications, pagination: paginationData } = response.data.data;
        
        console.log(`✅ Successfully loaded ${newNotifications?.length || 0} notifications for user ${authUser?.id}`);
        
        if (isMountedRef.current) {
          setNotifications(prev => {
            // preserve local temps not duplicated by server response
            const localTemps = prev.filter(n => n.is_local);
            const keptLocalTemps = localTemps.filter(lt => !(newNotifications || []).some(sn => sn.id === lt.id || sn.message === lt.message));
            // combine local temps (first) and server results
            return [...keptLocalTemps, ...(newNotifications || [])];
          });

          setPagination(paginationData || {
            currentPage: parseInt(page),
            totalPages: 1,
            totalCount: 0,
            hasNext: false,
            hasPrev: false
          });
        }
      } else {
        throw new Error(response.data?.message || 'Invalid response format from server');
      }
    } catch (err) {
      if (err.response?.status === 429 && _retry < 3) {
        // Retry after server window (2s) with limited attempts
        setTimeout(() => fetchNotifications({ ...options, _retry: _retry + 1 }), 2000 * (_retry + 1));
        return;
      }
      console.error('❌ Error fetching notifications:', err);
      if (isMountedRef.current) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch notifications');
        setNotifications([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [isAuthenticated, authUser?.id]);

  // SIMPLIFIED fetchUnreadCount - FIXED VERSION
  const fetchUnreadCount = useCallback(async (options = {}) => {
    const { _retry = 0 } = options;
    if (!isAuthenticated()) {
      if (isMountedRef.current) {
        setUnreadCount(0);
      }
      return 0;
    }

    try {
      console.log('🔢 Fetching unread count...');
      const response = await notificationAPI.getUnreadCount();
      
      if (response.data && response.data.success) {
        const newUnreadCount = response.data.data.unreadCount || 0;
        console.log(`✅ Unread count: ${newUnreadCount} for user ${authUser?.id}`);
        
        if (isMountedRef.current) {
          setUnreadCount(newUnreadCount);
        }
        return newUnreadCount;
      }
      return 0;
    } catch (err) {
    if (err.response?.status === 429 && _retry < 3) {
      // Retry after server window (2s) with exponential backoff (limited attempts)
      setTimeout(() => fetchUnreadCount({ ...options, _retry: _retry + 1 }), 2000 * (_retry + 1));
      return;
    }

      console.error('❌ Error fetching unread count:', err);
      if (isMountedRef.current) {
        setUnreadCount(0);
      }
      return 0;
    }
  }, [isAuthenticated, authUser?.id]);

  // SIMPLIFIED markAsRead - FIXED VERSION
  const markAsRead = useCallback(async (notificationId) => {
    if (!isAuthenticated() || !notificationId) throw new Error('User not authenticated or missing notification ID');

    const previousNotifications = [...notifications];
    const prevUnread = unreadCount;

    const target = notifications.find(n => n.id === notificationId);

    // Local-only notification -> mark locally (no API call)
    if (target?.is_local) {
      if (isMountedRef.current) {
        setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n));
      }
      return { ...target, is_read: true };
    }

    // Server notification: optimistic update then call API & reconcile
    try {
      if (isMountedRef.current) {
        setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      const response = await notificationAPI.markAsRead(notificationId);

      if (!response.data.success) {
        // revert
        if (isMountedRef.current) {
          setNotifications(previousNotifications);
          setUnreadCount(prevUnread);
        }
        throw new Error(response.data.message || 'Failed to mark notification as read');
      }

      const updated = response.data.data;
      if (isMountedRef.current && updated) {
        setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
        await fetchUnreadCount(); // re-sync unread count
      }
      return updated;
    } catch (err) {
      if (isMountedRef.current) setError(err.response?.data?.message || err.message || 'Failed to mark notification as read');
      throw err;
    }
  }, [notifications, unreadCount, isAuthenticated, fetchUnreadCount]);

  // SIMPLIFIED markAllAsRead - FIXED VERSION
  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated()) throw new Error('User not authenticated');

    const previousNotifications = [...notifications];

    try {
      // mark local temps as read immediately
      if (isMountedRef.current) {
        setNotifications(prev => prev.map(n => n.is_local ? ({ ...n, is_read: true, read_at: new Date().toISOString() }) : n));
        setUnreadCount(0); // temporarily set to 0; will re-sync
      }

      const response = await notificationAPI.markAllAsRead();

      if (!response.data.success) {
        if (isMountedRef.current) {
          setNotifications(previousNotifications);
          setUnreadCount(previousNotifications.filter(n => !n.is_read).length);
        }
        throw new Error(response.data.message || 'Failed to mark all notifications as read');
      }

      // Server returned updated notifications
      const updatedNotifications = response.data.data?.notifications || [];
      if (isMountedRef.current) {
        const localTemps = previousNotifications.filter(n => n.is_local);
        // keep local temps (now read) and server list
        setNotifications([...localTemps.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })), ...updatedNotifications]);
        await fetchUnreadCount(); // re-sync authoritative unread count
      }
      return response.data.data;
    } catch (err) {
      if (isMountedRef.current) setError(err.response?.data?.message || err.message || 'Failed to mark all notifications as read');
      throw err;
    }
  }, [notifications, isAuthenticated, fetchUnreadCount]);

  // SIMPLIFIED deleteNotification - FIXED VERSION
  const deleteNotification = useCallback(async (notificationId) => {
    if (!isAuthenticated() || !notificationId) {
      throw new Error('User not authenticated or missing notification ID');
    }

    try {
      console.log(`🗑️ Deleting notification ${notificationId}`);
      
      const notificationToDelete = notifications.find(n => n.id === notificationId);
      const previousNotifications = [...notifications];
      
      if (isMountedRef.current) {
        setNotifications(prev => prev.filter(notification => notification.id !== notificationId));
        
        if (notificationToDelete && !notificationToDelete.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }

      const response = await notificationAPI.deleteNotification(notificationId);
      
      if (!response.data.success) {
        if (isMountedRef.current) {
          setNotifications(previousNotifications);
          setUnreadCount(previousNotifications.filter(n => !n.is_read).length);
        }
        throw new Error(response.data.message || 'Failed to delete notification');
      }

      return response.data.data;
    } catch (err) {
      console.error('❌ Error deleting notification:', err);
      if (isMountedRef.current) {
        setError(err.response?.data?.message || err.message || 'Failed to delete notification');
      }
      throw err;
    }
  }, [notifications, isAuthenticated]);

  // SIMPLIFIED refreshNotifications - FIXED VERSION
  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated()) {
      console.log('❌ Not authenticated, skipping refresh');
      return;
    }

    try {
      console.log('🔄 Refreshing notifications...');
      await Promise.all([
        fetchNotifications({ page: 1 }),
        fetchUnreadCount()
      ]);
    } catch (error) {
      console.error('❌ Error refreshing notifications:', error);
    }
  }, [fetchNotifications, fetchUnreadCount, isAuthenticated]);

  
   // Initialize data when authenticated or user changes
   useEffect(() => {
     const initializeData = async () => {
       if (isAuthenticated()) {
         console.log('🔐 User authenticated, initializing notification data...');
         await refreshNotifications();
       } else {
         console.log('🔒 User not authenticated, clearing notification data');
         if (isMountedRef.current) {
           setNotifications([]);
           setUnreadCount(0);
           setLoading(false);
         }
       }
     };
 
     initializeData();
   }, [isAuthenticated, refreshNotifications, authUser?.id]);

  // Listen for incoming chat events (dispatched from ChatContext) to create an immediate local notification
useEffect(() => {
  const handler = (e) => {
    const data = e.detail || {};
    const message = data.message;
    const local = {
      id: `local-chat-${Date.now()}`,
      type: 'chat',
      message: `You have received a message from ${message?.first_name || 'Someone'} ${message?.last_name || ''}`.trim(),
      data,
      is_local: true,      // mark as local-only
      is_read: false,
      created_at: new Date().toISOString(),
    };

    // Replace any existing local notification for the same conversation (avoid duplicates)
    setNotifications(prev => {
      const withoutSameConv = prev.filter(n => !(n.is_local && n.data?.conversationId === data.conversationId));
      return [local, ...withoutSameConv];
    });

    // DO NOT change server-based unreadCount (server is authoritative)
  };

  window.addEventListener('incoming_chat_notification', handler);
  return () => window.removeEventListener('incoming_chat_notification', handler);
}, [authUser?.id]);

  // Clear all read notifications
  const clearReadNotifications = useCallback(async () => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      console.log('🧹 Clearing read notifications');
      
      const previousNotifications = [...notifications];
      if (isMountedRef.current) {
        setNotifications(prev => prev.filter(notification => !notification.is_read));
      }

      const response = await notificationAPI.clearReadNotifications();
      
      if (!response.data.success) {
        if (isMountedRef.current) {
          setNotifications(previousNotifications);
        }
        throw new Error(response.data.message || 'Failed to clear read notifications');
      }

      return response.data.data;
    } catch (err) {
      console.error('❌ Error clearing read notifications:', err);
      if (isMountedRef.current) {
        setError(err.response?.data?.message || err.message || 'Failed to clear read notifications');
      }
      throw err;
    }
  }, [notifications, isAuthenticated]);

  // Create broadcast notification (admin only)
  const createBroadcastNotification = useCallback(async (broadcastData) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    try {
      console.log('📢 Creating broadcast notification:', broadcastData);
      const response = await notificationAPI.createBroadcastNotification(broadcastData);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to create broadcast notification');
      }

      return response.data.data;
    } catch (err) {
      console.error('❌ Error creating broadcast notification:', err);
      if (isMountedRef.current) {
        setError(err.response?.data?.message || err.message || 'Failed to create broadcast notification');
      }
      throw err;
    }
  }, [isAuthenticated]);

  // Get notifications by type
  const getNotificationsByType = useCallback(async (type, options = {}) => {
    if (!isAuthenticated()) {
      throw new Error('User not authenticated');
    }

    const { page = 1, limit = 20 } = options;
    
    if (isMountedRef.current) {
      setLoading(true);
      setError(null);
    }
    
    try {
      const response = await notificationAPI.getNotificationsByType(type, page, limit);
      
      if (response.data && response.data.success) {
        const { notifications: typedNotifications, pagination: paginationData } = response.data.data;
        
        if (isMountedRef.current) {
          setNotifications(typedNotifications || []);
          setPagination(paginationData || {
            currentPage: parseInt(page),
            totalPages: 1,
            totalCount: 0,
            hasNext: false,
            hasPrev: false
          });
        }
        
        return typedNotifications;
      } else {
        throw new Error(response.data?.message || 'Invalid response format');
      }
    } catch (err) {
      console.error(`❌ Error fetching ${type} notifications:`, err);
      if (isMountedRef.current) {
        setError(err.response?.data?.message || err.message || `Failed to fetch ${type} notifications`);
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [isAuthenticated]);

  // Get notification stats
  const fetchNotificationStats = useCallback(async () => {
    if (!isAuthenticated()) {
      return {};
    }

    try {
      const response = await notificationAPI.getNotificationStats();
      
      if (response.data && response.data.success) {
        return response.data.data;
      }
      return {};
    } catch (err) {
      console.error('❌ Error fetching notification stats:', err);
      return {};
    }
  }, [isAuthenticated]);

  // Clear error
  const clearError = useCallback(() => {
    if (isMountedRef.current) {
      setError(null);
    }
  }, []);

  // Initialize data when authenticated or user changes
  useEffect(() => {
    const initializeData = async () => {
      if (isAuthenticated()) {
        console.log('🔐 User authenticated, initializing notification data...');
        await refreshNotifications();
      } else {
        console.log('🔒 User not authenticated, clearing notification data');
        if (isMountedRef.current) {
          setNotifications([]);
          setUnreadCount(0);
          setLoading(false);
        }
      }
    };

    initializeData();
  }, [isAuthenticated, refreshNotifications, authUser?.id]);

  const value = React.useMemo(() => ({
    // State
    notifications,
    loading,
    error,
    unreadCount,
    pagination,
    stats: {}, // Simplified for now
    
    // Actions
    fetchNotifications,
    fetchUnreadCount,
    fetchNotificationStats,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    createBroadcastNotification,
    refreshNotifications,
    getNotificationsByType,
    
    // Utility
    clearError,
    hasUnread: unreadCount > 0,
    hasNotifications: notifications.length > 0
  }), [
    notifications,
    loading,
    error,
    unreadCount,
    pagination,
    fetchNotifications,
    fetchUnreadCount,
    fetchNotificationStats,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    createBroadcastNotification,
    refreshNotifications,
    getNotificationsByType,
    clearError
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};