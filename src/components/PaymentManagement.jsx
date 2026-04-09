// src/components/PaymentManagement.jsx
// ENHANCED VERSION - With Unpaid/Paid Tabs, SMS Reminders, Manual Payment, Export
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePayment } from "../context/PaymentContext";
import { useProperty } from "../context/PropertyContext";
import { useAuth } from "../context/AuthContext";
import { API, notificationAPI, paymentAPI } from "../services/api";
import { exportToPDF } from "../utils/pdfExport";
import { exportToExcel } from "../utils/excelExport";
import { formatContactPhoneForDisplay } from "../utils/phoneUtils";
import PaymentRiskBadge from "./PaymentRiskBadge";
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
  Trash2,
  Pencil,
} from "lucide-react";

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const toNumericAmount = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  }).format(toNumericAmount(amount));

const formatDate = (dateString) =>
  dateString ? new Date(dateString).toLocaleDateString("en-GB") : "N/A";

const formatDateLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatMonthLabel = (monthValue) => {
  if (!monthValue) return "this month";
  const [year, month] = String(monthValue).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return monthValue;
  return date.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
};

const buildReminderMessage = ({
  tenantName,
  propertyName,
  unitCode,
  totalDue,
  month,
  paybill,
}) => {
  const targetMonth = formatMonthLabel(month);
  const balanceText = formatCurrency(totalDue);
  const locationText = [propertyName, unitCode].filter(Boolean).join(" ");
  const paybillLine = paybill ? ` Paybill: ${paybill}.` : "";

  return `Hello ${tenantName}, ${locationText} has an outstanding balance of ${balanceText} for ${targetMonth}.${paybillLine} Thank you.`;
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

const formatPhone = (phone) => formatContactPhoneForDisplay(phone) || "";

const getTenantAllocationOptionValue = (tenant) =>
  tenant?.tenant_id && tenant?.unit_id
    ? `${tenant.tenant_id}::${tenant.unit_id}`
    : tenant?.tenant_id || "";

const getTenantUnitCodes = (tenant) => {
  const allocations = Array.isArray(tenant?.active_allocations)
    ? tenant.active_allocations
    : [];

  if (allocations.length > 0) {
    return allocations.map((allocation) => allocation?.unit_code).filter(Boolean);
  }

  return tenant?.unit_code ? [tenant.unit_code] : [];
};

const formatExactDueDate = ({ dueDate, rentDueDay, month }) => {
  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  if (parsedDueDate && !Number.isNaN(parsedDueDate.getTime())) {
    return parsedDueDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  if (!month) return "N/A";
  const [yearText, monthText] = String(month).split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return "N/A";

  const day = Math.min(28, Math.max(1, Number(rentDueDay) || 1));
  const fallbackDate = new Date(year, monthIndex, day);

  if (Number.isNaN(fallbackDate.getTime())) return "N/A";
  return fallbackDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

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
    deletePayment,
    updatePayment,
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
  const [historyExporting, setHistoryExporting] = useState(false);

  // Manual Payment Modal
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [manualPaymentData, setManualPaymentData] = useState({
    entry_mode: "manual", // manual | paybill
    payment_type: "rent",
    payment_method: "manual",
    tenant_id: "",
    unit_id: "",
    unit_code: "",
    allocation_id: "",
    amount: "",
    payment_month: "",
    mpesa_receipt_number: "",
    phone_number: "",
    notes: "",
  });
  const [manualPaymentLoading, setManualPaymentLoading] = useState(false);
  const [manualPaymentError, setManualPaymentError] = useState("");

  // Edit Manual Payment Modal
  const [showEditManualPayment, setShowEditManualPayment] = useState(false);
  const [editManualPaymentData, setEditManualPaymentData] = useState({
    id: "",
    mpesa_receipt_number: "",
    phone_number: "",
    notes: "",
    amount: "",
    payment_month: "",
    status: "",
  });
  const [editManualPaymentLoading, setEditManualPaymentLoading] =
    useState(false);
  const [editManualPaymentError, setEditManualPaymentError] = useState("");

  // SMS Reminder Modal
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [reminderDrafts, setReminderDrafts] = useState([]);
  const [activeReminderTenantId, setActiveReminderTenantId] = useState(null);
  const [systemPaybill, setSystemPaybill] = useState("");
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

  // Fetch data based on active tab - with proper dependencies
  useEffect(() => {
    if (activeTab === "all") {
      handleFetchPayments();
    }
  }, [
    activeTab,
    filters.propertyId,
    filters.period,
    filters.startDate,
    filters.endDate,
    currentPage,
    sort.sortBy,
    sort.sortOrder,
  ]);

  // Separate effect for tenant status tabs - auto-refresh when filters change
  useEffect(() => {
    if (activeTab !== "all") {
      fetchTenantStatusData();
    }
  }, [activeTab, filters.propertyId, filters.month]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (activeTab === "all") {
        handleFetchPayments();
      } else {
        // For unpaid/paid tabs, search is done client-side via filteredTenants memo
        // So we don't need to refetch, just trigger a re-render
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [filters.search]);

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

    let startDate = filters.startDate;
    let endDate = filters.endDate;
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

    console.log("📅 Fetching payments with params:", params);
    fetchPayments(params);
  }, [
    currentPage,
    filters.propertyId,
    filters.search,
    filters.period,
    filters.startDate,
    filters.endDate,
    sort.sortBy,
    sort.sortOrder,
    fetchPayments,
  ]);

  const fetchTenantStatusData = useCallback(async (options = {}) => {
    const { ignoreSearch = false } = options;
    setStatusLoading(true);
    setStatusError("");

    try {
      // Call the tenant status endpoint
      const params = {
        month: filters.month,
        propertyId: filters.propertyId || undefined,
        search: ignoreSearch ? undefined : filters.search || undefined,
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
      filtered = filtered.filter((t) => t.total_due <= 0);
    }

    return filtered;
  }, [tenantStatus, filters.search, activeTab]);

  const unpaidCount = useMemo(
    () => tenantStatus.filter((t) => t.total_due > 0).length,
    [tenantStatus],
  );

  const paidCount = useMemo(
    () => tenantStatus.filter((t) => t.total_due <= 0).length,
    [tenantStatus],
  );

  const selectedReminderTenants = useMemo(
    () =>
      filteredTenants.filter((tenant) =>
        selectedTenants.includes(tenant.tenant_id),
      ),
    [filteredTenants, selectedTenants],
  );

  const activeReminderDraft = useMemo(
    () =>
      reminderDrafts.find((draft) => draft.tenant_id === activeReminderTenantId) ||
      reminderDrafts[0] ||
      null,
    [reminderDrafts, activeReminderTenantId],
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

  const handleOpenManualPayment = async (tenant = null) => {
    // Always load tenant list without search filter so manual posting can target any tenant.
    try {
      setManualPaymentLoading(true);
      await fetchTenantStatusData({ ignoreSearch: true });
    } catch (err) {
      console.error("Failed to prefetch tenants for manual payment:", err);
    } finally {
      setManualPaymentLoading(false);
    }

    if (tenant) {
      setManualPaymentData({
        entry_mode: "manual",
        payment_type: "rent",
        payment_method: "manual",
        tenant_id: tenant.tenant_id,
        unit_id: tenant.unit_id,
        unit_code: tenant.unit_code || "",
        allocation_id: tenant.allocation_id || "",
        amount: "",
        payment_month: filters.month,
        mpesa_receipt_number: "",
        phone_number: formatPhone(tenant.phone_number),
        notes: "",
      });
    } else {
      setManualPaymentData({
        entry_mode: "manual",
        payment_type: "rent",
        payment_method: "manual",
        tenant_id: "",
        unit_id: "",
        unit_code: "",
        allocation_id: "",
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
      const selectedTenantRow = tenantStatus.find(
        (t) =>
          t.tenant_id === manualPaymentData.tenant_id &&
          (!manualPaymentData.unit_id || t.unit_id === manualPaymentData.unit_id),
      );
      const resolvedUnitCode =
        selectedTenantRow?.unit_code?.trim() ||
        manualPaymentData.unit_code?.trim() ||
        "";
      const isPaybillEntry =
        manualPaymentData.payment_type === "rent" &&
        manualPaymentData.entry_mode === "paybill";

      if (isPaybillEntry && !resolvedUnitCode) {
        setManualPaymentError("Unit code is required for Paybill entry.");
        return;
      }
      if (isPaybillEntry && !manualPaymentData.mpesa_receipt_number?.trim()) {
        setManualPaymentError("M-Pesa receipt number is required for Paybill entry.");
        return;
      }
      if (isPaybillEntry && !manualPaymentData.phone_number?.trim()) {
        setManualPaymentError("Phone number is required for Paybill entry.");
        return;
      }

      const payload = {
        ...manualPaymentData,
        amount: parseFloat(manualPaymentData.amount),
      };

      const response =
        manualPaymentData.payment_type === "deposit"
          ? await paymentAPI.recordDepositPayment({
              tenant_id: payload.tenant_id,
              unit_id: payload.unit_id || null,
              allocation_id: payload.allocation_id || null,
              amount: payload.amount,
              payment_method: payload.payment_method || "manual",
              mpesa_receipt_number: payload.mpesa_receipt_number || null,
              phone_number: payload.phone_number || null,
              notes: payload.notes || null,
            })
          : manualPaymentData.entry_mode === "paybill"
            ? await paymentAPI.processPaybillPayment({
                unit_code: resolvedUnitCode,
                amount: payload.amount,
                mpesa_receipt_number:
                  payload.mpesa_receipt_number?.trim() || null,
                phone_number: payload.phone_number || null,
                payment_month: payload.payment_month || filters.month,
                transaction_date: new Date().toISOString(),
              })
            : await paymentAPI.recordManualPayment({
              tenant_id: payload.tenant_id,
              unit_id: payload.unit_id,
              amount: payload.amount,
              payment_month: payload.payment_month,
              mpesa_receipt_number: payload.mpesa_receipt_number || null,
              phone_number: payload.phone_number || null,
              notes: payload.notes || null,
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

  const resolveReminderPaybill = useCallback(() => {
    const selectedPropertyDetails = properties.find(
      (p) => p.id === filters.propertyId,
    );

    return (
      selectedPropertyDetails?.paybill_number ||
      selectedPropertyDetails?.paybill ||
      systemPaybill ||
      ""
    );
  }, [filters.propertyId, properties, systemPaybill]);

  const createReminderDrafts = useCallback(() => {
    const paybill = resolveReminderPaybill();

    return selectedReminderTenants.map((tenant) => ({
      tenant_id: tenant.tenant_id,
      tenant_name: tenant.tenant_name,
      property_name: tenant.property_name,
      unit_code: tenant.unit_code,
      phone_number: tenant.phone_number,
      total_due: tenant.total_due,
      message: buildReminderMessage({
        tenantName: tenant.tenant_name,
        propertyName: tenant.property_name,
        unitCode: tenant.unit_code,
        totalDue: tenant.total_due,
        month: filters.month,
        paybill,
      }),
      status: "pending",
      error: "",
    }));
  }, [filters.month, resolveReminderPaybill, selectedReminderTenants]);

  const handleOpenSMSModal = () => {
    if (selectedTenants.length === 0) {
      alert("Please select at least one tenant to send reminders.");
      return;
    }

    const drafts = createReminderDrafts();
    if (drafts.length === 0) {
      alert("No unpaid tenants were found in the current selection.");
      return;
    }

    setReminderDrafts(drafts);
    setActiveReminderTenantId(drafts[0]?.tenant_id || null);
    setSmsResult(null);
    setShowSMSModal(true);
  };

  const updateReminderDraft = useCallback((tenantId, updater) => {
    setReminderDrafts((prev) =>
      prev.map((draft) =>
        draft.tenant_id === tenantId
          ? {
              ...draft,
              ...(typeof updater === "function" ? updater(draft) : updater),
            }
          : draft,
      ),
    );
  }, []);

  const sendReminderDraft = useCallback(
    async (draft) => {
      const response = await notificationAPI.sendTargetedSMS({
        tenantIds: [draft.tenant_id],
        message: draft.message,
        messageType: "balance_reminder",
        template_variables: {
          month: filters.month,
          message: draft.message,
          paybill: resolveReminderPaybill(),
          propertyName: draft.property_name || "",
        },
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || "Failed to send reminder");
      }

      return response.data;
    },
    [filters.month, resolveReminderPaybill],
  );

  const handleSendSingleReminder = async (tenantId) => {
    const draft = reminderDrafts.find((item) => item.tenant_id === tenantId);
    if (!draft || !draft.message.trim()) return;

    updateReminderDraft(tenantId, { status: "sending", error: "" });
    setSmsLoading(true);

    try {
      const responseData = await sendReminderDraft(draft);
      updateReminderDraft(tenantId, { status: "sent", error: "" });
      setSmsResult({
        success: true,
        message: `Reminder sent to ${draft.tenant_name}.`,
        data: responseData.data,
      });
    } catch (error) {
      updateReminderDraft(tenantId, {
        status: "failed",
        error: error.response?.data?.message || error.message || "Failed to send reminder",
      });
    } finally {
      setSmsLoading(false);
    }
  };

  const handleDeleteManualPayment = async (payment) => {
    if (!payment?.id) return;

    const method = String(payment.payment_method || "").toLowerCase();
    const isManual =
      method === "manual" || method === "manual_reconciled";
    if (!isManual) {
      alert("Only manual payments can be deleted from this screen.");
      return;
    }

    const receipt = payment.mpesa_receipt_number || payment.mpesa_transaction_id || "N/A";
    const confirmDelete = window.confirm(
      `Delete this manual payment?\n\nAmount: ${formatCurrency(payment.amount)}\nReference: ${receipt}\n\nThis action cannot be undone.`,
    );
    if (!confirmDelete) return;

    try {
      await deletePayment(payment.id);
      await handleFetchPayments();
      alert("Manual payment deleted successfully.");
    } catch (err) {
      console.error("Delete manual payment error:", err);
      alert(err.response?.data?.message || "Failed to delete manual payment.");
    }
  };

  const handleOpenEditManualPayment = (payment) => {
    if (!payment?.id) return;

    const method = String(payment.payment_method || "").toLowerCase();
    const isEditable =
      method === "manual" ||
      method === "manual_reconciled" ||
      method === "paybill" ||
      method === "mpesa";
    if (!isEditable) {
      alert("Only manual, paybill, or M-Pesa payments can be edited.");
      return;
    }

    const rawMonth = payment.payment_month
      ? String(payment.payment_month).slice(0, 7)
      : "";

    setEditManualPaymentData({
      id: payment.id,
      mpesa_receipt_number: payment.mpesa_receipt_number || "",
      phone_number: payment.phone_number || "",
      notes: payment.notes || "",
      amount: payment.amount ? String(payment.amount) : "",
      payment_month: rawMonth,
      status: payment.status || "",
    });
    setEditManualPaymentError("");
    setShowEditManualPayment(true);
  };

  const handleSubmitEditManualPayment = async (e) => {
    e.preventDefault();
    if (!editManualPaymentData.id) return;

    setEditManualPaymentLoading(true);
    setEditManualPaymentError("");

    try {
      const payload = {
        amount: editManualPaymentData.amount
          ? parseFloat(editManualPaymentData.amount)
          : undefined,
        payment_month: editManualPaymentData.payment_month || undefined,
        status: editManualPaymentData.status || undefined,
        mpesa_receipt_number:
          editManualPaymentData.mpesa_receipt_number?.trim() || null,
        phone_number: editManualPaymentData.phone_number?.trim() || null,
        notes: editManualPaymentData.notes?.trim() || null,
      };

      await updatePayment(editManualPaymentData.id, payload);
      await handleFetchPayments();
      setShowEditManualPayment(false);
      alert("Payment updated successfully.");
    } catch (err) {
      console.error("Edit manual payment error:", err);
      setEditManualPaymentError(
        err.response?.data?.message || "Failed to update payment.",
      );
    } finally {
      setEditManualPaymentLoading(false);
    }
  };

  useEffect(() => {
    const fetchSystemPaybill = async () => {
      try {
        const infoResponse = await API.settings.getCompanyInfo();
        let value =
          infoResponse?.data?.data?.paybill_number ||
          infoResponse?.data?.data?.mpesa_paybill_number ||
          "";
        if (!value) {
          const response = await API.settings.getSettingByKey("paybill_number");
          value = response?.data?.setting?.value;
        }
        if (!value) {
          const alt = await API.settings.getSettingByKey("mpesa_paybill_number");
          value = alt?.data?.setting?.value;
        }
        setSystemPaybill(value ? String(value).trim() : "");
      } catch (error) {
        console.error("Failed to fetch system paybill:", error);
        setSystemPaybill("");
      }
    };

    fetchSystemPaybill();
  }, []);

  const handleSendReminders = async () => {
    setSmsLoading(true);
    setSmsResult(null);

    const draftsToSend = reminderDrafts.filter((draft) => draft.message.trim());
    if (draftsToSend.length === 0) {
      setSmsLoading(false);
      setSmsResult({
        success: false,
        message: "Add at least one reminder message before sending.",
      });
      return;
    }

    let sent = 0;
    let failed = 0;
    const errors = [];
    let whatsappSent = 0;

    try {
      for (const draft of draftsToSend) {
        updateReminderDraft(draft.tenant_id, { status: "sending", error: "" });

        try {
          const responseData = await sendReminderDraft(draft);
          sent += responseData?.data?.sent || 0;
          whatsappSent += responseData?.data?.whatsapp_sent || 0;
          updateReminderDraft(draft.tenant_id, { status: "sent", error: "" });
        } catch (error) {
          failed += 1;
          const message =
            error.response?.data?.message ||
            error.message ||
            "Failed to send reminder";
          errors.push(`${draft.tenant_name}: ${message}`);
          updateReminderDraft(draft.tenant_id, {
            status: "failed",
            error: message,
          });
        }
      }

      setSmsResult({
        success: failed === 0,
        message:
          failed === 0
            ? `Sent ${sent} reminder${sent === 1 ? "" : "s"}.`
            : `Sent ${sent} reminder${sent === 1 ? "" : "s"}, ${failed} failed.`,
        data: {
          sent,
          failed,
          whatsapp_sent: whatsappSent,
          errors,
        },
      });

      if (failed === 0) {
        setSelectedTenants([]);
        setSelectAll(false);
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

  const handleReminderMessageChange = (tenantId, message) => {
    updateReminderDraft(tenantId, {
      message,
      status: "pending",
      error: "",
    });
  };

  const handleApplyMessageToAll = () => {
    if (!activeReminderDraft?.message) return;

    setReminderDrafts((prev) =>
      prev.map((draft) => ({
        ...draft,
        message: activeReminderDraft.message,
        status: draft.status === "sent" ? "sent" : "pending",
        error: "",
      })),
    );
  };

  const handleResetReminderDrafts = () => {
    const drafts = createReminderDrafts();
    setReminderDrafts(drafts);
    setActiveReminderTenantId(drafts[0]?.tenant_id || null);
    setSmsResult(null);
  };

  // ============================================================
  // EXPORT HANDLERS
  // ============================================================

  const handleExportPayments = async (format) => {
    if (!payments || payments.length === 0) {
      alert("No data available to export.");
      return;
    }

    let exportData = payments;

    if (payments.length < (pagination?.totalCount || 0)) {
      try {
        const allPayments = [];
        const pageSize = 200;
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const params = { page, limit: pageSize };
          if (filters.startDate) params.startDate = filters.startDate;
          if (filters.endDate) params.endDate = filters.endDate;
          if (filters.propertyId) params.propertyId = filters.propertyId;
          if (filters.status) params.status = filters.status;

          const response = await API.payments.getPayments(params);
          if (response.data?.success && response.data?.data?.payments) {
            allPayments.push(...response.data.data.payments);
            const total = response.data.data.pagination?.totalCount || 0;
            hasMore = allPayments.length < total;
            page++;
          } else {
            hasMore = false;
          }
        }

        if (allPayments.length > 0) {
          exportData = allPayments;
        }
      } catch (error) {
        console.error("Failed to fetch all payments for export:", error);
        alert("Could not fetch all payments. Exporting current page only.");
      }
    }

    const config = {
      reportType: "payments",
      data: exportData,
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
        "Water Arrears": t.water_arrears || 0,
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

  const handleExportTenantHistory = async (format) => {
    if (loadingHistory) {
      alert("Please wait for statement data to finish loading.");
      return;
    }

    if (!selectedTenant) {
      alert("No tenant selected for statement export.");
      return;
    }

    if (!tenantHistory?.payments || tenantHistory.payments.length === 0) {
      alert("No statement data available to export.");
      return;
    }

    const monthLabel = filters.month
      ? new Date(`${filters.month}-01`).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })
      : "";

    const summary = tenantHistory.summary || {};
    const config = {
      reportType: "tenant_statement",
      data: tenantHistory.payments,
      filters: {
        ...filters,
        tenant: selectedTenant.name,
        ...(monthLabel ? { month: monthLabel } : {}),
      },
      user,
      title: `Payment Statement - ${selectedTenant.name}`,
      totalsOverride: {
        "Total Expected": formatCurrency(summary.totalExpected || 0),
        "Total Paid": formatCurrency(summary.totalPaid || 0),
        "Outstanding Balance": formatCurrency(summary.balance || 0),
        "Payment Records": `${tenantHistory.payments.length}`,
      },
    };

    try {
      setHistoryExporting(true);
      if (format === "pdf") await exportToPDF(config);
      else await exportToExcel(config);
    } finally {
      setHistoryExporting(false);
    }
  };

  // ============================================================
  // COMPUTED VALUES
  // ============================================================

  const totalInView = useMemo(() => {
    const pagedTotal = toNumericAmount(pagination?.totalAmount);
    if (pagedTotal > 0) return pagedTotal;
    return payments?.reduce((sum, p) => sum + toNumericAmount(p.amount), 0) || 0;
  }, [payments, pagination?.totalAmount]);

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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              size={18}
            />
            <input
              type="text"
              placeholder={
                activeTab === "all"
                  ? "Search tenant or receipt..."
                  : "Search tenant, unit, or property..."
              }
              className="w-full pl-4 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
              onClick={handleFetchPayments}
              disabled={paymentsLoading}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={paymentsLoading ? "animate-spin" : ""}
              />{" "}
              Refresh
            </button>
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
          onDeleteManualPayment={handleDeleteManualPayment}
          canDeleteManual={user?.role === "admin" || user?.role === "agent"}
          onEditManualPayment={handleOpenEditManualPayment}
          canEditManual={user?.role === "admin" || user?.role === "agent"}
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
          exporting={historyExporting}
          onExportPDF={() => handleExportTenantHistory("pdf")}
          onExportExcel={() => handleExportTenantHistory("excel")}
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

      {showEditManualPayment && (
        <EditManualPaymentModal
          data={editManualPaymentData}
          setData={setEditManualPaymentData}
          loading={editManualPaymentLoading}
          error={editManualPaymentError}
          onSubmit={handleSubmitEditManualPayment}
          onClose={() => setShowEditManualPayment(false)}
        />
      )}

      {/* SMS Reminder Modal */}
      {showSMSModal && (
        <SMSReminderModal
          drafts={reminderDrafts}
          activeDraft={activeReminderDraft}
          month={filters.month}
          loading={smsLoading}
          result={smsResult}
          onSelectDraft={setActiveReminderTenantId}
          onMessageChange={handleReminderMessageChange}
          onApplyToAll={handleApplyMessageToAll}
          onReset={handleResetReminderDrafts}
          onSendSingle={handleSendSingleReminder}
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
  onDeleteManualPayment,
  canDeleteManual,
  onEditManualPayment,
  canEditManual,
  pagination,
  currentPage,
  setCurrentPage,
}) => {
  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(toNumericAmount(amount));

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
                      <div className="flex items-center justify-center gap-2">
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
                        {canEditManual &&
                          (p.payment_method === "manual" ||
                            p.payment_method === "manual_reconciled" ||
                            p.payment_method === "paybill" ||
                            p.payment_method === "mpesa") && (
                            <button
                              onClick={() => onEditManualPayment?.(p)}
                              className="bg-amber-50 text-amber-700 p-1.5 rounded-md hover:bg-amber-600 hover:text-white transition-all"
                              title="Edit payment"
                              aria-label="Edit payment"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        {canDeleteManual &&
                          (p.payment_method === "manual" ||
                            p.payment_method === "manual_reconciled") && (
                            <button
                              onClick={() => onDeleteManualPayment?.(p)}
                              className="bg-red-50 text-red-600 p-1.5 rounded-md hover:bg-red-600 hover:text-white transition-all"
                              title="Delete manual payment"
                              aria-label="Delete manual payment"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                      </div>
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
    }).format(toNumericAmount(amount));

  const formatPhone = (phone) => formatContactPhoneForDisplay(phone) || "";

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
                <th className="p-4 text-right">
                  <span
                    title="Balance values shown in this table are net after advance allocation."
                    className="inline-flex items-center gap-1 cursor-help"
                  >
                    Water
                    <AlertCircle size={12} className="text-gray-400" />
                  </span>
                </th>
                <th className="p-4 text-right">
                  <span
                    title="Balance values shown in this table are net after advance allocation."
                    className="inline-flex items-center gap-1 cursor-help"
                  >
                    Arrears
                    <AlertCircle size={12} className="text-gray-400" />
                  </span>
                </th>
                <th className="p-4 text-right">
                  {activeTab === "unpaid" ? "Total Due" : "Advance"}
                </th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
                {activeTab === "unpaid" && (
                  <th className="p-4 text-center">
                    <span title="AI Payment Risk Score" className="inline-flex items-center gap-1 cursor-help">
                      🤖 AI Risk
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((t) => {
                const isSelected = selectedTenants.includes(t.tenant_id);
                const isPaid = t.total_due <= 0;

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
                      <div className="text-gray-500 text-xs">
                        Date:{" "}
                        {formatExactDueDate({
                          dueDate: t.due_date,
                          rentDueDay: t.rent_due_day,
                          month,
                        })}
                      </div>
                      <div
                        className={`font-medium ${t.rent_paid >= t.monthly_rent ? "text-green-600" : "text-gray-800"}`}
                      >
                        Paid: {formatCurrency(t.rent_paid)}
                      </div>
                      {(Number(t.rent_due) || 0) > 0 && (
                        <div
                          className="text-red-600 text-xs font-bold"
                          title="Net balance after advance allocation."
                        >
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
                      {(Number(t.water_due) || 0) > 0 && (
                        <div
                          className="text-red-600 text-xs font-bold"
                          title="Net balance after advance allocation."
                        >
                          Bal: {formatCurrency(t.water_due)}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      {(Number(t.arrears_due ?? t.arrears) || 0) > 0 ? (
                        <span className="text-red-600 font-bold">
                          {formatCurrency(t.arrears_due ?? t.arrears)}
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
                    {activeTab === "unpaid" && (
                      <td className="p-4 text-center">
                        <PaymentRiskBadge 
                          tenantId={t.tenant_id} 
                          compact 
                        />
                      </td>
                    )}
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

const TenantHistoryModal = ({
  tenant,
  history,
  loading,
  error,
  exporting,
  onExportPDF,
  onExportExcel,
  onClose,
}) => {
  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(toNumericAmount(amount));

  const formatDate = (dateString) =>
    dateString ? new Date(dateString).toLocaleDateString("en-GB") : "N/A";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border max-h-[90vh]">
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-xl text-gray-800">
              Payment Statement
            </h3>
            <p className="text-blue-600 font-medium">{tenant.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onExportPDF}
              disabled={loading || exporting || !!error}
              className="flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <FileText size={14} />
              PDF
            </button>
            <button
              onClick={onExportExcel}
              disabled={loading || exporting || !!error}
              className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet size={14} />
              Excel
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-200 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                  <p className="text-xs font-bold text-indigo-400 uppercase mb-1">
                    Current Month Expected
                  </p>
                  <p className="text-xl font-black text-indigo-700">
                    {formatCurrency(history.summary?.currentMonthExpected)}
                  </p>
                </div>
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
  const noTenants = !tenants || tenants.length === 0;
  const selectedTenantRow = tenants?.find(
    (t) =>
      t.tenant_id === data.tenant_id &&
      (!data.unit_id || t.unit_id === data.unit_id),
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
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

          {tenants && tenants.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Type
              </label>
              <select
                value={data.payment_type}
                onChange={(e) => {
                  const type = e.target.value;
                  setData({
                    ...data,
                    payment_type: type,
                    entry_mode: type === "deposit" ? "manual" : data.entry_mode || "manual",
                    payment_method:
                      type === "deposit"
                        ? data.payment_method || "cash"
                        : "manual",
                  });
                }}
                className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none mb-3"
                required
              >
                <option value="rent">Rent Payment</option>
                <option value="deposit">Deposit Payment</option>
              </select>

              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Tenant
              </label>
              <select
                value={
                  data.tenant_id && data.unit_id
                    ? `${data.tenant_id}::${data.unit_id}`
                    : data.tenant_id
                }
                onChange={(e) => {
                  const tenant = tenants.find(
                    (t) => getTenantAllocationOptionValue(t) === e.target.value,
                  );
                  if (tenant) {
                    setData({
                      ...data,
                      tenant_id: tenant.tenant_id,
                      unit_id: tenant.unit_id,
                      unit_code: tenant.unit_code || "",
                      allocation_id: tenant.allocation_id || "",
                      phone_number:
                        formatContactPhoneForDisplay(tenant.phone_number) || "",
                    });
                  } else {
                    setData({
                      ...data,
                      tenant_id: "",
                      unit_id: "",
                      unit_code: "",
                      allocation_id: "",
                    });
                  }
                }}
                className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                required
              >
                <option value="">Choose a tenant...</option>
                {tenants.map((t) => (
                  <option
                    key={`${t.tenant_id}-${t.unit_id || t.unit_code || "tenant"}`}
                    value={getTenantAllocationOptionValue(t)}
                  >
                    {t.tenant_name} - {t.unit_code}
                  </option>
                ))}
              </select>
            </div>
          )}

          {data.payment_type === "rent" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entry Mode
              </label>
              <select
                value={data.entry_mode || "manual"}
                onChange={(e) => setData({ ...data, entry_mode: e.target.value })}
                className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="manual">Cash / Manual</option>
                <option value="paybill">Paybill (M-Pesa Receipt)</option>
              </select>
            </div>
          )}

          {noTenants && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
              No active tenants were loaded for manual posting. Refresh tenant
              data or confirm tenants have active unit allocations.
            </div>
          )}

          {data.tenant_id && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <span className="font-medium">Selected:</span>{" "}
              {selectedTenantRow?.tenant_name || "Tenant"}
              {selectedTenantRow?.unit_code ? ` (${selectedTenantRow.unit_code})` : ""}
              {getTenantUnitCodes(selectedTenantRow).length > 1 && (
                <div className="text-xs text-blue-700 mt-1">
                  Tenant also has units: {getTenantUnitCodes(selectedTenantRow).join(", ")}
                </div>
              )}
            </div>
          )}

          {data.payment_type === "deposit" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                value={data.payment_method}
                onChange={(e) =>
                  setData({ ...data, payment_method: e.target.value })
                }
                className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                required
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="bank">Bank</option>
                <option value="manual">Manual</option>
              </select>
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

          {data.payment_type === "rent" && (
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
          )}

          {data.payment_type === "rent" && data.entry_mode === "paybill" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Code (Paybill Account)
              </label>
              <input
                type="text"
                value={data.unit_code || ""}
                onChange={(e) => setData({ ...data, unit_code: e.target.value })}
                className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g., KBA2"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              M-Pesa Receipt Number{" "}
              {data.payment_type === "rent" && data.entry_mode === "paybill"
                ? "(required)"
                : "(optional)"}
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
              Phone Number{" "}
              {data.payment_type === "rent" && data.entry_mode === "paybill"
                ? "(required)"
                : "(optional)"}
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
              disabled={
                loading ||
                !data.tenant_id ||
                !data.unit_id ||
                !data.amount ||
                Number(data.amount) <= 0 ||
                (data.payment_type === "rent" && !data.payment_month) ||
                (data.payment_type === "rent" &&
                  data.entry_mode === "paybill" &&
                  (!data.unit_code ||
                    !data.mpesa_receipt_number ||
                    !data.phone_number))
              }
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? "Recording..."
                : data.payment_type === "deposit"
                  ? "Record Deposit"
                  : data.entry_mode === "paybill"
                    ? "Post Paybill Receipt"
                  : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditManualPaymentModal = ({
  data,
  setData,
  loading,
  error,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border">
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-xl text-gray-800">
              Edit Payment
            </h3>
            <p className="text-gray-500 text-sm">
              Update details for manual or paybill payment
            </p>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (KES)
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={data.amount}
                onChange={(e) => setData({ ...data, amount: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Enter amount"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Month
              </label>
              <input
                type="month"
                value={data.payment_month}
                onChange={(e) =>
                  setData({ ...data, payment_month: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={data.status || "completed"}
                onChange={(e) => setData({ ...data, status: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              M-Pesa Receipt
            </label>
            <input
              type="text"
              value={data.mpesa_receipt_number}
              onChange={(e) =>
                setData({ ...data, mpesa_receipt_number: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="e.g. UC3IX89BKM"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="text"
              value={data.phone_number}
              onChange={(e) =>
                setData({ ...data, phone_number: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="2547XXXXXXXX"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              rows={3}
              value={data.notes}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="Optional notes"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SMSReminderModal = ({
  drafts,
  activeDraft,
  month,
  loading,
  result,
  onSelectDraft,
  onMessageChange,
  onApplyToAll,
  onReset,
  onSendSingle,
  onSend,
  onClose,
}) => {
  const sentCount = drafts.filter((draft) => draft.status === "sent").length;
  const failedCount = drafts.filter((draft) => draft.status === "failed").length;
  const pendingCount = drafts.filter(
    (draft) => draft.status === "pending" || draft.status === "sending",
  ).length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden border border-gray-200">
        <div className="p-6 border-b bg-gradient-to-r from-slate-50 via-white to-orange-50 flex justify-between items-start gap-4">
          <div>
            <h3 className="font-bold text-xl text-gray-900">
              Review Payment Reminders
            </h3>
            <p className="text-gray-500 text-sm mt-1">
              Edit each reminder before sending. Messages are sent one tenant at a time so every draft stays reviewable.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] min-h-[70vh]">
          <div className="border-r bg-slate-50/70 p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white border p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">
                  Total
                </p>
                <p className="text-2xl font-bold text-gray-900">{drafts.length}</p>
              </div>
              <div className="rounded-2xl bg-white border p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">
                  Sent
                </p>
                <p className="text-2xl font-bold text-green-600">{sentCount}</p>
              </div>
              <div className="rounded-2xl bg-white border p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">
                  Pending
                </p>
                <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Recipients
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatMonthLabel(month)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onReset}
                  className="text-xs font-medium text-gray-600 hover:text-gray-900"
                >
                  Reset drafts
                </button>
              </div>

              <div className="mt-4 space-y-2 max-h-[48vh] overflow-y-auto pr-1">
                {drafts.map((draft) => {
                  const isActive = activeDraft?.tenant_id === draft.tenant_id;
                  const statusStyles =
                    draft.status === "sent"
                      ? "bg-green-100 text-green-700"
                      : draft.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : draft.status === "sending"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-orange-100 text-orange-700";

                  return (
                    <button
                      key={draft.tenant_id}
                      type="button"
                      onClick={() => onSelectDraft(draft.tenant_id)}
                      className={`w-full text-left rounded-2xl border p-4 transition-all ${
                        isActive
                          ? "border-orange-300 bg-orange-50 shadow-sm"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {draft.tenant_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {draft.property_name} {draft.unit_code ? `• ${draft.unit_code}` : ""}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatContactPhoneForDisplay(draft.phone_number) || "No phone"}
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${statusStyles}`}>
                          {draft.status}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-gray-500">Outstanding</span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(draft.total_due)}
                        </span>
                      </div>
                      {draft.error && (
                        <p className="mt-2 text-xs text-red-600">{draft.error}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
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

            {activeDraft ? (
              <>
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                        Editing
                      </p>
                      <h4 className="text-2xl font-bold text-gray-900 mt-1">
                        {activeDraft.tenant_name}
                      </h4>
                      <div className="mt-2 space-y-1 text-sm text-gray-500">
                        <p>{activeDraft.property_name} {activeDraft.unit_code ? `• ${activeDraft.unit_code}` : ""}</p>
                        <p>{formatContactPhoneForDisplay(activeDraft.phone_number) || "No phone number"}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border p-4 min-w-[200px]">
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Outstanding balance
                      </p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {formatCurrency(activeDraft.total_due)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-800">
                        Reminder message
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        Review and edit before sending.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onApplyToAll}
                      className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50"
                    >
                      Apply this text to all
                    </button>
                  </div>
                  <textarea
                    value={activeDraft.message}
                    onChange={(e) =>
                      onMessageChange(activeDraft.tenant_id, e.target.value)
                    }
                    className="w-full min-h-[240px] border rounded-2xl p-4 focus:ring-2 focus:ring-orange-500 outline-none resize-y"
                    placeholder="Write the reminder message for this tenant..."
                    maxLength={160}
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>{activeDraft.message.length}/160 characters</span>
                    {activeDraft.error && (
                      <span className="text-red-600">{activeDraft.error}</span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
                  <div className="flex items-start gap-3">
                    <MessageSquare size={18} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Delivery</p>
                      <p className="mt-1">
                        Kenyan numbers can go through SMS with WhatsApp fallback logic. International numbers go through WhatsApp review/send only.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="sm:w-auto w-full px-5 py-3 border rounded-2xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => onSendSingle(activeDraft.tenant_id)}
                    disabled={loading || !activeDraft.message.trim()}
                    className="sm:w-auto w-full px-5 py-3 bg-slate-900 text-white rounded-2xl font-medium hover:bg-slate-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {loading && activeDraft.status === "sending" ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Sending current...
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        Send current
                      </>
                    )}
                  </button>
                  <button
                    onClick={onSend}
                    disabled={loading || drafts.every((draft) => !draft.message.trim())}
                    className="sm:w-auto w-full px-5 py-3 bg-orange-600 text-white rounded-2xl font-medium hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Sending all...
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        Send all drafts
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-gray-500">
                <div>
                  <Users size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No recipients selected</p>
                </div>
              </div>
            )}
            {failedCount > 0 && (
              <div className="text-xs text-red-600 font-medium">
                {failedCount} reminder{failedCount === 1 ? "" : "s"} failed. Fix the highlighted drafts and send again.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentManagement;
