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
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNext: false,
    hasPrev: false,
  });

  const isMountedRef = useRef(true);
  const pollingRef = useRef(null);
  const backoffRef = useRef(30000); // start with 30s
  const MAX_BACKOFF = 5 * 60 * 1000; // max 5 minutes

  useEffect(() => {
    return () => { isMountedRef.current = false; if (pollingRef.current) clearTimeout(pollingRef.current); };
  }, []);

  const isAuthenticated = useCallback(() => !!authUser && !!token, [authUser, token]);
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const safeFetch = useCallback(async (fetchFn, retries = 3, delay = 2000) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetchFn();
        if (response?.data) return response.data;
        throw new Error('Invalid response format');
      } catch (err) {
        const status = err.response?.status;
        if (status === 429 && attempt < retries) {
          console.warn(`⚠️ Rate limited (429). Retrying in ${delay}ms...`);
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
    if (isMountedRef.current) { setLoading(true); setError(null); }

    try {
      const data = await safeFetch(() => notificationAPI.getNotifications(limit, (page - 1) * limit, type, is_read));
      if (!data.success) throw new Error(data.message || 'Failed to fetch notifications');

      const newNotifications = data.data?.notifications || [];
      const paginationData = data.data?.pagination || { currentPage: page, totalPages: 1, totalCount: newNotifications.length, hasNext: false, hasPrev: false };

      if (isMountedRef.current) {
        // Keep local notifications
        const localTemps = notifications.filter(n => n.is_local);
        const keptLocal = localTemps.filter(lt => !newNotifications.some(sn => sn.id === lt.id));
        setNotifications([...keptLocal, ...newNotifications]);
        setPagination(paginationData);
      }

      return newNotifications;
    } catch (err) {
      console.error('❌ Error fetching notifications:', err);
      if (isMountedRef.current) setError(err.response?.data?.message || err.message || 'Failed to fetch notifications');
      throw err;
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [isAuthenticated, safeFetch, notifications]);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated()) { if (isMountedRef.current) setUnreadCount(0); return 0; }
    try {
      const data = await safeFetch(() => notificationAPI.getUnreadCount());
      const newCount = data.success ? data.data?.unreadCount || 0 : 0;
      if (isMountedRef.current) setUnreadCount(newCount);
      return newCount;
    } catch (err) {
      console.error('❌ Error fetching unread count:', err);
      if (isMountedRef.current) setUnreadCount(0);
      throw err;
    }
  }, [isAuthenticated, safeFetch]);

  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated()) return;
    try {
      await Promise.all([fetchNotifications({ page: 1 }), fetchUnreadCount()]);
      backoffRef.current = 30000; // reset backoff on success
    } catch (err) {
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
      console.warn(`⚠️ Backoff increased to ${backoffRef.current}ms due to 429 or error`);
    }
  }, [fetchNotifications, fetchUnreadCount, isAuthenticated]);

  const clearError = useCallback(() => { if (isMountedRef.current) setError(null); }, []);

  // --- SAFE POLLING ---
  useEffect(() => {
    const startPolling = async () => {
      if (!isAuthenticated()) return;

      const poll = async () => {
        if (!isMountedRef.current || !isAuthenticated()) return;
        try {
          await refreshNotifications();
        } catch (err) {
          console.warn('⚠️ Polling failed:', err.message);
        } finally {
          pollingRef.current = setTimeout(poll, backoffRef.current);
        }
      };

      poll();
    };

    startPolling();

    return () => { if (pollingRef.current) clearTimeout(pollingRef.current); };
  }, [isAuthenticated, refreshNotifications]);

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
    hasNotifications: notifications.length > 0
  }), [notifications, loading, error, unreadCount, pagination, fetchNotifications, fetchUnreadCount, refreshNotifications, clearError]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
