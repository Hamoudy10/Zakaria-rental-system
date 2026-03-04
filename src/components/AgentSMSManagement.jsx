// src/components/AgentSMSManagement.jsx
import React, { useState, useEffect, useMemo } from "react";
import { API } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Send,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react";
import TemplatePicker from "./common/TemplatePicker";

const toNumeric = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatKES = (value) =>
  toNumeric(value).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const getOrdinal = (day) => {
  const n = Number(day);
  if (!Number.isFinite(n) || n <= 0) return "";
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
};

const renderTemplateString = (body = "", variables = {}) =>
  String(body || "").replace(/\{([^}]+)\}/g, (_, key) => {
    const normalized = String(key || "").trim();
    return Object.prototype.hasOwnProperty.call(variables, normalized)
      ? String(variables[normalized] ?? "")
      : `{${normalized}}`;
  });

const AgentSMSManagement = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("trigger");

  // State for Trigger Billing Tab
  const [month, setMonth] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);
  const [missingBillsConfirmation, setMissingBillsConfirmation] =
    useState(null);
  const [autoIncludeMissingWaterBills, setAutoIncludeMissingWaterBills] =
    useState(false);
  const [billingTemplates, setBillingTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [notificationTemplates, setNotificationTemplates] = useState([]);

  // State for Failed SMS Tab
  const [failedSMS, setFailedSMS] = useState([]);
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [selectedFailedSMS, setSelectedFailedSMS] = useState([]);
  const [failedFilters, setFailedFilters] = useState({
    propertyId: "",
    startDate: "",
    endDate: "",
  });

  // State for SMS History Tab
  const [smsHistory, setSmsHistory] = useState([]);
  const [smsHistorySummary, setSmsHistorySummary] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    status: "",
    startDate: "",
    endDate: "",
    propertyId: "",
  });
  const [smsStats, setSmsStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // State for Delivery Details Modal
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryDetails, setDeliveryDetails] = useState(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);

  // State for Send Notifications Tab
  const [sendPropertyId, setSendPropertyId] = useState("");
  const [sendTenants, setSendTenants] = useState([]);
  const [loadingSendTenants, setLoadingSendTenants] = useState(false);
  const [selectedSendTenantId, setSelectedSendTenantId] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testAmount, setTestAmount] = useState("");
  const [testTemplateId, setTestTemplateId] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testSendResult, setTestSendResult] = useState(null);
  const [resolvedTemplateVariables, setResolvedTemplateVariables] = useState({});
  const [systemPaybill, setSystemPaybill] = useState("");
  const [loadingNotificationTemplates, setLoadingNotificationTemplates] =
    useState(false);
  const [loadingSendBalances, setLoadingSendBalances] = useState(false);
  const [sendTenantBalances, setSendTenantBalances] = useState({});

  const selectedNotificationTemplate = useMemo(
    () => notificationTemplates.find((t) => t.id === testTemplateId) || null,
    [notificationTemplates, testTemplateId],
  );

  const missingRequiredTemplateVariables = useMemo(() => {
    if (!selectedNotificationTemplate) return [];
    const requiredKeys = Array.isArray(selectedNotificationTemplate.variables)
      ? selectedNotificationTemplate.variables
      : [];
    return requiredKeys.filter((rawKey) => {
      const key = String(rawKey || "").trim();
      if (!key) return false;
      const value = resolvedTemplateVariables?.[key];
      if (value === undefined || value === null) return true;
      const normalized = String(value).trim().toLowerCase();
      return normalized === "" || normalized === "n/a";
    });
  }, [selectedNotificationTemplate, resolvedTemplateVariables]);

  // Load agent's assigned properties
  useEffect(() => {
    fetchAgentProperties();
    fetchBillingTemplates();
    fetchNotificationTemplates();
    fetchSystemPaybill();
    // Set default month to current month
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    setMonth(`${year}-${month}`);
  }, []);

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === "failed") {
      fetchFailedSMS(failedFilters);
    } else if (activeTab === "history") {
      fetchSMSHistory();
    }
    fetchSMSStats();
  }, [activeTab]);

  const fetchSMSStats = async () => {
    setLoadingStats(true);
    try {
      const response = await API.notifications.getSMSStats();
      if (response.data?.success) {
        setSmsStats(response.data.data);
      } else {
        setSmsStats(null);
      }
    } catch (error) {
      console.error("Error fetching SMS stats:", error);
      setSmsStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchAgentProperties = async () => {
    try {
      const response = await API.properties.getAgentProperties();
      if (response.data.success) {
        setProperties(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching properties:", error);
    }
  };

  const fetchBillingTemplates = async () => {
    try {
      const response =
        await API.settings.getTemplateOptionsForEvent(
          "agent_manual_billing_trigger",
        );
      if (response.data?.success) {
        setBillingTemplates(response.data.data?.templates || []);
      }
    } catch (error) {
      console.error("Error fetching billing templates:", error);
      setBillingTemplates([]);
    }
  };

  const fetchNotificationTemplates = async () => {
    setLoadingNotificationTemplates(true);
    try {
      const response = await API.settings.getTemplateOptionsForAllEvents({
        channel_capability: "whatsapp",
      });
      const templates = response?.data?.data?.templates || [];
      const uniqueById = new Map();
      templates.forEach((template) => {
        if (!template?.id) return;
        if (!uniqueById.has(template.id)) {
          uniqueById.set(template.id, template);
        }
      });

      setNotificationTemplates(
        Array.from(uniqueById.values()).sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
    } catch (error) {
      console.error("Error fetching notification templates:", error);
      setNotificationTemplates([]);
    } finally {
      setLoadingNotificationTemplates(false);
    }
  };

  const fetchSystemPaybill = async () => {
    try {
      const response = await API.settings.getSettingByKey("paybill_number");
      let value = response?.data?.setting?.value;
      if (!value) {
        const alt = await API.settings.getSettingByKey("mpesa_paybill_number");
        value = alt?.data?.setting?.value;
      }
      setSystemPaybill(value ? String(value).trim() : "");
    } catch (error) {
      console.error("Error fetching system paybill:", error);
      setSystemPaybill("");
    }
  };

  const buildVariableContext = (tenant) => {
    const now = new Date();
    const monthLong = now.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const monthShort = now
      .toLocaleDateString("en-US", { month: "short", year: "numeric" })
      .toUpperCase();

    const property = properties.find((p) => p.id === sendPropertyId);
    const dueValue = toNumeric(sendTenantBalances[selectedSendTenantId] ?? testAmount);
    const dueDayNumber = toNumeric(tenant?.rent_due_day);
    const dueDay = dueDayNumber > 0 ? `${getOrdinal(dueDayNumber)} of every month` : "";
    const dueDate = dueDayNumber > 0 ? `${getOrdinal(dueDayNumber)} ${monthLong}` : "";
    const tenantName =
      `${tenant.first_name || ""} ${tenant.last_name || ""}`.trim() || "Tenant";
    const itemsLine = `- Rent: KES ${formatKES(dueValue)}`;
    const statusLine =
      dueValue > 0
        ? `Balance: KES ${formatKES(dueValue)}`
        : "Fully Paid";

    return {
      tenantName,
      tenant_name: tenantName,
      firstName: tenant.first_name || "",
      first_name: tenant.first_name || "",
      lastName: tenant.last_name || "",
      last_name: tenant.last_name || "",
      unitCode: tenant.unit_code || "",
      unit_code: tenant.unit_code || "",
      month: monthLong,
      month_short: monthShort,
      propertyName: property?.name || "",
      property_name: property?.name || "",
      paybill:
        property?.paybill_number ||
        property?.paybill ||
        systemPaybill ||
        "",
      account: tenant.unit_code || "",
      accountNumber: tenant.unit_code || "",
      message: testMessage?.trim() || "",
      title: "Service Notice",
      total: `${dueValue}`,
      totalDue: `${dueValue}`,
      outstanding: `${dueValue}`,
      rent: `${toNumeric(tenant?.monthly_rent)}`,
      dueDay,
      due_day: dueDay,
      dueDate,
      due_date: dueDate,
      status: statusLine,
      allocation: itemsLine,
      items: itemsLine,
      months: "1",
    };
  };

  const resolveVariablesForTemplate = (template, tenant) => {
    const context = buildVariableContext(tenant);
    const requiredKeys = Array.isArray(template?.variables) ? template.variables : [];
    if (!requiredKeys.length) return context;

    const resolved = { ...context };
    requiredKeys.forEach((rawKey) => {
      const key = String(rawKey || "").trim();
      if (!key) return;
      const existing = resolved[key];
      if (existing !== undefined && existing !== null && String(existing).trim() !== "") {
        return;
      }
      resolved[key] = "N/A";
    });

    return resolved;
  };

  const renderTemplateForTenant = (template, tenant) => {
    if (!template || !tenant) return { message: "", variables: {} };
    const base = template.whatsapp_fallback_body || template.sms_body || "";
    if (!base) return { message: "", variables: {} };

    const resolved = resolveVariablesForTemplate(template, tenant);
    const rendered = renderTemplateString(base, resolved);

    return { message: rendered, variables: resolved };
  };

  useEffect(() => {
    if (!selectedSendTenantId) {
      setResolvedTemplateVariables({});
      return;
    }
    const tenant = sendTenants.find(
      (t) => (t.id || t.tenant_id) === selectedSendTenantId,
    );
    if (!tenant) {
      setResolvedTemplateVariables({});
      return;
    }

    if (!testTemplateId) {
      setResolvedTemplateVariables(buildVariableContext(tenant));
      return;
    }

    const template = notificationTemplates.find((t) => t.id === testTemplateId);
    if (!template) {
      setResolvedTemplateVariables({});
      return;
    }
    const rendered = renderTemplateForTenant(template, tenant);
    setResolvedTemplateVariables(rendered.variables || {});
    if (rendered.message) {
      setTestMessage(rendered.message);
    }
  }, [
    testTemplateId,
    selectedSendTenantId,
    sendTenants,
    notificationTemplates,
    sendPropertyId,
    testAmount,
    sendTenantBalances,
    systemPaybill,
  ]);

  const fetchSendTenantsByProperty = async (selectedProperty) => {
    if (!selectedProperty) {
      setSendTenants([]);
      setSelectedSendTenantId("");
      setSendTenantBalances({});
      setTestAmount("");
      return;
    }

    setLoadingSendTenants(true);
    try {
      const response = await API.notifications.getTenantsByProperty(
        selectedProperty,
      );
      const rawData = response?.data?.data;
      const tenants = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.tenants)
          ? rawData.tenants
          : [];
      setSendTenants(tenants);
      setSelectedSendTenantId("");
      setTestAmount("");

      // Auto-load balance snapshot for current month to prefill amount on tenant select.
      setLoadingSendBalances(true);
      try {
        const balanceMonth =
          month ||
          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        const statusResponse = await API.payments.getTenantPaymentStatus({
          propertyId: selectedProperty,
          month: balanceMonth,
        });
        const statusTenants = statusResponse?.data?.data?.tenants || [];
        const balanceMap = {};
        statusTenants.forEach((row) => {
          const id = String(row.tenant_id || row.id || "");
          if (!id) return;
          const rawDue = Number(row.total_due ?? row.balance ?? row.rent_due ?? 0);
          balanceMap[id] = Number.isFinite(rawDue) ? rawDue : 0;
        });
        setSendTenantBalances(balanceMap);
      } catch (balanceError) {
        console.error("Error fetching tenant balances for prefill:", balanceError);
        setSendTenantBalances({});
      } finally {
        setLoadingSendBalances(false);
      }
    } catch (error) {
      console.error("Error fetching property tenants for test send:", error);
      setSendTenants([]);
      setSelectedSendTenantId("");
      setSendTenantBalances({});
      alert(
        error?.response?.data?.message ||
          "Failed to load tenants for selected property.",
      );
    } finally {
      setLoadingSendTenants(false);
    }
  };

  useEffect(() => {
    if (!selectedSendTenantId) return;
    const due = Number(sendTenantBalances[selectedSendTenantId]);
    if (!Number.isFinite(due)) return;
    setTestAmount(due > 0 ? String(due) : "0");
  }, [selectedSendTenantId, sendTenantBalances]);

  const handleSendTestNotification = async () => {
    if (!sendPropertyId) {
      alert("Please select a property.");
      return;
    }
    if (!selectedSendTenantId) {
      alert("Please select a tenant.");
      return;
    }
    if (!testTemplateId && !testMessage.trim()) {
      alert("Please enter a message or select a template.");
      return;
    }
    if (!testTemplateId && testMessage.trim().length > 160) {
      alert("Message should be 160 characters or fewer when no template is selected.");
      return;
    }
    if (testTemplateId && missingRequiredTemplateVariables.length > 0) {
      alert(
        `Cannot send. Missing required template values: ${missingRequiredTemplateVariables.join(", ")}`,
      );
      return;
    }

    setSendingTest(true);
    setTestSendResult(null);

    try {
      const selectedTenant = sendTenants.find(
        (tenant) => (tenant.id || tenant.tenant_id) === selectedSendTenantId,
      );
      const tenantName = selectedTenant
        ? `${selectedTenant.first_name || ""} ${selectedTenant.last_name || ""}`.trim()
        : "";
      const selectedProperty = properties.find((p) => p.id === sendPropertyId);
      const dueDayValue =
        selectedTenant?.rent_due_day
          ? `${getOrdinal(selectedTenant.rent_due_day)} of every month`
          : "";
      const resolvedValues = {
        ...resolvedTemplateVariables,
        message: testMessage.trim(),
        tenantName,
        unitCode: selectedTenant?.unit_code || "",
        propertyName: selectedProperty?.name || "",
        rent: selectedTenant?.monthly_rent ?? "",
        dueDay: dueDayValue,
        month:
          resolvedTemplateVariables?.month ||
          new Date().toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          }),
        total: testAmount.trim(),
        totalDue: testAmount.trim(),
        outstanding: testAmount.trim(),
        account: selectedTenant?.unit_code || "",
        accountNumber: selectedTenant?.unit_code || "",
        paybill:
          selectedProperty?.paybill_number ||
          selectedProperty?.paybill ||
          systemPaybill ||
          "",
      };
      const payload = {
        tenantIds: [selectedSendTenantId],
        message: testMessage.trim(),
        messageType: "announcement",
        template_id: testTemplateId || undefined,
        template_variables: resolvedValues,
      };

      const response = await API.notifications.sendTargetedSMS(payload);
      if (response.data?.success) {
        setTestSendResult({
          type: "success",
          message: response.data.message || "Test notification sent.",
          data: response.data.data || null,
        });
        setTestMessage("");
      } else {
        setTestSendResult({
          type: "error",
          message: response.data?.message || "Failed to send test notification.",
        });
      }
    } catch (error) {
      console.error("Send test notification error:", error);
      setTestSendResult({
        type: "error",
        message:
          error?.response?.data?.message ||
          "Failed to send test notification.",
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleTriggerBilling = async () => {
    if (!month) {
      alert("Please select a month");
      return;
    }

    setLoading(true);
    setTriggerResult(null);

    try {
      const payload = { month };
      if (propertyId) {
        payload.property_id = propertyId;
      }
      if (autoIncludeMissingWaterBills) {
        payload.include_missing_water_bills = true;
      }
      if (selectedTemplateId) {
        payload.template_id = selectedTemplateId;
      }

      const response = await API.billing.triggerAgentBilling(payload);
      const responseData = response.data || {};

      if (responseData.requires_confirmation) {
        // Show confirmation modal for missing water bills.
        // Support both legacy and updated backend response shapes.
        setMissingBillsConfirmation(responseData);
        setTriggerResult(null);
      } else if (responseData.success) {
        setTriggerResult({
          type: "success",
          message: responseData.message,
          data: responseData.data,
        });
        // Reset confirmation state
        setMissingBillsConfirmation(null);
      } else {
        setTriggerResult({
          type: "error",
          message: responseData.message,
        });
      }
    } catch (error) {
      console.error("Error triggering billing:", error);
      setTriggerResult({
        type: "error",
        message: "Failed to trigger billing. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProceedWithMissingBills = async () => {
    setLoading(true);

    try {
      const payload = {
        month,
        include_missing_water_bills: true,
      };
      if (propertyId) {
        payload.property_id = propertyId;
      }
      if (selectedTemplateId) {
        payload.template_id = selectedTemplateId;
      }

      const response = await API.billing.triggerAgentBilling(payload);

      if (response.data.success) {
        setTriggerResult({
          type: "success",
          message: response.data.message,
          data: response.data.data,
        });
        setMissingBillsConfirmation(null);
      } else {
        setTriggerResult({
          type: "error",
          message: response.data.message,
        });
      }
    } catch (error) {
      console.error("Error proceeding with missing bills:", error);
      setTriggerResult({
        type: "error",
        message: "Failed to proceed with billing.",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFailedSMS = async (filters = failedFilters) => {
    setLoadingFailed(true);
    try {
      const params = {
        status: "failed",
        channel: "sms",
        limit: 200,
      };
      if (filters.propertyId) {
        params.propertyId = filters.propertyId;
      }
      if (filters.startDate) {
        params.startDate = filters.startDate;
      }
      if (filters.endDate) {
        params.endDate = filters.endDate;
      }
      const response = await API.notifications.getSMSHistory(params);
      if (response.data.success) {
        const items = response?.data?.data?.messages || [];
        setFailedSMS(Array.isArray(items) ? items : []);
      }
    } catch (error) {
      console.error("Error fetching failed SMS:", error);
      setFailedSMS([]);
    } finally {
      setLoadingFailed(false);
    }
  };

  const handleRetrySMS = async (smsId) => {
    const isQueueId =
      typeof smsId === "string" &&
      /^[0-9a-fA-F-]{36}$/.test(smsId) &&
      !smsId.startsWith("smsn_") &&
      !smsId.startsWith("wan_");
    if (!isQueueId) {
      alert("This failed item is not retryable from queue.");
      return;
    }
    try {
      const response = await API.billing.retryAgentFailedSMS({
        sms_ids: [smsId],
      });

      if (response.data.success) {
        alert("SMS queued for retry");
        // Refresh the list
        fetchFailedSMS(failedFilters);
      }
    } catch (error) {
      console.error("Error retrying SMS:", error);
      alert("Failed to retry SMS");
    }
  };

  const handleBulkRetry = async () => {
    if (selectedFailedSMS.length === 0) {
      alert("Please select SMS to retry");
      return;
    }

    const retryableIds = selectedFailedSMS.filter(
      (id) =>
        typeof id === "string" &&
        /^[0-9a-fA-F-]{36}$/.test(id) &&
        !id.startsWith("smsn_") &&
        !id.startsWith("wan_"),
    );
    if (retryableIds.length === 0) {
      alert("No retryable queue SMS selected.");
      return;
    }

    try {
      const response = await API.billing.retryAgentFailedSMS({
        sms_ids: retryableIds,
      });

      if (response.data.success) {
        alert(`${response.data.message}`);
        // Refresh and clear selection
        fetchFailedSMS(failedFilters);
        setSelectedFailedSMS([]);
      }
    } catch (error) {
      console.error("Error bulk retrying SMS:", error);
      alert("Failed to retry SMS");
    }
  };

  const fetchSMSHistory = async () => {
    return fetchSMSHistoryWithFilters(historyFilters);
  };

  const fetchSMSHistoryWithFilters = async (filters) => {
    setLoadingHistory(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.propertyId) params.propertyId = filters.propertyId;
      params.channel = "sms";
      params.limit = 200;

      const response = await API.notifications.getSMSHistory(params);

      if (response.data.success) {
        const historyData =
          response.data?.data?.messages ||
          response.data?.data?.rows ||
          response.data?.data?.history ||
          response.data?.data ||
          [];
        setSmsHistory(Array.isArray(historyData) ? historyData : []);
        setSmsHistorySummary(response.data?.data?.summary || null);
      } else {
        setSmsHistory([]);
        setSmsHistorySummary(null);
      }
    } catch (error) {
      console.error("Error fetching SMS history:", error);
      setSmsHistory([]);
      setSmsHistorySummary(null);
      alert(
        error?.response?.data?.message ||
          "Failed to fetch SMS history. Please try again.",
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCheckDelivery = async (messageId) => {
    if (!messageId) return;
    setCheckingDelivery(true);
    try {
      const response = await API.notifications.checkDeliveryStatus(messageId);
      if (response.data.success) {
        setDeliveryDetails(response.data.data);
        setShowDeliveryModal(true);
      } else {
        alert("Could not fetch delivery details.");
      }
    } catch (error) {
      console.error("Check delivery error:", error);
      const statusCode = error?.response?.status;
      const providerError =
        error?.response?.data?.error || error?.response?.data?.message;
      if (statusCode === 402) {
        alert(
          `Delivery status lookup rejected by provider (402). This is usually provider credit/permission limitation.\n\n${providerError || ""}`,
        );
        return;
      }
      alert(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Failed to check delivery status.",
      );
    } finally {
      setCheckingDelivery(false);
    }
  };

  const handleSelectFailedSMS = (smsId) => {
    if (selectedFailedSMS.includes(smsId)) {
      setSelectedFailedSMS(selectedFailedSMS.filter((id) => id !== smsId));
    } else {
      setSelectedFailedSMS([...selectedFailedSMS, smsId]);
    }
  };

  const handleSelectAllFailedSMS = () => {
    if (selectedFailedSMS.length === failedSMS.length) {
      setSelectedFailedSMS([]);
    } else {
      setSelectedFailedSMS(failedSMS.map((sms) => sms.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">SMS Management</h2>
            <p className="text-gray-600 mt-1">
              Manage billing SMS, retry failed messages, and view history
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === "send"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab("send")}
            >
              <Send className="inline-block w-4 h-4 mr-2" />
              Send Notifications
            </button>
            <button
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === "trigger"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab("trigger")}
            >
              <Send className="inline-block w-4 h-4 mr-2" />
              Trigger Billing SMS
            </button>
            <button
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === "failed"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab("failed")}
            >
              <AlertCircle className="inline-block w-4 h-4 mr-2" />
              Failed SMS ({failedSMS.length})
            </button>
            <button
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === "history"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab("history")}
            >
              <Clock className="inline-block w-4 h-4 mr-2" />
              SMS History
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Tab 0: Send Test Notification */}
          {activeTab === "send" && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 mr-3" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-800">
                      Send Test Notification
                    </h4>
                    <p className="mt-1 text-sm text-blue-700">
                      Sends WhatsApp first, then falls back to SMS only if WhatsApp fails or is unavailable.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Property *
                  </label>
                  <select
                    value={sendPropertyId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSendPropertyId(value);
                      fetchSendTenantsByProperty(value);
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Select property...</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name} ({property.property_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tenant *
                  </label>
                  <select
                    value={selectedSendTenantId}
                    onChange={(e) => setSelectedSendTenantId(e.target.value)}
                    disabled={!sendPropertyId || loadingSendTenants}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
                  >
                    <option value="">
                      {loadingSendTenants
                        ? "Loading tenants..."
                        : sendPropertyId
                          ? "Select tenant..."
                          : "Choose property first"}
                    </option>
                    {sendTenants.map((tenant) => (
                      <option
                        key={tenant.id || tenant.tenant_id}
                        value={tenant.id || tenant.tenant_id}
                      >
                        {tenant.first_name} {tenant.last_name} ({tenant.unit_code || "No unit"}) - {tenant.phone_number || "No phone"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <TemplatePicker
                    label="Notification Template (Optional)"
                    value={testTemplateId}
                    onChange={setTestTemplateId}
                    templates={notificationTemplates}
                    loading={loadingNotificationTemplates}
                    emptyLabel="No template (use custom message)"
                    helpText="All active WhatsApp-capable templates are listed. Select tenant first to auto-populate template variables."
                    selectClassName="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Outstanding Amount (KES)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={testAmount}
                    onChange={(e) => setTestAmount(e.target.value)}
                    placeholder="e.g. 35000"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Used for templates with <code>{"{total}"}</code>.
                  </p>
                  {selectedSendTenantId && (
                    <p className="mt-1 text-xs text-blue-600">
                      {loadingSendBalances
                        ? "Loading balance snapshot..."
                        : "Auto-filled from tenant outstanding balance (editable)."}
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message {testTemplateId ? "(Optional with template)" : "*"}
                  </label>
                  <textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    rows={4}
                    placeholder="Type your notification message..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {testMessage.length}/160 characters (plain message mode)
                  </p>
                </div>

                {testTemplateId && selectedSendTenantId && (
                  <div className="md:col-span-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase text-gray-600 mb-2">
                      Auto-populated Variables
                    </p>
                    {missingRequiredTemplateVariables.length > 0 && (
                      <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                        Missing required values: {missingRequiredTemplateVariables.join(", ")}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
                      {Object.entries(resolvedTemplateVariables || {}).map(([k, v]) => (
                        <div
                          key={k}
                          className="flex items-center justify-between rounded border border-gray-200 bg-white px-2 py-1"
                        >
                          <span className="font-mono text-gray-500">{k}</span>
                          <span className="ml-3 text-right font-medium break-all">
                            {String(v ?? "")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSendTestNotification}
                  disabled={
                    sendingTest ||
                    !sendPropertyId ||
                    !selectedSendTenantId ||
                    (!testTemplateId && !testMessage.trim()) ||
                    (testTemplateId && missingRequiredTemplateVariables.length > 0)
                  }
                  className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {sendingTest ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Test Notification
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setSendPropertyId("");
                    setSendTenants([]);
                    setSelectedSendTenantId("");
                    setTestTemplateId("");
                    setTestMessage("");
                    setTestAmount("");
                    setTestSendResult(null);
                  }}
                  className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Reset
                </button>
              </div>

              {testSendResult && (
                <div
                  className={`rounded-md p-4 ${testSendResult.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
                >
                  <div className="flex">
                    {testSendResult.type === "success" ? (
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 mr-3" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3" />
                    )}
                    <div>
                      <h4
                        className={`text-sm font-medium ${testSendResult.type === "success" ? "text-green-800" : "text-red-800"}`}
                      >
                        {testSendResult.type === "success" ? "Success" : "Error"}
                      </h4>
                      <p
                        className={`mt-1 text-sm ${testSendResult.type === "success" ? "text-green-700" : "text-red-700"}`}
                      >
                        {testSendResult.message}
                      </p>
                      {testSendResult.data && (
                        <div className="mt-3 text-sm text-gray-700">
                          <p><strong>Total:</strong> {testSendResult.data.total ?? 0}</p>
                          <p><strong>Successful:</strong> {testSendResult.data.sent ?? 0}</p>
                          <p><strong>Failed:</strong> {testSendResult.data.failed ?? 0}</p>
                          <p><strong>WhatsApp Sent:</strong> {testSendResult.data.whatsapp_sent ?? 0}</p>
                          <p><strong>WhatsApp Failed:</strong> {testSendResult.data.whatsapp_failed ?? 0}</p>
                          {!!testSendResult.data.whatsapp_errors?.length && (
                            <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                              <p className="font-semibold text-amber-800">WhatsApp failure reason</p>
                              {testSendResult.data.whatsapp_errors.slice(0, 1).map((err, idx) => (
                                <p key={idx} className="text-amber-900">
                                  {err.error}
                                  {err.code ? ` (code: ${err.code})` : ""}
                                  {err.template ? ` | template: ${err.template}` : ""}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 1: Trigger Billing SMS */}
          {activeTab === "trigger" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-gray-50 border rounded-md p-4">
                  <p className="text-xs text-gray-500">Delivered SMS</p>
                  <p className="text-xl font-semibold text-green-700">
                    {loadingStats ? "..." : (smsStats?.delivered_count ?? 0)}
                  </p>
                </div>
                <div className="bg-gray-50 border rounded-md p-4">
                  <p className="text-xs text-gray-500">Failed SMS</p>
                  <p className="text-xl font-semibold text-red-700">
                    {loadingStats ? "..." : (smsStats?.failed_count ?? 0)}
                  </p>
                </div>
                <div className="bg-gray-50 border rounded-md p-4">
                  <p className="text-xs text-gray-500">Pending SMS</p>
                  <p className="text-xl font-semibold text-yellow-700">
                    {loadingStats ? "..." : (smsStats?.pending_count ?? 0)}
                  </p>
                </div>
                <div className="bg-gray-50 border rounded-md p-4">
                  <p className="text-xs text-gray-500">Celcom Units Left</p>
                  <p className="text-xl font-semibold text-blue-700">
                    {loadingStats
                      ? "..."
                      : (smsStats?.balance?.available_units ?? "N/A")}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Est. spend: KSh{" "}
                    {Number(smsStats?.estimated_sms_spend || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-50 border rounded-md p-4">
                  <p className="text-xs text-gray-500">Payment SMS (D/F)</p>
                  <p className="text-xl font-semibold text-gray-800">
                    {loadingStats
                      ? "..."
                      : `${smsStats?.payment_sms?.delivered_count ?? 0} / ${smsStats?.payment_sms?.failed_count ?? 0}`}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Total: {smsStats?.payment_sms?.total_sms ?? 0}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Month *
                  </label>
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Property (Optional)
                  </label>
                  <select
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">All Assigned Properties</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name} ({property.property_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <TemplatePicker
                    label="Billing Template (Optional)"
                    value={selectedTemplateId}
                    onChange={setSelectedTemplateId}
                    templates={billingTemplates}
                    emptyLabel="Use system default template"
                    helpText="Agents can pick approved billing templates when override is allowed."
                    selectClassName="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 mr-3" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-800">
                      Important Notes
                    </h4>
                    <ul className="mt-2 text-sm text-blue-700 space-y-1">
                      <li>
                        • System will check for water bills before sending SMS
                      </li>
                      <li>
                        • Tenants without water bills will show in confirmation
                      </li>
                      <li>
                        • You can proceed with water amount set to 0 for missing
                        bills
                      </li>
                      <li>• SMS are queued and sent automatically</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={handleTriggerBilling}
                  disabled={loading || !month}
                  className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Billing SMS
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setMonth("");
                    setPropertyId("");
                    setSelectedTemplateId("");
                    setAutoIncludeMissingWaterBills(false);
                    setTriggerResult(null);
                    setMissingBillsConfirmation(null);
                  }}
                  className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Reset
                </button>
              </div>

              <div className="flex items-center">
                <input
                  id="autoIncludeMissingWaterBills"
                  type="checkbox"
                  checked={autoIncludeMissingWaterBills}
                  onChange={(e) =>
                    setAutoIncludeMissingWaterBills(e.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="autoIncludeMissingWaterBills"
                  className="ml-2 text-sm text-gray-700"
                >
                  Auto-include tenants with missing water bills (Water = KSh 0)
                </label>
              </div>

              {/* Result Display */}
              {triggerResult && (
                <div
                  className={`rounded-md p-4 ${triggerResult.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
                >
                  <div className="flex">
                    {triggerResult.type === "success" ? (
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 mr-3" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3" />
                    )}
                    <div>
                      <h4
                        className={`text-sm font-medium ${triggerResult.type === "success" ? "text-green-800" : "text-red-800"}`}
                      >
                        {triggerResult.type === "success"
                          ? "Success!"
                          : "Error"}
                      </h4>
                      <p
                        className={`mt-1 text-sm ${triggerResult.type === "success" ? "text-green-700" : "text-red-700"}`}
                      >
                        {triggerResult.message}
                      </p>
                      {triggerResult.data && (
                        <div className="mt-3 text-sm">
                          <p>
                            <strong>Queued:</strong> {triggerResult.data.queued}{" "}
                            SMS
                          </p>
                          <p>
                            <strong>Skipped (Fully Paid):</strong>{" "}
                            {triggerResult.data.skipped_paid || 0}
                          </p>
                          <p>
                            <strong>Properties:</strong>{" "}
                            {triggerResult.data.property_count}
                          </p>
                          <p>
                            <strong>Month:</strong> {triggerResult.data.month}
                          </p>
                          <p>
                            <strong>Missing Water Bills:</strong>{" "}
                            {triggerResult.data.missing_water_bills?.count || 0}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Missing Bills Confirmation Modal */}
              {missingBillsConfirmation && (
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                    <div className="p-6">
                      <div className="flex items-center mb-4">
                        <AlertCircle className="w-6 h-6 text-yellow-500 mr-3" />
                        <h3 className="text-lg font-medium text-gray-900">
                          Missing Water Bills
                        </h3>
                      </div>

                      <p className="text-gray-600 mb-4">
                        {missingBillsConfirmation.message}
                      </p>

                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
                        <h4 className="text-sm font-medium text-yellow-800 mb-2">
                          Tenants without water bills:
                        </h4>
                        <ul className="text-sm text-yellow-700 space-y-1 max-h-60 overflow-y-auto">
                          {missingBillsConfirmation.data.missing_tenants.map(
                            (tenant, index) => (
                              <li
                                key={index}
                                className="flex items-center justify-between py-1"
                              >
                                <span>{tenant.name}</span>
                                <span className="text-yellow-600">
                                  {tenant.unit}
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>

                      <div className="flex justify-end space-x-3">
                        <button
                          onClick={() => setMissingBillsConfirmation(null)}
                          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleProceedWithMissingBills}
                          disabled={loading}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50"
                        >
                          {loading ? "Processing..." : "Proceed Anyway"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Failed SMS Management */}
          {activeTab === "failed" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Property
                  </label>
                  <select
                    value={failedFilters.propertyId}
                    onChange={(e) =>
                      setFailedFilters((prev) => ({
                        ...prev,
                        propertyId: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">All Properties</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={failedFilters.startDate}
                    onChange={(e) =>
                      setFailedFilters((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={failedFilters.endDate}
                    onChange={(e) =>
                      setFailedFilters((prev) => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => fetchFailedSMS(failedFilters)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => {
                      const cleared = {
                        propertyId: "",
                        startDate: "",
                        endDate: "",
                      };
                      setFailedFilters(cleared);
                      fetchFailedSMS(cleared);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  Failed SMS Messages
                </h3>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600">
                    {selectedFailedSMS.length} of {failedSMS.length} selected
                  </span>
                  <button
                    onClick={handleBulkRetry}
                    disabled={selectedFailedSMS.length === 0}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Selected
                  </button>
                </div>
              </div>

              {loadingFailed ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                  <p className="mt-2 text-gray-600">Loading failed SMS...</p>
                </div>
              ) : failedSMS.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-md">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
                  <p className="mt-2 text-gray-600">No failed SMS found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={
                              selectedFailedSMS.length === failedSMS.length &&
                              failedSMS.length > 0
                            }
                            onChange={handleSelectAllFailedSMS}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tenant
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Property/Unit
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Error
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {failedSMS.map((sms) => (
                        <tr key={sms.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedFailedSMS.includes(sms.id)}
                              onChange={() => handleSelectFailedSMS(sms.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-medium text-gray-900">
                              {sms.first_name && sms.last_name
                                ? `${sms.first_name} ${sms.last_name}`
                                : "Unknown Tenant"}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900">
                              {sms.property_name || "-"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {sms.unit_code || "-"}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {sms.recipient_phone}
                          </td>
                          <td className="px-4 py-4">
                            <div
                              className="max-w-xs truncate"
                              title={sms.error_message}
                            >
                              <span className="text-sm text-red-600">
                                {sms.error_message || sms.message || "Failed delivery"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => handleRetrySMS(sms.id)}
                              disabled={
                                !(
                                  typeof sms.id === "string" &&
                                  /^[0-9a-fA-F-]{36}$/.test(sms.id)
                                )
                              }
                              className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                            >
                              Retry
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: SMS History */}
          {activeTab === "history" && (
            <div className="space-y-6">
              {smsHistorySummary && (
                <div className="text-sm text-gray-600">
                  Showing {smsHistory.length} message(s) • Total:{" "}
                  {smsHistorySummary.totalCount ?? smsHistory.length}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={historyFilters.status}
                    onChange={(e) =>
                      setHistoryFilters({
                        ...historyFilters,
                        status: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">All Status</option>
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={historyFilters.startDate}
                    onChange={(e) =>
                      setHistoryFilters({
                        ...historyFilters,
                        startDate: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={historyFilters.endDate}
                    onChange={(e) =>
                      setHistoryFilters({
                        ...historyFilters,
                        endDate: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Property
                  </label>
                  <select
                    value={historyFilters.propertyId}
                    onChange={(e) =>
                      setHistoryFilters({
                        ...historyFilters,
                        propertyId: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">All Properties</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={fetchSMSHistory}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Apply Filters
                </button>
                <button
                  onClick={() => {
                    const clearedFilters = {
                      status: "",
                      startDate: "",
                      endDate: "",
                      propertyId: "",
                    };
                    setHistoryFilters(clearedFilters);
                    fetchSMSHistoryWithFilters(clearedFilters);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Clear Filters
                </button>
              </div>

              <div className="flex gap-2 flex-wrap">
                {[
                  { id: "", label: "All" },
                  { id: "sent", label: "Sent" },
                  { id: "delivered", label: "Delivered" },
                  { id: "failed", label: "Failed" },
                  { id: "pending", label: "Pending" },
                ].map((f) => (
                  <button
                    key={f.id || "all"}
                    onClick={() => {
                      const next = { ...historyFilters, status: f.id };
                      setHistoryFilters(next);
                      fetchSMSHistoryWithFilters(next);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs border ${
                      historyFilters.status === f.id
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {loadingHistory ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                  <p className="mt-2 text-gray-600">Loading SMS history...</p>
                </div>
              ) : (Array.isArray(smsHistory) ? smsHistory : []).length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-md">
                  <p className="text-gray-600">No SMS history found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Recipient
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Message
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(Array.isArray(smsHistory) ? smsHistory : []).map((sms) => (
                        <tr key={sms.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(sms.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900">
                              {sms.recipient_phone}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                            {sms.message_type}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                sms.status === "sent" || sms.status === "delivered"
                                  ? "bg-green-100 text-green-800"
                                : sms.status === "failed"
                                  ? "bg-red-100 text-red-800"
                                  : sms.status === "pending"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {sms.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-700 whitespace-pre-wrap break-words min-w-[340px]">
                            {sms.message || "N/A"}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            {sms.status === "sent" && sms.message_id && (
                              <button
                                onClick={() => handleCheckDelivery(sms.message_id)}
                                className="text-blue-600 hover:text-blue-900 flex items-center"
                              >
                                <Eye className="w-4 h-4 mr-1" /> Status
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delivery Status Modal */}
      {showDeliveryModal && deliveryDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Delivery Status
              </h3>
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-semibold text-gray-900 capitalize">
                  {deliveryDetails.status}
                </p>
              </div>

              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-600">Delivered At</p>
                <p className="font-semibold text-gray-900">
                  {deliveryDetails.deliveredAt
                    ? new Date(deliveryDetails.deliveredAt).toLocaleString()
                    : "N/A"}
                </p>
              </div>

              {deliveryDetails.reason && (
                <div className="bg-red-50 p-3 rounded-md border border-red-100">
                  <p className="text-sm text-red-600">Reason/Error</p>
                  <p className="font-semibold text-red-800">
                    {deliveryDetails.reason}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentSMSManagement;
