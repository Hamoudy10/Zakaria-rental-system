// src/components/AgentWaterBills.jsx
import React, { useEffect, useState, useMemo } from 'react';
import agentService from '../services/AgentService';

const AgentWaterBills = () => {
  const [properties, setProperties] = useState([]);
  const [allTenants, setAllTenants] = useState([]);
  const [propertyTenants, setPropertyTenants] = useState([]);
  const [recentBills, setRecentBills] = useState([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const [form, setForm] = useState({
    propertyId: '',
    tenantId: '',
    tenantName: '',
    unitId: '',
    amount: '',
    notes: ''
  });

  const [waterBalance, setWaterBalance] = useState({
    loading: false,
    arrears: 0,
    advance: 0
  });

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  // Load properties, tenants, and recent bills on mount
  useEffect(() => {
    const load = async () => {
      try {
        // Assigned properties
        const p = await agentService.getAssignedProperties().catch(err => {
          console.error('getAssignedProperties error', err);
          return null;
        });
        const propertiesData = p?.data?.data || p?.data || [];
        setProperties(Array.isArray(propertiesData) ? propertiesData : []);

        // All tenants for this agent
        const t = await agentService.getTenantsWithPaymentStatus().catch(err => {
          console.error('getTenantsWithPaymentStatus error', err);
          return null;
        });
        const tenantsData = t?.data?.data || t?.data || [];
        setAllTenants(Array.isArray(tenantsData) ? tenantsData : []);

        // Recent water bills
        const b = await agentService.listWaterBills({ limit: 10 }).catch(err => {
          console.error('listWaterBills error', err);
          return null;
        });
        const billsData = b?.data?.data || b?.data || [];
        setRecentBills(Array.isArray(billsData) ? billsData : []);
      } catch (err) {
        console.error('Failed to load agent data', err);
      }
    };
    load();
  }, []);

  // Filter tenants when property changes
  const handlePropertyChange = (e) => {
    const propertyId = e.target.value;
    update('propertyId', propertyId);

    const filtered = Array.isArray(allTenants)
      ? allTenants.filter(t => t.property_id === propertyId)
      : [];

    setPropertyTenants(filtered);

    // Reset tenant & unit on property change
    setForm(prev => ({
      ...prev,
      tenantId: '',
      tenantName: '',
      unitId: ''
    }));
    setWaterBalance({ loading: false, arrears: 0, advance: 0 });
  };

  const selectedTenant = useMemo(
    () => propertyTenants.find(t => t.id === form.tenantId) || null,
    [propertyTenants, form.tenantId]
  );

  const selectedUnitCode = selectedTenant?.unit_code || '';

  // Fetch real water balance from backend
  const updateWaterBalanceForTenant = async (tenantId) => {
    if (!tenantId) {
      setWaterBalance({ loading: false, arrears: 0, advance: 0 });
      return;
    }
    setWaterBalance({ loading: true, arrears: 0, advance: 0 });
    try {
      const res = await agentService.getWaterBalance(tenantId);
      if (res?.data?.success) {
        const { arrears = 0, advance = 0 } = res.data.data || {};
        setWaterBalance({
          loading: false,
          arrears: parseFloat(arrears) || 0,
          advance: parseFloat(advance) || 0
        });
      } else {
        setWaterBalance({ loading: false, arrears: 0, advance: 0 });
      }
    } catch (err) {
      console.error('getWaterBalance error', err);
      setWaterBalance({ loading: false, arrears: 0, advance: 0 });
    }
  };

  const handleTenantChange = (e) => {
    const tenantId = e.target.value;
    const tenant = propertyTenants.find(t => t.id === tenantId) || null;

    setForm(prev => ({
      ...prev,
      tenantId,
      tenantName: tenant ? `${tenant.first_name || ''} ${tenant.last_name || ''}`.trim() : '',
      unitId: tenant?.unit_id || ''
    }));

    updateWaterBalanceForTenant(tenantId);
  };

  const submit = async (e) => {
    e?.preventDefault();
    setMessage(null);

    if (!form.propertyId || !form.tenantId || !form.amount) {
      setMessage({ type: 'error', text: 'Please select property, tenant, and enter amount' });
      return;
    }

    setLoading(true);
    try {
      // Use current month in YYYY-MM, backend will append "-01"
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const billMonth = `${yyyy}-${mm}`;

      const payload = {
        tenantId: form.tenantId || null,
        tenantName: form.tenantName || null,
        unitId: form.unitId || null,  // UUID
        propertyId: form.propertyId,
        amount: parseFloat(form.amount),
        billMonth,                     // backend will store as YYYY-MM-01
        notes: form.notes || null
      };

      const res = await agentService.createWaterBill(payload);
      if (res?.data?.success) {
        setMessage({ type: 'success', text: 'Water bill saved successfully' });
        // Refresh recent list
        const b = await agentService.listWaterBills({ limit: 10 });
        const billsData = b?.data?.data || b?.data || [];
        setRecentBills(Array.isArray(billsData) ? billsData : []);
        // Reset form
        setForm({
          propertyId: '',
          tenantId: '',
          tenantName: '',
          unitId: '',
          amount: '',
          notes: ''
        });
        setPropertyTenants([]);
        setWaterBalance({ loading: false, arrears: 0, advance: 0 });
      } else {
        setMessage({ type: 'error', text: res?.data?.message || 'Failed to save water bill' });
      }
    } catch (err) {
      console.error(err);
      setMessage({
        type: 'error',
        text: err?.response?.data?.message || err.message || 'Error saving water bill'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatMonth = (monthStr) => {
    if (!monthStr) return '';
    const date = new Date(monthStr); // bill_month is a DATE (e.g., "2026-01-01")
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-4 bg-white rounded-t-md shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Water Bill Management</h3>
          <p className="text-sm text-gray-500">Create and manage water bills for tenants</p>
        </div>
        <div className="text-sm text-gray-400">
          {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date())}
        </div>
      </div>

      {/* Water Bill Form */}
      <form onSubmit={submit} className="p-4 bg-white border-t border-b">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Property */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Property <span className="text-red-500">*</span>
            </label>
            <select
              value={form.propertyId}
              onChange={handlePropertyChange}
              className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select property</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Tenant */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tenant Full Name <span className="text-red-500">*</span>
            </label>
            <select
              value={form.tenantId}
              onChange={handleTenantChange}
              disabled={!form.propertyId || propertyTenants.length === 0}
              className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              required
            >
              <option value="">
                {form.propertyId
                  ? propertyTenants.length === 0
                    ? 'No tenants found for this property'
                    : 'Select tenant'
                  : 'Select property first'}
              </option>
              {propertyTenants.map(t => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name} ({t.unit_code || 'No unit'})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Open the list and type to jump to a tenant.
            </p>
          </div>

          {/* Unit (auto-filled) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Unit (Optional, auto-filled)
            </label>
            <input 
              value={selectedUnitCode}
              readOnly
              className="w-full px-3 py-2 text-sm border rounded bg-gray-50 text-gray-700"
              placeholder="Auto-filled from tenant"
            />
            <p className="text-xs text-gray-400 mt-1">
              This is the unit where the selected tenant currently stays.
            </p>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Amount (KSh) <span className="text-red-500">*</span>
            </label>
            <input 
              type="number" 
              step="0.01" 
              min="0"
              value={form.amount} 
              onChange={e => update('amount', e.target.value)} 
              className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              required
            />
          </div>

          {/* Water Balance (Arrears / Advance) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Water Balance (Arrears / Advance)
            </label>
            <div className="w-full px-3 py-2 text-sm border rounded bg-gray-50 text-gray-700">
              {waterBalance.loading
                ? 'Checking...'
                : `Arrears: KSh ${waterBalance.arrears.toLocaleString()} • Advance: KSh ${waterBalance.advance.toLocaleString()}`}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Calculated from total water bills vs payments allocated to water.
            </p>
          </div>

          {/* Notes */}
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notes (Optional)
            </label>
            <textarea 
              value={form.notes} 
              onChange={e => update('notes', e.target.value)} 
              className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              rows={2}
              placeholder="Any additional notes about this water bill..."
            />
          </div>
        </div>
      </form>

      {/* Footer Actions */}
      <div className="p-4 bg-white rounded-b-md flex items-center justify-between border-t">
        <div>
          {message && (
            <div className={`px-3 py-2 rounded text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button 
            onClick={submit} 
            disabled={loading} 
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Water Bill'}
          </button>

          <button 
            onClick={async () => {
              try {
                setLoading(true);
                const b = await agentService.listWaterBills({ limit: 10 });
                const billsData = b?.data?.data || b?.data || [];
                setRecentBills(Array.isArray(billsData) ? billsData : []);
                setMessage({ type: 'success', text: 'Water bills list refreshed' });
              } catch (err) {
                console.error('refresh list error', err);
                setMessage({ type: 'error', text: 'Failed to refresh water bills' });
              } finally {
                setLoading(false);
              }
            }} 
            disabled={loading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Refresh List
          </button>
        </div>
      </div>

      {/* Recent Bills Section */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-sm font-semibold">Recent Water Bills</h4>
          <span className="text-xs text-gray-500">
            Showing {recentBills.length} recent bills
          </span>
        </div>
        
        {recentBills.length === 0 ? (
          <div className="bg-white rounded shadow-sm p-8 text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">No water bills recorded yet</p>
            <p className="text-gray-400 text-xs mt-1">Create your first water bill using the form above</p>
          </div>
        ) : (
          <div className="bg-white rounded shadow-sm divide-y">
            {recentBills.map(bill => (
              <div key={bill.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900">
                    {bill.first_name} {bill.last_name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 space-y-1">
                    <div className="flex items-center">
                      <svg className="w-3 h-3 mr-1 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4z" clipRule="evenodd" />
                      </svg>
                      {bill.unit_code || 'No unit specified'}
                    </div>
                    <div className="flex items-center">
                      <svg className="w-3 h-3 mr-1 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                      </svg>
                      {formatMonth(bill.bill_month)}
                    </div>
                    <div className="flex items-center font-medium text-blue-600">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4z" clipRule="evenodd" />
                        <path fillRule="evenodd" d="M3 8V7h18v1H3z" clipRule="evenodd" />
                        <path d="M4 12h12v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5z" />
                      </svg>
                      KSh {parseFloat(bill.amount).toLocaleString()}
                    </div>
                    {bill.notes && (
                      <div className="text-xs text-gray-400 mt-1 pt-1 border-t border-gray-100">
                        <span className="font-medium">Note:</span> {bill.notes}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">
                    {bill.created_at ? new Date(bill.created_at).toLocaleDateString('en-GB') : ''}
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    by {bill.agent_first} {bill.agent_last}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Information Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-blue-800">Workflow Information</h4>
            <ul className="mt-2 text-sm text-blue-700 space-y-1">
              <li>• <strong>Step 1:</strong> Create water bills for tenants using this form</li>
              <li>• <strong>Step 2:</strong> Go to <strong>SMS Management</strong> tab to send billing notifications</li>
              <li>• The system will include water bill amounts in SMS for tenants with bills</li>
              <li>• Tenants without water bills will have water amount set to KSh 0</li>
            </ul>
            <div className="mt-3 p-2 bg-white rounded border border-blue-300">
              <p className="text-xs text-blue-600">
                <strong>Tip:</strong> Complete all water bill entries before sending billing SMS for accurate notifications.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentWaterBills;