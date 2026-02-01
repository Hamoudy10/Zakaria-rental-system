// src/pages/NotificationsPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const NotificationsPage = () => {
  const {
    notifications, unreadCount, loading, error, pagination,
    fetchNotifications, markAsRead, markAllAsRead, deleteNotification,
    clearReadNotifications, createBroadcastNotification, clearError
  } = useNotification();

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastData, setBroadcastData] = useState({
    title: '', message: '', target_roles: ['tenant']
  });

  const [filters, setFilters] = useState({ type: '', start_date: '', end_date: '' });

  useEffect(() => {
    fetchNotifications({ page: 1, ...filters });
  }, [filters, fetchNotifications]);

  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    try {
      await createBroadcastNotification(broadcastData);
      setShowBroadcastModal(false);
      setBroadcastData({ title: '', message: '', target_roles: ['tenant'] });
      alert('Broadcast sent to all relevant users!');
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      // EXISTING
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
        return "🏦";
      case "salary_processed":
        return "🏦";
      case "complaint_created":
        return "🚨";
      case "complaint_resolved":
        return "✅";
      case "complaint_updated":
        return "📝";
      case "announcement":
        return "📢";
      case "maintenance":
        return "🛠️";

      // NEW TYPES TO ADD
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

      default:
        return "🔔";
    }
  };

  const getNotificationColor = (type) => {
    // Error/Failure/Rejection (Red)
    if (
      type?.includes("failed") ||
      type?.includes("error") ||
      type?.includes("rejected")
    ) {
      return "border-red-200 bg-red-50";
    }
    // Success/Approved/Resolved (Green)
    if (
      type?.includes("success") ||
      type?.includes("resolved") ||
      type?.includes("approved")
    ) {
      return "border-green-200 bg-green-50";
    }
    // Financial/Payment (Blue)
    if (
      type?.includes("payment") ||
      type?.includes("salary") ||
      type?.includes("expense") ||
      type?.includes("bill")
    ) {
      return "border-blue-200 bg-blue-50";
    }
    // Warnings/Alerts (Yellow/Orange)
    if (
      type?.includes("expiring") ||
      type?.includes("overdue") ||
      type?.includes("alert")
    ) {
      return "border-orange-200 bg-orange-50";
    }
    // Default (Gray)
    return "border-gray-200 bg-gray-50";
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'unread') return !n.is_read;
    if (activeTab === 'read') return n.is_read;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notification Center</h1>
          <p className="text-gray-500">You have {unreadCount} unread messages</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {user?.role === 'admin' && (
            <button onClick={() => setShowBroadcastModal(true)} className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
              New Broadcast
            </button>
          )}
          <button onClick={markAllAsRead} className="flex-1 md:flex-none bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700">
            Read All
          </button>
          <button onClick={clearReadNotifications} className="flex-1 md:flex-none bg-gray-100 text-gray-600 px-4 py-2 rounded-lg font-medium hover:bg-gray-200">
            Clear Read
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b">
          {['all', 'unread', 'read'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-6 py-4 text-sm font-bold capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
              {tab}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="divide-y">
          {loading && notifications.length === 0 ? (
            <div className="p-10 text-center animate-pulse text-gray-400">Loading notifications...</div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-20 text-center text-gray-500">
              <div className="text-4xl mb-2">📭</div>
              <p>No notifications found here.</p>
            </div>
          ) : (
            filteredNotifications.map(n => (
              <div key={n.id} className={`p-4 flex gap-4 transition-colors hover:bg-gray-50 ${!n.is_read ? 'bg-blue-50/30' : ''}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl border ${getNotificationColor(n.type)}`}>
                  {getNotificationIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className={`font-bold truncate ${!n.is_read ? 'text-blue-900' : 'text-gray-700'}`}>{n.title}</h3>
                    <span className="text-xs text-gray-400 whitespace-nowrap ml-2">{new Date(n.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">{n.message}</p>
                  <div className="flex gap-4">
                    {!n.is_read && (
                      <button onClick={() => markAsRead(n.id)} className="text-xs font-bold text-blue-600 hover:underline">Mark Read</button>
                    )}
                    <button onClick={() => deleteNotification(n.id)} className="text-xs font-bold text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <form onSubmit={handleBroadcastSubmit} className="p-6 space-y-4">
              <h2 className="text-xl font-bold">System Broadcast</h2>
              <div>
                <label className="block text-sm font-bold mb-1">Title</label>
                <input type="text" required className="w-full border rounded-lg p-2" value={broadcastData.title} onChange={e => setBroadcastData({...broadcastData, title: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Message</label>
                <textarea required rows="4" className="w-full border rounded-lg p-2" value={broadcastData.message} onChange={e => setBroadcastData({...broadcastData, message: e.target.value})} />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowBroadcastModal(false)} className="px-4 py-2 text-gray-500 font-bold">Cancel</button>
                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">Send to All</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;