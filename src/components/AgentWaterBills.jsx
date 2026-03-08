// src/components/AgentWaterBills.jsx
import React, { useEffect, useState, useMemo } from 'react';
import agentService from '../services/AgentService';

const getCurrentMonth = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

const getTodayDate = () => {
  return new Date().toISOString().slice(0, 10);
};

const AgentWaterBills = () => {
  const [properties, setProperties] = useState([]);
  const [allTenants, setAllTenants] = useState([]);
  const [propertyTenants, setPropertyTenants] = useState([]);
  const [recentBills, setRecentBills] = useState([]);
  const [billFilters, setBillFilters] = useState({
    fromDate: '',
    toDate: '',
    page: 1,
    limit: 20,
  });
  const [billPagination, setBillPagination] = useState({
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 20,
    offset: 0,
  });

  const [loading, setLoading] = useState(false);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [profitLoading, setProfitLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingBillId, setEditingBillId] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);

  const [form, setForm] = useState({
    propertyId: '',
    tenantId: '',
    tenantName: '',
    unitId: '',
    billMonth: getCurrentMonth(),
    amount: '',
    notes: ''
  });

  const [waterBalance, setWaterBalance] = useState({
    loading: false,
    arrears: 0,
    advance: 0
  });

  const [expenseForm, setExpenseForm] = useState({
    propertyId: '',
    billMonth: getCurrentMonth(),
    expenseDate: getTodayDate(),
    vendorName: '',
    supplierOrganization: '',
    amount: '',
    paymentMethod: 'cash',
    paymentReference: '',
    litersDelivered: '',
    notes: ''
  });

  const [expenseFilters, setExpenseFilters] = useState({
    propertyId: '',
    billMonth: getCurrentMonth(),
    page: 1,
    limit: 20,
  });

  const [recentExpenses, setRecentExpenses] = useState([]);
  const [expensePagination, setExpensePagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });

  const [profitability, setProfitability] = useState({
    totals: {
      water_billed: 0,
      water_collected: 0,
      water_expense: 0,
      water_profit_or_loss: 0,
    },
    monthly: [],
  });
  const [showAllWaterBills, setShowAllWaterBills] = useState(true);
  const [showWaterFinance, setShowWaterFinance] = useState(true);
  const [showProfitabilityDetails, setShowProfitabilityDetails] = useState(true);
  const [showExpenseList, setShowExpenseList] = useState(true);
  const [billSearch, setBillSearch] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [profitabilitySearch, setProfitabilitySearch] = useState('');

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const updateExpense = (key, value) =>
    setExpenseForm(prev => ({ ...prev, [key]: value }));

  const fetchWaterBills = async () => {
    try {
      const params = {
        limit: billFilters.limit,
        offset: (billFilters.page - 1) * billFilters.limit,
      };
      if (billFilters.fromDate) params.fromDate = billFilters.fromDate;
      if (billFilters.toDate) params.toDate = billFilters.toDate;

      const response = await agentService.listWaterBills(params);
      const rows = Array.isArray(response?.data?.data)
        ? response.data.data
        : [];
      const pagination = response?.data?.pagination || {
        total: rows.length,
        page: 1,
        totalPages: 1,
        limit: billFilters.limit,
        offset: 0,
      };

      setRecentBills(rows);
      setBillPagination(pagination);
    } catch (err) {
      console.error('listWaterBills error', err);
      setMessage({ type: 'error', text: 'Failed to fetch water bills' });
      setRecentBills([]);
    }
  };

  const fetchWaterExpenses = async () => {
    try {
      const params = {
        limit: expenseFilters.limit,
        offset: (expenseFilters.page - 1) * expenseFilters.limit,
      };
      if (expenseFilters.propertyId) params.propertyId = expenseFilters.propertyId;
      if (expenseFilters.billMonth) params.billMonth = expenseFilters.billMonth;

      const response = await agentService.listWaterExpenses(params);
      const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
      const pagination = response?.data?.pagination || {
        total: rows.length,
        limit: expenseFilters.limit,
        offset: 0,
        hasMore: false,
      };

      setRecentExpenses(rows);
      setExpensePagination(pagination);
    } catch (err) {
      console.error('listWaterExpenses error', err);
      setMessage({ type: 'error', text: 'Failed to fetch water expenses' });
      setRecentExpenses([]);
    }
  };

  const fetchWaterProfitability = async () => {
    try {
      setProfitLoading(true);
      const params = {
        fromMonth: expenseFilters.billMonth || getCurrentMonth(),
        toMonth: expenseFilters.billMonth || getCurrentMonth(),
      };
      if (expenseFilters.propertyId) params.propertyId = expenseFilters.propertyId;
      const response = await agentService.getWaterProfitability(params);
      const data = response?.data?.data || {};
      setProfitability({
        totals: data.totals || {
          water_billed: 0,
          water_collected: 0,
          water_expense: 0,
          water_profit_or_loss: 0,
        },
        monthly: Array.isArray(data.monthly) ? data.monthly : [],
      });
    } catch (err) {
      console.error('getWaterProfitability error', err);
      setProfitability({
        totals: {
          water_billed: 0,
          water_collected: 0,
          water_expense: 0,
          water_profit_or_loss: 0,
        },
        monthly: [],
      });
    } finally {
      setProfitLoading(false);
    }
  };

  // Load properties + tenants on mount
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
      } catch (err) {
        console.error('Failed to load agent data', err);
      }
    };
    load();
  }, []);

  useEffect(() => {
    fetchWaterBills();
  }, [billFilters.page, billFilters.limit, billFilters.fromDate, billFilters.toDate]);

  useEffect(() => {
    fetchWaterExpenses();
    fetchWaterProfitability();
  }, [expenseFilters.page, expenseFilters.limit, expenseFilters.propertyId, expenseFilters.billMonth]);

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

    if (!form.propertyId || !form.tenantId || !form.amount || !form.billMonth) {
      setMessage({ type: 'error', text: 'Please select property, tenant, month, and enter amount' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        tenantId: form.tenantId || null,
        tenantName: form.tenantName || null,
        unitId: form.unitId || null,  // UUID
        propertyId: form.propertyId,
        amount: parseFloat(form.amount),
        billMonth: form.billMonth,     // backend will store as YYYY-MM-01
        notes: form.notes || null
      };

      const res = editingBillId
        ? await agentService.updateWaterBill(editingBillId, payload)
        : await agentService.createWaterBill(payload);
      if (res?.data?.success) {
        setMessage({
          type: 'success',
          text: editingBillId
            ? 'Water bill updated successfully'
            : 'Water bill saved successfully'
        });
        // Refresh recent list
        await fetchWaterBills();
        // Reset form
        setForm({
          propertyId: '',
          tenantId: '',
          tenantName: '',
          unitId: '',
          billMonth: getCurrentMonth(),
          amount: '',
          notes: ''
        });
        setEditingBillId(null);
        setPropertyTenants([]);
        setWaterBalance({ loading: false, arrears: 0, advance: 0 });
      } else {
        setMessage({
          type: 'error',
          text: res?.data?.message || (editingBillId ? 'Failed to update water bill' : 'Failed to save water bill')
        });
      }
    } catch (err) {
      console.error(err);
      setMessage({
        type: 'error',
        text:
          err?.response?.data?.message ||
          err.message ||
          (editingBillId ? 'Error updating water bill' : 'Error saving water bill')
      });
    } finally {
      setLoading(false);
    }
  };

  const beginEditBill = (bill) => {
    const propertyId = bill.property_id || '';
    const filtered = Array.isArray(allTenants)
      ? allTenants.filter(t => t.property_id === propertyId)
      : [];
    setPropertyTenants(filtered);
    setEditingBillId(bill.id);
    setForm({
      propertyId,
      tenantId: bill.tenant_id || '',
      tenantName: `${bill.first_name || ''} ${bill.last_name || ''}`.trim(),
      unitId: bill.unit_id || '',
      billMonth: bill.bill_month ? String(bill.bill_month).slice(0, 7) : getCurrentMonth(),
      amount: bill.amount != null ? String(bill.amount) : '',
      notes: bill.notes || ''
    });
    if (bill.tenant_id) {
      updateWaterBalanceForTenant(bill.tenant_id);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingBillId(null);
    setForm({
      propertyId: '',
      tenantId: '',
      tenantName: '',
      unitId: '',
      billMonth: getCurrentMonth(),
      amount: '',
      notes: ''
    });
    setPropertyTenants([]);
    setWaterBalance({ loading: false, arrears: 0, advance: 0 });
    setMessage(null);
  };

  const handleDeleteBill = async (bill) => {
    const ok = window.confirm(
      `Delete water bill for ${bill.first_name || ''} ${bill.last_name || ''} (${formatMonth(bill.bill_month)})?`,
    );
    if (!ok) return;

    try {
      setLoading(true);
      const res = await agentService.deleteWaterBill(bill.id);
      if (res?.data?.success) {
        setMessage({ type: 'success', text: 'Water bill deleted successfully' });
        await fetchWaterBills();
        if (editingBillId === bill.id) {
          cancelEdit();
        }
      } else {
        setMessage({ type: 'error', text: res?.data?.message || 'Failed to delete water bill' });
      }
    } catch (err) {
      console.error('delete water bill error', err);
      setMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to delete water bill',
      });
    } finally {
      setLoading(false);
    }
  };

  const submitExpense = async (e) => {
    e?.preventDefault();
    setMessage(null);

    if (
      !expenseForm.propertyId ||
      !expenseForm.billMonth ||
      !expenseForm.expenseDate ||
      !expenseForm.vendorName ||
      !expenseForm.amount
    ) {
      setMessage({
        type: 'error',
        text: 'Please provide property, supplier, amount, expense date, and bill month',
      });
      return;
    }

    if (expenseForm.paymentMethod === 'mpesa' && !expenseForm.paymentReference) {
      setMessage({
        type: 'error',
        text: 'M-Pesa payment requires receipt/reference',
      });
      return;
    }

    try {
      setExpenseLoading(true);
      const payload = {
        propertyId: expenseForm.propertyId,
        billMonth: expenseForm.billMonth,
        expenseDate: expenseForm.expenseDate,
        vendorName: expenseForm.vendorName,
        supplierOrganization: expenseForm.supplierOrganization || null,
        amount: parseFloat(expenseForm.amount),
        paymentMethod: expenseForm.paymentMethod,
        paymentReference: expenseForm.paymentReference || null,
        litersDelivered: expenseForm.litersDelivered
          ? parseFloat(expenseForm.litersDelivered)
          : null,
        notes: expenseForm.notes || null,
      };

      const res = editingExpenseId
        ? await agentService.updateWaterExpense(editingExpenseId, payload)
        : await agentService.createWaterExpense(payload);

      if (res?.data?.success) {
        setMessage({
          type: 'success',
          text: editingExpenseId
            ? 'Water expense updated successfully'
            : 'Water expense recorded successfully',
        });
        setEditingExpenseId(null);
        setExpenseForm({
          propertyId: expenseForm.propertyId,
          billMonth: expenseForm.billMonth,
          expenseDate: getTodayDate(),
          vendorName: '',
          supplierOrganization: '',
          amount: '',
          paymentMethod: 'cash',
          paymentReference: '',
          litersDelivered: '',
          notes: ''
        });
        await fetchWaterExpenses();
        await fetchWaterProfitability();
      } else {
        setMessage({
          type: 'error',
          text: res?.data?.message || 'Failed to save water expense',
        });
      }
    } catch (err) {
      console.error('submit water expense error', err);
      setMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to save water expense',
      });
    } finally {
      setExpenseLoading(false);
    }
  };

  const beginEditExpense = (expense) => {
    setEditingExpenseId(expense.id);
    setExpenseForm({
      propertyId: expense.property_id || '',
      billMonth: expense.bill_month ? String(expense.bill_month).slice(0, 7) : getCurrentMonth(),
      expenseDate: expense.expense_date ? String(expense.expense_date).slice(0, 10) : getTodayDate(),
      vendorName: expense.vendor_name || '',
      supplierOrganization: expense.supplier_organization || '',
      amount: expense.amount != null ? String(expense.amount) : '',
      paymentMethod: expense.payment_method || 'cash',
      paymentReference: expense.payment_reference || expense.mpesa_reference || '',
      litersDelivered:
        expense.liters_delivered != null ? String(expense.liters_delivered) : '',
      notes: expense.notes || '',
    });
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const cancelExpenseEdit = () => {
    setEditingExpenseId(null);
    setExpenseForm({
      propertyId: expenseFilters.propertyId || '',
      billMonth: expenseFilters.billMonth || getCurrentMonth(),
      expenseDate: getTodayDate(),
      vendorName: '',
      supplierOrganization: '',
      amount: '',
      paymentMethod: 'cash',
      paymentReference: '',
      litersDelivered: '',
      notes: '',
    });
  };

  const handleDeleteExpense = async (expense) => {
    const ok = window.confirm(
      `Delete water expense ${expense.vendor_name} (${formatMonth(expense.bill_month)})?`,
    );
    if (!ok) return;

    try {
      setExpenseLoading(true);
      const res = await agentService.deleteWaterExpense(expense.id);
      if (res?.data?.success) {
        setMessage({ type: 'success', text: 'Water expense deleted successfully' });
        await fetchWaterExpenses();
        await fetchWaterProfitability();
        if (editingExpenseId === expense.id) {
          cancelExpenseEdit();
        }
      } else {
        setMessage({ type: 'error', text: res?.data?.message || 'Failed to delete expense' });
      }
    } catch (err) {
      console.error('delete water expense error', err);
      setMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to delete expense',
      });
    } finally {
      setExpenseLoading(false);
    }
  };

  const formatMonth = (monthStr) => {
    if (!monthStr) return '';
    const date = new Date(monthStr); // bill_month is a DATE (e.g., "2026-01-01")
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  const filteredBills = useMemo(() => {
    const term = billSearch.trim().toLowerCase();
    if (!term) return recentBills;
    return recentBills.filter(bill => {
      const haystack = [
        bill.first_name,
        bill.last_name,
        bill.unit_code,
        bill.property_name,
        bill.bill_month,
        bill.amount,
        bill.notes,
        bill.agent_first,
        bill.agent_last,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [recentBills, billSearch]);

  const filteredExpenses = useMemo(() => {
    const term = expenseSearch.trim().toLowerCase();
    if (!term) return recentExpenses;
    return recentExpenses.filter(expense => {
      const haystack = [
        expense.vendor_name,
        expense.supplier_organization,
        expense.property_name,
        expense.bill_month,
        expense.expense_date,
        expense.payment_method,
        expense.payment_reference,
        expense.mpesa_reference,
        expense.notes,
        expense.amount,
        expense.liters_delivered,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [recentExpenses, expenseSearch]);

  const filteredProfitabilityRows = useMemo(() => {
    const term = profitabilitySearch.trim().toLowerCase();
    const rows = Array.isArray(profitability.monthly) ? profitability.monthly : [];
    if (!term) return rows;
    return rows.filter(row => {
      const haystack = [
        row.month,
        row.water_billed,
        row.water_collected,
        row.water_expense,
        row.water_profit_or_loss,
      ]
        .filter(value => value !== null && value !== undefined)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [profitability.monthly, profitabilitySearch]);

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

          {/* Bill Month */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Bill Month <span className="text-red-500">*</span>
            </label>
            <input
              type="month"
              value={form.billMonth}
              onChange={e => update('billMonth', e.target.value)}
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
            {loading ? 'Saving...' : editingBillId ? 'Update Water Bill' : 'Save Water Bill'}
          </button>

          {editingBillId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50"
            >
              Cancel Edit
            </button>
          )}

          <button 
            onClick={async () => {
              try {
                setLoading(true);
                await fetchWaterBills();
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h4 className="text-sm font-semibold">All Water Bills</h4>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Showing {filteredBills.length} of {billPagination.total} bill(s)
            </span>
            <button
              type="button"
              onClick={() => setShowAllWaterBills(prev => !prev)}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              {showAllWaterBills ? 'Hide Water Bills' : 'Show Water Bills'}
            </button>
          </div>
        </div>

        {showAllWaterBills && (
        <>
        <div className="bg-white rounded shadow-sm p-3 mb-4 border">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
              <input
                type="date"
                value={billFilters.fromDate}
                onChange={(e) =>
                  setBillFilters(prev => ({ ...prev, fromDate: e.target.value, page: 1 }))
                }
                className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
              <input
                type="date"
                value={billFilters.toDate}
                onChange={(e) =>
                  setBillFilters(prev => ({ ...prev, toDate: e.target.value, page: 1 }))
                }
                className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Per Page</label>
              <select
                value={billFilters.limit}
                onChange={(e) =>
                  setBillFilters(prev => ({
                    ...prev,
                    limit: parseInt(e.target.value, 10),
                    page: 1,
                  }))
                }
                className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() =>
                  setBillFilters(prev => ({
                    ...prev,
                    fromDate: '',
                    toDate: '',
                    page: 1,
                  }))
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Clear Date Filters
              </button>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search Bills</label>
            <input
              type="text"
              value={billSearch}
              onChange={(e) => setBillSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search by tenant, unit, property, amount, note, month..."
            />
          </div>
        </div>
        
        {filteredBills.length === 0 ? (
          <div className="bg-white rounded shadow-sm p-8 text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">
              {recentBills.length === 0 ? 'No water bills recorded yet' : 'No bills matched your search'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              {recentBills.length === 0
                ? 'Create your first water bill using the form above'
                : 'Adjust the search text or filters to see results'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded shadow-sm divide-y max-h-[26rem] overflow-y-auto">
            {filteredBills.map(bill => (
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
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => beginEditBill(bill)}
                      className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBill(bill)}
                      className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {billPagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between bg-white rounded shadow-sm p-3 border">
            <div className="text-xs text-gray-600">
              Page {billPagination.page} of {billPagination.totalPages}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setBillFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                }
                disabled={billPagination.page <= 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setBillFilters(prev => ({
                    ...prev,
                    page: Math.min(billPagination.totalPages, prev.page + 1),
                  }))
                }
                disabled={billPagination.page >= billPagination.totalPages}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Water Profitability + Expenses */}
      <div className="mt-8">
        <div className="p-4 bg-white rounded-t-md shadow-sm border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Water Delivery Expenses & Profitability</h3>
            <p className="text-sm text-gray-500">Agents record supplier costs and track water-only profit/loss</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">
              {profitLoading ? 'Refreshing...' : 'Live from current filters'}
            </div>
            <button
              type="button"
              onClick={() => setShowWaterFinance(prev => !prev)}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              {showWaterFinance ? 'Hide Section' : 'Show Section'}
            </button>
          </div>
        </div>

        {showWaterFinance && (
        <>
        <div className="bg-white border-b p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded border p-3 bg-blue-50">
            <p className="text-xs text-blue-700">Water Billed</p>
            <p className="text-lg font-semibold text-blue-900">
              KSh {Number(profitability.totals.water_billed || 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded border p-3 bg-emerald-50">
            <p className="text-xs text-emerald-700">Water Collected</p>
            <p className="text-lg font-semibold text-emerald-900">
              KSh {Number(profitability.totals.water_collected || 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded border p-3 bg-amber-50">
            <p className="text-xs text-amber-700">Water Expense</p>
            <p className="text-lg font-semibold text-amber-900">
              KSh {Number(profitability.totals.water_expense || 0).toLocaleString()}
            </p>
          </div>
          <div className={`rounded border p-3 ${Number(profitability.totals.water_profit_or_loss || 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`text-xs ${Number(profitability.totals.water_profit_or_loss || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              Profit / Loss
            </p>
            <p className={`text-lg font-semibold ${Number(profitability.totals.water_profit_or_loss || 0) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
              KSh {Number(profitability.totals.water_profit_or_loss || 0).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-white border-b p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Property Filter</label>
              <select
                value={expenseFilters.propertyId}
                onChange={(e) =>
                  setExpenseFilters(prev => ({ ...prev, propertyId: e.target.value, page: 1 }))
                }
                className="w-full px-3 py-2 text-sm border rounded"
              >
                <option value="">All properties</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Month Filter</label>
              <input
                type="month"
                value={expenseFilters.billMonth}
                onChange={(e) =>
                  setExpenseFilters(prev => ({ ...prev, billMonth: e.target.value, page: 1 }))
                }
                className="w-full px-3 py-2 text-sm border rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Per Page</label>
              <select
                value={expenseFilters.limit}
                onChange={(e) =>
                  setExpenseFilters(prev => ({
                    ...prev,
                    limit: parseInt(e.target.value, 10),
                    page: 1,
                  }))
                }
                className="w-full px-3 py-2 text-sm border rounded"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() =>
                  setExpenseFilters({
                    propertyId: '',
                    billMonth: getCurrentMonth(),
                    page: 1,
                    limit: 20,
                  })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Reset Filters
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Search Profitability Rows
              </label>
              <input
                type="text"
                value={profitabilitySearch}
                onChange={(e) => setProfitabilitySearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
                placeholder="Search by month or amounts..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Search Expense Rows
              </label>
              <input
                type="text"
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
                placeholder="Search supplier, property, payment ref, method..."
              />
            </div>
          </div>
        </div>

        <div className="bg-white border-b p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Monthly Water Profitability</h4>
            <button
              type="button"
              onClick={() => setShowProfitabilityDetails(prev => !prev)}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              {showProfitabilityDetails ? 'Hide Profitability' : 'Show Profitability'}
            </button>
          </div>
          {showProfitabilityDetails && (
            filteredProfitabilityRows.length === 0 ? (
              <p className="text-sm text-gray-500">
                {Array.isArray(profitability.monthly) && profitability.monthly.length > 0
                  ? 'No profitability rows matched your search.'
                  : 'No profitability data for selected filters.'}
              </p>
            ) : (
              <div className="max-h-64 overflow-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Month</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">Billed</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">Collected</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">Expense</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">Profit/Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfitabilityRows.map((row, index) => (
                      <tr key={`${row.month || 'month'}-${index}`} className="border-t">
                        <td className="px-3 py-2 text-gray-700">{formatMonth(row.month)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {Number(row.water_billed || 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {Number(row.water_collected || 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {Number(row.water_expense || 0).toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            Number(row.water_profit_or_loss || 0) >= 0
                              ? 'text-green-700'
                              : 'text-red-700'
                          }`}
                        >
                          {Number(row.water_profit_or_loss || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        <form onSubmit={submitExpense} className="bg-white border-b p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Property *</label>
              <select
                value={expenseForm.propertyId}
                onChange={(e) => updateExpense('propertyId', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
                required
              >
                <option value="">Select property</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Name *</label>
              <input
                value={expenseForm.vendorName}
                onChange={(e) => updateExpense('vendorName', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
                placeholder="Person or supplier contact"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Organization</label>
              <input
                value={expenseForm.supplierOrganization}
                onChange={(e) => updateExpense('supplierOrganization', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
                placeholder="Company name (optional)"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KSh) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={expenseForm.amount}
                onChange={(e) => updateExpense('amount', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expense Date *</label>
              <input
                type="date"
                value={expenseForm.expenseDate}
                onChange={(e) => updateExpense('expenseDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bill Month *</label>
              <input
                type="month"
                value={expenseForm.billMonth}
                onChange={(e) => updateExpense('billMonth', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method *</label>
              <select
                value={expenseForm.paymentMethod}
                onChange={(e) => updateExpense('paymentMethod', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {expenseForm.paymentMethod === 'mpesa' ? 'M-Pesa Receipt *' : 'Reference'}
              </label>
              <input
                value={expenseForm.paymentReference}
                onChange={(e) => updateExpense('paymentReference', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
                placeholder={expenseForm.paymentMethod === 'mpesa' ? 'e.g. UC73J98I8G' : 'Cashbook/receipt number'}
                required={expenseForm.paymentMethod === 'mpesa'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Liters Delivered</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={expenseForm.litersDelivered}
                onChange={(e) => updateExpense('litersDelivered', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={expenseForm.notes}
                onChange={(e) => updateExpense('notes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border rounded"
                placeholder="Optional details"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            {editingExpenseId && (
              <button
                type="button"
                onClick={cancelExpenseEdit}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="submit"
              disabled={expenseLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {expenseLoading ? 'Saving...' : editingExpenseId ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-b-md shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Water Delivery Expenses</h4>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                Showing {filteredExpenses.length} of {expensePagination.total}
              </span>
              <button
                type="button"
                onClick={() => setShowExpenseList(prev => !prev)}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                {showExpenseList ? 'Hide Expenses' : 'Show Expenses'}
              </button>
            </div>
          </div>

          {showExpenseList && (filteredExpenses.length === 0 ? (
            <p className="text-sm text-gray-500">No water expenses recorded for selected filters.</p>
          ) : (
            <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
              {filteredExpenses.map(expense => (
                <div key={expense.id} className="border rounded p-3 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {expense.vendor_name}
                      {expense.supplier_organization ? ` (${expense.supplier_organization})` : ''}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {expense.property_name || 'Property'} • {formatMonth(expense.bill_month)} • {expense.expense_date ? new Date(expense.expense_date).toLocaleDateString('en-GB') : ''}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Payment: {(expense.payment_method || 'cash').toUpperCase()}
                      {expense.payment_reference ? ` • Ref: ${expense.payment_reference}` : ''}
                    </p>
                    {expense.notes ? (
                      <p className="text-xs text-gray-500 mt-1">Note: {expense.notes}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      KSh {Number(expense.amount || 0).toLocaleString()}
                    </p>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => beginEditExpense(expense)}
                        className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(expense)}
                        className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {expensePagination.total > expenseFilters.limit && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setExpenseFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                }
                disabled={expenseFilters.page <= 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setExpenseFilters(prev => ({ ...prev, page: prev.page + 1 }))
                }
                disabled={!expensePagination.hasMore}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
        </>
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
              <li>• <strong>Step 2:</strong> Record water delivery expenses with payment method and reference</li>
              <li>• <strong>Step 3:</strong> Go to <strong>SMS Management</strong> tab to send billing notifications</li>
              <li>• The system will include water bill amounts in SMS for tenants with bills</li>
              <li>• Water profit/loss is computed from water collected minus water delivery expenses</li>
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
