// src/context/NotificationContext.jsx
import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { notificationAPI } from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { user: authUser, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState({
    currentPage: 1, totalPages: 1, totalCount: 0, hasNext: false, hasPrev: false,
  });

  const isMountedRef = useRef(true);
  const pollingRef = useRef(null);
  const backoffRef = useRef(30000); 
  const MAX_BACKOFF = 5 * 60 * 1000;

  useEffect(() => {
    isMountedRef.current = true;
    return () => { 
      isMountedRef.current = false; 
      if (pollingRef.current) clearTimeout(pollingRef.current); 
    };
  }, []);

  const isAuthenticated = useCallback(() => !!authUser && !!token, [authUser, token]);
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Safe fetch wrapper with retry logic for network errors
  const safeFetch = useCallback(async (fetchFn, retries = 3, delay = 2000) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetchFn();
        if (response?.data) return response.data;
        throw new Error('Invalid response format');
      } catch (err) {
        // If it's a 429 (Rate Limit), do NOT retry immediately (let polling handle it via backoff)
        if (err.response?.status === 429) {
          throw err; 
        }
        if (attempt < retries) {
          console.warn(`Retrying (${attempt + 1}/${retries})...`);
          await wait(delay);
          delay *= 2;
        } else {
          throw err;
        }
      }
    }
  }, []);

  const fetchNotifications = useCallback(async ({ page = 1, limit = 20, type, is_read } = {}) => {
    if (!isAuthenticated()) return [];
    setLoading(true);
    try {
      const data = await safeFetch(() => notificationAPI.getNotifications(limit, (page - 1) * limit, type, is_read));
      if (!data.success) throw new Error(data.message || 'Failed to fetch notifications');

      const newNotifications = data.data?.notifications || [];
      const paginationData = data.data?.pagination || { currentPage: page, totalPages: 1, totalCount: newNotifications.length, hasNext: false, hasPrev: false };

      if (isMountedRef.current) {
        setNotifications(newNotifications); // Only set new ones to avoid merge complexity
        setPagination(paginationData);
      }

      return newNotifications;
    } catch (err) {
      console.error('❌ Error fetching notifications:', err);
      // Don't set generic error for 429 as polling handles it, but set for others
      if (err.response?.status !== 429) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch notifications');
      }
      throw err; // Allow poll to catch this
    } finally {
      setLoading(false);
    }
    }, [isAuthenticated, safeFetch]); // <--- REMOVED 'notifications' DEP

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated()) { 
      if (isMountedRef.current) setUnreadCount(0); 
      return 0; 
    }
    try {
      const data = await safeFetch(() => notificationAPI.getUnreadCount());
      const newCount = data.success ? data.data?.unreadCount || 0 : 0;
      if (isMountedRef.current) setUnreadCount(newCount);
      return newCount;
    } catch (err) {
      console.error('❌ Error fetching unread count:', err);
      // If 429, don't spam console, just reset to 0 to prevent UI freeze or leave as is
      if (err.response?.status === 429) return;
      if (isMountedRef.current) setUnreadCount(0);
      throw err;
    }
  }, [isAuthenticated, safeFetch]); // <--- REMOVED 'notifications' DEP

  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated()) return;
    try {
      await Promise.all([fetchNotifications({ page: 1 }), fetchUnreadCount()]);
      backoffRef.current = 30000; // reset backoff on success
    } catch (err) {
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
      console.warn(`⚠️ Polling error (increasing backoff to ${backoffRef.current}ms):`, err.message);
    }
  }, [fetchNotifications, fetchUnreadCount, isAuthenticated]); // <--- REMOVED 'notifications' DEP

  const clearError = useCallback(() => { if (isMountedRef.current) setError(null); }, []);

  const markAsRead = async (id) => {
    try {
      const response = await notificationAPI.markAsRead(id);
      if (response.data.success) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      setError('Failed to mark as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await notificationAPI.markAllAsRead();
      if (response.data.success) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      setError('Failed to mark all as read');
    }
  };

  const deleteNotification = async (id) => {
    try {
      const response = await notificationAPI.deleteNotification(id);
      if (response.data.success) {
        setNotifications(prev => {
          const deleted = prev.find(n => n.id === id);
          return prev.filter(n => n.id !== id);
        });
        if (deleted && !deleted.is_read) setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      setError('Failed to delete notification');
    }
  };

  const clearReadNotifications = async () => {
    try {
      const response = await notificationAPI.clearReadNotifications();
      if (response.data.success) {
        setNotifications(prev => prev.filter(n => !n.is_read));
      }
    } catch (err) {
      setError('Failed to clear read notifications');
    }
  };

  const createBroadcastNotification = async (data) => {
    try {
      const response = await notificationAPI.createBroadcastNotification(data);
      return response.data;
    } catch (err) {
      throw new Error(err.response?.data?.message || 'Broadcast failed');
    }
  };

  // --- POLLING LOGIC ---
  useEffect(() => {
    if (!isAuthenticated()) {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      return;
    }

    const poll = async () => {
      if (!isMountedRef.current || !isAuthenticated()) return;
      try {
        await refreshNotifications();
      } catch (err) {
        // Only log error for debugging, don't crash the loop
        // backoff is already adjusted in refreshNotifications
      } finally {
        // Always reschedule
        if (isMountedRef.current && isAuthenticated()) {
          pollingRef.current = setTimeout(poll, backoffRef.current);
        }
      }
    };

    poll();

    return () => { 
      if (pollingRef.current) clearTimeout(pollingRef.current); 
    };
  }, [isAuthenticated, refreshNotifications]); // <--- REF DEPS REMOVED 'notifications' to break loop

  const value = React.useMemo(() => ({
    notifications,
    loading,
    error,
    unreadCount,
    pagination,
    fetchNotifications,
    fetchUnreadCount,
    refreshNotifications,
    clearError,
    hasUnread: unreadCount > 0,
    hasNotifications: notifications.length > 0,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    createBroadcastNotification,
  }), [notifications, loading, error, unreadCount, pagination, fetchNotifications, fetchUnreadCount, refreshNotifications, markAsRead, markAllAsRead, deleteNotification, clearReadNotifications, createBroadcastNotification]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};