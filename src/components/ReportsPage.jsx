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

  // Generate report form state
  const [formData, setFormData] = useState({
    type: '',
    start_date: '',
    end_date: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Fetch report types
  const fetchReportTypes = async () => {
    try {
      const res = await API.reports.getReportTypes();
      setReportTypes(res.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch report types.');
    }
  };

  // Fetch reports with optional type filter
  const fetchReports = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit };
      if (selectedType) params.type = selectedType;

      const res = await API.reports.getReports(params);
      setReports(res.data.data || []);
      setTotalReports(res.data.total || res.data.data.length);
    } catch (err) {
      console.error(err);
      setError(handleApiError(err).message || 'Failed to fetch reports.');
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

  const handleTypeChange = (e) => {
    setSelectedType(e.target.value);
    setPage(1); // reset page when filter changes
  };

  const handleDownload = async (reportId, format = 'pdf') => {
    try {
      const res = await API.reports.downloadReport(reportId, format);
      // Convert blob to download
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${reportId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      alert('Failed to download report.');
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleGenerateReport = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    setFormSuccess('');
    try {
      if (!formData.type || !formData.start_date || !formData.end_date) {
        setFormError('Please fill all fields.');
        setFormLoading(false);
        return;
      }

      const res = await API.reports.generateReport(formData);
      setFormSuccess('Report generated successfully!');
      setFormData({ type: '', start_date: '', end_date: '' });
      fetchReports(); // Refresh report list
    } catch (err) {
      console.error(err);
      setFormError(handleApiError(err).message || 'Failed to generate report.');
    } finally {
      setFormLoading(false);
    }
  };

  const totalPages = Math.ceil(totalReports / limit);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Reports</h1>

      {/* Generate Report Form */}
      <form
        onSubmit={handleGenerateReport}
        className="mb-6 p-4 border rounded bg-gray-50 space-y-3"
      >
        <h2 className="text-xl font-semibold">Generate Report</h2>
        {formError && <p className="text-red-500">{formError}</p>}
        {formSuccess && <p className="text-green-500">{formSuccess}</p>}

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block mb-1 font-medium">Report Type</label>
            <select
              name="type"
              value={formData.type}
              onChange={handleFormChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Select Type</option>
              {reportTypes.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">Start Date</label>
            <input
              type="date"
              name="start_date"
              value={formData.start_date}
              onChange={handleFormChange}
              className="border rounded px-2 py-1"
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">End Date</label>
            <input
              type="date"
              name="end_date"
              value={formData.end_date}
              onChange={handleFormChange}
              className="border rounded px-2 py-1"
            />
          </div>

          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded"
            disabled={formLoading}
          >
            {formLoading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </form>

      {/* Filter by report type */}
      <div className="mb-4">
        <label className="mr-2 font-semibold">Filter by Type:</label>
        <select
          value={selectedType}
          onChange={handleTypeChange}
          className="border rounded p-1"
        >
          <option value="">All</option>
          {reportTypes.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && <p className="text-red-500 mb-2">{error}</p>}

      {/* Loading */}
      {loading ? (
        <p>Loading reports...</p>
      ) : (
        <>
          {reports.length === 0 ? (
            <p>No reports found.</p>
          ) : (
            <table className="min-w-full border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2">ID</th>
                  <th className="border px-3 py-2">Type</th>
                  <th className="border px-3 py-2">Generated By</th>
                  <th className="border px-3 py-2">Start Date</th>
                  <th className="border px-3 py-2">End Date</th>
                  <th className="border px-3 py-2">Created At</th>
                  <th className="border px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td className="border px-3 py-2">{report.id}</td>
                    <td className="border px-3 py-2">{report.type}</td>
                    <td className="border px-3 py-2">{report.generated_by}</td>
                    <td className="border px-3 py-2">{report.start_date}</td>
                    <td className="border px-3 py-2">{report.end_date}</td>
                    <td className="border px-3 py-2">
                      {new Date(report.created_at).toLocaleString()}
                    </td>
                    <td className="border px-3 py-2 space-x-2">
                      <button
                        onClick={() => handleDownload(report.id, 'pdf')}
                        className="bg-blue-500 text-white px-2 py-1 rounded"
                      >
                        PDF
                      </button>
                      <button
                        onClick={() => handleDownload(report.id, 'csv')}
                        className="bg-green-500 text-white px-2 py-1 rounded"
                      >
                        CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 space-x-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReportsPage;
