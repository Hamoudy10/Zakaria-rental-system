// src/components/NotificationBell.jsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { useNotification } from "../context/NotificationContext";
import { useChat } from "../context/ChatContext";
import { useNavigate } from "react-router-dom";

// ============================================
// NOTIFICATION TYPE ICONS & COLORS
// ============================================
const getNotificationIcon = (type) => {
  const icons = {
    // Payment notifications
    payment_success: "💰",
    payment_received: "💵",
    payment_failed: "❌",
    payment_pending: "⏳",
    payment_carry_forward: "➡️",

    // Salary notifications
    salary_paid: "💵",
    salary_processed: "✅",

    // Tenant notifications
    tenant_created: "👤",
    tenant_allocated: "🏠",
    tenant_deallocated: "🚪",

    // Complaint notifications
    complaint_created: "📝",
    complaint_updated: "🔄",
    complaint_resolved: "✅",
    complaint_assigned: "👷",

    // Water bill notifications
    water_bill_created: "💧",

    // Expense notifications
    expense_created: "📋",
    expense_approved: "✅",
    expense_rejected: "❌",

    // Lease notifications
    lease_expiring: "📅",
    rent_overdue: "⚠️",

    // System notifications
    announcement: "📢",
    maintenance: "🔧",
    emergency: "🚨",
    system_alert: "⚙️",
    broadcast: "📣",

    // Chat
    chat_message: "💬",

    // Default
    default: "🔔",
  };

  return icons[type] || icons.default;
};

const getNotificationColor = (type) => {
  const colors = {
    payment_success: "bg-green-100 text-green-800",
    payment_received: "bg-green-100 text-green-800",
    payment_failed: "bg-red-100 text-red-800",
    payment_pending: "bg-yellow-100 text-yellow-800",
    salary_paid: "bg-blue-100 text-blue-800",
    complaint_created: "bg-orange-100 text-orange-800",
    complaint_resolved: "bg-green-100 text-green-800",
    expense_rejected: "bg-red-100 text-red-800",
    expense_approved: "bg-green-100 text-green-800",
    lease_expiring: "bg-yellow-100 text-yellow-800",
    rent_overdue: "bg-red-100 text-red-800",
    emergency: "bg-red-100 text-red-800",
    system_alert: "bg-gray-100 text-gray-800",
  };

  return colors[type] || "bg-blue-100 text-blue-800";
};

// ============================================
// TIME FORMATTING
// ============================================
const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "";

  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-KE", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
};

// ============================================
// NOTIFICATION ITEM COMPONENT
// ============================================
const NotificationItem = ({ notification, onMarkRead, onDelete, onClick }) => {
  const isUnread = !notification.is_read;

  return (
    <div
      className={`
        relative px-4 py-3 border-b border-gray-100 last:border-b-0
        hover:bg-gray-50 transition-colors cursor-pointer
        ${isUnread ? "bg-blue-50/50" : ""}
      `}
      onClick={() => onClick?.(notification)}
    >
      {/* Unread indicator */}
      {isUnread && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
      )}

      <div className="flex items-start gap-3 pl-2">
        {/* Icon */}
        <div
          className={`
          flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg
          ${getNotificationColor(notification.type)}
        `}
        >
          {getNotificationIcon(notification.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm ${isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}
          >
            {notification.title}
          </p>
          <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">
            {notification.message}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatTimeAgo(notification.created_at)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1">
          {isUnread && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead?.(notification.id);
              }}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
              title="Mark as read"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(notification.id);
            }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// CHAT NOTIFICATION ITEM
// ============================================
const ChatNotificationItem = ({ conversation, onClick }) => {
  const unreadCount = conversation.unread_count || 0;
  const lastMessage = conversation.last_message;
  const senderName =
    conversation.other_participant_name || conversation.title || "Chat";

  return (
    <div
      className={`
        relative px-4 py-3 border-b border-gray-100 last:border-b-0
        hover:bg-gray-50 transition-colors cursor-pointer
        ${unreadCount > 0 ? "bg-green-50/50" : ""}
      `}
      onClick={() => onClick?.(conversation)}
    >
      {/* Unread indicator */}
      {unreadCount > 0 && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 bg-green-500 rounded-full" />
      )}

      <div className="flex items-start gap-3 pl-2">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-green-600" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p
              className={`text-sm ${unreadCount > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}
            >
              {senderName}
            </p>
            {unreadCount > 0 && (
              <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          {lastMessage && (
            <p className="text-sm text-gray-600 line-clamp-1 mt-0.5">
              {lastMessage.content || lastMessage.message_text || "New message"}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {formatTimeAgo(lastMessage?.created_at || conversation.updated_at)}
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN NOTIFICATION BELL COMPONENT
// ============================================
const NotificationBell = () => {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Use NotificationContext for system notifications
  const {
    notifications,
    unreadCount: systemUnreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  } = useNotification();

  // Use ChatContext for chat notifications
  const chatContext = useChat();
  const chatUnreadCount = chatContext?.getTotalUnreadCount?.() || 0;
  const recentChats =
    chatContext?.conversations?.filter((c) => (c.unread_count || 0) > 0) || [];

  // Local state
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'system', 'chat'
  const [processing, setProcessing] = useState(false);

  // Total unread count (system + chat)
  const totalUnreadCount = systemUnreadCount + chatUnreadCount;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle toggle dropdown
  const handleToggle = useCallback(() => {
    const newState = !isOpen;
    setIsOpen(newState);

    if (newState) {
      // Refresh notifications when opening
      refreshNotifications();
    }
  }, [isOpen, refreshNotifications]);

  // Handle mark single notification as read
  const handleMarkRead = useCallback(
    async (id) => {
      try {
        setProcessing(true);
        await markAsRead(id);
      } catch (error) {
        console.error("Failed to mark as read:", error);
      } finally {
        setProcessing(false);
      }
    },
    [markAsRead],
  );

  // Handle mark all as read
  const handleMarkAllRead = useCallback(async () => {
    try {
      setProcessing(true);
      await markAllAsRead();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    } finally {
      setProcessing(false);
    }
  }, [markAllAsRead]);

  // Handle delete notification
  const handleDelete = useCallback(
    async (id) => {
      try {
        setProcessing(true);
        await deleteNotification(id);
      } catch (error) {
        console.error("Failed to delete notification:", error);
      } finally {
        setProcessing(false);
      }
    },
    [deleteNotification],
  );

  // Handle notification click (navigate to related entity)
  const handleNotificationClick = useCallback(
    (notification) => {
      // Mark as read first
      if (!notification.is_read) {
        handleMarkRead(notification.id);
      }

      // Navigate based on type
      const { type, related_entity_type, related_entity_id } = notification;

      switch (type) {
        case "payment_success":
        case "payment_received":
        case "payment_failed":
        case "payment_pending":
          navigate("/payments");
          break;
        case "complaint_created":
        case "complaint_updated":
        case "complaint_resolved":
        case "complaint_assigned":
          navigate("/complaints");
          break;
        case "tenant_created":
        case "tenant_allocated":
        case "tenant_deallocated":
          navigate("/tenants");
          break;
        case "expense_created":
        case "expense_approved":
        case "expense_rejected":
          navigate("/expenses");
          break;
        case "water_bill_created":
          navigate("/water-bills");
          break;
        case "lease_expiring":
        case "rent_overdue":
          navigate("/allocations");
          break;
        default:
          // Just close the dropdown
          break;
      }

      setIsOpen(false);
    },
    [navigate, handleMarkRead],
  );

  // Handle chat notification click
  const handleChatClick = useCallback(
    (conversation) => {
      // Navigate to chat with this conversation
      navigate("/chat", { state: { conversationId: conversation.id } });
      setIsOpen(false);
    },
    [navigate],
  );

  // Handle mark all chats as read
  const handleMarkAllChatsRead = useCallback(() => {
    if (chatContext?.markAllAsRead) {
      chatContext.markAllAsRead();
    }
  }, [chatContext]);

  // Get filtered notifications based on active tab
  const getDisplayNotifications = () => {
    switch (activeTab) {
      case "system":
        return notifications;
      case "chat":
        return []; // Chat items are rendered separately
      default: // 'all'
        return notifications;
    }
  };

  const displayNotifications = getDisplayNotifications();
  const hasUnreadSystem = notifications.some((n) => !n.is_read);

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`
          relative p-2 rounded-full transition-all duration-200
          ${isOpen ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100 text-gray-600"}
        `}
        aria-label="Notifications"
      >
        <Bell className="w-6 h-6" />

        {/* Badge */}
        {totalUnreadCount > 0 && (
          <span
            className={`
            absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5
            flex items-center justify-center
            bg-red-500 text-white text-xs font-bold rounded-full
            ${totalUnreadCount > 0 ? "animate-pulse" : ""}
          `}
          >
            {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden"
          style={{ maxHeight: "calc(100vh - 100px)" }}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center gap-2">
                {hasUnreadSystem && (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={processing}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-3">
              <button
                onClick={() => setActiveTab("all")}
                className={`
                  flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
                  ${
                    activeTab === "all"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-white/50"
                  }
                `}
              >
                All
                {totalUnreadCount > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {totalUnreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("system")}
                className={`
                  flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
                  ${
                    activeTab === "system"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-white/50"
                  }
                `}
              >
                System
                {systemUnreadCount > 0 && (
                  <span className="ml-1.5 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {systemUnreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                className={`
                  flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
                  ${
                    activeTab === "chat"
                      ? "bg-white text-green-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-white/50"
                  }
                `}
              >
                Chat
                {chatUnreadCount > 0 && (
                  <span className="ml-1.5 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {chatUnreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                <span className="ml-2 text-gray-500">Loading...</span>
              </div>
            ) : (
              <>
                {/* Chat Notifications (when 'all' or 'chat' tab) */}
                {(activeTab === "all" || activeTab === "chat") &&
                  recentChats.length > 0 && (
                    <>
                      {activeTab === "all" && (
                        <div className="px-4 py-2 bg-green-50 border-b border-green-100 flex items-center justify-between">
                          <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                            Chat Messages ({chatUnreadCount})
                          </span>
                          <button
                            onClick={handleMarkAllChatsRead}
                            className="text-xs text-green-600 hover:underline"
                          >
                            Mark all read
                          </button>
                        </div>
                      )}
                      {recentChats.map((conversation) => (
                        <ChatNotificationItem
                          key={conversation.id}
                          conversation={conversation}
                          onClick={handleChatClick}
                        />
                      ))}
                    </>
                  )}

                {/* System Notifications (when 'all' or 'system' tab) */}
                {(activeTab === "all" || activeTab === "system") && (
                  <>
                    {activeTab === "all" &&
                      displayNotifications.length > 0 &&
                      recentChats.length > 0 && (
                        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
                          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                            System Notifications ({systemUnreadCount})
                          </span>
                        </div>
                      )}
                    {displayNotifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkRead={handleMarkRead}
                        onDelete={handleDelete}
                        onClick={handleNotificationClick}
                      />
                    ))}
                  </>
                )}

                {/* Empty State */}
                {(activeTab === "system" || activeTab === "all") &&
                  displayNotifications.length === 0 &&
                  recentChats.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                      <Bell className="w-12 h-12 text-gray-300 mb-3" />
                      <p className="font-medium">No notifications</p>
                      <p className="text-sm text-gray-400">
                        You're all caught up!
                      </p>
                    </div>
                  )}

                {activeTab === "chat" && recentChats.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="font-medium">No unread messages</p>
                    <p className="text-sm text-gray-400">Your inbox is empty</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
            <button
              onClick={() => {
                navigate("/notifications");
                setIsOpen(false);
              }}
              className="w-full text-center text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
