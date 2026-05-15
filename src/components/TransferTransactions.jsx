import React, { useState, useCallback } from "react";
import { API } from "../services/api";

const TransferTransactions = () => {
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceResults, setSourceResults] = useState([]);
  const [sourceTenant, setSourceTenant] = useState(null);

  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState(new Set());
  const [receiptSearch, setReceiptSearch] = useState("");

  const [destSearch, setDestSearch] = useState("");
  const [destResults, setDestResults] = useState([]);
  const [destTenant, setDestTenant] = useState(null);

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
    setSelectedPayments(new Set());
    setResult(null);
    setError("");
    setPaymentsLoading(true);
    try {
      const res = await API.payments.getPaymentHistory(tenant.id, { limit: 500 });
      const data = res.data?.data?.payments || res.data?.data || [];
      setPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Failed to load payments: " + (err.response?.data?.message || err.message));
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const togglePayment = (id) => {
    setSelectedPayments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const filtered = filteredPayments;
    if (selectedPayments.size === filtered.length) {
      setSelectedPayments(new Set());
    } else {
      setSelectedPayments(new Set(filtered.map(p => p.id)));
    }
  };

  const selectDest = (tenant) => {
    setDestTenant(tenant);
    setDestResults([]);
    setDestSearch("");
  };

  const handleSubmit = async () => {
    if (!sourceTenant || !destTenant) { setError("Both tenants required"); return; }
    if (selectedPayments.size === 0) { setError("Select at least one transaction"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const paymentIds = Array.from(selectedPayments);
      const res = await API.payments.transferTenantTransactions({
        source_tenant_id: sourceTenant.id,
        destination_tenant_id: destTenant.id,
        source_unit_id: payments.find(p => paymentIds.includes(p.id))?.unit_id || payments[0]?.unit_id,
        destination_unit_id: payments.find(p => paymentIds.includes(p.id))?.unit_id || payments[0]?.unit_id,
        payment_ids: paymentIds,
        transfer_payments: true,
        transfer_water_bills: false,
      });
      if (res.data?.success) {
        setResult(res.data);
        setSelectedPayments(new Set());
        setPayments([]);
        setSourceTenant(null);
        setDestTenant(null);
      } else {
        setError(res.data?.message || "Transfer failed");
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Transfer failed");
    } finally { setLoading(false); }
  };

  const filteredPayments = payments.filter(p => {
    if (!receiptSearch) return true;
    const q = receiptSearch.toLowerCase();
    return (
      (p.mpesa_receipt_number || "").toLowerCase().includes(q) ||
      (p.mpesa_transaction_id || "").toLowerCase().includes(q) ||
      (p.phone_number || "").includes(q) ||
      String(p.amount || "").includes(q)
    );
  });

  const selectedAmount = Array.from(selectedPayments).reduce((sum, id) => {
    const p = payments.find(x => x.id === id);
    return sum + (parseFloat(p?.amount) || 0);
  }, 0);

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-GB") : "N/A";
  const formatPhone = (p) => (p || "").replace(/^254/, "0") || "N/A";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transfer Transactions</h1>
        <p className="text-gray-600 mt-1">Select specific transactions and move them to another tenant. Balances recalculate automatically.</p>
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

      {/* Step 1: Source Tenant */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-lg mb-4 text-red-700">Step 1: Source Tenant</h2>
        {sourceTenant ? (
          <div className="p-4 bg-red-50 rounded-lg flex justify-between items-center">
            <div>
              <p className="font-bold text-lg">{sourceTenant.first_name} {sourceTenant.last_name}</p>
              <p className="text-sm text-gray-600">{formatPhone(sourceTenant.phone_number)}</p>
            </div>
            <button onClick={() => { setSourceTenant(null); setPayments([]); setSelectedPayments(new Set()); }} className="text-red-600 hover:text-red-800 font-medium">Change</button>
          </div>
        ) : (
          <div>
            <input type="text" placeholder="Search source tenant by name or phone..." value={sourceSearch}
              onChange={(e) => { setSourceSearch(e.target.value); handleSearch(e.target.value, setSourceResults); }}
              className="w-full rounded-lg border border-gray-300 px-4 py-3" />
            {sourceResults.length > 0 && (
              <div className="mt-1 border rounded-lg shadow divide-y max-h-48 overflow-y-auto">
                {sourceResults.map(t => (
                  <button key={t.id} onClick={() => selectSource(t)} className="w-full text-left px-4 py-3 hover:bg-gray-50">
                    <span className="font-medium">{t.first_name} {t.last_name}</span>
                    <span className="text-gray-500 ml-2 text-sm">{formatPhone(t.phone_number)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Select Transactions */}
      {sourceTenant && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-lg mb-4">
            Step 2: Select Transactions
            {payments.length > 0 && <span className="text-gray-500 font-normal text-sm ml-2">({payments.length} total)</span>}
          </h2>

          {paymentsLoading ? (
            <div className="flex items-center justify-center py-8"><div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : payments.length === 0 ? (
            <p className="text-gray-500 py-4">No payments found for this tenant.</p>
          ) : (
            <>
              <div className="flex gap-4 mb-4 flex-wrap items-center">
                <input type="text" placeholder="Filter by receipt number, phone, amount..."
                  value={receiptSearch} onChange={(e) => setReceiptSearch(e.target.value)}
                  className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-4 py-2 text-sm" />
                <button onClick={toggleAll} className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">
                  {selectedPayments.size === filteredPayments.length ? "Deselect All" : "Select All"}
                </button>
                <span className="text-sm text-gray-500">
                  {selectedPayments.size} selected · KSh {selectedAmount.toLocaleString()}
                </span>
              </div>

              <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-10"><input type="checkbox" checked={selectedPayments.size === filteredPayments.length && filteredPayments.length > 0} onChange={toggleAll} /></th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Receipt No.</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Phone</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Amount</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Month</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Method</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredPayments.map(p => (
                      <tr key={p.id} className={`cursor-pointer hover:bg-amber-50 ${selectedPayments.has(p.id) ? "bg-amber-50" : ""}`} onClick={() => togglePayment(p.id)}>
                        <td className="px-3 py-2"><input type="checkbox" checked={selectedPayments.has(p.id)} readOnly className="pointer-events-none" /></td>
                        <td className="px-3 py-2 font-mono text-xs">{p.mpesa_receipt_number || p.mpesa_transaction_id || (p.id || "").substring(0, 8)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(p.payment_date || p.created_at)}</td>
                        <td className="px-3 py-2">{formatPhone(p.phone_number)}</td>
                        <td className="px-3 py-2 text-right font-medium">KSh {(parseFloat(p.amount) || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{String(p.payment_month || "").substring(0, 7)}</td>
                        <td className="px-3 py-2 capitalize">{(p.payment_method || "N/A").replace(/_/g, " ")}</td>
                        <td className="px-3 py-2 capitalize">{p.status || "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Destination Tenant */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-lg mb-4 text-green-700">Step 3: Destination Tenant</h2>
        {destTenant ? (
          <div className="p-4 bg-green-50 rounded-lg flex justify-between items-center">
            <div>
              <p className="font-bold text-lg">{destTenant.first_name} {destTenant.last_name}</p>
              <p className="text-sm text-gray-600">{formatPhone(destTenant.phone_number)}</p>
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
                    <span className="text-gray-500 ml-2 text-sm">{formatPhone(t.phone_number)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit */}
      <button onClick={handleSubmit}
        disabled={loading || !sourceTenant || !destTenant || selectedPayments.size === 0}
        className="w-full py-3.5 bg-amber-600 text-white rounded-xl font-bold text-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Transferring {selectedPayments.size} transactions...</> : `Transfer ${selectedPayments.size} Transaction${selectedPayments.size !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
};

export default TransferTransactions;
