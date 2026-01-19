import React, { useState, useCallback, useRef, useEffect } from 'react';
import { API } from '../services/api';
import { Bell, CheckCircle, Loader, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import { useChat } from '../context/ChatContext';
import { useNotification } from '../context/NotificationContext';

const NotificationBell = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { 
    notifications, 
    unreadCount, 
    loading, 
    fetchNotifications, 
    refreshNotifications 
  } = useNotification();

  const { setActiveConversation } = useChat();

  // Mark a single notification as read and handle navigation
  const handleNotificationClick = async (notification) => {
    try {
      await API.notifications.markAsRead(notification.id);
      
      // If it's a chat notification, open the chat
      if (notification.type === 'chat' && notification.related_entity_id) {
        setActiveConversation({ id: notification.related_entity_id });
        // Optional: window.location.href = '/chat' if not using a modal
      }
      
      refreshNotifications();
      setDropdownOpen(false);
    } catch (error) {
      console.error('Failed to process notification click:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await API.notifications.markAllAsRead();
      refreshNotifications();
    } catch (error) {
      console.error('Failed to mark all notifications read:', error);
    }
  };

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
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[450px] flex flex-col">
          <div className="flex justify-between items-center p-3 border-b">
            <span className="font-bold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 ? (
              <div className="p-8 flex justify-center items-center text-gray-500">
                <Loader className="w-6 h-6 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No new notifications
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={clsx(
                      'p-4 hover:bg-gray-50 cursor-pointer flex items-start transition-colors',
                      !n.is_read ? 'bg-blue-50/50' : 'bg-white'
                    )}
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div className="mr-3 mt-1">
                      {n.type === 'chat' ? (
                        <div className="bg-blue-100 p-2 rounded-full">
                          <MessageSquare className="w-4 h-4 text-blue-600" />
                        </div>
                      ) : (
                        <div className="bg-gray-100 p-2 rounded-full">
                          {API.notificationUtils.getNotificationIcon(n.type)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={clsx("text-sm", !n.is_read ? "font-semibold text-gray-900" : "text-gray-700")}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {API.notificationUtils.formatTimestamp(n.created_at)}
                      </p>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 ml-2"></div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;