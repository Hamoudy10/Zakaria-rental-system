import React, { useState } from "react";
import { API } from "../services/api";
import { useAuth } from "../context/AuthContext";

const TransferTransactions = () => {
  const { user } = useAuth();

  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceResults, setSourceResults] = useState([]);
  const [sourceTenant, setSourceTenant] = useState(null);
  const [sourceUnits, setSourceUnits] = useState([]);
  const [sourceUnitId, setSourceUnitId] = useState("");

  const [destSearch, setDestSearch] = useState("");
  const [destResults, setDestResults] = useState([]);
  const [destTenant, setDestTenant] = useState(null);

  const [transferPayments, setTransferPayments] = useState(true);
  const [transferWater, setTransferWater] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleSearch = async (query, setFn) => {
    if (!query || query.length < 2) { setFn([]); return; }
    try {
      const res = await API.tenants.getTenants({ search: query, limit: 10 });
      const tenants = res.data?.data?.tenants || res.data?.data || [];
      setFn(Array.isArray(tenants) ? tenants : []);
    } catch { setFn([]); }
  };

  const selectSource = async (tenant) => {
    setSourceTenant(tenant);
    setSourceResults([]);
    setSourceSearch("");
    setSourceUnitId("");
    try {
      const res = await API.allocations.getAllocationsByTenantId(tenant.id);
      const allocs = res.data?.data || [];
      const active = Array.isArray(allocs) ? allocs.filter(a => a.is_active) : [];
      setSourceUnits(active);
      if (active.length === 1) setSourceUnitId(active[0].unit_id);
    } catch { setSourceUnits([]); }
  };

  const selectDest = (tenant) => {
    setDestTenant(tenant);
    setDestResults([]);
    setDestSearch("");
  };

  const handleSubmit = async () => {
    if (!sourceTenant || !destTenant) { setError("Both tenants required"); return; }
    if (!sourceUnitId) { setError("Source unit required"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await API.payments.transferTenantTransactions({
        source_tenant_id: sourceTenant.id,
        destination_tenant_id: destTenant.id,
        source_unit_id: sourceUnitId,
        destination_unit_id: sourceUnitId,
        transfer_payments: transferPayments,
        transfer_water_bills: transferWater,
      });
      if (res.data?.success) {
        setResult(res.data);
        setSourceTenant(null); setSourceUnits([]); setSourceUnitId("");
        setDestTenant(null);
      } else {
        setError(res.data?.message || "Transfer failed");
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Transfer failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transfer Transactions</h1>
        <p className="text-gray-600 mt-1">Move rent payments and water bills from one tenant to another</p>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">{error}</div>}
      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="font-medium text-green-800">{result.message}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>Payments: <strong>{result.data?.payments_transferred || 0}</strong></div>
            <div>Amount: <strong>KSh {((result.data?.payments_amount || 0)).toLocaleString()}</strong></div>
          </div>
        </div>
      )}

      {/* Source */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-lg mb-4 text-red-700">Source Tenant (from)</h2>
        {sourceTenant ? (
          <div className="p-4 bg-red-50 rounded-lg flex justify-between items-center">
            <div>
              <p className="font-bold text-lg">{sourceTenant.first_name} {sourceTenant.last_name}</p>
              <p className="text-sm text-gray-600">{sourceTenant.phone_number?.replace(/^254/, "0")}</p>
            </div>
            <button onClick={() => { setSourceTenant(null); setSourceUnits([]); setSourceUnitId(""); }} className="text-red-600 hover:text-red-800 font-medium">Change</button>
          </div>
        ) : (
          <div>
            <input type="text" placeholder="Search tenant by name or phone..." value={sourceSearch}
              onChange={(e) => { setSourceSearch(e.target.value); handleSearch(e.target.value, setSourceResults); }}
              className="w-full rounded-lg border border-gray-300 px-4 py-3" />
            {sourceResults.length > 0 && (
              <div className="mt-1 border rounded-lg shadow divide-y max-h-48 overflow-y-auto">
                {sourceResults.map(t => (
                  <button key={t.id} onClick={() => selectSource(t)} className="w-full text-left px-4 py-3 hover:bg-gray-50">
                    <span className="font-medium">{t.first_name} {t.last_name}</span>
                    <span className="text-gray-500 ml-2 text-sm">{t.phone_number?.replace(/^254/, "0")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {sourceTenant && sourceUnits.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Source Unit</label>
            <select value={sourceUnitId} onChange={(e) => setSourceUnitId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5">
              <option value="">Select unit...</option>
              {sourceUnits.map(a => (
                <option key={a.id} value={a.unit_id}>{a.unit_code} — KSh {(a.monthly_rent || 0).toLocaleString()}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Destination */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-lg mb-4 text-green-700">Destination Tenant (to)</h2>
        {destTenant ? (
          <div className="p-4 bg-green-50 rounded-lg flex justify-between items-center">
            <div>
              <p className="font-bold text-lg">{destTenant.first_name} {destTenant.last_name}</p>
              <p className="text-sm text-gray-600">{destTenant.phone_number?.replace(/^254/, "0")}</p>
            </div>
            <button onClick={() => setDestTenant(null)} className="text-red-600 hover:text-red-800 font-medium">Change</button>
          </div>
        ) : (
          <div>
            <input type="text" placeholder="Search destination tenant..." value={destSearch}
              onChange={(e) => { setDestSearch(e.target.value); handleSearch(e.target.value, setDestResults); }}
              className="w-full rounded-lg border border-gray-300 px-4 py-3" />
            {destResults.length > 0 && (
              <div className="mt-1 border rounded-lg shadow divide-y max-h-48 overflow-y-auto">
                {destResults.map(t => (
                  <button key={t.id} onClick={() => selectDest(t)} className="w-full text-left px-4 py-3 hover:bg-gray-50">
                    <span className="font-medium">{t.first_name} {t.last_name}</span>
                    <span className="text-gray-500 ml-2 text-sm">{t.phone_number?.replace(/^254/, "0")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Options */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-lg mb-4">Transfer Options</h2>
        <label className="flex items-center gap-3 mb-3 cursor-pointer">
          <input type="checkbox" checked={transferPayments} onChange={(e) => setTransferPayments(e.target.checked)}
            className="w-4 h-4 text-amber-600 rounded" />
          <div><p className="font-medium">Transfer rent payments</p><p className="text-sm text-gray-500">All payments for the source unit will be moved</p></div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={transferWater} onChange={(e) => setTransferWater(e.target.checked)}
            className="w-4 h-4 text-amber-600 rounded" />
          <div><p className="font-medium">Transfer water bills</p><p className="text-sm text-gray-500">Water bills will also be transferred</p></div>
        </label>
      </div>

      {/* Submit */}
      <button onClick={handleSubmit}
        disabled={loading || !sourceTenant || !destTenant || !sourceUnitId}
        className="w-full py-3.5 bg-amber-600 text-white rounded-xl font-bold text-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Transferring...</> : "Transfer Transactions"}
      </button>
    </div>
  );
};

export default TransferTransactions;
