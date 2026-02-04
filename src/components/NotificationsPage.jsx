// src/components/NotificationsPage.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";
import { userAPI } from "../services/api";

const NotificationsPage = () => {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    pagination,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    createBroadcastNotification,
    clearError,
  } = useNotification();

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  // Enhanced broadcast data with recipient selection
  const [broadcastData, setBroadcastData] = useState({
    title: "",
    message: "",
    type: "announcement",
    recipientType: "all", // 'all', 'roles', 'specific'
    target_roles: [],
    selectedUserIds: [],
  });

  // Users list for specific selection
  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [filters, setFilters] = useState({
    type: "",
    start_date: "",
    end_date: "",
  });

  // Available roles
  const availableRoles = [
    { value: "admin", label: "Administrators", icon: "👑" },
    { value: "agent", label: "Agents", icon: "🏢" },
    { value: "tenant", label: "Tenants", icon: "🏠" },
  ];

  // Notification types for broadcast
  const notificationTypes = [
    { value: "announcement", label: "Announcement", icon: "📢" },
    { value: "maintenance", label: "Maintenance Notice", icon: "🛠️" },
    { value: "emergency", label: "Emergency Alert", icon: "🚨" },
    { value: "system_alert", label: "System Alert", icon: "⚙️" },
  ];

  useEffect(() => {
    fetchNotifications({ page: 1, ...filters });
  }, [filters, fetchNotifications]);

  // Fetch users when modal opens and specific selection is chosen
  const fetchAllUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await userAPI.getUsers({ limit: 500 });
      if (response.data?.success || response.data?.data) {
        const users = response.data?.data || response.data || [];
        setAllUsers(Array.isArray(users) ? users : []);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setAllUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Fetch users when modal opens
  useEffect(() => {
    if (
      showBroadcastModal &&
      broadcastData.recipientType === "specific" &&
      allUsers.length === 0
    ) {
      fetchAllUsers();
    }
  }, [
    showBroadcastModal,
    broadcastData.recipientType,
    allUsers.length,
    fetchAllUsers,
  ]);

  // Handle role toggle
  const toggleRole = (role) => {
    setBroadcastData((prev) => {
      const roles = prev.target_roles.includes(role)
        ? prev.target_roles.filter((r) => r !== role)
        : [...prev.target_roles, role];
      return { ...prev, target_roles: roles };
    });
  };

  // Handle user selection toggle
  const toggleUserSelection = (userId) => {
    setBroadcastData((prev) => {
      const ids = prev.selectedUserIds.includes(userId)
        ? prev.selectedUserIds.filter((id) => id !== userId)
        : [...prev.selectedUserIds, userId];
      return { ...prev, selectedUserIds: ids };
    });
  };

  // Select all filtered users
  const selectAllFilteredUsers = () => {
    const filteredIds = filteredUsers.map((u) => u.id);
    setBroadcastData((prev) => ({
      ...prev,
      selectedUserIds: [...new Set([...prev.selectedUserIds, ...filteredIds])],
    }));
  };

  // Deselect all users
  const deselectAllUsers = () => {
    setBroadcastData((prev) => ({ ...prev, selectedUserIds: [] }));
  };

  // Filter users by search query
  const filteredUsers = allUsers.filter((u) => {
    if (!searchQuery) return true;
    const fullName = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
    const email = (u.email || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return (
      fullName.includes(query) ||
      email.includes(query) ||
      u.role?.toLowerCase().includes(query)
    );
  });

  // Reset modal state
  const resetBroadcastModal = () => {
    setBroadcastData({
      title: "",
      message: "",
      type: "announcement",
      recipientType: "all",
      target_roles: [],
      selectedUserIds: [],
    });
    setSearchQuery("");
  };

  // Handle broadcast submit
  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!broadcastData.title.trim()) {
      alert("Please enter a title");
      return;
    }
    if (!broadcastData.message.trim()) {
      alert("Please enter a message");
      return;
    }

    // Build payload based on recipient type
    let payload = {
      title: broadcastData.title.trim(),
      message: broadcastData.message.trim(),
      type: broadcastData.type,
    };

    if (broadcastData.recipientType === "all") {
      // Send to all users - pass all roles
      payload.target_roles = ["admin", "agent", "tenant"];
    } else if (broadcastData.recipientType === "roles") {
      // Send to selected roles
      if (broadcastData.target_roles.length === 0) {
        alert("Please select at least one role");
        return;
      }
      payload.target_roles = broadcastData.target_roles;
    } else if (broadcastData.recipientType === "specific") {
      // Send to specific users - need to handle differently
      if (broadcastData.selectedUserIds.length === 0) {
        alert("Please select at least one user");
        return;
      }
      // For specific users, we'll need to create individual notifications
      // The backend broadcast endpoint uses roles, so we'll use a different approach
      payload.user_ids = broadcastData.selectedUserIds;
      payload.target_roles = null; // Signal to backend to use user_ids instead
    }

    setBroadcastLoading(true);
    try {
      await createBroadcastNotification(payload);
      setShowBroadcastModal(false);
      resetBroadcastModal();

      // Show success message
      const recipientText =
        broadcastData.recipientType === "all"
          ? "all users"
          : broadcastData.recipientType === "roles"
            ? broadcastData.target_roles.join(", ")
            : `${broadcastData.selectedUserIds.length} selected user(s)`;

      alert(`Broadcast sent successfully to ${recipientText}!`);

      // Refresh notifications
      fetchNotifications({ page: 1 });
    } catch (err) {
      console.error("Broadcast error:", err);
      alert(
        "Failed to send broadcast: " +
          (err.response?.data?.message || err.message),
      );
    } finally {
      setBroadcastLoading(false);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "payment_success":
      case "payment_received":
        return "💰";
      case "payment_failed":
        return "❌";
      case "payment_pending":
        return "⏳";
      case "payment_carry_forward":
        return "⏭️";
      case "salary_paid":
      case "salary_processed":
        return "🏦";
      case "complaint_created":
        return "🚨";
      case "complaint_resolved":
        return "✅";
      case "complaint_updated":
        return "📝";
      case "complaint_assigned":
        return "👤";
      case "announcement":
        return "📢";
      case "maintenance":
        return "🛠️";
      case "emergency":
        return "🚨";
      case "tenant_created":
        return "👤";
      case "tenant_allocated":
        return "🏠";
      case "tenant_deallocated":
        return "🚪";
      case "water_bill_created":
        return "🚰";
      case "expense_created":
        return "💸";
      case "expense_approved":
        return "✅";
      case "expense_rejected":
        return "❌";
      case "lease_expiring":
        return "📅";
      case "rent_overdue":
        return "⚠️";
      case "system_alert":
        return "⚙️";
      case "broadcast":
        return "📣";
      default:
        return "🔔";
    }
  };

  const getNotificationColor = (type) => {
    if (
      type?.includes("failed") ||
      type?.includes("error") ||
      type?.includes("rejected") ||
      type?.includes("emergency")
    ) {
      return "border-red-200 bg-red-50";
    }
    if (
      type?.includes("success") ||
      type?.includes("resolved") ||
      type?.includes("approved")
    ) {
      return "border-green-200 bg-green-50";
    }
    if (
      type?.includes("payment") ||
      type?.includes("salary") ||
      type?.includes("expense") ||
      type?.includes("bill")
    ) {
      return "border-blue-200 bg-blue-50";
    }
    if (
      type?.includes("expiring") ||
      type?.includes("overdue") ||
      type?.includes("alert")
    ) {
      return "border-orange-200 bg-orange-50";
    }
    if (type?.includes("announcement") || type?.includes("broadcast")) {
      return "border-purple-200 bg-purple-50";
    }
    return "border-gray-200 bg-gray-50";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
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
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "unread") return !n.is_read;
    if (activeTab === "read") return n.is_read;
    return true;
  });

  // Get role badge color
  const getRoleBadgeColor = (role) => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-700";
      case "agent":
        return "bg-blue-100 text-blue-700";
      case "tenant":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Notification Center
          </h1>
          <p className="text-gray-500">
            You have {unreadCount} unread message{unreadCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto flex-wrap">
          {user?.role === "admin" && (
            <button
              onClick={() => setShowBroadcastModal(true)}
              className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <span>📢</span>
              <span>New Broadcast</span>
            </button>
          )}
          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="flex-1 md:flex-none bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mark All Read
          </button>
          <button
            onClick={clearReadNotifications}
            className="flex-1 md:flex-none bg-gray-100 text-gray-600 px-4 py-2 rounded-lg font-medium hover:bg-gray-200"
          >
            Clear Read
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-red-700">{error}</span>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-700"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b">
          {[
            { key: "all", label: "All", count: notifications.length },
            { key: "unread", label: "Unread", count: unreadCount },
            {
              key: "read",
              label: "Read",
              count: notifications.filter((n) => n.is_read).length,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-4 text-sm font-bold capitalize transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? "border-b-2 border-blue-600 text-blue-600 bg-blue-50/50"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.key
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="divide-y max-h-[600px] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="p-10 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-20 text-center text-gray-500">
              <div className="text-5xl mb-4">📭</div>
              <p className="text-lg font-medium">No notifications</p>
              <p className="text-sm text-gray-400 mt-1">
                {activeTab === "unread"
                  ? "All caught up!"
                  : "Nothing here yet."}
              </p>
            </div>
          ) : (
            filteredNotifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 flex gap-4 transition-all hover:bg-gray-50 ${
                  !n.is_read ? "bg-blue-50/40 border-l-4 border-l-blue-500" : ""
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-xl border flex-shrink-0 ${getNotificationColor(n.type)}`}
                >
                  {getNotificationIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <h3
                      className={`font-bold truncate ${!n.is_read ? "text-blue-900" : "text-gray-700"}`}
                    >
                      {n.title}
                    </h3>
                    <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                      {formatDate(n.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                    {n.message}
                  </p>
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${getNotificationColor(n.type)} border`}
                    >
                      {n.type?.replace(/_/g, " ")}
                    </span>
                    {!n.is_read && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        Mark Read
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(n.id)}
                      className="text-xs font-bold text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {pagination.currentPage} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  fetchNotifications({
                    page: pagination.currentPage - 1,
                    ...filters,
                  })
                }
                disabled={!pagination.hasPrev}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  fetchNotifications({
                    page: pagination.currentPage + 1,
                    ...filters,
                  })
                }
                disabled={!pagination.hasNext}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📢</span>
                <div>
                  <h2 className="text-xl font-bold">Create Broadcast</h2>
                  <p className="text-sm text-blue-100">
                    Send notifications to users
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowBroadcastModal(false);
                  resetBroadcastModal();
                }}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <form
              onSubmit={handleBroadcastSubmit}
              className="flex-1 overflow-y-auto"
            >
              <div className="p-6 space-y-5">
                {/* Notification Type */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Notification Type
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {notificationTypes.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() =>
                          setBroadcastData((prev) => ({
                            ...prev,
                            type: type.value,
                          }))
                        }
                        className={`p-3 rounded-lg border-2 transition-all text-center ${
                          broadcastData.type === type.value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        <span className="text-xl block mb-1">{type.icon}</span>
                        <span className="text-xs font-medium">
                          {type.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter notification title..."
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:border-blue-500 focus:outline-none transition-colors"
                    value={broadcastData.title}
                    onChange={(e) =>
                      setBroadcastData({
                        ...broadcastData,
                        title: e.target.value,
                      })
                    }
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows="4"
                    placeholder="Write your notification message..."
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:border-blue-500 focus:outline-none transition-colors resize-none"
                    value={broadcastData.message}
                    onChange={(e) =>
                      setBroadcastData({
                        ...broadcastData,
                        message: e.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {broadcastData.message.length} characters
                  </p>
                </div>

                {/* Recipient Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Send To
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() =>
                        setBroadcastData((prev) => ({
                          ...prev,
                          recipientType: "all",
                        }))
                      }
                      className={`p-3 rounded-lg border-2 transition-all ${
                        broadcastData.recipientType === "all"
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-xl block mb-1">👥</span>
                      <span className="text-sm font-medium">All Users</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBroadcastData((prev) => ({
                          ...prev,
                          recipientType: "roles",
                        }))
                      }
                      className={`p-3 rounded-lg border-2 transition-all ${
                        broadcastData.recipientType === "roles"
                          ? "border-purple-500 bg-purple-50 text-purple-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-xl block mb-1">🏷️</span>
                      <span className="text-sm font-medium">By Role</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBroadcastData((prev) => ({
                          ...prev,
                          recipientType: "specific",
                        }));
                        if (allUsers.length === 0) fetchAllUsers();
                      }}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        broadcastData.recipientType === "specific"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-xl block mb-1">👤</span>
                      <span className="text-sm font-medium">
                        Specific Users
                      </span>
                    </button>
                  </div>

                  {/* Role Selection */}
                  {broadcastData.recipientType === "roles" && (
                    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                      <p className="text-sm text-gray-600">
                        Select which roles to notify:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {availableRoles.map((role) => (
                          <button
                            key={role.value}
                            type="button"
                            onClick={() => toggleRole(role.value)}
                            className={`px-4 py-2 rounded-full border-2 transition-all flex items-center gap-2 ${
                              broadcastData.target_roles.includes(role.value)
                                ? "border-blue-500 bg-blue-100 text-blue-700"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <span>{role.icon}</span>
                            <span className="font-medium">{role.label}</span>
                            {broadcastData.target_roles.includes(
                              role.value,
                            ) && (
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                      {broadcastData.target_roles.length > 0 && (
                        <p className="text-sm text-green-600">
                          ✓ Will notify all{" "}
                          {broadcastData.target_roles.join(", ")} users
                        </p>
                      )}
                    </div>
                  )}

                  {/* Specific User Selection */}
                  {broadcastData.recipientType === "specific" && (
                    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                      {/* Search */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search users by name, email, or role..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                        />
                        <svg
                          className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </div>

                      {/* Selection Controls */}
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">
                          {broadcastData.selectedUserIds.length} user
                          {broadcastData.selectedUserIds.length !== 1
                            ? "s"
                            : ""}{" "}
                          selected
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={selectAllFilteredUsers}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={deselectAllUsers}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* User List */}
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y">
                        {usersLoading ? (
                          <div className="p-4 text-center text-gray-400">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                            Loading users...
                          </div>
                        ) : filteredUsers.length === 0 ? (
                          <div className="p-4 text-center text-gray-400">
                            No users found
                          </div>
                        ) : (
                          filteredUsers.map((u) => (
                            <label
                              key={u.id}
                              className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                                broadcastData.selectedUserIds.includes(u.id)
                                  ? "bg-blue-50"
                                  : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={broadcastData.selectedUserIds.includes(
                                  u.id,
                                )}
                                onChange={() => toggleUserSelection(u.id)}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                              />
                              <div className="flex-shrink-0">
                                {u.profile_image ? (
                                  <img
                                    src={u.profile_image}
                                    alt=""
                                    className="w-8 h-8 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium text-white">
                                    {u.first_name?.charAt(0)}
                                    {u.last_name?.charAt(0)}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {u.first_name} {u.last_name}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {u.email}
                                </p>
                              </div>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadgeColor(u.role)}`}
                              >
                                {u.role}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* All Users Info */}
                  {broadcastData.recipientType === "all" && (
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center gap-2 text-green-700">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm font-medium">
                          This notification will be sent to all active users in
                          the system.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setShowBroadcastModal(false);
                    resetBroadcastModal();
                  }}
                  className="px-5 py-2 text-gray-600 font-medium hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={broadcastLoading}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {broadcastLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <span>📤</span>
                      <span>Send Broadcast</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
