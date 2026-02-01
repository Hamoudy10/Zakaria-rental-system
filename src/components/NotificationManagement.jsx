// src/components/NotificationManagement.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "../context/PropertyContext";
import { notificationAPI } from "../services/api";
import {
  Send,
  MessageSquare,
  Users,
  History,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Building2,
  User,
  Phone,
  Home,
  Filter,
  X,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";

// Helper to format phone for display (254xxx -> 0xxx)
const formatPhoneDisplay = (phone) => {
  if (!phone) return "N/A";
  return phone.startsWith("254") ? "0" + phone.slice(3) : phone;
};

// Helper to format date
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Status badge component
const StatusBadge = ({ status }) => {
  const styles = {
    sent: "bg-green-100 text-green-700 border-green-200",
    delivered: "bg-blue-100 text-blue-700 border-blue-200",
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    failed: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${styles[status] || styles.pending}`}
    >
      {status || "unknown"}
    </span>
  );
};

const NotificationManagement = () => {
  const { properties, loading: propsLoading, fetchProperties } = useProperty();

  // Tab state
  const [activeTab, setActiveTab] = useState("bulk"); // 'bulk', 'targeted', 'history'

  // Bulk SMS state
  const [selectedProperty, setSelectedProperty] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("announcement");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Targeted SMS state
  const [targetedProperty, setTargetedProperty] = useState("");
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [selectedTenants, setSelectedTenants] = useState([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [targetedMessage, setTargetedMessage] = useState("");
  const [targetedMessageType, setTargetedMessageType] =
    useState("announcement");
  const [sendingTargeted, setSendingTargeted] = useState(false);
  const [targetedResult, setTargetedResult] = useState(null);

  // History state
  const [smsHistory, setSmsHistory] = useState([]);
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
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  // Fetch properties on mount
  useEffect(() => {
    if (fetchProperties) {
      fetchProperties();
    }
  }, [fetchProperties]);

  // Fetch tenants when property is selected (for targeted SMS)
  useEffect(() => {
    if (targetedProperty) {
      fetchPropertyTenants(targetedProperty);
    } else {
      setTenants([]);
      setSelectedTenants([]);
    }
  }, [targetedProperty]);

  // Fetch SMS history when tab changes to history
  useEffect(() => {
    if (activeTab === "history") {
      fetchSMSHistory();
    }
  }, [activeTab, historyFilters, historyPagination.currentPage]);

  // Fetch tenants for a property
  const fetchPropertyTenants = async (propertyId) => {
    setLoadingTenants(true);
    try {
      const response = await notificationAPI.getPropertyTenants(propertyId);
      if (response.data.success) {
        setTenants(response.data.data.tenants || []);
      } else {
        setTenants([]);
      }
    } catch (err) {
      console.error("Error fetching tenants:", err);
      setTenants([]);
    } finally {
      setLoadingTenants(false);
    }
  };

  // Fetch SMS history
  const fetchSMSHistory = async () => {
    setLoadingHistory(true);
    try {
      const params = {
        page: historyPagination.currentPage,
        limit: 20,
        ...historyFilters,
      };
      // Remove empty params
      Object.keys(params).forEach((key) => {
        if (params[key] === "" || params[key] === null) delete params[key];
      });

      const response = await notificationAPI.getSMSHistory(params);
      if (response.data.success) {
        setSmsHistory(response.data.data.history || []);
        setHistoryPagination((prev) => ({
          ...prev,
          totalPages: response.data.data.pagination?.totalPages || 1,
          totalCount: response.data.data.pagination?.totalCount || 0,
        }));
      }
    } catch (err) {
      console.error("Error fetching SMS history:", err);
      setSmsHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Send bulk SMS
  const sendBulkSMS = async () => {
    if (!selectedProperty || !message.trim()) return;

    setSending(true);
    setSendResult(null);
    try {
      const response = await notificationAPI.sendBulkSMS({
        propertyId: selectedProperty,
        message: message.trim(),
        messageType: messageType,
      });

      if (response.data.success) {
        setSendResult({
          success: true,
          message: response.data.message,
          data: response.data.data,
        });
        setMessage("");
      } else {
        setSendResult({
          success: false,
          message: response.data.message || "Failed to send SMS",
        });
      }
    } catch (err) {
      console.error("Bulk SMS error:", err);
      setSendResult({
        success: false,
        message: err.response?.data?.message || "Failed to send bulk SMS",
      });
    } finally {
      setSending(false);
    }
  };

  // Send targeted SMS
  const sendTargetedSMS = async () => {
    if (selectedTenants.length === 0 || !targetedMessage.trim()) return;

    setSendingTargeted(true);
    setTargetedResult(null);
    try {
      const response = await notificationAPI.sendTargetedSMS({
        tenantIds: selectedTenants,
        message: targetedMessage.trim(),
        messageType: targetedMessageType,
      });

      if (response.data.success) {
        setTargetedResult({
          success: true,
          message: response.data.message,
          data: response.data.data,
        });
        setTargetedMessage("");
        setSelectedTenants([]);
      } else {
        setTargetedResult({
          success: false,
          message: response.data.message || "Failed to send SMS",
        });
      }
    } catch (err) {
      console.error("Targeted SMS error:", err);
      setTargetedResult({
        success: false,
        message: err.response?.data?.message || "Failed to send targeted SMS",
      });
    } finally {
      setSendingTargeted(false);
    }
  };

  // Toggle tenant selection
  const toggleTenantSelection = (tenantId) => {
    setSelectedTenants((prev) =>
      prev.includes(tenantId)
        ? prev.filter((id) => id !== tenantId)
        : [...prev, tenantId],
    );
  };

  // Select all filtered tenants
  const selectAllTenants = () => {
    const filteredIds = filteredTenants.map((t) => t.id);
    setSelectedTenants(filteredIds);
  };

  // Deselect all
  const deselectAllTenants = () => {
    setSelectedTenants([]);
  };

  // Filter tenants by search
  const filteredTenants = tenants.filter((t) => {
    if (!tenantSearch) return true;
    const search = tenantSearch.toLowerCase();
    return (
      t.first_name?.toLowerCase().includes(search) ||
      t.last_name?.toLowerCase().includes(search) ||
      t.phone_number?.includes(search) ||
      t.unit_code?.toLowerCase().includes(search)
    );
  });

  // Message templates
  const templates = [
    {
      title: "Rent Reminder",
      type: "payment",
      msg: "Dear tenant, a friendly reminder that rent is due. Please settle via Paybill to avoid penalties.",
    },
    {
      title: "Water Interruption",
      type: "maintenance",
      msg: "Notice: Scheduled maintenance will result in water interruption tomorrow from 10am to 2pm.",
    },
    {
      title: "General Notice",
      type: "announcement",
      msg: "Dear tenant, please be informed that...",
    },
    {
      title: "Emergency Alert",
      type: "emergency",
      msg: "URGENT: Please be advised of an emergency situation. Follow building safety protocols.",
    },
  ];

  // Apply template
  const applyTemplate = (template, isTargeted = false) => {
    if (isTargeted) {
      setTargetedMessage(template.msg);
      setTargetedMessageType(template.type);
    } else {
      setMessage(template.msg);
      setMessageType(template.type);
    }
  };

  // Tab button component
  const TabButton = ({ id, label, icon: Icon, count }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-all ${
        activeTab === id
          ? "border-blue-600 text-blue-600 bg-blue-50"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      }`}
    >
      <Icon size={18} />
      {label}
      {count !== undefined && (
        <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs font-bold">
          {count}
        </span>
      )}
    </button>
  );

  // Message type buttons
  const MessageTypeButtons = ({ value, onChange }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {["announcement", "payment", "maintenance", "emergency"].map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all border ${
            value === t
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  // Result alert component
  const ResultAlert = ({ result, onClose }) => {
    if (!result) return null;

    return (
      <div
        className={`p-4 rounded-xl border ${
          result.success
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle2 className="text-green-500 mt-0.5" size={20} />
            ) : (
              <XCircle className="text-red-500 mt-0.5" size={20} />
            )}
            <div>
              <p className="font-medium">{result.message}</p>
              {result.data && (
                <div className="mt-2 text-sm">
                  <p>
                    Total: {result.data.total} | Sent: {result.data.sent} |
                    Failed: {result.data.failed}
                  </p>
                  {result.data.errors?.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-red-600 font-medium">
                        View {result.data.errors.length} failed
                      </summary>
                      <ul className="mt-1 space-y-1 text-xs">
                        {result.data.errors.map((err, i) => (
                          <li key={i}>
                            • {err.tenant} ({err.unit}): {err.error}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
            <MessageSquare className="text-blue-600" /> SMS Management
          </h1>
          <p className="text-gray-500 mt-1">
            Send SMS notifications to property tenants
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-gray-50">
          <TabButton id="bulk" label="Bulk SMS" icon={Building2} />
          <TabButton
            id="targeted"
            label="Targeted SMS"
            icon={Users}
            count={selectedTenants.length || undefined}
          />
          <TabButton id="history" label="History" icon={History} />
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* ==================== BULK SMS TAB ==================== */}
          {activeTab === "bulk" && (
            <div className="space-y-6">
              {/* Result Alert */}
              <ResultAlert
                result={sendResult}
                onClose={() => setSendResult(null)}
              />

              <div className="grid md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      <Building2 size={14} className="inline mr-1" /> Target
                      Property
                    </label>
                    <select
                      value={selectedProperty}
                      onChange={(e) => setSelectedProperty(e.target.value)}
                      className="w-full p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      disabled={propsLoading}
                    >
                      <option value="">Select Property...</option>
                      {properties?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.total_units} units)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Category
                    </label>
                    <MessageTypeButtons
                      value={messageType}
                      onChange={setMessageType}
                    />
                  </div>

                  {/* Templates */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Quick Templates
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {templates.map((tpl, i) => (
                        <button
                          key={i}
                          onClick={() => applyTemplate(tpl, false)}
                          className="text-left p-3 rounded-lg border border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-all"
                        >
                          <span className="font-medium text-blue-600 text-sm">
                            {tpl.title}
                          </span>
                          <p className="text-xs text-gray-500 line-clamp-1 mt-1">
                            {tpl.msg}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column - Message */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      SMS Content
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={160}
                      rows={6}
                      placeholder="Write your message here..."
                      className="w-full p-4 border rounded-xl bg-gray-50 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <div className="flex justify-between mt-1 text-[10px] font-bold text-gray-400">
                      <span>MAX 160 CHARACTERS</span>
                      <span
                        className={
                          message.length > 150 ? "text-orange-500" : ""
                        }
                      >
                        {message.length} / 160
                      </span>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <Info size={16} className="text-blue-500 mt-0.5" />
                      <div className="text-sm text-blue-700">
                        <p className="font-medium">Bulk SMS will be sent to:</p>
                        <p className="text-blue-600">
                          All active tenants with phone numbers in the selected
                          property.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Send Button */}
              <div className="pt-4 border-t flex justify-end">
                <button
                  disabled={sending || !selectedProperty || !message.trim()}
                  onClick={sendBulkSMS}
                  className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200"
                >
                  {sending ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Send size={18} /> Send Bulk SMS
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ==================== TARGETED SMS TAB ==================== */}
          {activeTab === "targeted" && (
            <div className="space-y-6">
              {/* Result Alert */}
              <ResultAlert
                result={targetedResult}
                onClose={() => setTargetedResult(null)}
              />

              {/* Property Selection */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    <Building2 size={14} className="inline mr-1" /> Select
                    Property
                  </label>
                  <select
                    value={targetedProperty}
                    onChange={(e) => {
                      setTargetedProperty(e.target.value);
                      setSelectedTenants([]);
                    }}
                    className="w-full p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    disabled={propsLoading}
                  >
                    <option value="">Select Property...</option>
                    {properties?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tenant Search */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    <Search size={14} className="inline mr-1" /> Search Tenants
                  </label>
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      size={18}
                    />
                    <input
                      type="text"
                      placeholder="Search by name, phone, or unit..."
                      value={tenantSearch}
                      onChange={(e) => setTenantSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                      disabled={!targetedProperty}
                    />
                  </div>
                </div>
              </div>

              {/* Tenant List */}
              {targetedProperty && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-gray-50 p-3 border-b flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-gray-600">
                        {filteredTenants.length} tenant
                        {filteredTenants.length !== 1 ? "s" : ""} found
                      </span>
                      <span className="text-sm font-bold text-blue-600">
                        {selectedTenants.length} selected
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllTenants}
                        disabled={filteredTenants.length === 0}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={deselectAllTenants}
                        disabled={selectedTenants.length === 0}
                        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:text-gray-400"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {loadingTenants ? (
                    <div className="p-8 text-center">
                      <Loader2
                        className="animate-spin mx-auto text-blue-600"
                        size={32}
                      />
                      <p className="text-gray-500 mt-2">Loading tenants...</p>
                    </div>
                  ) : filteredTenants.length === 0 ? (
                    <div className="p-8 text-center">
                      <Users className="mx-auto text-gray-300" size={48} />
                      <p className="text-gray-500 mt-2">
                        {tenants.length === 0
                          ? "No tenants found in this property"
                          : "No tenants match your search"}
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {filteredTenants.map((tenant) => (
                        <label
                          key={tenant.id}
                          className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                            selectedTenants.includes(tenant.id)
                              ? "bg-blue-50"
                              : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedTenants.includes(tenant.id)}
                            onChange={() => toggleTenantSelection(tenant.id)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div className="ml-3 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {tenant.first_name} {tenant.last_name}
                              </span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {tenant.unit_code}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Phone size={12} />{" "}
                                {formatPhoneDisplay(tenant.phone_number)}
                              </span>
                            </div>
                          </div>
                          {!tenant.phone_number && (
                            <span className="text-xs text-red-500 font-medium">
                              No phone
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message Section */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Category
                    </label>
                    <MessageTypeButtons
                      value={targetedMessageType}
                      onChange={setTargetedMessageType}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Quick Templates
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {templates.slice(0, 2).map((tpl, i) => (
                        <button
                          key={i}
                          onClick={() => applyTemplate(tpl, true)}
                          className="text-left p-2 rounded-lg border border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-all"
                        >
                          <span className="font-medium text-blue-600 text-xs">
                            {tpl.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    SMS Content
                  </label>
                  <textarea
                    value={targetedMessage}
                    onChange={(e) => setTargetedMessage(e.target.value)}
                    maxLength={160}
                    rows={5}
                    placeholder="Write your message here..."
                    className="w-full p-4 border rounded-xl bg-gray-50 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <div className="flex justify-between mt-1 text-[10px] font-bold text-gray-400">
                    <span>MAX 160 CHARACTERS</span>
                    <span
                      className={
                        targetedMessage.length > 150 ? "text-orange-500" : ""
                      }
                    >
                      {targetedMessage.length} / 160
                    </span>
                  </div>
                </div>
              </div>

              {/* Send Button */}
              <div className="pt-4 border-t flex justify-end">
                <button
                  disabled={
                    sendingTargeted ||
                    selectedTenants.length === 0 ||
                    !targetedMessage.trim()
                  }
                  onClick={sendTargetedSMS}
                  className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200"
                >
                  {sendingTargeted ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Send size={18} /> Send to {selectedTenants.length} Tenant
                      {selectedTenants.length !== 1 ? "s" : ""}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ==================== HISTORY TAB ==================== */}
          {activeTab === "history" && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    Search
                  </label>
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Phone or message..."
                      value={historyFilters.search}
                      onChange={(e) =>
                        setHistoryFilters((prev) => ({
                          ...prev,
                          search: e.target.value,
                        }))
                      }
                      className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    Status
                  </label>
                  <select
                    value={historyFilters.status}
                    onChange={(e) =>
                      setHistoryFilters((prev) => ({
                        ...prev,
                        status: e.target.value,
                      }))
                    }
                    className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">All Status</option>
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    From
                  </label>
                  <input
                    type="date"
                    value={historyFilters.startDate}
                    onChange={(e) =>
                      setHistoryFilters((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                    className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    To
                  </label>
                  <input
                    type="date"
                    value={historyFilters.endDate}
                    onChange={(e) =>
                      setHistoryFilters((prev) => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                    className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <button
                  onClick={fetchSMSHistory}
                  className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  <RefreshCw
                    size={18}
                    className={loadingHistory ? "animate-spin" : ""}
                  />
                </button>
              </div>

              {/* History Table */}
              <div className="border rounded-xl overflow-hidden">
                {loadingHistory ? (
                  <div className="p-12 text-center">
                    <Loader2
                      className="animate-spin mx-auto text-blue-600"
                      size={32}
                    />
                    <p className="text-gray-500 mt-2">Loading history...</p>
                  </div>
                ) : smsHistory.length === 0 ? (
                  <div className="p-12 text-center">
                    <History className="mx-auto text-gray-300" size={48} />
                    <p className="text-gray-500 mt-2">No SMS history found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
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
                            Status
                          </th>
                          <th className="text-left p-3 font-semibold text-gray-600">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {smsHistory.map((sms) => (
                          <React.Fragment key={sms.id}>
                            <tr
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() =>
                                setExpandedHistoryId(
                                  expandedHistoryId === sms.id ? null : sms.id,
                                )
                              }
                            >
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <Phone size={14} className="text-gray-400" />
                                  <span className="font-mono">
                                    {formatPhoneDisplay(sms.recipient_phone)}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 max-w-xs">
                                <p className="truncate text-gray-600">
                                  {sms.message}
                                </p>
                              </td>
                              <td className="p-3">
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded-full capitalize">
                                  {sms.message_type || "general"}
                                </span>
                              </td>
                              <td className="p-3">
                                <StatusBadge status={sms.status} />
                              </td>
                              <td className="p-3 text-gray-500 whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <Clock size={12} />
                                  {formatDate(sms.sent_at || sms.created_at)}
                                </div>
                              </td>
                            </tr>
                            {/* Expanded Row */}
                            {expandedHistoryId === sms.id && (
                              <tr className="bg-blue-50">
                                <td colSpan={5} className="p-4">
                                  <div className="space-y-2 text-sm">
                                    <p>
                                      <strong>Full Message:</strong>{" "}
                                      {sms.message}
                                    </p>
                                    {sms.error_message && (
                                      <p className="text-red-600">
                                        <strong>Error:</strong>{" "}
                                        {sms.error_message}
                                      </p>
                                    )}
                                    <p>
                                      <strong>Attempts:</strong>{" "}
                                      {sms.attempts || 1}
                                    </p>
                                    {sms.last_attempt_at && (
                                      <p>
                                        <strong>Last Attempt:</strong>{" "}
                                        {formatDate(sms.last_attempt_at)}
                                      </p>
                                    )}
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
              </div>

              {/* Pagination */}
              {historyPagination.totalPages > 1 && (
                <div className="flex justify-between items-center pt-2">
                  <span className="text-sm text-gray-500">
                    Page {historyPagination.currentPage} of{" "}
                    {historyPagination.totalPages} (
                    {historyPagination.totalCount} total)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setHistoryPagination((prev) => ({
                          ...prev,
                          currentPage: prev.currentPage - 1,
                        }))
                      }
                      disabled={historyPagination.currentPage <= 1}
                      className="px-3 py-1 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setHistoryPagination((prev) => ({
                          ...prev,
                          currentPage: prev.currentPage + 1,
                        }))
                      }
                      disabled={
                        historyPagination.currentPage >=
                        historyPagination.totalPages
                      }
                      className="px-3 py-1 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationManagement;
