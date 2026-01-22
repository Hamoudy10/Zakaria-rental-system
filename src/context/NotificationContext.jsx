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
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState({
    currentPage: 1, totalPages: 1, totalCount: 0, hasNext: false, hasPrev: false,
  });

  const isMountedRef = useRef(true);
  const pollingRef = useRef(null);
  const backoffRef = useRef(30000); // Start polling every 30s
  const MAX_BACKOFF = 5 * 60 * 1000; 

  useEffect(() => {
    isMountedRef.current = true;
    return () => { 
      isMountedRef.current = false; 
      if (pollingRef.current) clearTimeout(pollingRef.current); 
    };
  }, []);

  const isAuthenticated = useCallback(() => !!user && !!token, [user, token]);
  
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper to handle 429s centrally
  const handleFetch = useCallback(async (apiCall) => {
    try {
      const response = await apiCall();
      return { success: true, data: response.data };
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn('⚠️ Rate limit hit (429). Backing off.');
        // Double backoff on 429
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        return { success: false, status: 429 };
      }
      return { success: false, error: err };
    }
  }, []);

  // Fetch list ONLY
  const fetchNotifications = useCallback(async (params = {}) => {
    if (!isAuthenticated()) return;
    setLoading(true);
    
    const result = await handleFetch(() => notificationAPI.getNotifications({
      limit: params.limit || 20,
      page: params.page || 1,
      type: params.type,
      is_read: params.is_read
    }));

    if (isMountedRef.current) {
      setLoading(false);
      if (result.success) {
        setNotifications(result.data.data?.notifications || []);
        setPagination(result.data.data?.pagination || {});
        // Reset backoff on success
        backoffRef.current = 30000;
      } else if (result.status !== 429) {
        setError(result.error?.response?.data?.message || 'Failed to fetch notifications');
      }
    }
  }, [isAuthenticated, handleFetch]);

  // Fetch count ONLY
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated()) return;
    
    const result = await handleFetch(() => notificationAPI.getUnreadCount());
    
    if (isMountedRef.current && result.success) {
      setUnreadCount(result.data.data?.unreadCount || 0);
    }
  }, [isAuthenticated, handleFetch]);

  // SEQUENTIAL Refresh: List -> Wait 2.5s -> Count
  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated()) return;

    // 1. Fetch notifications
    await fetchNotifications({ page: 1 });
    
    // 2. Wait 2500ms to clear the 2000ms rate limit window
    await wait(2500);

    // 3. Fetch count
    await fetchUnreadCount();

  }, [isAuthenticated, fetchNotifications, fetchUnreadCount]);

  // Context Actions
  const markAsRead = async (id) => {
    await notificationAPI.markAsRead(id);
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    await notificationAPI.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const deleteNotification = async (id) => {
    await notificationAPI.deleteNotification(id);
    setNotifications(prev => {
      const deleted = prev.find(n => n.id === id);
      if (deleted && !deleted.is_read) setUnreadCount(prev => Math.max(0, prev - 1));
      return prev.filter(n => n.id !== id);
    });
  };

  const clearReadNotifications = async () => {
    await notificationAPI.clearReadNotifications();
    setNotifications(prev => prev.filter(n => !n.is_read));
  };

  const createBroadcastNotification = async (data) => {
    const response = await notificationAPI.createBroadcastNotification(data);
    return response.data;
  };

  const clearError = () => setError(null);

  // Polling Effect
  useEffect(() => {
    if (!isAuthenticated()) {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      return;
    }

    const poll = async () => {
      if (!isMountedRef.current) return;
      await refreshNotifications();
      // Schedule next poll based on dynamic backoff
      pollingRef.current = setTimeout(poll, backoffRef.current);
    };

    poll();

    return () => { if (pollingRef.current) clearTimeout(pollingRef.current); };
  }, [isAuthenticated, refreshNotifications]);

  const value = React.useMemo(() => ({
    notifications, loading, error, unreadCount, pagination,
    fetchNotifications, fetchUnreadCount, refreshNotifications,
    markAsRead, markAllAsRead, deleteNotification, 
    clearReadNotifications, createBroadcastNotification, clearError
  }), [notifications, loading, error, unreadCount, pagination, refreshNotifications]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};