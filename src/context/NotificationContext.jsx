// src/context/NotificationContext.jsx
import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { notificationAPI } from "../services/api";
import { useAuth } from "./AuthContext";

const NotificationContext = createContext(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotification must be used within a NotificationProvider",
    );
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { user, token } = useAuth();
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
  const isRefreshingRef = useRef(false);
  const backoffRef = useRef(30000); // Start polling every 30s
  const MAX_BACKOFF = 5 * 60 * 1000; // Max 5 minutes
  const lastFetchRef = useRef(0);
  const lastUnreadFetchRef = useRef(0);
  const MIN_FETCH_INTERVAL = 5000; // Minimum 5s between fetches

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  const isAuthenticated = useCallback(() => !!user && !!token, [user, token]);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Helper to handle 429s centrally
  const handleFetch = useCallback(async (apiCall) => {
    try {
      const response = await apiCall();
      return { success: true, data: response.data };
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn("⚠️ Rate limit hit (429). Backing off.");
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        return { success: false, status: 429 };
      }
      return { success: false, error: err };
    }
  }, []);

  // Fetch notifications list
  const fetchNotifications = useCallback(
    async (params = {}) => {
      if (!isAuthenticated()) return;

      // Throttle fetches
      const now = Date.now();
      if (!params.force && now - lastFetchRef.current < MIN_FETCH_INTERVAL) {
        console.log("🔄 Throttling notification fetch");
        return { success: false, status: "throttled" };
      }
      lastFetchRef.current = now;

      setLoading(true);

      const result = await handleFetch(() =>
        notificationAPI.getNotifications({
          limit: params.limit || 20,
          page: params.page || 1,
          type: params.type,
          is_read: params.is_read,
        }),
      );

      if (isMountedRef.current) {
        setLoading(false);
        if (result.success) {
          const notificationsData =
            result.data.data?.notifications || result.data.notifications || [];
          const paginationData =
            result.data.data?.pagination || result.data.pagination || {};

          setNotifications(
            Array.isArray(notificationsData) ? notificationsData : [],
          );
          setPagination({
            currentPage: paginationData.currentPage || 1,
            totalPages: paginationData.totalPages || 1,
            totalCount: paginationData.totalCount || 0,
            hasNext: paginationData.hasNext || false,
            hasPrev: paginationData.hasPrev || false,
          });
          // Reset backoff on success
          backoffRef.current = 30000;
          setError(null);
          return { success: true };
        } else if (result.status !== 429) {
          setError(
            result.error?.response?.data?.message ||
              "Failed to fetch notifications",
          );
        }
      }
      return result;
    },
    [isAuthenticated, handleFetch],
  );

  // Fetch unread count only
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated()) return;
    const now = Date.now();
    if (now - lastUnreadFetchRef.current < MIN_FETCH_INTERVAL) {
      return { success: false, status: "throttled" };
    }
    lastUnreadFetchRef.current = now;

    const result = await handleFetch(() => notificationAPI.getUnreadCount());

    if (isMountedRef.current && result.success) {
      const count =
        result.data.data?.unreadCount ?? result.data.unreadCount ?? 0;
      setUnreadCount(count);
    }
    return result;
  }, [isAuthenticated, handleFetch]);

  // SEQUENTIAL Refresh: List -> Wait -> Count
  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated()) return;
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      // 1. Fetch notifications
      const listResult = await fetchNotifications({ page: 1, force: true });
      if (listResult?.status === 429) return;

      // 2. Wait to clear rate limit window
      await wait(1200);

      // 3. Fetch count
      await fetchUnreadCount();
    } finally {
      isRefreshingRef.current = false;
    }
  }, [isAuthenticated, fetchNotifications, fetchUnreadCount]);

  // Mark single notification as read
  const markAsRead = useCallback(async (id) => {
    if (!id) return;

    try {
      await notificationAPI.markAsRead(id);

      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
      throw error;
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationAPI.markAllAsRead();

      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          is_read: true,
          read_at: new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      throw error;
    }
  }, []);

  // Delete single notification
  const deleteNotification = useCallback(async (id) => {
    if (!id) return;

    try {
      await notificationAPI.deleteNotification(id);

      setNotifications((prev) => {
        const deleted = prev.find((n) => n.id === id);
        if (deleted && !deleted.is_read) {
          setUnreadCount((count) => Math.max(0, count - 1));
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch (error) {
      console.error("Failed to delete notification:", error);
      throw error;
    }
  }, []);

  // Clear all read notifications
  const clearReadNotifications = useCallback(async () => {
    try {
      await notificationAPI.clearReadNotifications();
      setNotifications((prev) => prev.filter((n) => !n.is_read));
    } catch (error) {
      console.error("Failed to clear read notifications:", error);
      throw error;
    }
  }, []);

  // Create broadcast notification (admin only)
  const createBroadcastNotification = useCallback(async (data) => {
    const response = await notificationAPI.createBroadcastNotification(data);
    return response.data;
  }, []);

  // Clear error state
  const clearError = useCallback(() => setError(null), []);

  // Initial fetch and polling
  useEffect(() => {
    if (!isAuthenticated()) {
      // Clear state when logged out
      setNotifications([]);
      setUnreadCount(0);
      if (pollingRef.current) clearTimeout(pollingRef.current);
      return;
    }

    const poll = async () => {
      if (!isMountedRef.current) return;

      if (document.hidden) {
        pollingRef.current = setTimeout(
          poll,
          Math.max(backoffRef.current, 60000),
        );
        return;
      }

      await fetchUnreadCount();

      // Schedule next poll based on dynamic backoff
      pollingRef.current = setTimeout(poll, backoffRef.current);
    };

    // Initial full fetch, then light polling
    refreshNotifications();
    poll();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchUnreadCount();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, refreshNotifications, fetchUnreadCount]);

  // Reset state when user changes
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
    }
  }, [user]);

  const value = React.useMemo(
    () => ({
      // State
      notifications,
      loading,
      error,
      unreadCount,
      pagination,

      // Actions
      fetchNotifications,
      fetchUnreadCount,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearReadNotifications,
      createBroadcastNotification,
      clearError,
    }),
    [
      notifications,
      loading,
      error,
      unreadCount,
      pagination,
      fetchNotifications,
      fetchUnreadCount,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearReadNotifications,
      createBroadcastNotification,
      clearError,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
