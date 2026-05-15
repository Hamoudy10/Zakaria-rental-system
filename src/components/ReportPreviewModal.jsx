import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  X, FileText, FileSpreadsheet, Columns, ArrowUpDown,
  ArrowUp, ArrowDown, Eye, EyeOff, Search, RotateCcw,
  Edit3, Check, Printer, Download
} from "lucide-react";

const COLUMN_DEFS = {
  tenants: [
    { key: "#", label: "#", width: "w-12", sortable: false },
    { key: "tenantName", label: "Tenant Name", width: "min-w-[160px]", always: true },
    { key: "phone", label: "Phone", width: "min-w-[120px]", always: true },
    { key: "nationalId", label: "National ID", width: "min-w-[120px]" },
    { key: "email", label: "Email", width: "min-w-[160px]" },
    { key: "property", label: "Property", width: "min-w-[140px]", always: true },
    { key: "unit", label: "Unit", width: "min-w-[100px]", always: true },
    { key: "rent", label: "Rent (KSh)", width: "min-w-[110px]", always: true, align: "right" },
    { key: "status", label: "Status", width: "min-w-[90px]", always: true, align: "center" },
    { key: "balanceDue", label: "Balance Due (KSh)", width: "min-w-[130px]", align: "right" },
    { key: "leaseStart", label: "Lease Start", width: "min-w-[110px]" },
    { key: "leaseEnd", label: "Lease End", width: "min-w-[110px]" },
  ],
  payments: [
    { key: "#", label: "#", width: "w-12", sortable: false },
    { key: "receipt", label: "Receipt No.", width: "min-w-[140px]", always: true },
    { key: "tenantName", label: "Tenant", width: "min-w-[150px]", always: true },
    { key: "phone", label: "Phone", width: "min-w-[120px]" },
    { key: "amount", label: "Amount (KSh)", width: "min-w-[120px]", always: true, align: "right" },
    { key: "month", label: "Month", width: "min-w-[110px]", always: true },
    { key: "method", label: "Method", width: "min-w-[90px]", always: true, align: "center" },
    { key: "status", label: "Status", width: "min-w-[90px]", always: true, align: "center" },
    { key: "date", label: "Date", width: "min-w-[110px]", always: true },
    { key: "property", label: "Property", width: "min-w-[130px]" },
    { key: "unit", label: "Unit", width: "min-w-[90px]" },
    { key: "allocatedArrears", label: "Alloc. Arrears (KSh)", width: "min-w-[130px]", align: "right" },
    { key: "allocatedWater", label: "Alloc. Water (KSh)", width: "min-w-[130px]", align: "right" },
    { key: "allocatedRent", label: "Alloc. Rent (KSh)", width: "min-w-[120px]", align: "right" },
    { key: "advancePayment", label: "Advance (KSh)", width: "min-w-[110px]", align: "right" },
  ],
  revenue: [
    { key: "#", label: "#", width: "w-12", sortable: false },
    { key: "month", label: "Month", width: "min-w-[120px]", always: true },
    { key: "totalRevenue", label: "Total Revenue (KSh)", width: "min-w-[150px]", always: true, align: "right" },
    { key: "paymentCount", label: "Payments", width: "min-w-[100px]", always: true, align: "center" },
    { key: "propertyCount", label: "Properties", width: "min-w-[110px]", align: "center" },
    { key: "tenantCount", label: "Tenants", width: "min-w-[100px]", align: "center" },
    { key: "avgPayment", label: "Avg Payment (KSh)", width: "min-w-[130px]", align: "right" },
  ],
  properties: [
    { key: "#", label: "#", width: "w-12", sortable: false },
    { key: "code", label: "Code", width: "min-w-[90px]", always: true },
    { key: "name", label: "Property Name", width: "min-w-[160px]", always: true },
    { key: "address", label: "Address", width: "min-w-[180px]", always: true },
    { key: "county", label: "County", width: "min-w-[110px]" },
    { key: "town", label: "Town", width: "min-w-[110px]" },
    { key: "totalUnits", label: "Total Units", width: "min-w-[100px]", always: true, align: "center" },
    { key: "occupied", label: "Occupied", width: "min-w-[90px]", always: true, align: "center" },
    { key: "available", label: "Available", width: "min-w-[90px]", always: true, align: "center" },
    { key: "occupancy", label: "Occupancy %", width: "min-w-[100px]", align: "center" },
  ],
  complaints: [
    { key: "#", label: "#", width: "w-12", sortable: false },
    { key: "title", label: "Title", width: "min-w-[180px]", always: true },
    { key: "description", label: "Description", width: "min-w-[220px]" },
    { key: "property", label: "Property", width: "min-w-[130px]", always: true },
    { key: "unit", label: "Unit", width: "min-w-[90px]", always: true },
    { key: "tenant", label: "Tenant", width: "min-w-[140px]" },
    { key: "priority", label: "Priority", width: "min-w-[80px]", always: true, align: "center" },
    { key: "status", label: "Status", width: "min-w-[100px]", always: true, align: "center" },
    { key: "dateRaised", label: "Date Raised", width: "min-w-[110px]", always: true },
    { key: "dateResolved", label: "Date Resolved", width: "min-w-[110px]" },
    { key: "assignedAgent", label: "Assigned Agent", width: "min-w-[140px]" },
  ],
  water: [
    { key: "#", label: "#", width: "w-12", sortable: false },
    { key: "tenant", label: "Tenant", width: "min-w-[150px]", always: true },
    { key: "phone", label: "Phone", width: "min-w-[120px]" },
    { key: "property", label: "Property", width: "min-w-[130px]", always: true },
    { key: "unit", label: "Unit", width: "min-w-[90px]", always: true },
    { key: "amount", label: "Amount (KSh)", width: "min-w-[110px]", always: true, align: "right" },
    { key: "billMonth", label: "Bill Month", width: "min-w-[110px]", always: true },
    { key: "status", label: "Status", width: "min-w-[90px]", always: true, align: "center" },
    { key: "notes", label: "Notes", width: "min-w-[200px]" },
    { key: "created", label: "Created", width: "min-w-[140px]" },
  ],
  sms: [
    { key: "#", label: "#", width: "w-12", sortable: false },
    { key: "channel", label: "Channel", width: "min-w-[80px]", always: true, align: "center" },
    { key: "recipient", label: "Recipient", width: "min-w-[130px]", always: true },
    { key: "message", label: "Message", width: "min-w-[250px]", always: true },
    { key: "type", label: "Type", width: "min-w-[120px]", always: true },
    { key: "status", label: "Status", width: "min-w-[80px]", always: true, align: "center" },
    { key: "sentBy", label: "Sent By", width: "min-w-[120px]", always: true },
    { key: "date", label: "Date", width: "min-w-[150px]", always: true },
    { key: "property", label: "Property", width: "min-w-[130px]" },
    { key: "unit", label: "Unit", width: "min-w-[90px]" },
    { key: "attempts", label: "Attempts", width: "min-w-[80px]", align: "center" },
    { key: "error", label: "Error", width: "min-w-[180px]" },
    { key: "messageId", label: "Message ID", width: "min-w-[130px]" },
  ],
  expenses: [
    { key: "#", label: "#", width: "w-12", sortable: false },
    { key: "date", label: "Date", width: "min-w-[110px]", always: true },
    { key: "category", label: "Category", width: "min-w-[130px]", always: true },
    { key: "subcategory", label: "Subcategory", width: "min-w-[120px]" },
    { key: "description", label: "Description", width: "min-w-[200px]", always: true },
    { key: "property", label: "Property", width: "min-w-[130px]", always: true },
    { key: "unit", label: "Unit", width: "min-w-[90px]" },
    { key: "amount", label: "Amount (KSh)", width: "min-w-[120px]", always: true, align: "right" },
    { key: "paymentMethod", label: "Payment", width: "min-w-[100px]", align: "center" },
    { key: "vendor", label: "Vendor", width: "min-w-[130px]" },
    { key: "receiptNo", label: "Receipt No.", width: "min-w-[130px]" },
    { key: "status", label: "Status", width: "min-w-[90px]", always: true, align: "center" },
    { key: "recordedBy", label: "Recorded By", width: "min-w-[130px]" },
    { key: "notes", label: "Notes", width: "min-w-[180px]" },
  ],
};

const EXTRACTORS = {
  tenants: (item, idx) => ({
    "#": idx + 1,
    tenantName: `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.name || "N/A",
    phone: (item.phone_number || "").replace(/^254/, "0") || "N/A",
    nationalId: item.national_id || "N/A",
    email: item.email || "N/A",
    property: item.property_name || "N/A",
    unit: item.unit_code || "N/A",
    rent: `KSh ${(parseFloat(item.rent_amount || item.monthly_rent) || 0).toLocaleString()}`,
    status: item.is_active ? "Active" : "Inactive",
    balanceDue: `KSh ${(parseFloat(item.balance_due || item.arrears_balance) || 0).toLocaleString()}`,
    leaseStart: item.lease_start_date ? new Date(item.lease_start_date).toLocaleDateString("en-GB") : "N/A",
    leaseEnd: item.lease_end_date ? new Date(item.lease_end_date).toLocaleDateString("en-GB") : "N/A",
  }),
  payments: (item, idx) => ({
    "#": idx + 1,
    receipt: item.mpesa_receipt_number || item.mpesa_transaction_id || (item.payment_method === "manual" ? "MANUAL" : (item.id || "").substring(0, 8)) || "N/A",
    tenantName: item.tenant_name || `${item.first_name || ""} ${item.last_name || ""}`.trim() || "N/A",
    phone: (item.phone_number || "").replace(/^254/, "0") || "N/A",
    amount: `KSh ${(parseFloat(item.amount) || 0).toLocaleString()}`,
    month: item.payment_month ? String(item.payment_month).substring(0, 7) : "N/A",
    method: item.payment_method ? item.payment_method.charAt(0).toUpperCase() + item.payment_method.slice(1) : "N/A",
    status: item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : "Pending",
    date: item.payment_date || item.created_at ? new Date(item.payment_date || item.created_at).toLocaleDateString("en-GB") : "N/A",
    property: item.property_name || "N/A",
    unit: item.unit_code || "N/A",
    allocatedArrears: `KSh ${(parseFloat(item.allocated_to_arrears) || 0).toLocaleString()}`,
    allocatedWater: `KSh ${(parseFloat(item.allocated_to_water) || 0).toLocaleString()}`,
    allocatedRent: `KSh ${(parseFloat(item.allocated_to_rent) || 0).toLocaleString()}`,
    advancePayment: `KSh ${(parseFloat(item.is_advance_payment ? item.amount : 0) || 0).toLocaleString()}`,
  }),
  revenue: (item, idx) => ({
    "#": idx + 1,
    month: item.month ? (() => { const [y, m] = String(item.month).substring(0, 7).split("-"); return new Date(y, parseInt(m) - 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }); })() : "N/A",
    totalRevenue: `KSh ${(parseFloat(item.total_revenue) || 0).toLocaleString()}`,
    paymentCount: item.payment_count || 0,
    propertyCount: item.property_count || 0,
    tenantCount: item.tenant_count || 0,
    avgPayment: `KSh ${(parseFloat(item.average_payment) || 0).toLocaleString()}`,
  }),
  properties: (item, idx) => {
    const total = item.total_units || item.unit_count || 0;
    const occupied = item.occupied_units || 0;
    const available = item.available_units || item.available_units_count || 0;
    return {
      "#": idx + 1,
      code: item.property_code || "N/A",
      name: item.name || "N/A",
      address: item.address || "N/A",
      county: item.county || "N/A",
      town: item.town || "N/A",
      totalUnits: total,
      occupied: occupied,
      available: available,
      occupancy: total > 0 ? `${Math.round((occupied / total) * 100)}%` : "0%",
    };
  },
  complaints: (item, idx) => ({
    "#": idx + 1,
    title: item.title || "N/A",
    description: item.description || "N/A",
    property: item.property_name || "N/A",
    unit: item.unit_code || "N/A",
    tenant: item.tenant_name || `${item.first_name || ""} ${item.last_name || ""}`.trim() || "N/A",
    priority: item.priority ? item.priority.charAt(0).toUpperCase() + item.priority.slice(1) : "Medium",
    status: item.status ? item.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Open",
    dateRaised: item.raised_at || item.created_at ? new Date(item.raised_at || item.created_at).toLocaleDateString("en-GB") : "N/A",
    dateResolved: item.resolved_at ? new Date(item.resolved_at).toLocaleDateString("en-GB") : "N/A",
    assignedAgent: item.assigned_agent_name || "N/A",
  }),
  water: (item, idx) => ({
    "#": idx + 1,
    tenant: item.tenant_name || `${item.first_name || ""} ${item.last_name || ""}`.trim() || "N/A",
    phone: (item.phone_number || "").replace(/^254/, "0") || "N/A",
    property: item.property_name || "N/A",
    unit: item.unit_code || "N/A",
    amount: `KSh ${(parseFloat(item.amount) || 0).toLocaleString()}`,
    billMonth: item.bill_month ? new Date(item.bill_month).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "N/A",
    status: item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : "Billed",
    notes: item.notes || "N/A",
    created: item.created_at ? new Date(item.created_at).toLocaleString("en-GB") : "N/A",
  }),
  sms: (item, idx) => ({
    "#": idx + 1,
    channel: item.channel === "whatsapp" ? "WhatsApp" : "SMS",
    recipient: (item.recipient_phone || item.phone_number || "").replace(/^254/, "0") || "N/A",
    message: item.message || item.template_name || "N/A",
    type: (item.message_type || "general").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    status: item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : "Pending",
    sentBy: item.sent_by_name || "System",
    date: item.created_at || item.sent_at ? new Date(item.created_at || item.sent_at).toLocaleString("en-GB") : "N/A",
    property: item.property_name || "N/A",
    unit: item.unit_code || "N/A",
    attempts: item.attempts || 0,
    error: item.error_message || "",
    messageId: item.message_id || item.whatsapp_message_id || "N/A",
  }),
  expenses: (item, idx) => ({
    "#": idx + 1,
    date: item.expense_date ? new Date(item.expense_date).toLocaleDateString("en-GB") : "N/A",
    category: item.category || "N/A",
    subcategory: item.subcategory || "",
    description: item.description || "N/A",
    property: item.property_name || "General",
    unit: item.unit_code || "",
    amount: `KSh ${(parseFloat(item.amount) || 0).toLocaleString()}`,
    paymentMethod: (item.payment_method || "cash").toUpperCase(),
    vendor: item.vendor_name || "",
    receiptNo: item.receipt_number || "",
    status: item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : "Pending",
    recordedBy: item.recorded_by_name || "N/A",
    notes: item.notes || "",
  }),
};

const ReportPreviewModal = ({
  isOpen,
  onClose,
  reportType,
  reportTitle,
  data,
  filters,
  onExportPDF,
  onExportExcel,
}) => {
  const columnDefs = COLUMN_DEFS[reportType] || [];
  const extractor = EXTRACTORS[reportType];

  const [visibleColumns, setVisibleColumns] = useState({});
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editedData, setEditedData] = useState([]);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  useEffect(() => {
    if (isOpen && columnDefs.length > 0) {
      const initialVis = {};
      columnDefs.forEach((col) => {
        initialVis[col.key] = col.always !== false;
      });
      setVisibleColumns(initialVis);
      setSortKey(null);
      setSortDir("asc");
      setSearchTerm("");
      setEditingCell(null);
      setShowColumnPicker(false);
    }
  }, [isOpen, reportType]);

  useEffect(() => {
    if (data && extractor) {
      setEditedData(data.map((item, idx) => extractor(item, idx)));
    }
  }, [data, extractor]);

  const toggleColumn = useCallback((key) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSort = useCallback((key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

  const startEdit = useCallback((rowIdx, colKey, value) => {
    setEditingCell({ row: rowIdx, col: colKey });
    setEditValue(String(value || ""));
  }, []);

  const commitEdit = useCallback(() => {
    if (editingCell) {
      setEditedData((prev) => {
        const updated = [...prev];
        updated[editingCell.row] = {
          ...updated[editingCell.row],
          [editingCell.col]: editValue,
        };
        return updated;
      });
    }
    setEditingCell(null);
    setEditValue("");
  }, [editingCell, editValue]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const activeColumns = useMemo(
    () => columnDefs.filter((col) => visibleColumns[col.key]),
    [columnDefs, visibleColumns]
  );

  const activeColumnKeys = useMemo(
    () => activeColumns.map((c) => c.key),
    [activeColumns]
  );

  const filteredAndSortedData = useMemo(() => {
    let result = [...editedData];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((row) =>
        activeColumnKeys.some((key) =>
          String(row[key] || "").toLowerCase().includes(term)
        )
      );
    }
    if (sortKey) {
      result.sort((a, b) => {
        const va = String(a[sortKey] || "");
        const vb = String(b[sortKey] || "");
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return result;
  }, [editedData, searchTerm, sortKey, sortDir, activeColumnKeys]);

  const handleExportPDF = useCallback(() => {
    if (onExportPDF) {
      onExportPDF(filteredAndSortedData, activeColumnKeys, visibleColumns);
    }
  }, [onExportPDF, filteredAndSortedData, activeColumnKeys, visibleColumns]);

  const handleExportExcel = useCallback(() => {
    if (onExportExcel) {
      onExportExcel(filteredAndSortedData, activeColumnKeys, visibleColumns);
    }
  }, [onExportExcel, filteredAndSortedData, activeColumnKeys, visibleColumns]);

  const getAlignClass = (align) => {
    if (align === "right") return "text-right";
    if (align === "center") return "text-center";
    return "text-left";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto pt-4 pb-6">
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-[95vw] mx-4 my-2 flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-600" />
              Preview: {reportTitle}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {filteredAndSortedData.length} of {editedData.length} records
              {sortKey && ` • Sorted by ${activeColumns.find(c => c.key === sortKey)?.label || sortKey}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                showColumnPicker
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Columns className="w-4 h-4" />
              Columns
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              disabled={filteredAndSortedData.length === 0}
            >
              <FileText className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              disabled={filteredAndSortedData.length === 0}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Column Picker */}
        {showColumnPicker && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
            <div className="flex flex-wrap gap-2">
              {columnDefs.map((col) => (
                <label
                  key={col.key}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    visibleColumns[col.key]
                      ? "bg-blue-100 text-blue-800 border border-blue-300"
                      : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!visibleColumns[col.key]}
                    onChange={() => toggleColumn(col.key)}
                    className="sr-only"
                  />
                  {visibleColumns[col.key] ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                  {col.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search within preview..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                {activeColumns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                    className={`px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap select-none ${
                      col.sortable !== false ? "cursor-pointer hover:bg-gray-200" : ""
                    } ${col.width || ""}`}
                  >
                    <div className={`flex items-center gap-1 ${getAlignClass(col.align)}`}>
                      {getAlignClass(col.align) === "text-right" ? (
                        <>
                          {sortKey === col.key && (
                            sortDir === "asc" ? <ArrowUp className="w-3 h-3 flex-shrink-0" /> : <ArrowDown className="w-3 h-3 flex-shrink-0" />
                          )}
                          {col.label}
                        </>
                      ) : (
                        <>
                          {col.label}
                          {sortKey === col.key && (
                            sortDir === "asc" ? <ArrowUp className="w-3 h-3 flex-shrink-0" /> : <ArrowDown className="w-3 h-3 flex-shrink-0" />
                          )}
                        </>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredAndSortedData.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length} className="px-6 py-12 text-center text-gray-500">
                    No matching records with current filters and columns
                  </td>
                </tr>
              ) : (
                filteredAndSortedData.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-blue-50/50 transition-colors">
                    {activeColumns.map((col) => {
                      const cellValue = row[col.key];
                      const isEditing =
                        editingCell &&
                        editingCell.row === rowIdx &&
                        editingCell.col === col.key;
                      return (
                        <td
                          key={col.key}
                          className={`px-3 py-2 text-sm text-gray-700 ${col.width || ""} ${getAlignClass(col.align)}`}
                          onDoubleClick={() => col.key !== "#" && startEdit(rowIdx, col.key, cellValue)}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitEdit();
                                  if (e.key === "Escape") cancelEdit();
                                }}
                                autoFocus
                                className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <button onClick={commitEdit} className="p-0.5 text-green-600 hover:text-green-800">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={cancelEdit} className="p-0.5 text-red-600 hover:text-red-800">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className={col.key !== "#" ? "cursor-pointer hover:text-blue-600" : ""} title="Double-click to edit">
                              {col.align === "center" ? (
                                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                                  String(cellValue).toLowerCase().includes("active") || String(cellValue).toLowerCase().includes("paid") || String(cellValue).toLowerCase().includes("completed") || String(cellValue).toLowerCase().includes("resolved") || String(cellValue).toLowerCase().includes("sent")
                                    ? "bg-green-100 text-green-800"
                                    : String(cellValue).toLowerCase().includes("pending") || String(cellValue).toLowerCase().includes("billed") || String(cellValue).toLowerCase().includes("in_progress")
                                    ? "bg-yellow-100 text-yellow-800"
                                    : String(cellValue).toLowerCase().includes("failed") || String(cellValue).toLowerCase().includes("rejected") || String(cellValue).toLowerCase().includes("high")
                                    ? "bg-red-100 text-red-800"
                                    : ""
                                }`}>
                                  {cellValue}
                                </span>
                              ) : (
                                cellValue
                              )}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>
              <span className="font-medium">{filteredAndSortedData.length}</span> records visible
              {searchTerm && ` • Filtered from ${editedData.length}`}
            </span>
            {activeColumns.length < columnDefs.length && (
              <span className="text-blue-600">
                {activeColumns.length} of {columnDefs.length} columns shown
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSearchTerm("");
                const initialVis = {};
                columnDefs.forEach((col) => {
                  initialVis[col.key] = true;
                });
                setVisibleColumns(initialVis);
                setSortKey(null);
                setSortDir("asc");
                setEditValue("");
                setEditingCell(null);
                setEditedData(data.map((item, idx) => extractor(item, idx)));
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <div className="flex gap-1">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                disabled={filteredAndSortedData.length === 0}
              >
                <Printer className="w-4 h-4" />
                PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                disabled={filteredAndSortedData.length === 0}
              >
                <Download className="w-4 h-4" />
                Excel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportPreviewModal;
