// src/components/NotificationManagement.jsx
// COMPLETE REDESIGNED COMPONENT WITH SMS DELIVERY TRACKING
// Features:
// - Tab 1: Bulk SMS (all tenants in property)
// - Tab 2: Targeted SMS (select specific tenants)
// - Tab 3: SMS History with Delivery Tracking

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "../context/PropertyContext";
import { notificationAPI } from "../services/api";
import {
  Send,
  MessageSquare,
  Users,
  Clock,
  Search,
  X,
  Check,
  CheckCheck,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Filter,
  User,
  Phone,
  Home,
  Mail,
  Loader2,
  History,
  Target,
  Radio,
  Eye,
  ExternalLink,
  Zap,
} from "lucide-react";

// ============================================================
// HELPER COMPONENTS
// ============================================================

const TabButton = ({ active, onClick, icon: Icon, label, count }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm transition-all border-b-2 ${
      active
        ? "text-blue-600 border-blue-600 bg-blue-50/50"
        : "text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50"
    }`}
  >
    <Icon size={18} />
    <span>{label}</span>
    {count !== undefined && count > 0 && (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
          active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

const StatusBadge = ({ status }) => {
  const config = {
    sent: {
      bg: "bg-green-100",
      text: "text-green-700",
      icon: Check,
      label: "Sent",
    },
    delivered: {
      bg: "bg-blue-100",
      text: "text-blue-700",
      icon: CheckCheck,
      label: "Delivered",
    },
    failed: {
      bg: "bg-red-100",
      text: "text-red-700",
      icon: X,
      label: "Failed",
    },
    pending: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      icon: Clock,
      label: "Pending",
    },
    queued: {
      bg: "bg-orange-100",
      text: "text-orange-700",
      icon: Clock,
      label: "Queued",
    },
  };

  const { bg, text, icon: Icon, label } = config[status] || config.pending;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${bg} ${text}`}
    >
      <Icon size={12} />
      {label}
    </span>
  );
};

const DeliveryStatusBadge = ({ status, description }) => {
  // Celcom delivery status codes
  const config = {
    DeliveredToTerminal: {
      bg: "bg-green-100",
      text: "text-green-700",
      label: "Delivered",
      icon: CheckCheck,
    },
    SentToNetwork: {
      bg: "bg-blue-100",
      text: "text-blue-700",
      label: "Sent to Network",
      icon: Radio,
    },
    Pending: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      label: "Pending",
      icon: Clock,
    },
    Failed: {
      bg: "bg-red-100",
      text: "text-red-700",
      label: "Failed",
      icon: X,
    },
    Expired: {
      bg: "bg-gray-100",
      text: "text-gray-700",
      label: "Expired",
      icon: Clock,
    },
    Rejected: {
      bg: "bg-red-100",
      text: "text-red-700",
      label: "Rejected",
      icon: X,
    },
    Unknown: {
      bg: "bg-gray-100",
      text: "text-gray-500",
      label: "Unknown",
      icon: AlertTriangle,
    },
  };

  const statusKey = status || "Unknown";
  const {
    bg,
    text,
    label,
    icon: Icon,
  } = config[statusKey] || config["Unknown"];

  return (
    <div className="flex flex-col">
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${bg} ${text}`}
      >
        <Icon size={12} />
        {label}
      </span>
      {description && (
        <span className="text-[10px] text-gray-500 mt-1">{description}</span>
      )}
    </div>
  );
};

const MessagePreview = ({ message, maxLength = 50 }) => {
  const truncated =
    message?.length > maxLength
      ? message.substring(0, maxLength) + "..."
      : message;
  return <span className="text-gray-600">{truncated || "No message"}</span>;
};

const TenantCheckbox = ({ tenant, selected, onToggle }) => (
  <div
    onClick={() => onToggle(tenant.id)}
    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
      selected
        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
    }`}
  >
    <div
      className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
        selected ? "bg-blue-600 border-blue-600" : "border-gray-300"
      }`}
    >
      {selected && <Check size={14} className="text-white" />}
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-900 truncate">
          {tenant.first_name} {tenant.last_name}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
          {tenant.unit_code}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
        <Phone size={12} />
        <span>{tenant.phone_number || "No phone"}</span>
      </div>
    </div>
  </div>
);

const EmptyState = ({ icon: Icon, title, description }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
      <Icon size={32} className="text-gray-400" />
    </div>
    <h3 className="font-semibold text-gray-700 mb-1">{title}</h3>
    <p className="text-sm text-gray-500 max-w-sm">{description}</p>
  </div>
);

const LoadingSpinner = ({ text = "Loading..." }) => (
  <div className="flex flex-col items-center justify-center py-12">
    <Loader2 size={32} className="text-blue-600 animate-spin mb-3" />
    <span className="text-sm text-gray-500">{text}</span>
  </div>
);

// ============================================================
// TEMPLATE DATA
// ============================================================

const MESSAGE_TEMPLATES = [
  {
    id: 1,
    title: "Rent Reminder",
    type: "payment",
    message:
      "Dear tenant, a friendly reminder that rent is due. Please settle via Paybill to avoid penalties. Thank you!",
  },
  {
    id: 2,
    title: "Water Interruption",
    type: "maintenance",
    message:
      "Notice: Scheduled maintenance will cause water interruption tomorrow from 10am to 2pm. Please prepare.",
  },
  {
    id: 3,
    title: "General Announcement",
    type: "announcement",
    message:
      "Dear tenants, please note that the property management office will be closed this Friday.",
  },
  {
    id: 4,
    title: "Security Alert",
    type: "emergency",
    message:
      "URGENT: Please ensure all doors and windows are locked. Report suspicious activity to management.",
  },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

const NotificationManagement = () => {
  const { properties, loading: propsLoading } = useProperty();

  // Tab state
  const [activeTab, setActiveTab] = useState("bulk");

  // Common state
  const [selectedProperty, setSelectedProperty] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("announcement");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // Targeted SMS state
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [selectedTenants, setSelectedTenants] = useState([]);
  const [tenantSearch, setTenantSearch] = useState("");

  // History state
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    status: "",
    startDate: "",
    endDate: "",
    search: "",
  });
  const [historyPagination, setHistoryPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
  });
  const [expandedRow, setExpandedRow] = useState(null);

  // Delivery tracking state
  const [checkingDelivery, setCheckingDelivery] = useState({});
  const [deliveryStatuses, setDeliveryStatuses] = useState({});

  // ============================================================
  // FETCH FUNCTIONS
  // ============================================================

  const fetchTenants = useCallback(async (propertyId) => {
    if (!propertyId) {
      setTenants([]);
      return;
    }

    setLoadingTenants(true);
    try {
      const response = await notificationAPI.getTenantsByProperty(propertyId);
      if (response.data.success) {
        setTenants(response.data.data || []);
      } else {
        setTenants([]);
      }
    } catch (err) {
      console.error("Error fetching tenants:", err);
      setTenants([]);
    } finally {
      setLoadingTenants(false);
    }
  }, []);

  const fetchHistory = useCallback(
    async (page = 1) => {
      setLoadingHistory(true);
      try {
        const params = {
          page,
          limit: 15,
          ...historyFilters,
        };

        // Remove empty params
        Object.keys(params).forEach((key) => {
          if (!params[key]) delete params[key];
        });

        const response = await notificationAPI.getSMSHistory(params);
        if (response.data.success) {
          setHistory(response.data.data.history || []);
          setHistoryPagination(
            response.data.data.pagination || {
              currentPage: 1,
              totalPages: 1,
              totalCount: 0,
            },
          );
        }
      } catch (err) {
        console.error("Error fetching SMS history:", err);
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    },
    [historyFilters],
  );

  // ============================================================
  // DELIVERY TRACKING FUNCTION
  // ============================================================

  const checkDeliveryStatus = useCallback(async (messageId, smsId) => {
    if (!messageId) {
      alert("No message ID available for this SMS");
      return;
    }

    setCheckingDelivery((prev) => ({ ...prev, [smsId]: true }));

    try {
      const response = await notificationAPI.checkDeliveryStatus(messageId);

      if (response.data.success) {
        const status = response.data.data;
        setDeliveryStatuses((prev) => ({
          ...prev,
          [smsId]: {
            status: status.delivery_status || status.status,
            description: status.description || status.delivery_description,
            checkedAt: new Date().toISOString(),
            raw: status,
          },
        }));

        // Update the history item with new status if delivered
        if (status.delivery_status === "DeliveredToTerminal") {
          setHistory((prev) =>
            prev.map((item) =>
              item.id === smsId
                ? {
                    ...item,
                    status: "delivered",
                    delivery_status: status.delivery_status,
                  }
                : item,
            ),
          );
        }
      } else {
        alert(
          "Failed to check delivery status: " +
            (response.data.message || "Unknown error"),
        );
      }
    } catch (err) {
      console.error("Error checking delivery status:", err);
      alert(
        "Error checking delivery status: " +
          (err.response?.data?.message || err.message),
      );
    } finally {
      setCheckingDelivery((prev) => ({ ...prev, [smsId]: false }));
    }
  }, []);

  // Bulk check all sent messages
  const checkAllDeliveryStatuses = useCallback(async () => {
    const sentMessages = history.filter(
      (h) => h.message_id && h.status === "sent",
    );

    if (sentMessages.length === 0) {
      alert("No sent messages with tracking IDs found");
      return;
    }

    for (const sms of sentMessages) {
      await checkDeliveryStatus(sms.message_id, sms.id);
      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, [history, checkDeliveryStatus]);

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    if (activeTab === "targeted" && selectedProperty) {
      fetchTenants(selectedProperty);
    }
  }, [activeTab, selectedProperty, fetchTenants]);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory(1);
    }
  }, [activeTab, fetchHistory]);

  useEffect(() => {
    // Reset selections when property changes
    setSelectedTenants([]);
    setTenantSearch("");
  }, [selectedProperty]);

  // ============================================================
  // SEND FUNCTIONS
  // ============================================================

  const sendBulkSMS = async () => {
    if (!selectedProperty || !message.trim()) {
      alert("Please select a property and enter a message");
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await notificationAPI.sendBulkSMS({
        propertyId: selectedProperty,
        message: message.trim(),
        messageType,
      });

      if (response.data.success) {
        setResult({
          success: true,
          message: response.data.message,
          data: response.data.data,
        });
        setMessage("");
      } else {
        setResult({
          success: false,
          message: response.data.message || "Failed to send SMS",
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: err.response?.data?.message || "Failed to send SMS",
      });
    } finally {
      setSending(false);
    }
  };

  const sendTargetedSMS = async () => {
    if (selectedTenants.length === 0 || !message.trim()) {
      alert("Please select at least one tenant and enter a message");
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await notificationAPI.sendTargetedSMS({
        tenantIds: selectedTenants,
        message: message.trim(),
        messageType,
      });

      if (response.data.success) {
        setResult({
          success: true,
          message: response.data.message,
          data: response.data.data,
        });
        setMessage("");
        setSelectedTenants([]);
      } else {
        setResult({
          success: false,
          message: response.data.message || "Failed to send SMS",
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: err.response?.data?.message || "Failed to send SMS",
      });
    } finally {
      setSending(false);
    }
  };

  // ============================================================
  // TENANT SELECTION HELPERS
  // ============================================================

  const toggleTenant = (tenantId) => {
    setSelectedTenants((prev) =>
      prev.includes(tenantId)
        ? prev.filter((id) => id !== tenantId)
        : [...prev, tenantId],
    );
  };

  const selectAll = () => {
    const visibleTenantIds = filteredTenants.map((t) => t.id);
    setSelectedTenants(visibleTenantIds);
  };

  const deselectAll = () => {
    setSelectedTenants([]);
  };

  const filteredTenants = tenants.filter((tenant) => {
    if (!tenantSearch) return true;
    const search = tenantSearch.toLowerCase();
    return (
      tenant.first_name?.toLowerCase().includes(search) ||
      tenant.last_name?.toLowerCase().includes(search) ||
      tenant.phone_number?.includes(search) ||
      tenant.unit_code?.toLowerCase().includes(search)
    );
  });

  // ============================================================
  // FORMAT HELPERS
  // ============================================================

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const formatPhone = (phone) => {
    if (!phone) return "N/A";
    // Convert 254... to 0...
    if (phone.startsWith("254")) {
      return "0" + phone.substring(3);
    }
    return phone;
  };

  // ============================================================
  // RENDER: MESSAGE COMPOSER
  // ============================================================

  const renderMessageComposer = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Message Category
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {["announcement", "payment", "maintenance", "emergency"].map((t) => (
            <button
              key={t}
              onClick={() => setMessageType(t)}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all border ${
                messageType === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">
          SMS Content
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={160}
          rows={4}
          placeholder="Write your message here..."
          className="w-full p-4 border rounded-xl bg-gray-50 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <div className="flex justify-between mt-1 text-xs font-medium">
          <span
            className={
              message.length > 140 ? "text-orange-500" : "text-gray-400"
            }
          >
            {message.length > 140
              ? "⚠️ Approaching limit"
              : "MAX 160 CHARACTERS"}
          </span>
          <span
            className={message.length > 160 ? "text-red-500" : "text-gray-400"}
          >
            {message.length} / 160
          </span>
        </div>
      </div>

      {/* Quick Templates */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Quick Templates
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MESSAGE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => {
                setMessage(tpl.message);
                setMessageType(tpl.type);
              }}
              className="text-left p-3 rounded-xl border border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <span className="font-semibold text-blue-600 text-sm">
                {tpl.title}
              </span>
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                {tpl.message}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ============================================================
  // RENDER: RESULT MESSAGE
  // ============================================================

  const renderResult = () => {
    if (!result) return null;

    return (
      <div
        className={`p-4 rounded-xl border ${
          result.success
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}
      >
        <div className="flex items-start gap-3">
          {result.success ? (
            <CheckCheck className="mt-0.5 flex-shrink-0" size={20} />
          ) : (
            <AlertTriangle className="mt-0.5 flex-shrink-0" size={20} />
          )}
          <div className="flex-1">
            <p className="font-semibold">{result.message}</p>
            {result.data && (
              <div className="mt-2 text-sm space-y-1">
                <p>
                  Total: {result.data.total} | Sent: {result.data.sent} |
                  Failed: {result.data.failed}
                </p>
                {result.data.errors?.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer hover:underline">
                      View errors ({result.data.errors.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {result.data.errors.map((err, i) => (
                        <li key={i} className="bg-white/50 p-2 rounded">
                          {err.tenant} ({err.unit}): {err.error}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setResult(null)}
            className="p-1 hover:bg-white/50 rounded"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  };

  // ============================================================
  // RENDER: BULK SMS TAB
  // ============================================================

  const renderBulkTab = () => (
    <div className="space-y-6">
      {renderResult()}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Target Property
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              disabled={propsLoading}
            >
              <option value="">Select Property...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.total_units} units)
                </option>
              ))}
            </select>
          </div>

          {selectedProperty && (
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2 text-blue-800">
                <Users size={18} />
                <span className="font-semibold">
                  SMS will be sent to all active tenants in this property
                </span>
              </div>
            </div>
          )}
        </div>

        <div>{renderMessageComposer()}</div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <button
          disabled={sending || !selectedProperty || !message.trim()}
          onClick={sendBulkSMS}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200"
        >
          {sending ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send size={18} />
              Send Bulk SMS
            </>
          )}
        </button>
      </div>
    </div>
  );

  // ============================================================
  // RENDER: TARGETED SMS TAB
  // ============================================================

  const renderTargetedTab = () => (
    <div className="space-y-6">
      {renderResult()}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Tenant Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Select Property
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              disabled={propsLoading}
            >
              <option value="">Select Property...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.total_units} units)
                </option>
              ))}
            </select>
          </div>

          {selectedProperty && (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <input
                    type="text"
                    placeholder="Search tenants..."
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {selectedTenants.length} of {filteredTenants.length} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={deselectAll}
                    className="text-xs font-semibold text-gray-500 hover:underline"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                {loadingTenants ? (
                  <LoadingSpinner text="Loading tenants..." />
                ) : filteredTenants.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No tenants found"
                    description={
                      tenantSearch
                        ? "Try a different search term"
                        : "No active tenants in this property"
                    }
                  />
                ) : (
                  filteredTenants.map((tenant) => (
                    <TenantCheckbox
                      key={tenant.id}
                      tenant={tenant}
                      selected={selectedTenants.includes(tenant.id)}
                      onToggle={toggleTenant}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {!selectedProperty && (
            <EmptyState
              icon={Home}
              title="Select a Property"
              description="Choose a property to view its tenants"
            />
          )}
        </div>

        {/* Right: Message Composer */}
        <div>{renderMessageComposer()}</div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <button
          disabled={sending || selectedTenants.length === 0 || !message.trim()}
          onClick={sendTargetedSMS}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200"
        >
          {sending ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Target size={18} />
              Send to {selectedTenants.length} Tenant
              {selectedTenants.length !== 1 ? "s" : ""}
            </>
          )}
        </button>
      </div>
    </div>
  );

  // ============================================================
  // RENDER: HISTORY TAB WITH DELIVERY TRACKING
  // ============================================================

  const renderHistoryTab = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search phone or message..."
            value={historyFilters.search}
            onChange={(e) =>
              setHistoryFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <select
          value={historyFilters.status}
          onChange={(e) =>
            setHistoryFilters((prev) => ({ ...prev, status: e.target.value }))
          }
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">All Status</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>

        <input
          type="date"
          value={historyFilters.startDate}
          onChange={(e) =>
            setHistoryFilters((prev) => ({
              ...prev,
              startDate: e.target.value,
            }))
          }
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Start Date"
        />

        <input
          type="date"
          value={historyFilters.endDate}
          onChange={(e) =>
            setHistoryFilters((prev) => ({ ...prev, endDate: e.target.value }))
          }
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="End Date"
        />

        <button
          onClick={() => fetchHistory(1)}
          className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          title="Refresh"
        >
          <RefreshCw
            size={18}
            className={loadingHistory ? "animate-spin" : ""}
          />
        </button>

        <button
          onClick={checkAllDeliveryStatuses}
          className="flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
          title="Check delivery status for all sent messages"
        >
          <Zap size={16} />
          Check All Deliveries
        </button>
      </div>

      {/* History Table */}
      {loadingHistory ? (
        <LoadingSpinner text="Loading SMS history..." />
      ) : history.length === 0 ? (
        <EmptyState
          icon={History}
          title="No SMS History"
          description="SMS messages you send will appear here"
        />
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">
                  Recipient
                </th>
                <th className="text-left p-3 font-semibold text-gray-600">
                  Message
                </th>
                <th className="text-left p-3 font-semibold text-gray-600">
                  Type
                </th>
                <th className="text-left p-3 font-semibold text-gray-600">
                  Send Status
                </th>
                <th className="text-left p-3 font-semibold text-gray-600">
                  Delivery Status
                </th>
                <th className="text-left p-3 font-semibold text-gray-600">
                  Sent At
                </th>
                <th className="text-center p-3 font-semibold text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((item) => (
                <React.Fragment key={item.id}>
                  <tr
                    className={`hover:bg-gray-50 transition-colors ${expandedRow === item.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-gray-400" />
                        <span className="font-medium">
                          {formatPhone(item.recipient_phone)}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 max-w-xs">
                      <MessagePreview message={item.message} maxLength={40} />
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium capitalize">
                        {item.message_type || "general"}
                      </span>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="p-3">
                      {deliveryStatuses[item.id] ? (
                        <DeliveryStatusBadge
                          status={deliveryStatuses[item.id].status}
                          description={deliveryStatuses[item.id].description}
                        />
                      ) : item.delivery_status ? (
                        <DeliveryStatusBadge status={item.delivery_status} />
                      ) : (
                        <span className="text-xs text-gray-400 italic">
                          Not checked
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-gray-500 text-xs">
                      {formatDate(item.sent_at || item.created_at)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        {/* Expand/View Details */}
                        <button
                          onClick={() =>
                            setExpandedRow(
                              expandedRow === item.id ? null : item.id,
                            )
                          }
                          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                          title="View details"
                        >
                          {expandedRow === item.id ? (
                            <ChevronUp size={16} className="text-gray-500" />
                          ) : (
                            <ChevronDown size={16} className="text-gray-500" />
                          )}
                        </button>

                        {/* Check Delivery Status */}
                        {item.message_id && item.status === "sent" && (
                          <button
                            onClick={() =>
                              checkDeliveryStatus(item.message_id, item.id)
                            }
                            disabled={checkingDelivery[item.id]}
                            className="p-1.5 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                            title="Check delivery status"
                          >
                            {checkingDelivery[item.id] ? (
                              <Loader2
                                size={16}
                                className="text-blue-600 animate-spin"
                              />
                            ) : (
                              <Eye size={16} className="text-blue-600" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Row */}
                  {expandedRow === item.id && (
                    <tr className="bg-blue-50/50">
                      <td colSpan={7} className="p-4">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-2">
                              Full Message
                            </h4>
                            <p className="text-sm text-gray-600 bg-white p-3 rounded-lg border">
                              {item.message}
                            </p>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-1">
                                Details
                              </h4>
                              <div className="text-sm space-y-1">
                                <p>
                                  <span className="text-gray-500">Phone:</span>{" "}
                                  {formatPhone(item.recipient_phone)}
                                </p>
                                <p>
                                  <span className="text-gray-500">
                                    Message ID:
                                  </span>{" "}
                                  {item.message_id || "N/A"}
                                </p>
                                <p>
                                  <span className="text-gray-500">
                                    Attempts:
                                  </span>{" "}
                                  {item.attempts || 1}
                                </p>
                                <p>
                                  <span className="text-gray-500">
                                    Created:
                                  </span>{" "}
                                  {formatDate(item.created_at)}
                                </p>
                                {item.sent_at && (
                                  <p>
                                    <span className="text-gray-500">Sent:</span>{" "}
                                    {formatDate(item.sent_at)}
                                  </p>
                                )}
                              </div>
                            </div>

                            {item.error_message && (
                              <div>
                                <h4 className="font-semibold text-red-600 mb-1">
                                  Error
                                </h4>
                                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                                  {item.error_message}
                                </p>
                              </div>
                            )}

                            {deliveryStatuses[item.id] && (
                              <div>
                                <h4 className="font-semibold text-blue-700 mb-1">
                                  Delivery Report
                                </h4>
                                <div className="text-sm bg-blue-50 p-2 rounded space-y-1">
                                  <p>
                                    <span className="text-gray-500">
                                      Status:
                                    </span>{" "}
                                    {deliveryStatuses[item.id].status}
                                  </p>
                                  {deliveryStatuses[item.id].description && (
                                    <p>
                                      <span className="text-gray-500">
                                        Description:
                                      </span>{" "}
                                      {deliveryStatuses[item.id].description}
                                    </p>
                                  )}
                                  <p>
                                    <span className="text-gray-500">
                                      Checked:
                                    </span>{" "}
                                    {formatDate(
                                      deliveryStatuses[item.id].checkedAt,
                                    )}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Check Delivery Button in expanded view */}
                            {item.message_id && (
                              <button
                                onClick={() =>
                                  checkDeliveryStatus(item.message_id, item.id)
                                }
                                disabled={checkingDelivery[item.id]}
                                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 text-sm font-medium transition-colors"
                              >
                                {checkingDelivery[item.id] ? (
                                  <>
                                    <Loader2
                                      size={16}
                                      className="animate-spin"
                                    />
                                    Checking...
                                  </>
                                ) : (
                                  <>
                                    <Radio size={16} />
                                    Check Delivery Status
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {historyPagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-sm text-gray-600">
            Page {historyPagination.currentPage} of{" "}
            {historyPagination.totalPages}({historyPagination.totalCount} total)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => fetchHistory(historyPagination.currentPage - 1)}
              disabled={historyPagination.currentPage <= 1}
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => fetchHistory(historyPagination.currentPage + 1)}
              disabled={
                historyPagination.currentPage >= historyPagination.totalPages
              }
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
              <MessageSquare className="text-blue-600" />
              SMS Management
            </h1>
            <p className="text-gray-500 mt-1">
              Send SMS notifications to tenants and track delivery
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b -mx-6 px-6">
          <TabButton
            active={activeTab === "bulk"}
            onClick={() => setActiveTab("bulk")}
            icon={Users}
            label="Bulk SMS"
          />
          <TabButton
            active={activeTab === "targeted"}
            onClick={() => setActiveTab("targeted")}
            icon={Target}
            label="Targeted SMS"
            count={selectedTenants.length}
          />
          <TabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            icon={History}
            label="History"
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        {activeTab === "bulk" && renderBulkTab()}
        {activeTab === "targeted" && renderTargetedTab()}
        {activeTab === "history" && renderHistoryTab()}
      </div>
    </div>
  );
};

export default NotificationManagement;
