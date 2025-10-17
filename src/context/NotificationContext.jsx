import React, { createContext, useState, useContext, useCallback } from 'react';
import { notificationAPI } from '../services/api';

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
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch all notifications
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await notificationAPI.getNotifications();
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.notifications?.filter(n => !n.is_read).length || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to fetch notifications');
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch announcements
  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await notificationAPI.getAnnouncements();
      setAnnouncements(response.data.announcements || []);
    } catch (err) {
      console.error('Error fetching announcements:', err);
      setError('Failed to fetch announcements');
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    setLoading(true);
    setError(null);
    try {
      setNotifications(prev => prev.map(notification => 
        notification.id === notificationId 
          ? { ...notification, is_read: true, read_at: new Date().toISOString() }
          : notification
      ));
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
      setError('Failed to mark notification as read');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotifications(prev => prev.map(notification => 
        ({ ...notification, is_read: true, read_at: new Date().toISOString() })
      ));
      
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      setError('Failed to mark all notifications as read');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new announcement
  const createAnnouncement = useCallback(async (announcementData) => {
    setLoading(true);
    setError(null);
    try {
      const newAnnouncement = {
        id: Math.random().toString(36).substr(2, 9),
        ...announcementData,
        is_published: true,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      
      setAnnouncements(prev => [...prev, newAnnouncement]);
      return newAnnouncement;
    } catch (err) {
      console.error('Error creating announcement:', err);
      setError('Failed to create announcement');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Create notification
  const createNotification = useCallback(async (notificationData) => {
    setLoading(true);
    setError(null);
    try {
      const newNotification = {
        id: Math.random().toString(36).substr(2, 9),
        ...notificationData,
        is_read: false,
        created_at: new Date().toISOString()
      };
      
      setNotifications(prev => [newNotification, ...prev]);
      setUnreadCount(prev => prev + 1);
      return newNotification;
    } catch (err) {
      console.error('Error creating notification:', err);
      setError('Failed to create notification');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = React.useMemo(() => ({
    notifications,
    announcements,
    loading,
    error,
    unreadCount,
    fetchNotifications,
    fetchAnnouncements,
    markAsRead,
    markAllAsRead,
    createAnnouncement,
    createNotification,
    clearError: () => setError(null)
  }), [
    notifications,
    announcements,
    loading,
    error,
    unreadCount,
    fetchNotifications,
    fetchAnnouncements,
    markAsRead,
    markAllAsRead,
    createAnnouncement,
    createNotification
  ]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};