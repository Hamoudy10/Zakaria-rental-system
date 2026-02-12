// src/components/PaymentManagement.jsx
// ENHANCED VERSION - With Unpaid/Paid Tabs, SMS Reminders, Manual Payment, Export
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePayment } from "../context/PaymentContext";
import { useProperty } from "../context/PropertyContext";
import { useAuth } from "../context/AuthContext";
import { API, notificationAPI, paymentAPI } from "../services/api";
import { exportToPDF } from "../utils/pdfExport";
import { exportToExcel } from "../utils/excelExport";
import {
  Calendar,
  DollarSign,
  BarChart,
  Activity,
  Search,
  X,
  ChevronsRight,
  ChevronsLeft,
  ChevronRight,
  ChevronLeft,
  ArrowDown,
  ArrowUp,
  FileText,
  FileSpreadsheet,
  Send,
  Plus,
  Users,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare,
  RefreshCw,
  Filter,
  Eye,
  Phone,
} from "lucide-react";

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  }).format(amount || 0);

const formatDate = (dateString) =>
  dateString ? new Date(dateString).toLocaleDateString("en-GB") : "N/A";

const formatDateLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    options.push({ value, label });
  }
  return options;
};

const formatPhone = (phone) => phone?.replace(/^254/, "0") || "";

// ============================================================
// MAIN COMPONENT
// ============================================================

const PaymentManagement = () => {
  const { user } = useAuth();
  const {
    payments,
    pagination,
    loading: paymentsLoading,
    error: paymentsError,
    fetchPayments,
    fetchTenantHistory,
  } = usePayment();

  const propertyContext = useProperty();
  const properties = propertyContext?.properties || [];
  const propertiesLoading = propertyContext?.loading || false;
  const fetchProperties = propertyContext?.fetchProperties || (() => {});

  // ============================================================
  // STATE
  // ============================================================

  // Tab state
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'unpaid', 'paid'

  // Tenant status data (for unpaid/paid tabs)
  const [tenantStatus, setTenantStatus] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusSummary, setStatusSummary] = useState({
    total_tenants: 0,
    paid_count: 0,
    unpaid_count: 0,
    total_expected: 0,
    total_collected: 0,
    total_outstanding: 0,
  });

  // Filters
  const [filters, setFilters] = useState({
    propertyId: "",
    month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    period: "this_month",
    startDate: "",
    endDate: "",
    search: "",
  });

  const [sort, setSort] = useState({
    sortBy: "payment_date",
    sortOrder: "desc",
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Selection for bulk actions
  const [selectedTenants, setSelectedTenants] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  // Modals
  const [showTenantHistory, setShowTenantHistory] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantHistory, setTenantHistory] = useState({
    payments: [],
    summary: {},
  });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // Manual Payment Modal
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [manualPaymentData, setManualPaymentData] = useState({
    tenant_id: "",
    unit_id: "",
    amount: "",
    payment_month: "",
    mpesa_receipt_number: "",
    phone_number: "",
    notes: "",
  });
  const [manualPaymentLoading, setManualPaymentLoading] = useState(false);
  const [manualPaymentError, setManualPaymentError] = useState("");

  // SMS Reminder Modal
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsResult, setSmsResult] = useState(null);

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    if (typeof fetchProperties === "function") {
      fetchProperties();
    }
  }, [fetchProperties]);

  // Fetch data based on active tab
  useEffect(() => {
    if (activeTab === "all") {
      handleFetchPayments();
    } else {
      fetchTenantStatusData();
    }
  }, [activeTab, filters.propertyId, filters.month, currentPage, sort]);

  // Reset selection when tab changes
  useEffect(() => {
    setSelectedTenants([]);
    setSelectAll(false);
  }, [activeTab]);

  // ============================================================
  // DATA FETCHING
  // ============================================================

  const handleFetchPayments = useCallback(() => {
    const params = {
      page: currentPage,
      limit: 15,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    };

    if (filters.propertyId) params.propertyId = filters.propertyId;
    if (filters.search) params.search = filters.search;

    let { startDate, endDate } = filters;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (filters.period !== "custom") {
      if (filters.period === "this_month") {
        startDate = formatDateLocal(new Date(year, month, 1));
        endDate = formatDateLocal(new Date(year, month + 1, 0));
      } else if (filters.period === "last_month") {
        startDate = formatDateLocal(new Date(year, month - 1, 1));
        endDate = formatDateLocal(new Date(year, month, 0));
      } else if (filters.period === "this_quarter") {
        const quarter = Math.floor(month / 3);
        startDate = formatDateLocal(new Date(year, quarter * 3, 1));
        endDate = formatDateLocal(new Date(year, (quarter + 1) * 3, 0));
      } else if (filters.period === "this_year") {
        startDate = formatDateLocal(new Date(year, 0, 1));
        endDate = formatDateLocal(new Date(year, 11, 31));
      }
    }

    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    fetchPayments(params);
  }, [currentPage, filters, sort, fetchPayments]);

  const fetchTenantStatusData = useCallback(async () => {
    setStatusLoading(true);
    setStatusError("");

    try {
      // Call the tenant status endpoint
      const params = {
        month: filters.month,
        propertyId: filters.propertyId || undefined,
        search: filters.search || undefined,
      };

      const response = await API.payments.getTenantPaymentStatus(params);

      if (response.data.success) {
        const { tenants, summary } = response.data.data;
        setTenantStatus(tenants || []);
        setStatusSummary(
          summary || {
            total_tenants: 0,
            paid_count: 0,
            unpaid_count: 0,
            total_expected: 0,
            total_collected: 0,
            total_outstanding: 0,
          },
        );
      } else {
        setStatusError(
          response.data.message || "Failed to fetch tenant status",
        );
      }
    } catch (error) {
      console.error("Error fetching tenant status:", error);
      setStatusError(
        error.response?.data?.message ||
          "Failed to fetch tenant payment status",
      );

      // Fallback: If endpoint doesn't exist, show helpful message
      if (error.response?.status === 404) {
        setStatusError(
          "Tenant status endpoint not found. Please add GET /api/payments/tenant-status endpoint to your backend.",
        );
      }
    } finally {
      setStatusLoading(false);
    }
  }, [filters.month, filters.propertyId, filters.search]);

  // ============================================================
  // FILTERED DATA
  // ============================================================

  const filteredTenants = useMemo(() => {
    let filtered = [...tenantStatus];

    // Filter by search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.tenant_name?.toLowerCase().includes(searchLower) ||
          t.unit_code?.toLowerCase().includes(searchLower) ||
          t.property_name?.toLowerCase().includes(searchLower),
      );
    }

    // Filter by paid/unpaid status based on tab
    if (activeTab === "unpaid") {
      filtered = filtered.filter((t) => t.total_due > 0);
    } else if (activeTab === "paid") {
      filtered = filtered.filter(
        (t) => t.total_due <= 0 || t.rent_paid >= t.monthly_rent,
      );
    }

    return filtered;
  }, [tenantStatus, filters.search, activeTab]);

  const unpaidCount = useMemo(
    () => tenantStatus.filter((t) => t.total_due > 0).length,
    [tenantStatus],
  );

  const paidCount = useMemo(
    () =>
      tenantStatus.filter(
        (t) => t.total_due <= 0 || t.rent_paid >= t.monthly_rent,
      ).length,
    [tenantStatus],
  );

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleSort = (column) => {
    setSort((prev) => ({
      sortBy: column,
      sortOrder:
        prev.sortBy === column && prev.sortOrder === "desc" ? "asc" : "desc",
    }));
  };

  const handleSelectTenant = (tenantId) => {
    setSelectedTenants((prev) => {
      if (prev.includes(tenantId)) {
        return prev.filter((id) => id !== tenantId);
      } else {
        return [...prev, tenantId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedTenants([]);
    } else {
      const tenantIds = filteredTenants.map((t) => t.tenant_id);
      setSelectedTenants(tenantIds);
    }
    setSelectAll(!selectAll);
  };

  const handleViewHistory = async (tenantId, fullName) => {
    setLoadingHistory(true);
    setHistoryError("");
    setSelectedTenant({ id: tenantId, name: fullName });

    try {
      const historyData = await fetchTenantHistory(tenantId);
      if (historyData) {
        setTenantHistory(historyData);
      } else {
        setTenantHistory({ payments: [], summary: {} });
        setHistoryError("No payment history found for this tenant.");
      }
    } catch (err) {
      console.error("Fetch tenant history error:", err);
      setHistoryError("Failed to load payment history. Please try again.");
    } finally {
      setShowTenantHistory(true);
      setLoadingHistory(false);
    }
  };

  // ============================================================
  // MANUAL PAYMENT HANDLER
  // ============================================================

  const handleOpenManualPayment = (tenant = null) => {
    if (tenant) {
      setManualPaymentData({
        tenant_id: tenant.tenant_id,
        unit_id: tenant.unit_id,
        amount: "",
        payment_month: filters.month,
        mpesa_receipt_number: "",
        phone_number: formatPhone(tenant.phone_number),
        notes: "",
      });
    } else {
      setManualPaymentData({
        tenant_id: "",
        unit_id: "",
        amount: "",
        payment_month: filters.month,
        mpesa_receipt_number: "",
        phone_number: "",
        notes: "",
      });
    }
    setManualPaymentError("");
    setShowManualPayment(true);
  };

  const handleSubmitManualPayment = async (e) => {
    e.preventDefault();
    setManualPaymentLoading(true);
    setManualPaymentError("");

    try {
      const response = await paymentAPI.recordManualPayment({
        ...manualPaymentData,
        amount: parseFloat(manualPaymentData.amount),
      });

      if (response.data.success) {
        setShowManualPayment(false);
        // Refresh data
        if (activeTab === "all") {
          handleFetchPayments();
        } else {
          fetchTenantStatusData();
        }
        alert("Payment recorded successfully!");
      } else {
        setManualPaymentError(
          response.data.message || "Failed to record payment",
        );
      }
    } catch (error) {
      console.error("Manual payment error:", error);
      setManualPaymentError(
        error.response?.data?.message || "Failed to record payment",
      );
    } finally {
      setManualPaymentLoading(false);
    }
  };

  // ============================================================
  // SMS REMINDER HANDLER
  // ============================================================

  const handleOpenSMSModal = () => {
    if (selectedTenants.length === 0) {
      alert("Please select at least one tenant to send reminders.");
      return;
    }

    // Generate default message
    const defaultMessage = `Dear Tenant, this is a reminder that your rent for ${filters.month} is due. Please make payment at your earliest convenience. Thank you.`;
    setSmsMessage(defaultMessage);
    setSmsResult(null);
    setShowSMSModal(true);
  };

  const handleSendReminders = async () => {
    setSmsLoading(true);
    setSmsResult(null);

    try {
      const response = await notificationAPI.sendTargetedSMS({
        tenantIds: selectedTenants,
        message: smsMessage,
        messageType: "balance_reminder",
      });

      if (response.data.success) {
        setSmsResult({
          success: true,
          message: response.data.message,
          data: response.data.data,
        });
        setSelectedTenants([]);
        setSelectAll(false);
      } else {
        setSmsResult({
          success: false,
          message: response.data.message || "Failed to send reminders",
        });
      }
    } catch (error) {
      console.error("SMS send error:", error);
      setSmsResult({
        success: false,
        message: error.response?.data?.message || "Failed to send reminders",
      });
    } finally {
      setSmsLoading(false);
    }
  };

  // ============================================================
  // EXPORT HANDLERS
  // ============================================================

  const handleExportPayments = (format) => {
    if (!payments || payments.length === 0) {
      alert("No data available to export.");
      return;
    }

    const config = {
      reportType: "payments",
      data: payments,
      filters,
      user,
      title: `Payment Transactions - ${filters.period.replace("_", " ").toUpperCase()}`,
    };

    if (format === "pdf") exportToPDF(config);
    else exportToExcel(config);
  };

  const handleExportTenantStatus = (format) => {
    if (!filteredTenants || filteredTenants.length === 0) {
      alert("No data available to export.");
      return;
    }

    const tabLabel = activeTab === "unpaid" ? "Unpaid Tenants" : "Paid Tenants";
    const monthLabel = new Date(filters.month + "-01").toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric" },
    );

    const config = {
      reportType: activeTab === "unpaid" ? "unpaid_tenants" : "paid_tenants",
      data: filteredTenants.map((t) => ({
        "Tenant Name": t.tenant_name,
        Property: t.property_name,
        Unit: t.unit_code,
        Phone: formatPhone(t.phone_number),
        "Monthly Rent": t.monthly_rent,
        "Rent Paid": t.rent_paid,
        "Rent Due": t.rent_due,
        "Water Bill": t.water_bill || 0,
        "Water Paid": t.water_paid || 0,
        Arrears: t.arrears || 0,
        "Total Due": t.total_due,
        Advance: t.advance_amount || 0,
        Status: t.total_due <= 0 ? "Paid" : "Unpaid",
      })),
      filters: { ...filters, month: monthLabel },
      user,
      title: `${tabLabel} - ${monthLabel}`,
    };

    if (format === "pdf") exportToPDF(config);
    else exportToExcel(config);
  };

  // ============================================================
  // COMPUTED VALUES
  // ============================================================

  const totalInView = useMemo(
    () => payments?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0,
    [payments],
  );

  const monthOptions = useMemo(() => getMonthOptions(), []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Activity className="text-blue-600" /> Payment Management
          </h1>
          <p className="text-gray-500">
            Track payments, view balances, and send reminders.
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => handleOpenManualPayment()}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} /> Record Payment
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 md:flex-none px-6 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "all"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <BarChart size={18} />
            All Payments
          </button>
          <button
            onClick={() => setActiveTab("unpaid")}
            className={`flex-1 md:flex-none px-6 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "unpaid"
                ? "text-red-600 border-b-2 border-red-600 bg-red-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <UserX size={18} />
            Unpaid Tenants
            {unpaidCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {unpaidCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("paid")}
            className={`flex-1 md:flex-none px-6 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "paid"
                ? "text-green-600 border-b-2 border-green-600 bg-green-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <UserCheck size={18} />
            Paid Tenants
            {paidCount > 0 && (
              <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                {paidCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {activeTab === "all" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <DollarSign className="text-blue-600" />
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
                Total in View
              </p>
              <p className="text-2xl font-bold text-gray-800">
                {formatCurrency(totalInView)}
              </p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
            <div className="bg-green-100 p-3 rounded-full">
              <BarChart className="text-green-600" />
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
                Transaction Count
              </p>
              <p className="text-2xl font-bold text-gray-800">
                {pagination?.totalCount || 0}
              </p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
            <div className="bg-purple-100 p-3 rounded-full">
              <Calendar className="text-purple-600" />
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
                Period
              </p>
              <p className="text-lg font-bold text-gray-800 capitalize">
                {filters.period.replace("_", " ")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <Users className="text-blue-600" />
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
                Total Tenants
              </p>
              <p className="text-2xl font-bold text-gray-800">
                {statusSummary.total_tenants}
              </p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
            <div className="bg-green-100 p-3 rounded-full">
              <CheckCircle className="text-green-600" />
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
                Paid
              </p>
              <p className="text-2xl font-bold text-green-600">
                {statusSummary.paid_count}
              </p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
            <div className="bg-red-100 p-3 rounded-full">
              <AlertCircle className="text-red-600" />
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
                Unpaid
              </p>
              <p className="text-2xl font-bold text-red-600">
                {statusSummary.unpaid_count}
              </p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border shadow-sm flex items-center gap-4">
            <div className="bg-orange-100 p-3 rounded-full">
              <DollarSign className="text-orange-600" />
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
                Outstanding
              </p>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(statusSummary.total_outstanding)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder={
                activeTab === "all"
                  ? "Search tenant or receipt..."
                  : "Search tenant, unit, or property..."
              }
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 md:flex gap-2">
            {activeTab === "all" ? (
              <select
                value={filters.period}
                onChange={(e) =>
                  setFilters({ ...filters, period: e.target.value })
                }
                className="border rounded-lg p-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="this_quarter">This Quarter</option>
                <option value="this_year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            ) : (
              <select
                value={filters.month}
                onChange={(e) =>
                  setFilters({ ...filters, month: e.target.value })
                }
                className="border rounded-lg p-2 text-sm outline-none focus:border-blue-500"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
            <select
              value={filters.propertyId}
              onChange={(e) =>
                setFilters({ ...filters, propertyId: e.target.value })
              }
              className="border rounded-lg p-2 text-sm outline-none focus:border-blue-500"
              disabled={propertiesLoading}
            >
              <option value="">All Properties</option>
              {properties?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom date range for All Payments tab */}
        {activeTab === "all" && filters.period === "custom" && (
          <div className="flex gap-4 p-3 bg-gray-50 rounded-lg animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">From:</span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
                className="border rounded-md p-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">To:</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
                className="border rounded-md p-1 text-sm"
              />
            </div>
          </div>
        )}

        {/* Action buttons for unpaid/paid tabs */}
        {activeTab !== "all" && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <button
              onClick={handleOpenSMSModal}
              disabled={selectedTenants.length === 0}
              className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Send size={16} /> Send Reminders ({selectedTenants.length})
            </button>
            <button
              onClick={() => handleExportTenantStatus("pdf")}
              disabled={statusLoading || !filteredTenants.length}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <FileText size={16} /> Export PDF
            </button>
            <button
              onClick={() => handleExportTenantStatus("excel")}
              disabled={statusLoading || !filteredTenants.length}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet size={16} /> Export Excel
            </button>
            <button
              onClick={fetchTenantStatusData}
              disabled={statusLoading}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              <RefreshCw
                size={16}
                className={statusLoading ? "animate-spin" : ""}
              />{" "}
              Refresh
            </button>
          </div>
        )}

        {/* Export buttons for All Payments tab */}
        {activeTab === "all" && (
          <div className="flex gap-2 pt-2 border-t">
            <button
              onClick={() => handleExportPayments("pdf")}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              disabled={paymentsLoading || !payments?.length}
            >
              <FileText size={16} /> PDF
            </button>
            <button
              onClick={() => handleExportPayments("excel")}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              disabled={paymentsLoading || !payments?.length}
            >
              <FileSpreadsheet size={16} /> Excel
            </button>
          </div>
        )}
      </div>

      {/* Content based on active tab */}
      {activeTab === "all" ? (
        // All Payments Table
        <AllPaymentsTable
          payments={payments}
          loading={paymentsLoading}
          error={paymentsError}
          sort={sort}
          onSort={handleSort}
          onViewHistory={handleViewHistory}
          pagination={pagination}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
        />
      ) : (
        // Unpaid/Paid Tenants Table
        <TenantStatusTable
          tenants={filteredTenants}
          loading={statusLoading}
          error={statusError}
          activeTab={activeTab}
          selectedTenants={selectedTenants}
          selectAll={selectAll}
          onSelectTenant={handleSelectTenant}
          onSelectAll={handleSelectAll}
          onViewHistory={handleViewHistory}
          onRecordPayment={handleOpenManualPayment}
          month={filters.month}
        />
      )}

      {/* Tenant Payment History Modal */}
      {showTenantHistory && selectedTenant && (
        <TenantHistoryModal
          tenant={selectedTenant}
          history={tenantHistory}
          loading={loadingHistory}
          error={historyError}
          onClose={() => setShowTenantHistory(false)}
        />
      )}

      {/* Manual Payment Modal */}
      {showManualPayment && (
        <ManualPaymentModal
          data={manualPaymentData}
          setData={setManualPaymentData}
          loading={manualPaymentLoading}
          error={manualPaymentError}
          onSubmit={handleSubmitManualPayment}
          onClose={() => setShowManualPayment(false)}
          monthOptions={monthOptions}
          tenants={tenantStatus}
        />
      )}

      {/* SMS Reminder Modal */}
      {showSMSModal && (
        <SMSReminderModal
          selectedCount={selectedTenants.length}
          message={smsMessage}
          setMessage={setSmsMessage}
          loading={smsLoading}
          result={smsResult}
          onSend={handleSendReminders}
          onClose={() => setShowSMSModal(false)}
        />
      )}
    </div>
  );
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

const AllPaymentsTable = ({
  payments,
  loading,
  error,
  sort,
  onSort,
  onViewHistory,
  pagination,
  currentPage,
  setCurrentPage,
}) => {
  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(amount || 0);

  const formatDate = (dateString) =>
    dateString ? new Date(dateString).toLocaleDateString("en-GB") : "N/A";

  return (
    <>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-20 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Fetching records...</p>
          </div>
        ) : error ? (
          <div className="p-20 text-center text-red-500">{error}</div>
        ) : !payments || payments.length === 0 ? (
          <div className="p-20 text-center">
            <DollarSign size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">
              No payment records found for the selected criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b text-gray-600 uppercase text-xs font-bold">
                <tr>
                  <th
                    className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap"
                    onClick={() => onSort("first_name")}
                  >
                    Tenant{" "}
                    {sort.sortBy === "first_name" &&
                      (sort.sortOrder === "asc" ? (
                        <ArrowUp size={12} className="inline ml-1" />
                      ) : (
                        <ArrowDown size={12} className="inline ml-1" />
                      ))}
                  </th>
                  <th className="p-4">Property & Unit</th>
                  <th
                    className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap"
                    onClick={() => onSort("amount")}
                  >
                    Amount{" "}
                    {sort.sortBy === "amount" &&
                      (sort.sortOrder === "asc" ? (
                        <ArrowUp size={12} className="inline ml-1" />
                      ) : (
                        <ArrowDown size={12} className="inline ml-1" />
                      ))}
                  </th>
                  <th className="p-4">M-Pesa / Ref</th>
                  <th
                    className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap"
                    onClick={() => onSort("payment_date")}
                  >
                    Date{" "}
                    {sort.sortBy === "payment_date" &&
                      (sort.sortOrder === "asc" ? (
                        <ArrowUp size={12} className="inline ml-1" />
                      ) : (
                        <ArrowDown size={12} className="inline ml-1" />
                      ))}
                  </th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-blue-50/50 transition-colors"
                  >
                    <td className="p-4 font-medium text-gray-900 whitespace-nowrap">
                      {p.first_name} {p.last_name}
                    </td>
                    <td className="p-4 text-gray-600 whitespace-nowrap">
                      {p.property_name}
                      <span className="block text-xs font-bold text-blue-500">
                        {p.unit_code}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-gray-800 whitespace-nowrap">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="p-4 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {p.mpesa_receipt_number ||
                        p.mpesa_transaction_id ||
                        "N/A"}
                    </td>
                    <td className="p-4 text-gray-600 whitespace-nowrap">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <button
                        onClick={() =>
                          onViewHistory(
                            p.tenant_id,
                            `${p.first_name} ${p.last_name}`,
                          )
                        }
                        className="bg-blue-50 text-blue-600 px-3 py-1 rounded-md text-xs font-bold hover:bg-blue-600 hover:text-white transition-all touch-manipulation"
                      >
                        View History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination?.totalPages > 1 && (
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50 p-4 rounded-xl border">
          <span className="text-sm text-gray-600 font-medium">
            Showing Page{" "}
            <span className="text-gray-900">{pagination.currentPage}</span> of{" "}
            {pagination.totalPages} ({pagination.totalCount} records)
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronsLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))
              }
              disabled={currentPage >= pagination.totalPages}
              className="p-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setCurrentPage(pagination.totalPages)}
              disabled={currentPage >= pagination.totalPages}
              className="p-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronsRight size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

const TenantStatusTable = ({
  tenants,
  loading,
  error,
  activeTab,
  selectedTenants,
  selectAll,
  onSelectTenant,
  onSelectAll,
  onViewHistory,
  onRecordPayment,
  month,
}) => {
  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(amount || 0);

  const formatPhone = (phone) => phone?.replace(/^254/, "0") || "";

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {loading ? (
        <div className="p-20 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading tenant data...</p>
        </div>
      ) : error ? (
        <div className="p-20 text-center">
          <AlertCircle size={48} className="mx-auto text-red-300 mb-4" />
          <p className="text-red-500 font-medium">{error}</p>
          <p className="text-gray-400 text-sm mt-2">
            Please check that the backend endpoint is configured correctly.
          </p>
        </div>
      ) : !tenants || tenants.length === 0 ? (
        <div className="p-20 text-center">
          {activeTab === "unpaid" ? (
            <>
              <CheckCircle size={48} className="mx-auto text-green-300 mb-4" />
              <p className="text-gray-500 font-medium">
                No unpaid tenants found for this month! 🎉
              </p>
            </>
          ) : (
            <>
              <Users size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">
                No paid tenants found for this month.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b text-gray-600 uppercase text-xs font-bold">
              <tr>
                <th className="p-4">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={onSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="p-4">Tenant</th>
                <th className="p-4">Property / Unit</th>
                <th className="p-4">Phone</th>
                <th className="p-4 text-right">Rent</th>
                <th className="p-4 text-right">Water</th>
                <th className="p-4 text-right">Arrears</th>
                <th className="p-4 text-right">
                  {activeTab === "unpaid" ? "Total Due" : "Advance"}
                </th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((t) => {
                const isSelected = selectedTenants.includes(t.tenant_id);
                const isPaid =
                  t.total_due <= 0 || t.rent_paid >= t.monthly_rent;

                return (
                  <tr
                    key={t.tenant_id}
                    className={`hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
                  >
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelectTenant(t.tenant_id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-gray-900">
                        {t.tenant_name}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-gray-600">{t.property_name}</div>
                      <div className="text-xs font-bold text-blue-500">
                        {t.unit_code}
                      </div>
                    </td>
                    <td className="p-4 text-gray-600 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Phone size={14} className="text-gray-400" />
                        {formatPhone(t.phone_number)}
                      </div>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="text-gray-500 text-xs">
                        Due: {formatCurrency(t.monthly_rent)}
                      </div>
                      <div
                        className={`font-medium ${t.rent_paid >= t.monthly_rent ? "text-green-600" : "text-gray-800"}`}
                      >
                        Paid: {formatCurrency(t.rent_paid)}
                      </div>
                      {t.rent_due > 0 && (
                        <div className="text-red-600 text-xs font-bold">
                          Bal: {formatCurrency(t.rent_due)}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="text-gray-500 text-xs">
                        Bill: {formatCurrency(t.water_bill || 0)}
                      </div>
                      <div className="font-medium text-gray-800">
                        Paid: {formatCurrency(t.water_paid || 0)}
                      </div>
                      {t.water_bill - (t.water_paid || 0) > 0 && (
                        <div className="text-red-600 text-xs font-bold">
                          Bal:{" "}
                          {formatCurrency(t.water_bill - (t.water_paid || 0))}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      {t.arrears > 0 ? (
                        <span className="text-red-600 font-bold">
                          {formatCurrency(t.arrears)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      {activeTab === "unpaid" ? (
                        <span className="text-red-600 font-bold text-lg">
                          {formatCurrency(t.total_due)}
                        </span>
                      ) : t.advance_amount > 0 ? (
                        <span className="text-green-600 font-bold">
                          {formatCurrency(t.advance_amount)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                          <CheckCircle size={12} /> Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                          <Clock size={12} /> Unpaid
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() =>
                            onViewHistory(t.tenant_id, t.tenant_name)
                          }
                          className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                          title="View History"
                        >
                          <Eye size={16} />
                        </button>
                        {activeTab === "unpaid" && (
                          <button
                            onClick={() => onRecordPayment(t)}
                            className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                            title="Record Payment"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const TenantHistoryModal = ({ tenant, history, loading, error, onClose }) => {
  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(amount || 0);

  const formatDate = (dateString) =>
    dateString ? new Date(dateString).toLocaleDateString("en-GB") : "N/A";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border max-h-[90vh]">
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-xl text-gray-800">
              Payment Statement
            </h3>
            <p className="text-blue-600 font-medium">{tenant.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="py-20 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : error ? (
            <div className="text-center py-10 text-red-500">{error}</div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                  <p className="text-xs font-bold text-blue-400 uppercase mb-1">
                    Total Expected
                  </p>
                  <p className="text-xl font-black text-blue-700">
                    {formatCurrency(history.summary?.totalExpected)}
                  </p>
                </div>
                <div className="bg-green-50 border border-green-100 p-4 rounded-xl">
                  <p className="text-xs font-bold text-green-400 uppercase mb-1">
                    Total Paid
                  </p>
                  <p className="text-xl font-black text-green-700">
                    {formatCurrency(history.summary?.totalPaid)}
                  </p>
                </div>
                <div
                  className={`${(history.summary?.balance || 0) > 0 ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"} border p-4 rounded-xl`}
                >
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">
                    Outstanding Balance
                  </p>
                  <p
                    className={`text-xl font-black ${(history.summary?.balance || 0) > 0 ? "text-red-600" : "text-gray-700"}`}
                  >
                    {formatCurrency(history.summary?.balance || 0)}
                  </p>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden max-h-[40vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 border-b">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Amount</th>
                      <th className="p-3 text-left">Ref Code</th>
                      <th className="p-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {!history.payments || history.payments.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="text-center py-8 text-gray-500"
                        >
                          No payment records found
                        </td>
                      </tr>
                    ) : (
                      history.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="p-3">{formatDate(p.payment_date)}</td>
                          <td className="p-3 font-bold">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="p-3 font-mono text-xs">
                            {p.mpesa_receipt_number ||
                              p.mpesa_transaction_id ||
                              "N/A"}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                p.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : p.status === "pending"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {p.status || "Unknown"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-900 transition-all"
          >
            Close Statement
          </button>
        </div>
      </div>
    </div>
  );
};

const ManualPaymentModal = ({
  data,
  setData,
  loading,
  error,
  onSubmit,
  onClose,
  monthOptions,
  tenants,
}) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border">
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-xl text-gray-800">
              Record Manual Payment
            </h3>
            <p className="text-gray-500 text-sm">Enter payment details</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {!data.tenant_id && tenants && tenants.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Tenant
              </label>
              <select
                value={data.tenant_id}
                onChange={(e) => {
                  const tenant = tenants.find(
                    (t) => t.tenant_id === e.target.value,
                  );
                  if (tenant) {
                    setData({
                      ...data,
                      tenant_id: tenant.tenant_id,
                      unit_id: tenant.unit_id,
                      phone_number:
                        tenant.phone_number?.replace(/^254/, "0") || "",
                    });
                  }
                }}
                className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                required
              >
                <option value="">Choose a tenant...</option>
                {tenants.map((t) => (
                  <option key={t.tenant_id} value={t.tenant_id}>
                    {t.tenant_name} - {t.unit_code}
                  </option>
                ))}
              </select>
            </div>
          )}

          {data.tenant_id && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <span className="font-medium">Selected:</span>{" "}
              {tenants?.find((t) => t.tenant_id === data.tenant_id)
                ?.tenant_name || "Tenant"}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (KES)
            </label>
            <input
              type="number"
              value={data.amount}
              onChange={(e) => setData({ ...data, amount: e.target.value })}
              className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Enter amount"
              required
              min="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Month
            </label>
            <select
              value={data.payment_month}
              onChange={(e) =>
                setData({ ...data, payment_month: e.target.value })
              }
              className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              required
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              M-Pesa Receipt Number (optional)
            </label>
            <input
              type="text"
              value={data.mpesa_receipt_number}
              onChange={(e) =>
                setData({ ...data, mpesa_receipt_number: e.target.value })
              }
              className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g., QHL2ABC123"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number (optional)
            </label>
            <input
              type="text"
              value={data.phone_number}
              onChange={(e) =>
                setData({ ...data, phone_number: e.target.value })
              }
              className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="07XX XXX XXX"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={data.notes}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
              className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              rows={2}
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !data.tenant_id || !data.amount}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Recording..." : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SMSReminderModal = ({
  selectedCount,
  message,
  setMessage,
  loading,
  result,
  onSend,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border">
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-xl text-gray-800">
              Send Payment Reminders
            </h3>
            <p className="text-gray-500 text-sm">
              Sending to {selectedCount} tenant(s) via SMS & WhatsApp
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {result && (
            <div
              className={`p-4 rounded-lg ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
            >
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle
                    className="text-green-600 flex-shrink-0"
                    size={20}
                  />
                ) : (
                  <AlertCircle
                    className="text-red-600 flex-shrink-0"
                    size={20}
                  />
                )}
                <div>
                  <p
                    className={`font-medium ${result.success ? "text-green-800" : "text-red-800"}`}
                  >
                    {result.message}
                  </p>
                  {result.data && (
                    <div className="text-sm mt-1 text-gray-600">
                      <p>SMS Sent: {result.data.sent || 0}</p>
                      <p>WhatsApp Sent: {result.data.whatsapp_sent || 0}</p>
                      {result.data.failed > 0 && (
                        <p className="text-red-600">
                          Failed: {result.data.failed}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              rows={5}
              placeholder="Enter your reminder message..."
              maxLength={320}
            />
            <p className="text-xs text-gray-400 mt-1">
              {message.length}/320 characters
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700">
            <div className="flex items-start gap-2">
              <MessageSquare size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Messages will be sent via:</p>
                <ul className="list-disc list-inside mt-1 text-blue-600">
                  <li>SMS (always)</li>
                  <li>WhatsApp (if available)</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              {result?.success ? "Close" : "Cancel"}
            </button>
            {!result?.success && (
              <button
                onClick={onSend}
                disabled={loading || !message.trim()}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send Reminders
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentManagement;
