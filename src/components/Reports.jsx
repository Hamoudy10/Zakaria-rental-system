import React from 'react'

const Reports = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Financial Reports</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-700">Revenue Report</h3>
          <button className="btn-primary mt-4 w-full">Generate Report</button>
        </div>
        
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-700">Expense Report</h3>
          <button className="btn-primary mt-4 w-full">Generate Report</button>
        </div>
        
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-700">Profit & Loss</h3>
          <button className="btn-primary mt-4 w-full">Generate Report</button>
        </div>
      </div>
    </div>
  )
}

export default Reports