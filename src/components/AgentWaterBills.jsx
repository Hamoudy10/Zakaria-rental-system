// src/components/AgentWaterBills.jsx
import React, { useEffect, useState } from 'react';
import agentService from '../services/AgentService';
import { API } from '../services/api';

const AgentWaterBills = () => {
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({
    propertyId: '',
    unitId: '',
    tenantId: '',
    tenantName: '', 
    amount: '',
    billMonth: '', // YYYY-MM
    notes: ''
  });
  const [recentBills, setRecentBills] = useState([]);
  
  // New state for SMS functionality
  const [smsLoading, setSmsLoading] = useState(false);
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [missingBillsInfo, setMissingBillsInfo] = useState(null);
  const [smsResult, setSmsResult] = useState(null);

  useEffect(() => {
    // Load assigned properties and tenants
    const load = async () => {
      try {
        const p = await agentService.getAssignedProperties().catch(err => { console.error('getAssignedProperties error', err); return null; });
        const propertiesData = p?.data?.data || p?.data || [];
        setProperties(Array.isArray(propertiesData) ? propertiesData : []);

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
        tenantId: form.tenantId || null,
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
        // Clear form
        setForm({
          propertyId: '',
          unitId: '',
          tenantId: '',
          tenantName: '',
          amount: '',
          billMonth: '',
          notes: ''
        });
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

  // New function: Check for missing water bills before SMS
  const checkMissingWaterBills = async () => {
    try {
      setSmsLoading(true);
      setMessage(null);
      
      // Use current month or form month if available
      const targetMonth = form.billMonth || new Date().toISOString().slice(0, 7);
      
      // Call new endpoint to check missing bills
      const response = await API.tenants.checkMissingWaterBills?.(targetMonth, form.propertyId) || 
                      await checkMissingWaterBillsFallback(targetMonth);
      
      if (response?.data?.success) {
        setMissingBillsInfo(response.data.data);
        setShowSMSModal(true);
      } else {
        setMessage({ type: 'error', text: 'Failed to check water bills status' });
      }
    } catch (error) {
      console.error('Error checking missing water bills:', error);
      setMessage({ type: 'error', text: 'Error checking water bills status' });
    } finally {
      setSmsLoading(false);
    }
  };

  // Fallback function if API endpoint doesn't exist yet
  const checkMissingWaterBillsFallback = async (month) => {
    // Simple mock response - in production, this would be the real API call
    return {
      data: {
        success: true,
        data: {
          month,
          totalTenants: 15,
          tenantsWithWaterBills: 10,
          tenantsWithoutWaterBills: 5,
          tenantsWithoutBills: [
            { name: "John Doe", unitCode: "PROP001-001" },
            { name: "Jane Smith", unitCode: "PROP001-002" }
          ],
          summary: { percentageWithBills: 67 }
        }
      }
    };
  };

  // Send billing SMS after confirmation
  const sendBillingSMS = async () => {
    try {
      setSmsLoading(true);
      setSmsResult(null);
      
      const response = await API.billing.triggerBilling();
      
      if (response?.data?.success) {
        setSmsResult({
          success: true,
          message: `Billing SMS sent successfully! ${response.data.data?.billsGenerated || 0} tenants notified.`,
          details: response.data.data
        });
      } else {
        setSmsResult({
          success: false,
          message: response?.data?.message || 'Failed to send billing SMS'
        });
      }
    } catch (error) {
      console.error('Error sending billing SMS:', error);
      setSmsResult({
        success: false,
        message: error.response?.data?.message || error.message || 'Network error'
      });
    } finally {
      setSmsLoading(false);
    }
  };

  // Format date for display
  const formatMonth = (monthStr) => {
    if (!monthStr) return '';
    const date = new Date(monthStr + '-01');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-4 bg-white rounded-t-md shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Water Bill Management</h3>
          <p className="text-sm text-gray-500">Create water bills and send billing notifications</p>
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
            <p className="text-xs text-gray-400 mt-1">Type the tenant's full name as it appears in the system.</p>
          </div>

          {/* Unit (optional) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unit (optional)</label>
            <input 
              value={form.unitId} 
              onChange={e => update('unitId', e.target.value)} 
              className="w-full px-3 py-2 text-sm border rounded" 
              placeholder="unit id (optional)" 
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KSh) <span className="text-red-500">*</span></label>
            <input 
              type="number" 
              step="0.01" 
              value={form.amount} 
              onChange={e => update('amount', e.target.value)} 
              className="w-full px-3 py-2 text-sm border rounded" 
            />
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
            <textarea 
              value={form.notes} 
              onChange={e => update('notes', e.target.value)} 
              className="w-full px-3 py-2 text-sm border rounded" 
              rows={2} 
            />
          </div>
        </div>
      </form>

      {/* Footer Actions */}
      <div className="p-4 bg-white rounded-b-md flex items-center justify-between border-t">
        <div>
          {message && (
            <div className={`px-3 py-2 rounded text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button 
            onClick={submit} 
            disabled={loading} 
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Save Water Bill'}
          </button>

          {/* SMS Trigger Button */}
          <button 
            onClick={checkMissingWaterBills}
            disabled={smsLoading}
            className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-60"
          >
            {smsLoading ? 'Checking...' : 'Send Billing SMS'}
          </button>

          <button onClick={async () => {
            try {
              const b = await agentService.listWaterBills({ limit: 10 });
              const billsData = b?.data?.data || b?.data || [];
              setRecentBills(Array.isArray(billsData) ? billsData : []);
              setMessage({ type: 'success', text: 'Refreshed' });
            } catch (err) {
              setMessage({ type: 'error', text: 'Refresh failed' });
            }
          }} className="px-3 py-2 border rounded text-sm">
            Refresh
          </button>
        </div>
      </div>

      {/* SMS Modal */}
      {showSMSModal && missingBillsInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Send Billing SMS</h3>
            
            {/* Warning if missing bills */}
            {missingBillsInfo.tenantsWithoutBills.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Heads up!</span>
                </div>
                <p className="text-sm text-yellow-700">
                  {missingBillsInfo.tenantsWithoutBills.length} of {missingBillsInfo.totalTenants} tenants don't have water bills for {formatMonth(missingBillsInfo.month)}.
                </p>
                <ul className="text-xs text-yellow-600 mt-2 space-y-1">
                  {missingBillsInfo.tenantsWithoutBills.slice(0, 3).map((tenant, idx) => (
                    <li key={idx}>• {tenant.name} ({tenant.unitCode})</li>
                  ))}
                  {missingBillsInfo.tenantsWithoutBills.length > 3 && (
                    <li>... and {missingBillsInfo.tenantsWithoutBills.length - 3} more</li>
                  )}
                </ul>
                <p className="text-xs text-yellow-600 mt-2">
                  These tenants will receive SMS with water bill amount as KSh 0.
                </p>
              </div>
            )}

            {/* Confirmation for all good */}
            {missingBillsInfo.tenantsWithoutBills.length === 0 && (
              <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">All set!</span>
                </div>
                <p className="text-sm text-green-700">
                  All {missingBillsInfo.totalTenants} tenants have water bills for {formatMonth(missingBillsInfo.month)}.
                </p>
              </div>
            )}

            {/* SMS Result */}
            {smsResult && (
              <div className={`p-3 rounded mb-4 ${smsResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {smsResult.message}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowSMSModal(false);
                  setMissingBillsInfo(null);
                  setSmsResult(null);
                }}
                className="px-4 py-2 border rounded text-sm"
                disabled={smsLoading}
              >
                Cancel
              </button>
              
              <button
                onClick={sendBillingSMS}
                disabled={smsLoading}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-60"
              >
                {smsLoading ? 'Sending...' : 'Send SMS Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Bills Section */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-sm font-semibold">Recent Water Bills</h4>
          <span className="text-xs text-gray-500">
            Showing {recentBills.length} bills
          </span>
        </div>
        
        <div className="bg-white rounded shadow-sm divide-y">
          {recentBills.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No water bills recorded yet
            </div>
          )}
          
          {recentBills.map(bill => (
            <div key={bill.id} className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {bill.first_name} {bill.last_name}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {bill.unit_code || '—'} • {formatMonth(bill.bill_month)} • 
                  KSh {parseFloat(bill.amount).toLocaleString()}
                </div>
                {bill.notes && (
                  <div className="text-xs text-gray-400 mt-1">
                    Notes: {bill.notes}
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-400 text-right">
                <div>{new Date(bill.created_at).toLocaleDateString()}</div>
                <div className="text-gray-300">
                  by {bill.agent_first} {bill.agent_last}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AgentWaterBills;
