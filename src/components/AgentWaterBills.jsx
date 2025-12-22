// src/components/AgentWaterBills.jsx
import React, { useEffect, useState } from 'react';
import agentService from '../services/AgentService';

const AgentWaterBills = () => {
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({
    propertyId: '',
    unitId: '',
    tenantId: '',
    tenantName: '', // New field for tenant's full name
    amount: '',
    billMonth: '', // YYYY-MM
    notes: ''
  });
  const [recentBills, setRecentBills] = useState([]);

  useEffect(() => {
    // Load assigned properties and tenants
    const load = async () => {
      try {
        const p = await agentService.getAssignedProperties().catch(err => { console.error('getAssignedProperties error', err); return null; });
        const propertiesData = p?.data?.data || p?.data || [];
        setProperties(Array.isArray(propertiesData) ? propertiesData : []);

        // We no longer fetch tenants list because agents will type tenant full name
        /*
        const t = await agentService.getTenantsWithPaymentStatus().catch(err => { console.error('getTenantsWithPaymentStatus error', err); return null; });
        const tenantsData = t?.data?.data || t?.data || [];
        setTenants(Array.isArray(tenantsData) ? tenantsData : []);
        */

        // Optionally preload recent bills
        const b = await agentService.listWaterBills({ limit: 10 }).catch(err => { console.error('listWaterBills error', err); return null; });
        const billsData = b?.data?.data || b?.data || [];
        setRecentBills(Array.isArray(billsData) ? billsData : []);
      } catch (err) {
        console.error('Failed to load agent data', err);
      }
    };
    load();
  }, []);

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async (e) => {
    e?.preventDefault();
    setMessage(null);

    if (!form.tenantName || !form.propertyId || !form.amount || !form.billMonth) {
      setMessage({ type: 'error', text: 'Please fill required fields' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        tenantId: form.tenantId || null, // legacy (if you keep selecting ids)
        tenantName: form.tenantName || null,
        unitId: form.unitId || null,
        propertyId: form.propertyId,
        amount: parseFloat(form.amount),
        billMonth: form.billMonth,
        notes: form.notes || null
      };

      const res = await agentService.createWaterBill(payload);
      if (res?.data?.success) {
        setMessage({ type: 'success', text: 'Water bill saved' });
        // Refresh list
        const b = await agentService.listWaterBills({ limit: 10 });
        setRecentBills(b.data || []);
      } else {
        setMessage({ type: 'error', text: res?.data?.message || 'Failed to save' });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: err?.response?.data?.message || err.message || 'Error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header (3 parts height: 3) */}
      <div className="p-4 bg-white rounded-t-md shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Add Monthly Water Bill</h3>
          <p className="text-sm text-gray-500">Create or update the tenant's monthly water bill</p>
        </div>
        <div className="text-sm text-gray-400">
          {/* quick timestamp */}
          {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date())}
        </div>
      </div>

      {/* Body (5 parts) */}
      <form onSubmit={submit} className="p-4 bg-white border-t border-b">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Property */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Property <span className="text-red-500">*</span></label>
            <select
              value={form.propertyId}
              onChange={e => update('propertyId', e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded"
            >
              <option value="">Select property</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Tenant (free-text full name) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tenant Full Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.tenantName || ''}
              onChange={e => update('tenantName', e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded"
              placeholder="e.g. John Doe (must match tenant in system)"
            />
            <p className="text-xs text-gray-400 mt-1">Type the tenant's full name as it appears in the system (required).</p>
          </div>

          {/* Unit (optional) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unit (optional)</label>
            <input value={form.unitId} onChange={e => update('unitId', e.target.value)} className="w-full px-3 py-2 text-sm border rounded" placeholder="unit id (optional)" />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KSh) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" value={form.amount} onChange={e => update('amount', e.target.value)} className="w-full px-3 py-2 text-sm border rounded" />
          </div>

          {/* Month */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bill Month <span className="text-red-500">*</span></label>
            <input
              type="month"
              value={form.billMonth}
              onChange={e => update('billMonth', e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded"
            />
          </div>

          {/* Notes */}
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)} className="w-full px-3 py-2 text-sm border rounded" rows={2} />
          </div>
        </div>
      </form>

      {/* Footer (2 parts) */}
      <div className="p-4 bg-white rounded-b-md flex items-center justify-between border-t">
        <div>
          {message && (
            <div className={`px-3 py-2 rounded text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={submit} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60">
            {loading ? 'Saving...' : 'Save Water Bill'}
          </button>

          <button onClick={async () => {
            // quick refresh
            try {
              const b = await agentService.listWaterBills({ limit: 10 });
              const billsData = b?.data?.data || b?.data || [];
              setRecentBills(Array.isArray(billsData) ? billsData : []);
              setMessage({ type: 'success', text: 'Refreshed' });
            } catch (err) {
              setMessage({ type: 'error', text: 'Refresh failed' });
            }
          }} className="px-3 py-2 border rounded text-sm">Refresh</button>
        </div>
      </div>

      {/* Recent bills (small) */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold mb-2">Recent water bills</h4>
        <div className="bg-white rounded shadow-sm divide-y">
          {recentBills.length === 0 && <div className="p-3 text-xs text-gray-500">No bills yet</div>}
          {recentBills.map(b => (
            <div key={b.id} className="p-3 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{b.first_name} {b.last_name}</div>
                <div className="text-gray-500">{b.unit_code || '—'} • {(() => {
  const s = b.bill_month || '';
  const dt = new Date(s.length === 7 ? `${s}-01` : s);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(dt);
})()} • KSh {parseFloat(b.amount).toLocaleString()}</div>
              </div>
              <div className="text-gray-400 text-xs">{new Date(b.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AgentWaterBills;