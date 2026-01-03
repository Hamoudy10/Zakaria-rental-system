import React, { useEffect, useState } from 'react';
import { API, handleApiError } from '../services/api';

const ReportsPage = () => {
  const [reports, setReports] = useState([]);
  const [reportTypes, setReportTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalReports, setTotalReports] = useState(0);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    report_type: '',
    start_date: '',
    end_date: '',
  });

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  /* ---------------- FETCH REPORT TYPES ---------------- */
  const fetchReportTypes = async () => {
    try {
      const res = await API.reports.getReportTypes();
      setReportTypes(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error(err);
      setReportTypes([]);
      setError('Failed to fetch report types');
    }
  };

  /* ---------------- FETCH REPORTS ---------------- */
  const fetchReports = async () => {
    setLoading(true);
    setError('');

    try {
      const params = { page, limit };
      if (selectedType) params.report_type = selectedType;

      const res = await API.reports.getReports(params);
      setReports(res?.data?.data || []);
      setTotalReports(res?.data?.total || 0);
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportTypes();
  }, []);

  useEffect(() => {
    fetchReports();
  }, [page, selectedType]);

  const handleGenerateReport = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      if (!formData.report_type || !formData.start_date || !formData.end_date) {
        setFormError('All fields are required');
        return;
      }

      await API.reports.generateReport(formData);
      setFormSuccess('Report generated successfully');
      setFormData({ report_type: '', start_date: '', end_date: '' });
      fetchReports();
    } catch (err) {
      setFormError(handleApiError(err).message || 'Failed to generate report');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDownload = async (id, format) => {
    const res = await API.reports.downloadReport(id, format);
    const blob = new Blob([res.data]);
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `report_${id}.${format}`;
    link.click();
  };

  const totalPages = Math.ceil(totalReports / limit);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Reports</h1>

      {/* GENERATE REPORT */}
      <form onSubmit={handleGenerateReport} className="mb-6 p-4 border rounded bg-gray-50">
        <h2 className="font-semibold mb-2">Generate Report</h2>

        {formError && <p className="text-red-500">{formError}</p>}
        {formSuccess && <p className="text-green-500">{formSuccess}</p>}

        <div className="flex gap-3 flex-wrap">
          <select
            value={formData.report_type}
            onChange={(e) => setFormData({ ...formData, report_type: e.target.value })}
            className="border px-2 py-1"
          >
            <option value="">Select report type</option>
            {reportTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <input type="date" value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            className="border px-2 py-1" />

          <input type="date" value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            className="border px-2 py-1" />

          <button disabled={formLoading}
            className="bg-blue-500 text-white px-4 py-1 rounded">
            {formLoading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </form>

      {/* FILTER */}
      <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
        className="border mb-3 px-2 py-1">
        <option value="">All</option>
        {reportTypes.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {loading ? <p>Loading…</p> : (
        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Start</th>
              <th>End</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.report_type}</td>
                <td>{r.start_date}</td>
                <td>{r.end_date}</td>
                <td>{new Date(r.generated_at).toLocaleString()}</td>
                <td>
                  <button onClick={() => handleDownload(r.id, 'pdf')}>PDF</button>
                  <button onClick={() => handleDownload(r.id, 'csv')}>CSV</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div className="mt-4">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
          <span className="mx-2">{page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
