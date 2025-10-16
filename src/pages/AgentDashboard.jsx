// src/pages/AgentDashboard.jsx
import React from 'react';

const AgentDashboard = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Agent Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-700">Pending Complaints</h3>
          <p className="text-2xl font-bold text-orange-600">12</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-700">Overdue Rent</h3>
          <p className="text-2xl font-bold text-red-600">5</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-700">My Properties</h3>
          <p className="text-2xl font-bold text-blue-600">8</p>
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;