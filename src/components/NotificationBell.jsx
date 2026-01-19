import React, { useState, useCallback, useRef } from 'react';
import { API } from '../services/api';
import { Bell, CheckCircle, Loader } from 'lucide-react'; // Added Loader for spinner
import clsx from 'clsx';
import { useChat } from '../context/ChatContext';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { getTotalUnreadCount: getChatUnreadCount, markAsRead: markAllChatsRead } = useChat();
  const chatUnreadCount = getChatUnreadCount();

  const fetchTimeoutRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  // Fetch notifications safely with retry on 429
  const fetchNotifications = useCallback(async () => {
    if (fetchTimeoutRef.current) return;

    fetchTimeoutRef.current = setTimeout(async () => {
      fetchTimeoutRef.current = null;
      setLoading(true);

      try {
        const res = await API.notifications.getNotifications(20, 0);

        // Ensure data is array
        const notificationsData = Array.isArray(res.data) ? res.data : [];
        setNotifications(notificationsData);

        const unread = notificationsData.filter((n) => !n.is_read).length || 0;
        setUnreadCount(unread);
      } catch (error) {
        if (error.response?.status === 429) {
          console.warn('Too many requests. Retrying in 5 seconds...');
          retryTimeoutRef.current = setTimeout(fetchNotifications, 5000);
        } else {
          console.error('Failed to fetch notifications:', error);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  // Mark a single notification as read
  const markNotificationRead = async (id) => {
    try {
      await API.notifications.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(prev - 1, 0));
    } catch (error) {
      console.error('Failed to mark notification read:', error);
    }
  };

  // Mark all notifications as read
  const markAllNotificationsRead = async () => {
    try {
      await API.notifications.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications read:', error);
    }
  };

  // Cleanup timers
  React.useEffect(() => {
    return () => {
      clearTimeout(fetchTimeoutRef.current);
      clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  // Total unread for badge
  const totalUnread = unreadCount + chatUnreadCount;

  return (
    <div className="relative">
      <button
        className="relative p-2 hover:bg-gray-200 rounded-full transition-colors"
        onClick={() => {
          setDropdownOpen((prev) => {
            const newState = !prev;
            if (newState) fetchNotifications();
            return newState;
          });
        }}
      >
        <Bell className="w-6 h-6 text-gray-700" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {totalUnread}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
          <div className="flex justify-between items-center p-2 border-b">
            <span className="font-semibold">Notifications</span>
            <div className="flex space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllNotificationsRead}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
              {chatUnreadCount > 0 && (
                <button
                  onClick={markAllChatsRead}
                  className="text-sm text-green-600 hover:underline"
                >
                  Mark chats read
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-4 flex justify-center items-center text-gray-500">
              <Loader className="w-6 h-6 animate-spin" />
              <span className="ml-2">Loading...</span>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {notifications.length === 0 && chatUnreadCount === 0 && (
                <li className="p-4 text-center text-gray-500">No notifications</li>
              )}

              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={clsx(
                    'p-4 hover:bg-gray-50 cursor-pointer flex items-start transition-colors',
                    !n.is_read && 'bg-gray-100'
                  )}
                  onClick={() => markNotificationRead(n.id)}
                >
                  <span className="mr-3">{API.notificationUtils.getNotificationIcon(n.type)}</span>
                  <div className="flex-1">
                    <p className="text-sm">{API.notificationUtils.formatNotificationMessage(n)}</p>
                    <p className="text-xs text-gray-400">
                      {API.notificationUtils.formatTimestamp(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && <CheckCircle className="w-4 h-4 text-blue-500 ml-2" />}
                </li>
              ))}

              {chatUnreadCount > 0 && (
                <li
                  className="p-4 hover:bg-gray-50 cursor-pointer flex items-start bg-gray-50 transition-colors"
                  onClick={markAllChatsRead}
                >
                  <span className="mr-3">💬</span>
                  <div className="flex-1">
                    <p className="text-sm">
                      You have {chatUnreadCount} unread chat {chatUnreadCount > 1 ? 'messages' : 'message'}
                    </p>
                    <p className="text-xs text-gray-400">Click to mark all as read</p>
                  </div>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
