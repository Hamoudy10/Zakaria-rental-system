import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  MessageCircle,
  Loader,
  ChevronRight,
} from "lucide-react";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";

// Try to import ChatContext, but don't fail if it doesn't exist
let useChat = null;
try {
  const ChatContext = require("../context/ChatContext");
  useChat = ChatContext.useChat;
} catch (e) {
  console.log("ChatContext not available");
}

// Notification type icons and colors
const getNotificationStyle = (type) => {
  const styles = {
    // Payment notifications
    payment_success: {
      icon: "💰",
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
    },
    payment_received: {
      icon: "💵",
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
    },
    payment_failed: {
      icon: "❌",
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-200",
    },
    payment_pending: {
      icon: "⏳",
      bg: "bg-yellow-100",
      text: "text-yellow-800",
      border: "border-yellow-200",
    },
    payment_carry_forward: {
      icon: "➡️",
      bg: "bg-blue-100",
      text: "text-blue-800",
      border: "border-blue-200",
    },

    // Salary notifications
    salary_paid: {
      icon: "💵",
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
    },
    salary_processed: {
      icon: "✅",
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
    },

    // Tenant notifications
    tenant_created: {
      icon: "👤",
      bg: "bg-blue-100",
      text: "text-blue-800",
      border: "border-blue-200",
    },
    tenant_allocated: {
      icon: "🏠",
      bg: "bg-purple-100",
      text: "text-purple-800",
      border: "border-purple-200",
    },
    tenant_deallocated: {
      icon: "🚪",
      bg: "bg-orange-100",
      text: "text-orange-800",
      border: "border-orange-200",
    },

    // Complaint notifications
    complaint_created: {
      icon: "📝",
      bg: "bg-orange-100",
      text: "text-orange-800",
      border: "border-orange-200",
    },
    complaint_updated: {
      icon: "🔄",
      bg: "bg-blue-100",
      text: "text-blue-800",
      border: "border-blue-200",
    },
    complaint_resolved: {
      icon: "✅",
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
    },
    complaint_assigned: {
      icon: "👷",
      bg: "bg-indigo-100",
      text: "text-indigo-800",
      border: "border-indigo-200",
    },

    // Water bill notifications
    water_bill_created: {
      icon: "💧",
      bg: "bg-cyan-100",
      text: "text-cyan-800",
      border: "border-cyan-200",
    },

    // Expense notifications
    expense_created: {
      icon: "📊",
      bg: "bg-amber-100",
      text: "text-amber-800",
      border: "border-amber-200",
    },
    expense_approved: {
      icon: "✅",
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
    },
    expense_rejected: {
      icon: "❌",
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-200",
    },

    // Lease notifications
    lease_expiring: {
      icon: "📅",
      bg: "bg-yellow-100",
      text: "text-yellow-800",
      border: "border-yellow-200",
    },
    rent_overdue: {
      icon: "⚠️",
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-200",
    },

    // System notifications
    announcement: {
      icon: "📢",
      bg: "bg-blue-100",
      text: "text-blue-800",
      border: "border-blue-200",
    },
    maintenance: {
      icon: "🔧",
      bg: "bg-gray-100",
      text: "text-gray-800",
      border: "border-gray-200",
    },
    emergency: {
      icon: "🚨",
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-200",
    },
    system_alert: {
      icon: "⚙️",
      bg: "bg-gray-100",
      text: "text-gray-800",
      border: "border-gray-200",
    },
    broadcast: {
      icon: "📣",
      bg: "bg-indigo-100",
      text: "text-indigo-800",
      border: "border-indigo-200",
    },

    // Chat notifications
    chat: {
      icon: "💬",
      bg: "bg-green-100",
      text: "text-green-800",
      border: "border-green-200",
    },

    // Default
    default: {
      icon: "🔔",
      bg: "bg-gray-100",
      text: "text-gray-800",
      border: "border-gray-200",
    },
  };

  return styles[type] || styles.default;
};

// Format timestamp
const formatTimestamp = (timestamp) => {
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

// System Notification Item Component
const SystemNotificationItem = ({
  notification,
  onMarkRead,
  onDelete,
  onClick,
}) => {
  const style = getNotificationStyle(notification.type);

  return (
    <div
      className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 ${
        !notification.is_read ? "bg-blue-50/50" : ""
      }`}
      onClick={() => onClick(notification)}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center flex-shrink-0 text-lg`}
        >
          {style.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-sm font-medium ${!notification.is_read ? "text-gray-900" : "text-gray-700"}`}
            >
              {notification.title}
            </p>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {formatTimestamp(notification.created_at)}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
            {notification.message}
          </p>

          {/* Unread indicator */}
          {!notification.is_read && (
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span className="text-xs text-blue-600 font-medium">New</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!notification.is_read && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(notification.id);
              }}
              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
              title="Mark as read"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(notification.id);
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

// Chat Notification Item Component
const ChatNotificationItem = ({ conversation, onChatClick, currentUserId }) => {
  const unreadCount = conversation.unread_count || 0;

  // Get the other participant from participants array
  const otherParticipant = conversation.participants?.find(
    (p) => p.id !== currentUserId,
  );

  // Determine display name
  let senderName = "Unknown";
  if (conversation.conversation_type === "group" && conversation.title) {
    senderName = conversation.title;
  } else if (otherParticipant) {
    senderName =
      `${otherParticipant.first_name || ""} ${otherParticipant.last_name || ""}`.trim() ||
      "Unknown";
  } else if (conversation.display_name) {
    senderName = conversation.display_name;
  } else if (conversation.title) {
    senderName = conversation.title;
  }

  // Get profile image
  const profileImage = otherParticipant?.profile_image || null;

  // Get initials for avatar fallback
  const getInitials = () => {
    if (conversation.conversation_type === "group") {
      return (conversation.title || "G").slice(0, 2).toUpperCase();
    }
    if (otherParticipant) {
      return (
        `${otherParticipant.first_name?.charAt(0) || ""}${otherParticipant.last_name?.charAt(0) || ""}`.toUpperCase() ||
        "?"
      );
    }
    return "?";
  };

  // Get message preview - last_message is a string, not an object
  const messagePreview = conversation.last_message || "Start a conversation";

  // Format time
  const timeString = formatTimestamp(
    conversation.last_message_at || conversation.updated_at,
  );

  return (
    <div
      className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 ${
        unreadCount > 0 ? "bg-green-50/50" : ""
      }`}
      onClick={() => onChatClick(conversation)}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {profileImage ? (
            <img
              src={profileImage}
              alt={senderName}
              className="w-12 h-12 rounded-full object-cover"
              onError={(e) => {
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "flex";
              }}
            />
          ) : null}
          <div
            className={`w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white font-semibold text-sm ${profileImage ? "hidden" : ""}`}
          >
            {getInitials()}
          </div>

          {/* Online indicator */}
          {conversation.is_online && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
          )}

          {/* Unread pulse */}
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p
              className={`text-sm font-semibold truncate ${unreadCount > 0 ? "text-gray-900" : "text-gray-700"}`}
            >
              {senderName}
            </p>
            <span
              className={`text-xs flex-shrink-0 ${unreadCount > 0 ? "text-green-600 font-medium" : "text-gray-400"}`}
            >
              {timeString}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p
              className={`text-sm truncate ${unreadCount > 0 ? "text-gray-800 font-medium" : "text-gray-500"}`}
            >
              {messagePreview}
            </p>

            {/* Unread badge */}
            {unreadCount > 0 && (
              <span className="bg-green-500 text-white text-xs rounded-full px-2 py-0.5 font-bold flex-shrink-0 min-w-[20px] text-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </div>
    </div>
  );
};

// Main NotificationBell Component
const NotificationBell = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dropdownRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Notification context
  const notificationContext = useNotification();
  const {
    notifications = [],
    unreadCount = 0,
    loading = false,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  } = notificationContext || {};

  // Chat context (optional)
  let chatContext = null;
  try {
    if (useChat) {
      chatContext = useChat();
    }
  } catch (e) {
    // ChatContext not available or not within provider
  }

  const conversations = chatContext?.conversations || [];
  const getChatUnreadForConversation = chatContext?.getUnreadCount;
  const chatUnreadCount = chatContext?.getTotalUnreadCount?.() || 0;

  // Local state
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'system', 'chat'

  // Total unread count
  const totalUnread = (unreadCount || 0) + chatUnreadCount;

  // Get unread conversations
  const unreadConversations = conversations
    .map((c) => ({
      ...c,
      unread_count: getChatUnreadForConversation
        ? getChatUnreadForConversation(c.id)
        : c.unread_count || 0,
    }))
    .filter((c) => (c.unread_count || 0) > 0);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle toggle dropdown
  const handleToggle = useCallback(() => {
    const newState = !isOpen;
    setIsOpen(newState);

    if (newState) {
      // Refresh data when opening
      refreshNotifications?.();
      chatContext?.loadConversations?.();
    }
  }, [isOpen, refreshNotifications, chatContext]);

  // Handle system notification click
  const handleNotificationClick = useCallback(
    (notification) => {
      // Mark as read
      if (!notification.is_read) {
        markAsRead?.(notification.id);
      }

      // Navigate based on notification type
      const basePath = `/${user?.role}`;
      let targetPath = basePath;

      switch (notification.type) {
        case "payment_success":
        case "payment_received":
        case "payment_failed":
        case "payment_pending":
          targetPath = `${basePath}/payments`;
          break;
        case "complaint_created":
        case "complaint_updated":
        case "complaint_resolved":
        case "complaint_assigned":
          targetPath = `${basePath}/complaints`;
          break;
        case "tenant_created":
        case "tenant_allocated":
        case "tenant_deallocated":
          targetPath = `${basePath}/tenants`;
          break;
        case "expense_created":
        case "expense_approved":
        case "expense_rejected":
          targetPath = `${basePath}/expenses`;
          break;
        case "water_bill_created":
          targetPath = `${basePath}/water-bills`;
          break;
        case "lease_expiring":
        case "rent_overdue":
          targetPath = `${basePath}/allocations`;
          break;
        default:
          targetPath = `${basePath}/notifications`;
      }

      setIsOpen(false);
      navigate(targetPath);
    },
    [navigate, markAsRead, user?.role],
  );

  // Handle chat notification click
  const handleChatClick = useCallback(
    (conversation) => {
      // Set active conversation in ChatContext BEFORE navigating
      if (chatContext?.setActiveConversation) {
        chatContext.setActiveConversation(conversation);
      }

      // Navigate to chat page with the correct path based on user role
      const chatPath = `/${user?.role}/chat`;
      navigate(chatPath, {
        state: {
          conversationId: conversation.id,
          conversation: conversation,
        },
      });

      setIsOpen(false);
    },
    [navigate, chatContext, user?.role],
  );

  // Handle mark all as read
  const handleMarkAllAsRead = useCallback(async () => {
    await markAllAsRead?.();
  }, [markAllAsRead]);

  // Handle delete notification
  const handleDelete = useCallback(
    async (id) => {
      await deleteNotification?.(id);
    },
    [deleteNotification],
  );

  // Navigate to full notifications page
  const handleViewAll = useCallback(() => {
    setIsOpen(false);
    navigate(`/${user?.role}/notifications`);
  }, [navigate, user?.role]);

  // Navigate to chat page
  const handleOpenChat = useCallback(() => {
    setIsOpen(false);
    navigate(`/${user?.role}/chat`);
  }, [navigate, user?.role]);

  // Filter notifications based on active tab
  const getFilteredContent = () => {
    if (activeTab === "chat") {
      return { type: "chat", items: unreadConversations };
    } else if (activeTab === "system") {
      return { type: "system", items: notifications };
    } else {
      // All tab - combine both
      return {
        type: "all",
        systemItems: notifications,
        chatItems: unreadConversations,
      };
    }
  };

  const filteredContent = getFilteredContent();

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Notifications"
      >
        <Bell className="w-6 h-6" />

        {/* Badge */}
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 animate-pulse">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden"
          style={{ maxHeight: "min(70vh, 600px)", minHeight: "300px" }}
        >
          <div
            className="flex flex-col h-full"
            style={{ maxHeight: "min(70vh, 600px)" }}
          >
            {/* Header - Fixed */}
            <div className="flex-shrink-0 px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Notifications
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-gray-200 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "all"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  All
                  {totalUnread > 0 && (
                    <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                      {totalUnread}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("system")}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "system"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  System
                  {unreadCount > 0 && (
                    <span className="ml-1.5 bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5">
                      {unreadCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("chat")}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "chat"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Chat
                  {chatUnreadCount > 0 && (
                    <span className="ml-1.5 bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5">
                      {chatUnreadCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{
                minHeight: "200px",
                scrollbarWidth: "thin",
                scrollbarColor: "#CBD5E1 #F1F5F9",
              }}
            >
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : (
                <>
                  {/* All Tab */}
                  {activeTab === "all" && (
                    <>
                      {filteredContent.systemItems?.length === 0 &&
                      filteredContent.chatItems?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Bell className="w-8 h-8 text-gray-400" />
                          </div>
                          <p className="text-gray-500 text-sm">
                            No notifications
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            You're all caught up!
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Chat notifications section */}
                          {filteredContent.chatItems?.length > 0 && (
                            <>
                              <div className="sticky top-0 z-10 px-4 py-2 bg-green-50 border-b border-green-100">
                                <div className="flex items-center gap-2">
                                  <MessageCircle className="w-4 h-4 text-green-600" />
                                  <span className="text-sm font-medium text-green-800">
                                    Unread Messages ({chatUnreadCount})
                                  </span>
                                </div>
                              </div>
                              {filteredContent.chatItems.map((conversation) => (
                                <ChatNotificationItem
                                  key={conversation.id}
                                  conversation={conversation}
                                  onChatClick={handleChatClick}
                                  currentUserId={user?.id}
                                />
                              ))}
                            </>
                          )}

                          {/* System notifications section */}
                          {filteredContent.systemItems?.length > 0 && (
                            <>
                              <div className="sticky top-0 z-10 px-4 py-2 bg-blue-50 border-b border-blue-100">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Bell className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm font-medium text-blue-800">
                                      System Notifications
                                    </span>
                                  </div>
                                  {unreadCount > 0 && (
                                    <button
                                      onClick={handleMarkAllAsRead}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                    >
                                      <CheckCheck className="w-3 h-3" />
                                      Mark all read
                                    </button>
                                  )}
                                </div>
                              </div>
                              {filteredContent.systemItems.map(
                                (notification) => (
                                  <SystemNotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onMarkRead={markAsRead}
                                    onDelete={handleDelete}
                                    onClick={handleNotificationClick}
                                  />
                                ),
                              )}
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {/* System Tab */}
                  {activeTab === "system" && (
                    <>
                      {filteredContent.items?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Bell className="w-8 h-8 text-gray-400" />
                          </div>
                          <p className="text-gray-500 text-sm">
                            No system notifications
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Mark all read button */}
                          {unreadCount > 0 && (
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                              <button
                                onClick={handleMarkAllAsRead}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                              >
                                <CheckCheck className="w-4 h-4" />
                                Mark all as read
                              </button>
                            </div>
                          )}

                          {filteredContent.items.map((notification) => (
                            <SystemNotificationItem
                              key={notification.id}
                              notification={notification}
                              onMarkRead={markAsRead}
                              onDelete={handleDelete}
                              onClick={handleNotificationClick}
                            />
                          ))}
                        </>
                      )}
                    </>
                  )}

                  {/* Chat Tab */}
                  {activeTab === "chat" && (
                    <>
                      {filteredContent.items?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <MessageCircle className="w-8 h-8 text-green-500" />
                          </div>
                          <p className="text-gray-500 text-sm">
                            No unread messages
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            You're all caught up!
                          </p>
                          <button
                            onClick={handleOpenChat}
                            className="mt-4 text-green-600 hover:text-green-800 text-sm font-medium flex items-center gap-1"
                          >
                            Open Chat <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        filteredContent.items.map((conversation) => (
                          <ChatNotificationItem
                            key={conversation.id}
                            conversation={conversation}
                            onChatClick={handleChatClick}
                            currentUserId={user?.id}
                          />
                        ))
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer - Fixed */}
            <div className="flex-shrink-0 px-4 py-3 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={handleViewAll}
                  className="flex-1 text-center text-sm text-blue-600 hover:text-blue-800 font-medium py-2 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  View all notifications
                </button>
                {(user?.role === "admin" || user?.role === "agent") && (
                  <button
                    onClick={handleOpenChat}
                    className="flex-1 text-center text-sm text-green-600 hover:text-green-800 font-medium py-2 rounded-lg hover:bg-green-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Open Chat
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
