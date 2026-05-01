import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API } from "../services/api";
import { exportToPDF } from "../utils/pdfExport";
import { exportToExcel } from "../utils/excelExport";
import { Download, FileSpreadsheet, FileText, Filter, RefreshCw } from "lucide-react";

const toDateInput = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-KE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const summarizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object") return "";
  const parts = [];
  if (metadata.tenant_name) parts.push(`Tenant: ${metadata.tenant_name}`);
  if (metadata.from_unit_code && metadata.to_unit_code) {
    parts.push(`Unit: ${metadata.from_unit_code} -> ${metadata.to_unit_code}`);
  }
  if (metadata.transfer_mode) parts.push(`Mode: ${metadata.transfer_mode}`);
  if (metadata.reason) parts.push(`Reason: ${metadata.reason}`);
  if (metadata.closed_active_allocations !== undefined) {
    parts.push(`Closed allocations: ${metadata.closed_active_allocations}`);
  }
  return parts.join(" | ");
};

const AdminAuditTrail = () => {
  const [filters, setFilters] = useState({
    from_date: toDateInput(new Date(new Date().setDate(new Date().getDate() - 30))),
    to_date: toDateInput(new Date()),
    module: "",
    action: "",
    actor_user_id: "",
    search: "",
  });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filterOptions, setFilterOptions] = useState({
    modules: [],
    actions: [],
    actors: [],
  });

  const fetchLogs = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError("");
      try {
        const response = await API.audit.getLogs({
          ...filters,
          page,
          limit: 50,
        });
        if (response.data?.success) {
          const payload = response.data.data || {};
          setLogs(Array.isArray(payload.logs) ? payload.logs : []);
          setFilterOptions(payload.filters || { modules: [], actions: [], actors: [] });
          setPagination(payload.pagination || { page: 1, totalPages: 1, total: 0 });
        } else {
          setError("Failed to load audit logs.");
        }
      } catch (err) {
        console.error("Audit logs fetch failed:", err);
        setError(err.response?.data?.message || "Failed to load audit logs.");
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const exportRows = useMemo(
    () =>
      logs.map((log, idx) => ({
        no: idx + 1,
        timestamp: formatDateTime(log.created_at),
        actor: log.actor_name?.trim() || "System",
        actorEmail: log.actor_email || "N/A",
        module: log.module || "N/A",
        action: log.action || "N/A",
        entityType: log.entity_type || "N/A",
        entityId: log.entity_id || "N/A",
        statusCode: log.response_status ?? "N/A",
        requestMethod: log.request_method || "N/A",
        requestPath: log.request_path || "N/A",
        metadataSummary: summarizeMetadata(log.metadata),
      })),
    [logs],
  );

  const handleExport = async (format) => {
    if (!exportRows.length) return;

    const config = {
      reportType: "audit_logs",
      data: exportRows,
      title: "System Audit Trail",
      filters,
    };
    if (format === "pdf") await exportToPDF(config);
    else await exportToExcel(config);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Audit Trail</h2>
          <p className="text-sm text-gray-600">
            Filter administrative events, review transfer/archive actions, and export results.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("pdf")}
            disabled={!logs.length}
            className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
          <button
            onClick={() => handleExport("excel")}
            disabled={!logs.length}
            className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg border">
        <input
          type="date"
          value={filters.from_date}
          onChange={(e) => setFilters((prev) => ({ ...prev, from_date: e.target.value }))}
          className="border rounded px-2 py-2 text-sm"
        />
        <input
          type="date"
          value={filters.to_date}
          onChange={(e) => setFilters((prev) => ({ ...prev, to_date: e.target.value }))}
          className="border rounded px-2 py-2 text-sm"
        />
        <select
          value={filters.module}
          onChange={(e) => setFilters((prev) => ({ ...prev, module: e.target.value }))}
          className="border rounded px-2 py-2 text-sm"
        >
          <option value="">All modules</option>
          {filterOptions.modules.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={filters.action}
          onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
          className="border rounded px-2 py-2 text-sm"
        >
          <option value="">All actions</option>
          {filterOptions.actions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={filters.actor_user_id}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, actor_user_id: e.target.value }))
          }
          className="border rounded px-2 py-2 text-sm"
        >
          <option value="">All actors</option>
          {filterOptions.actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name || actor.email || actor.id}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="text"
            value={filters.search}
            placeholder="Search..."
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            className="border rounded px-2 py-2 text-sm w-full"
          />
          <button
            onClick={() => fetchLogs(1)}
            className="px-3 py-2 rounded bg-blue-600 text-white inline-flex items-center gap-1"
            title="Apply filters"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={() => fetchLogs(pagination.page || 1)}
            className="px-3 py-2 rounded border border-gray-300 text-gray-700 inline-flex items-center gap-1"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error ? <div className="text-red-600 text-sm">{error}</div> : null}

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-2 text-left">Time</th>
                <th className="p-2 text-left">Actor</th>
                <th className="p-2 text-left">Module</th>
                <th className="p-2 text-left">Action</th>
                <th className="p-2 text-left">Entity</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Summary</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={7}>
                    Loading audit logs...
                  </td>
                </tr>
              ) : !logs.length ? (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={7}>
                    No audit entries found for current filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td className="p-2">
                      <div className="font-medium text-gray-800">
                        {log.actor_name?.trim() || "System"}
                      </div>
                      <div className="text-xs text-gray-500">{log.actor_email || ""}</div>
                    </td>
                    <td className="p-2">{log.module || "N/A"}</td>
                    <td className="p-2">{log.action || "N/A"}</td>
                    <td className="p-2">
                      <div>{log.entity_type || "N/A"}</div>
                      <div className="text-xs text-gray-500">{log.entity_id || ""}</div>
                    </td>
                    <td className="p-2">{log.response_status ?? "N/A"}</td>
                    <td className="p-2 max-w-[420px]">
                      <div className="truncate" title={summarizeMetadata(log.metadata)}>
                        {summarizeMetadata(log.metadata) || log.request_path || "N/A"}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          Total entries: <span className="font-semibold">{pagination.total || 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLogs(Math.max(1, (pagination.page || 1) - 1))}
            disabled={(pagination.page || 1) <= 1}
            className="px-2 py-1 border rounded disabled:opacity-50"
          >
            Prev
          </button>
          <span>
            Page {pagination.page || 1} / {pagination.totalPages || 1}
          </span>
          <button
            onClick={() =>
              fetchLogs(
                Math.min(
                  pagination.totalPages || 1,
                  (pagination.page || 1) + 1,
                ),
              )
            }
            disabled={(pagination.page || 1) >= (pagination.totalPages || 1)}
            className="px-2 py-1 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminAuditTrail;

