// /src/components/AgentReports.jsx - FIXED SMS/WHATSAPP REPORT WITH PROPER API CALLS
import React, { useState, useEffect } from "react";
import api, { API } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Users,
  CreditCard,
  TrendingUp,
  Building,
  AlertCircle,
  Droplets,
  MessageSquare,
  FileText,
  FileSpreadsheet,
  Calendar,
  Filter,
  Search,
  AlertTriangle,
  RefreshCw,
  Phone,
  MessageCircle,
  CheckCircle,
  Clock,
  XCircle,
  SkipForward,
} from "lucide-react";
import { exportToPDF } from "../utils/pdfExport";
import { exportToExcel } from "../utils/excelExport";

const AgentReports = () => {
  const { user } = useAuth();
  const [activeReport, setActiveReport] = useState("tenants");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    propertyId: "",
    status: "",
    search: "",
  });

  // SMS/WhatsApp specific filters
  const [messagingFilters, setMessagingFilters] = useState({
    status: "all",
    channel: "all",
  });
  const [messagingSummary, setMessagingSummary] = useState({
    totalCount: 0,
    channelCounts: { sms: 0, whatsapp: 0 },
    statusCounts: { sent: 0, pending: 0, failed: 0, skipped: 0 },
  });

  const [companyInfo, setCompanyInfo] = useState({
    name: "Zakaria Housing Agency Limited",
    logo: null,
  });
  const [apiErrors, setApiErrors] = useState([]);
  const [availableProperties, setAvailableProperties] = useState([]);

  const reportTypes = [
    {
      id: "tenants",
      name: "Tenants Report",
      icon: Users,
      color: "bg-blue-500",
    },
    {
      id: "payments",
      name: "Payments Report",
      icon: CreditCard,
      color: "bg-green-500",
    },
    {
      id: "revenue",
      name: "Revenue Report",
      icon: TrendingUp,
      color: "bg-purple-500",
    },
    {
      id: "properties",
      name: "Properties Report",
      icon: Building,
      color: "bg-orange-500",
    },
    {
      id: "complaints",
      name: "Complaints Report",
      icon: AlertCircle,
      color: "bg-red-500",
    },
    {
      id: "water",
      name: "Water Bills Report",
      icon: Droplets,
      color: "bg-cyan-500",
    },
    {
      id: "sms",
      name: "SMS/WhatsApp Report",
      icon: MessageSquare,
      color: "bg-indigo-500",
    },
  ];

  // Helper function to extract array from various response formats
  const extractDataArray = (response, reportType) => {
    console.log(`🔍 Extracting data for ${reportType}:`, response);

    if (!response?.data?.success) {
      console.warn(`⚠️ Response not successful for ${reportType}`);
      return [];
    }

    const responseData = response.data.data;

    // If it's already an array, return it
    if (Array.isArray(responseData)) {
      console.log(
        `✅ Direct array found for ${reportType}:`,
        responseData.length,
        "items",
      );
      return responseData;
    }

    // If it's an object, try to find the array inside
    if (typeof responseData === "object" && responseData !== null) {
      console.log(
        `🔎 Searching for array in object for ${reportType}:`,
        Object.keys(responseData),
      );

      // Check for common array keys based on report type
      const possibleKeys = {
        payments: ["payments", "data", "records"],
        tenants: ["tenants", "data", "records"],
        properties: ["properties", "data", "records"],
        complaints: ["complaints", "data", "records"],
        water: ["waterBills", "bills", "data", "records"],
        sms: ["messages", "history", "sms", "data", "records"],
        revenue: ["revenue", "data", "records"],
      };

      const keysToCheck = possibleKeys[reportType] || ["data", "records"];

      for (const key of keysToCheck) {
        if (Array.isArray(responseData[key])) {
          console.log(
            `✅ Found array in key '${key}' for ${reportType}:`,
            responseData[key].length,
            "items",
          );
          return responseData[key];
        }
      }

      console.warn(
        `⚠️ No array found in expected keys for ${reportType}. Available keys:`,
        Object.keys(responseData),
      );
    }

    return [];
  };

  // Fetch company settings from admin settings
  useEffect(() => {
    const fetchCompanyInfo = async () => {
      try {
        const response = await API.settings.getCompanyInfo();
        if (response.data?.success && response.data?.data) {
          const info = response.data.data;
          setCompanyInfo({
            name: info.name || "Zakaria Housing Agency Limited",
            logo: info.logo || null,
            email: info.email || "",
            phone: info.phone || "",
            address: info.address || "",
          });
        }
      } catch (error) {
        console.warn("Could not fetch company info:", error);
        setCompanyInfo((prev) => ({
          ...prev,
          name: "Zakaria Housing Agency Limited",
        }));
      }
    };

    fetchCompanyInfo();
  }, []);

  // Fetch available properties for agent
  useEffect(() => {
    const fetchAgentProperties = async () => {
      try {
        const response = await API.properties.getAgentProperties();
        if (response.data?.success) {
          setAvailableProperties(response.data.data);
        }
      } catch (error) {
        console.error("Failed to fetch agent properties:", error);
        setAvailableProperties([]);
      }
    };

    fetchAgentProperties();
  }, []);

  // Safe API call wrapper
  const safeAPICall = async (apiFunction, fallbackData = []) => {
    try {
      if (typeof apiFunction === "function") {
        console.log("🔗 Making API call...");
        const response = await apiFunction();
        console.log("✅ API Response:", response);
        return response;
      }
      throw new Error("API function not available");
    } catch (error) {
      console.error("❌ API call failed:", error);
      return {
        data: {
          success: false,
          message: error.message,
          data: fallbackData,
        },
      };
    }
  };

  // Helper to calculate revenue from payments
  const calculateRevenue = (payments) => {
    if (!Array.isArray(payments)) {
      console.warn("⚠️ calculateRevenue received non-array:", payments);
      return [];
    }

    const revenueByMonth = payments.reduce((acc, payment) => {
      const month =
        payment.payment_month ||
        payment.created_at?.substring(0, 7) ||
        new Date().toISOString().substring(0, 7);

      if (!acc[month]) {
        acc[month] = {
          month,
          total_revenue: 0,
          payment_count: 0,
          properties: new Set(),
          tenants: new Set(),
        };
      }

      acc[month].total_revenue += parseFloat(payment.amount || 0);
      acc[month].payment_count += 1;

      if (payment.property_name)
        acc[month].properties.add(payment.property_name);
      if (payment.tenant_name || payment.first_name) {
        const tenantName =
          payment.tenant_name ||
          `${payment.first_name || ""} ${payment.last_name || ""}`.trim();
        if (tenantName) acc[month].tenants.add(tenantName);
      }

      return acc;
    }, {});

    return Object.values(revenueByMonth).map((item) => ({
      ...item,
      property_count: item.properties.size,
      tenant_count: item.tenants.size,
      average_payment:
        item.payment_count > 0 ? item.total_revenue / item.payment_count : 0,
    }));
  };

  // Build filter params object (only non-empty values)
  const buildFilterParams = () => {
    const params = {};
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.propertyId) params.propertyId = filters.propertyId;
    if (filters.status) params.status = filters.status;
    if (filters.search) params.search = filters.search;
    return params;
  };

  // Fetch SMS/WhatsApp history using the correct endpoint
  const fetchMessagingHistory = async () => {
    setLoading(true);
    setApiErrors([]);

    try {
      console.log("📱 Fetching messaging history...");

      const params = {
        ...buildFilterParams(),
        limit: 100, // Get more records for reports
      };

      // Add messaging-specific filters
      if (messagingFilters.status && messagingFilters.status !== "all") {
        params.status = messagingFilters.status;
      }
      if (messagingFilters.channel && messagingFilters.channel !== "all") {
        params.channel = messagingFilters.channel;
      }

      // Use the correct endpoint: /notifications/sms-history
      // The API.notifications.getSMSHistory points to this endpoint
      const response = await API.notifications.getSMSHistory(params);

      console.log("📦 Messaging history response:", response);

      if (response?.data?.success) {
        // Extract messages array - could be 'messages' or 'history'
        const messages =
          response.data.data?.messages || response.data.data?.history || [];
        setData(messages);

        // Set summary if available
        if (response.data.data?.summary) {
          setMessagingSummary(response.data.data.summary);
        } else {
          // Calculate summary from data
          const statusCounts = { sent: 0, pending: 0, failed: 0, skipped: 0 };
          const channelCounts = { sms: 0, whatsapp: 0 };

          messages.forEach((msg) => {
            if (msg.status && statusCounts[msg.status] !== undefined) {
              statusCounts[msg.status]++;
            }
            if (msg.channel === "whatsapp") {
              channelCounts.whatsapp++;
            } else {
              channelCounts.sms++;
            }
          });

          setMessagingSummary({
            totalCount: messages.length,
            statusCounts,
            channelCounts,
          });
        }

        console.log(`✅ Loaded ${messages.length} messaging records`);
      } else {
        console.warn(
          "❌ Messaging history fetch failed:",
          response?.data?.message,
        );
        setData([]);
        setApiErrors((prev) => [
          ...prev,
          `sms report: ${response?.data?.message || "API endpoint may not exist"}`,
        ]);
      }
    } catch (error) {
      console.error("❌ Messaging history error:", error);
      setData([]);
      setApiErrors((prev) => [...prev, `Error: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch report data based on active report
  const fetchReportData = async () => {
    // Special handling for SMS/WhatsApp report
    if (activeReport === "sms") {
      await fetchMessagingHistory();
      return;
    }

    setLoading(true);
    setApiErrors([]);

    try {
      console.log("📥 Fetching report data for:", activeReport);

      let response;
      const params = buildFilterParams();

      switch (activeReport) {
        case "tenants":
          try {
            response = await api.get("/agent-properties/my-tenants", {
              params,
            });
            response = { data: response.data };
          } catch (err) {
            console.error("Tenants API error:", err);
            response = {
              data: {
                success: false,
                message: err.response?.data?.message || err.message,
                data: [],
              },
            };
          }
          break;

        case "payments":
          response = await safeAPICall(() => API.payments.getPayments(params));
          break;

        case "properties":
          response = await safeAPICall(() =>
            API.properties.getAgentProperties(),
          );
          break;

        case "complaints":
          try {
            response = await api.get("/agent-properties/my-complaints", {
              params,
            });
            response = { data: response.data };
          } catch (err) {
            console.error("Complaints API error:", err);
            response = {
              data: {
                success: false,
                message: err.response?.data?.message || err.message,
                data: [],
              },
            };
          }
          break;

        case "water":
          try {
            response = await api.get("/agent-properties/water-bills", {
              params: { ...params, limit: 5000, offset: 0 },
            });
            response = { data: response.data };
          } catch (err) {
            console.error("Water bills API error:", err);
            response = {
              data: {
                success: false,
                message: err.response?.data?.message || err.message,
                data: [],
              },
            };
          }
          break;

        case "revenue":
          const paymentsResponse = await safeAPICall(() =>
            API.payments.getPayments(params),
          );
          if (paymentsResponse.data?.success) {
            const paymentsArray = extractDataArray(
              paymentsResponse,
              "payments",
            );
            const revenueData = calculateRevenue(paymentsArray);
            response = { data: { success: true, data: revenueData } };
          } else {
            response = { data: { success: false, data: [] } };
          }
          break;

        default:
          response = { data: { success: true, data: [] } };
      }

      console.log("📦 Raw response for", activeReport, ":", response);

      if (response?.data?.success) {
        const extractedData = extractDataArray(response, activeReport);
        setData(extractedData);
        console.log(
          `✅ Loaded ${extractedData.length} records for ${activeReport} report`,
        );
      } else {
        console.warn(
          "❌ Report fetch failed:",
          response?.data?.message || "Unknown error",
        );
        setData([]);
        setApiErrors((prev) => [
          ...prev,
          `${activeReport} report: ${response?.data?.message || "API endpoint may not exist"}`,
        ]);
      }
    } catch (error) {
      console.error("❌ Fetch error:", error);
      setData([]);
      setApiErrors((prev) => [...prev, `Error: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when report type changes
  useEffect(() => {
    fetchReportData();
  }, [activeReport]);

  // Debounced filter change handler
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReportData();
    }, 500);

    return () => clearTimeout(timer);
  }, [filters]);

  // Fetch when messaging filters change (only for SMS report)
  useEffect(() => {
    if (activeReport === "sms") {
      fetchMessagingHistory();
    }
  }, [messagingFilters]);

  const handleExport = async (format) => {
    const fetchExportData = async () => {
      const params = buildFilterParams();
      const EXPORT_LIMIT = 5000;

      const extractPaginatedArray = (response, type) => {
        const extracted = extractDataArray(response, type);
        return Array.isArray(extracted) ? extracted : [];
      };

      switch (activeReport) {
        case "payments": {
          let page = 1;
          let totalPages = 1;
          const allRows = [];
          do {
            const resp = await safeAPICall(() =>
              API.payments.getPayments({ ...params, page, limit: EXPORT_LIMIT }),
            );
            const rows = extractPaginatedArray(resp, "payments");
            allRows.push(...rows);
            totalPages = resp?.data?.data?.pagination?.totalPages || 1;
            page += 1;
          } while (page <= totalPages);
          return allRows;
        }

        case "water": {
          const resp = await safeAPICall(() =>
            api.get("/agent-properties/water-bills", {
              params: { ...params, limit: EXPORT_LIMIT, offset: 0 },
            }),
          );
          return extractPaginatedArray(resp, "water");
        }

        case "sms": {
          let page = 1;
          let totalPages = 1;
          const allRows = [];
          do {
            const smsParams = {
              ...params,
              page,
              limit: 1000,
              ...(messagingFilters.status !== "all" && {
                status: messagingFilters.status,
              }),
              ...(messagingFilters.channel !== "all" && {
                channel: messagingFilters.channel,
              }),
            };
            const resp = await safeAPICall(() =>
              API.notifications.getSMSHistory(smsParams),
            );
            const rows =
              resp?.data?.data?.messages ||
              resp?.data?.data?.history ||
              extractPaginatedArray(resp, "sms");
            allRows.push(...(Array.isArray(rows) ? rows : []));
            totalPages = resp?.data?.data?.pagination?.totalPages || 1;
            page += 1;
          } while (page <= totalPages);
          return allRows;
        }

        case "revenue": {
          let page = 1;
          let totalPages = 1;
          const allPayments = [];
          do {
            const resp = await safeAPICall(() =>
              API.payments.getPayments({ ...params, page, limit: EXPORT_LIMIT }),
            );
            allPayments.push(...extractPaginatedArray(resp, "payments"));
            totalPages = resp?.data?.data?.pagination?.totalPages || 1;
            page += 1;
          } while (page <= totalPages);
          return calculateRevenue(allPayments);
        }

        case "tenants": {
          const resp = await safeAPICall(() =>
            api.get("/agent-properties/my-tenants", { params }),
          );
          return extractPaginatedArray(resp, "tenants");
        }

        case "complaints": {
          const resp = await safeAPICall(() =>
            api.get("/agent-properties/my-complaints", { params }),
          );
          return extractPaginatedArray(resp, "complaints");
        }

        case "properties": {
          const resp = await safeAPICall(() => API.properties.getAgentProperties());
          return extractPaginatedArray(resp, "properties");
        }

        default:
          return Array.isArray(data) ? data : [];
      }
    };

    let exportData = [];
    try {
      exportData = await fetchExportData();
    } catch (e) {
      console.warn("Falling back to loaded data for export:", e);
      exportData = Array.isArray(data) ? data : [];
    }

    if (!Array.isArray(exportData) || exportData.length === 0) {
      alert(
        "No data to export. Please wait for data to load or check if the report has any records.",
      );
      return;
    }

    try {
      const reportTitle = reportTypes.find((r) => r.id === activeReport)?.name;

      if (format === "pdf") {
        await exportToPDF({
          reportType: activeReport,
          data: exportData,
          filters: filters,
          companyInfo: companyInfo,
          user: user,
          title: reportTitle,
        });
      } else if (format === "excel") {
        await exportToExcel({
          reportType: activeReport,
          data: exportData,
          filters: filters,
          companyInfo: companyInfo,
          user: user,
          title: reportTitle,
        });
      }
    } catch (error) {
      console.error("Export error:", error);
      alert(
        `Export failed: ${error.message}\n\nPlease check that jspdf-autotable is installed:\nnpm install jspdf-autotable`,
      );
    }
  };

  // Render messaging status filter tabs
  const renderMessagingFilters = () => {
    const statusTabs = [
      {
        id: "all",
        label: "All",
        icon: MessageSquare,
        count: messagingSummary.totalCount,
      },
      {
        id: "sent",
        label: "Sent",
        icon: CheckCircle,
        count: messagingSummary.statusCounts?.sent || 0,
        color: "text-green-600",
      },
      {
        id: "pending",
        label: "Pending",
        icon: Clock,
        count: messagingSummary.statusCounts?.pending || 0,
        color: "text-yellow-600",
      },
      {
        id: "failed",
        label: "Failed",
        icon: XCircle,
        count: messagingSummary.statusCounts?.failed || 0,
        color: "text-red-600",
      },
      {
        id: "skipped",
        label: "Skipped",
        icon: SkipForward,
        count: messagingSummary.statusCounts?.skipped || 0,
        color: "text-gray-500",
      },
    ];

    const channelTabs = [
      { id: "all", label: "All Channels", icon: MessageSquare },
      {
        id: "sms",
        label: "SMS Only",
        icon: Phone,
        count: messagingSummary.channelCounts?.sms || 0,
      },
      {
        id: "whatsapp",
        label: "WhatsApp Only",
        icon: MessageCircle,
        count: messagingSummary.channelCounts?.whatsapp || 0,
      },
    ];

    return (
      <div className="mb-4 space-y-3">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium text-gray-500 self-center mr-2">
            Status:
          </span>
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setMessagingFilters((prev) => ({ ...prev, status: tab.id }))
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                messagingFilters.status === tab.id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <tab.icon
                className={`w-4 h-4 ${messagingFilters.status !== tab.id && tab.color ? tab.color : ""}`}
              />
              {tab.label}
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                  messagingFilters.status === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Channel Tabs */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium text-gray-500 self-center mr-2">
            Channel:
          </span>
          {channelTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setMessagingFilters((prev) => ({ ...prev, channel: tab.id }))
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                messagingFilters.channel === tab.id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                    messagingFilters.channel === tab.id
                      ? "bg-white/20 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderFilters = () => {
    return (
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        {/* Messaging-specific filters for SMS report */}
        {activeReport === "sms" && renderMessagingFilters()}

        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="self-center">to</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {availableProperties.length > 0 && activeReport !== "sms" && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property
              </label>
              <select
                value={filters.propertyId}
                onChange={(e) =>
                  setFilters({ ...filters, propertyId: e.target.value })
                }
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Properties</option>
                {availableProperties.map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name} ({prop.property_code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={
                  activeReport === "sms"
                    ? "Search phone or message..."
                    : "Search..."
                }
                value={filters.search}
                onChange={(e) =>
                  setFilters({ ...filters, search: e.target.value })
                }
                className="block w-full pl-10 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={fetchReportData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setFilters({
                startDate: "",
                endDate: "",
                propertyId: "",
                status: "",
                search: "",
              });
              setMessagingFilters({ status: "all", channel: "all" });
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>
      </div>
    );
  };

  // Render SMS/WhatsApp Table
  const renderMessagingTable = () => {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Channel
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Recipient
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Message
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sent By
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, index) => {
              const isWhatsApp =
                item.channel === "whatsapp" || item.template_name;

              return (
                <tr key={item.id || index} className="hover:bg-gray-50">
                  {/* Channel */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium w-fit ${
                        isWhatsApp
                          ? "bg-green-100 text-green-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {isWhatsApp ? (
                        <>
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </>
                      ) : (
                        <>
                          <Phone className="w-3.5 h-3.5" />
                          SMS
                        </>
                      )}
                    </div>
                  </td>

                  {/* Recipient */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {item.recipient_phone?.replace(/^254/, "0") || "N/A"}
                  </td>

                  {/* Message */}
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                    <div className="truncate" title={item.message}>
                      {item.message || item.template_name || "N/A"}
                    </div>
                    {item.template_name && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Template: {item.template_name}
                      </div>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    <span className="capitalize">
                      {item.message_type?.replace(/_/g, " ") || "General"}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex items-center gap-1 text-xs font-semibold rounded-full ${
                        item.status === "sent"
                          ? "bg-green-100 text-green-800"
                          : item.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : item.status === "skipped"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-red-100 text-red-800"
                      }`}
                    >
                      {item.status === "sent" && (
                        <CheckCircle className="w-3 h-3" />
                      )}
                      {item.status === "pending" && (
                        <Clock className="w-3 h-3" />
                      )}
                      {item.status === "failed" && (
                        <XCircle className="w-3 h-3" />
                      )}
                      {item.status === "skipped" && (
                        <SkipForward className="w-3 h-3" />
                      )}
                      {item.status || "Pending"}
                    </span>
                    {item.error_message && item.status === "failed" && (
                      <div
                        className="text-xs text-red-500 mt-1 max-w-[200px] truncate"
                        title={item.error_message}
                      >
                        {item.error_message}
                      </div>
                    )}
                  </td>

                  {/* Sent By */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {item.sent_by_name || "System"}
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString()
                        : "N/A"}
                    </div>
                    <div className="text-xs text-gray-400">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleTimeString()
                        : ""}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTable = () => {
    const formatDisplayDate = (...dateCandidates) => {
      const rawDate = dateCandidates.find((d) => !!d);
      if (!rawDate) return "N/A";
      const parsed = new Date(rawDate);
      return Number.isNaN(parsed.getTime())
        ? "N/A"
        : parsed.toLocaleDateString();
    };

    if (loading) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="ml-3 text-gray-600">Loading report data...</div>
        </div>
      );
    }

    if (!Array.isArray(data) || data.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-2">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
            No data available for this report
          </div>
          <div className="text-sm text-gray-500 mb-4">
            This could be because:
            <ul className="mt-2 text-left max-w-md mx-auto">
              <li>• No records exist for this report type</li>
              <li>• Backend endpoint needs to be configured</li>
              <li>• Your filters are too restrictive</li>
            </ul>
          </div>
          {apiErrors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg text-left max-w-md mx-auto">
              <div className="text-sm font-medium text-red-800">
                Debug Info:
              </div>
              <div className="text-xs text-red-600 mt-1">
                {apiErrors.map((error, idx) => (
                  <div key={idx}>• {error}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Use specialized table for SMS/WhatsApp
    if (activeReport === "sms") {
      return renderMessagingTable();
    }

    // Render different tables based on report type
    switch (activeReport) {
      case "tenants":
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.slice(0, 10).map((item, index) => (
                  <tr key={item.id || index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.first_name || item.name} {item.last_name || ""}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.phone_number?.replace(/^254/, "0") || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.property_name || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.unit_code || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      KSh{" "}
                      {(
                        parseFloat(item.rent_amount || item.monthly_rent) || 0
                      ).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          item.is_active || item.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {item.is_active ? "Active" : item.status || "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "payments":
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Receipt
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Month
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.slice(0, 10).map((item, index) => (
                  <tr key={item.id || index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.mpesa_receipt_number ||
                        item.id?.substring(0, 8) ||
                        "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.tenant_name ||
                        `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
                        "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      KSh {(parseFloat(item.amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.payment_month || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          item.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : item.status === "pending"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {item.status || "Pending"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDisplayDate(
                        item.payment_date,
                        item.created_at,
                        item.updated_at,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "properties":
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Units
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Occupied
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Available
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.slice(0, 10).map((item, index) => (
                  <tr key={item.id || index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.property_code || item.id?.substring(0, 8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.address || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.total_units || item.unit_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.occupied_units || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.available_units || item.available_units_count || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "complaints":
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.slice(0, 10).map((item, index) => (
                  <tr key={item.id || index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.title || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.property_name || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.unit_code || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          item.priority === "high"
                            ? "bg-red-100 text-red-800"
                            : item.priority === "medium"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-green-100 text-green-800"
                        }`}
                      >
                        {item.priority || "Medium"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          item.status === "resolved"
                            ? "bg-green-100 text-green-800"
                            : item.status === "in_progress"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {item.status || "Open"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDisplayDate(
                        item.raised_at,
                        item.created_at,
                        item.updated_at,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "water":
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bill Month
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item, index) => (
                  <tr key={item.id || index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.tenant_name ||
                        `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
                        "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.property_name || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.unit_code || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.phone_number || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      KSh {(parseFloat(item.amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.bill_month
                        ? new Date(item.bill_month).toLocaleDateString("en-GB", {
                            month: "short",
                            year: "numeric",
                          })
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          item.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {item.status || "Billed"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                      {item.notes || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString()
                        : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "revenue":
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Month
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Revenue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payments
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Properties
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenants
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Payment
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.slice(0, 10).map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.month || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      KSh{" "}
                      {(parseFloat(item.total_revenue) || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.payment_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.property_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.tenant_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      KSh{" "}
                      {(parseFloat(item.average_payment) || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      default:
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.slice(0, 10).map((item, index) => (
                  <tr key={item.id || index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.id?.substring(0, 8) || index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.name ||
                        item.first_name ||
                        item.tenant_name ||
                        "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          item.status === "completed" ||
                          item.status === "active"
                            ? "bg-green-100 text-green-800"
                            : item.status === "pending"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {item.status || "Active"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      KSh {(parseFloat(item.amount) || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  };

  const getReportStats = () => {
    if (!Array.isArray(data)) {
      console.warn("⚠️ getReportStats: data is not an array:", data);
      return { count: 0, totalAmount: 0 };
    }

    const count = data.length;
    let totalAmount = 0;

    if (activeReport === "payments" || activeReport === "revenue") {
      totalAmount = data.reduce(
        (sum, item) =>
          sum + (parseFloat(item.amount || item.total_revenue) || 0),
        0,
      );
    } else if (activeReport === "tenants") {
      totalAmount = data.reduce(
        (sum, item) =>
          sum + (parseFloat(item.rent_amount || item.monthly_rent) || 0),
        0,
      );
    } else if (activeReport === "water") {
      totalAmount = data.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0,
      );
    }

    return { count, totalAmount };
  };

  const stats = getReportStats();

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">
            Generate and export detailed reports for your assigned properties
          </p>
          {apiErrors.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-sm text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              Some features may need backend configuration
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-4 md:mt-0">
          <button
            onClick={() => handleExport("pdf")}
            disabled={!Array.isArray(data) || data.length === 0 || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              !Array.isArray(data) || data.length === 0 || loading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
          <button
            onClick={() => handleExport("excel")}
            disabled={!Array.isArray(data) || data.length === 0 || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              !Array.isArray(data) || data.length === 0 || loading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Report Type Selection */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-6">
        {reportTypes.map((report) => (
          <button
            key={report.id}
            onClick={() => setActiveReport(report.id)}
            disabled={loading}
            className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
              activeReport === report.id
                ? `${report.color} text-white border-transparent shadow-md`
                : loading
                  ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-sm"
            }`}
          >
            <report.icon className="w-5 h-5 mb-2" />
            <span className="text-xs font-medium text-center">
              {report.name}
            </span>
          </button>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Total Records</div>
          <div className="text-2xl font-bold mt-1">{stats.count}</div>
          <div className="text-xs text-gray-400 mt-1">in this report</div>
        </div>

        {/* Show channel breakdown for SMS report */}
        {activeReport === "sms" ? (
          <>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-500">By Channel</div>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <span className="font-bold">
                    {messagingSummary.channelCounts?.sms || 0}
                  </span>
                  <span className="text-xs text-gray-500">SMS</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-green-600" />
                  <span className="font-bold">
                    {messagingSummary.channelCounts?.whatsapp || 0}
                  </span>
                  <span className="text-xs text-gray-500">WhatsApp</span>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-500">Delivery Status</div>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="flex items-center gap-1 text-sm">
                  <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  <span className="font-medium">
                    {messagingSummary.statusCounts?.sent || 0}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-sm">
                  <Clock className="w-3.5 h-3.5 text-yellow-600" />
                  <span className="font-medium">
                    {messagingSummary.statusCounts?.pending || 0}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-sm">
                  <XCircle className="w-3.5 h-3.5 text-red-600" />
                  <span className="font-medium">
                    {messagingSummary.statusCounts?.failed || 0}
                  </span>
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {(activeReport === "payments" ||
              activeReport === "revenue" ||
              activeReport === "tenants" ||
              activeReport === "water") && (
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="text-sm text-gray-500">Total Amount</div>
                <div className="text-2xl font-bold mt-1 text-green-600">
                  KSh {stats.totalAmount.toLocaleString()}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  sum of all amounts
                </div>
              </div>
            )}
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-500">Generated By</div>
              <div className="text-lg font-medium mt-1">
                {user?.first_name} {user?.last_name}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {user?.role || "agent"}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Report Content */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {reportTypes.find((r) => r.id === activeReport)?.name}
            </h2>
            <div className="text-sm text-gray-500">
              Generated: {new Date().toLocaleDateString()}{" "}
              {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>

        <div className="p-6">{renderTable()}</div>

        {/* Export info footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              {Array.isArray(data) ? data.length : 0} records • Export to PDF or
              Excel
            </div>
              <div className="text-xs text-gray-400">
                {activeReport === "sms"
                  ? `Showing ${Math.min(Array.isArray(data) ? data.length : 0, 100)} messages`
                  : activeReport === "water"
                    ? `Showing all ${Array.isArray(data) ? data.length : 0} records`
                    : `Showing first ${Math.min(Array.isArray(data) ? data.length : 0, 10)} of ${Array.isArray(data) ? data.length : 0} records`}
              </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-2">
          <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Building className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="font-medium">{companyInfo.name}</div>
            <div>Agent Reports System • {new Date().getFullYear()}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentReports;
