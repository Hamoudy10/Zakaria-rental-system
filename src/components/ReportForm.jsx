import React, { useState } from 'react';
import { createReport } from '../api';

const ReportForm = ({ onClose }) => {
  const [reportType, setReportType] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createReport({ report_type: reportType, tenant_id: tenantId || null, start_date: startDate, end_date: endDate });
      alert('Report generated successfully!');
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error generating report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Generate Report</h2>

        <label className="block mb-2">Report Type</label>
        <select className="w-full border p-2 mb-4" value={reportType} onChange={e => setReportType(e.target.value)} required>
          <option value="">Select type</option>
          <option value="rent_payments">Rent Payments</option>
          <option value="expenses">Expenses</option>
          <option value="financial_summary">Financial Summary</option>
          <option value="tenant_statement">Tenant Statement</option>
        </select>

        <label className="block mb-2">Tenant ID (optional)</label>
        <input type="text" className="w-full border p-2 mb-4" value={tenantId} onChange={e => setTenantId(e.target.value)} />

        <label className="block mb-2">Start Date</label>
        <input type="date" className="w-full border p-2 mb-4" value={startDate} onChange={e => setStartDate(e.target.value)} required />

        <label className="block mb-2">End Date</label>
        <input type="date" className="w-full border p-2 mb-4" value={endDate} onChange={e => setEndDate(e.target.value)} required />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-500 text-white rounded">{loading ? 'Generating...' : 'Generate'}</button>
        </div>
      </form>
    </div>
  );
};

export default ReportForm;
