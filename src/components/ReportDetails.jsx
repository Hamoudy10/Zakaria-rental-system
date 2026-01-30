import React from 'react';

const ReportDetails = ({ report, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded w-full max-w-2xl overflow-auto max-h-full">
        <h2 className="text-xl font-bold mb-4">Report Details (ID: {report.id})</h2>

        <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
          {JSON.stringify(report.report_data, null, 2)}
        </pre>

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded">Close</button>
        </div>
      </div>
    </div>
  );
};

export default ReportDetails;
