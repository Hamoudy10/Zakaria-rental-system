// src/components/AgentManagement.jsx
import React, { useState, useEffect } from 'react';
import { useUsers } from '../context/UserContext';

const AgentManagement = () => {
  const { agents, loading, error, updateAgentPermissions } = useUsers();
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    // Component will use agents from UserContext
  }, []);

  const handleToggleActive = async (agent, isActive) => {
    try {
      setUpdating(true);
      await updateAgentPermissions(agent.id, { is_active: isActive });
    } catch (err) {
      console.error('Error updating agent status:', err);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (isActive) => {
    return isActive 
      ? <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Active</span>
      : <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">Inactive</span>;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agent Management</h1>
        <p className="text-gray-600 text-sm mt-1">Manage agent permissions and access</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned Properties
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active Complaints
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {agent.first_name} {agent.last_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {agent.national_id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{agent.email}</div>
                    <div className="text-sm text-gray-500">{agent.phone_number}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {agent.managed_properties || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {agent.assigned_complaints || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(agent.is_active)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleToggleActive(agent, !agent.is_active)}
                      disabled={updating}
                      className={`mr-3 ${
                        agent.is_active 
                          ? 'text-red-600 hover:text-red-900' 
                          : 'text-green-600 hover:text-green-900'
                      }`}
                    >
                      {agent.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => setSelectedAgent(agent)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {agents.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No agents found
          </div>
        )}
      </div>

      {/* Agent Details Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {selectedAgent.first_name} {selectedAgent.last_name}
                </h3>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedAgent.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedAgent.phone_number}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">National ID</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedAgent.national_id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <p className="mt-1">{getStatusBadge(selectedAgent.is_active)}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Permissions</h4>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled
                    />
                    <label className="ml-2 text-sm text-gray-700">View assigned properties</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled
                    />
                    <label className="ml-2 text-sm text-gray-700">Manage complaints</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      defaultChecked={false}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled
                    />
                    <label className="ml-2 text-sm text-gray-700">Financial data access</label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagement;