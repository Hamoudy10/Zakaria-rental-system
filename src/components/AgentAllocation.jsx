// src/components/AgentAllocation.jsx
import React, { useState, useEffect } from 'react';
import adminService from '../services/AdminService';

const AgentAllocation = () => {
  const [agents, setAgents] = useState([]);
  const [properties, setProperties] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedProperties, setSelectedProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  // Helper function to extract data from various API response structures
  const extractDataFromResponse = (response) => {
    console.log('Extracting data from response:', response);
    
    // If response is already an array, return it
    if (Array.isArray(response)) {
      return response;
    }
    
    // If response has a data property that's an array
    if (response && response.data && Array.isArray(response.data)) {
      return response.data;
    }
    
    // If response has a data property that's an object with a data array
    if (response && response.data && response.data.data && Array.isArray(response.data.data)) {
      return response.data.data;
    }
    
    // If response is an object with users/properties array
    if (response && response.users && Array.isArray(response.users)) {
      return response.users;
    }
    if (response && response.properties && Array.isArray(response.properties)) {
      return response.properties;
    }
    if (response && response.data && response.data.users && Array.isArray(response.data.users)) {
      return response.data.users;
    }
    if (response && response.data && response.data.properties && Array.isArray(response.data.properties)) {
      return response.data.properties;
    }
    
    // If no array found, return empty array
    console.warn('No array data found in response, returning empty array');
    return [];
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      setDebugInfo('Starting data fetch...');
      
      console.log('Starting to fetch data...');
      
      // Get all users
      const usersResponse = await adminService.getUsers();
      console.log('Raw users response:', usersResponse);
      setDebugInfo(prev => prev + '\nRaw users response received');
      
      // Extract users data using our helper function
      const allUsers = extractDataFromResponse(usersResponse);
      console.log('Extracted users:', allUsers);
      setDebugInfo(prev => prev + `\nExtracted ${allUsers.length} users`);
      
      // Log all users and their roles for debugging
      if (Array.isArray(allUsers)) {
        console.log('All users with roles:');
        allUsers.forEach(user => {
          console.log(`- ${user.first_name} ${user.last_name}: role = "${user.role}", id = ${user.id}`);
        });
        
        // Filter for agents - check role field directly
        const agentUsers = allUsers.filter(user => {
          // Check various possible role representations
          const userRole = user.role;
          console.log(`Checking user ${user.first_name} ${user.last_name}: role = "${userRole}"`);
          
          // Direct comparison for common role values
          if (userRole === 'agent' || userRole === 'Agent' || userRole === 'AGENT') {
            return true;
          }
          
          // If role is an object, check its value property
          if (userRole && typeof userRole === 'object' && userRole.value) {
            return userRole.value === 'agent' || userRole.value === 'Agent' || userRole.value === 'AGENT';
          }
          
          return false;
        });
        
        console.log('Filtered agents:', agentUsers);
        setDebugInfo(prev => prev + `\nFound ${agentUsers.length} agents after filtering`);
        
        if (agentUsers.length === 0) {
          setDebugInfo(prev => prev + '\nNo agents found. Available roles in users: ' + 
            allUsers.map(u => `${u.first_name} ${u.last_name}: "${u.role}"`).join(', '));
        }
        
        setAgents(agentUsers);
      } else {
        console.error('allUsers is not an array:', allUsers);
        setDebugInfo(prev => prev + `\nERROR: allUsers is not an array: ${typeof allUsers}`);
        setAgents([]);
      }

      // Get properties
      const propertiesResponse = await adminService.getProperties();
      console.log('Raw properties response:', propertiesResponse);
      setDebugInfo(prev => prev + '\nRaw properties response received');
      
      // Extract properties data using our helper function
      const propertiesData = extractDataFromResponse(propertiesResponse);
      console.log('Extracted properties:', propertiesData);
      setDebugInfo(prev => prev + `\nExtracted ${propertiesData.length} properties`);
      
      if (Array.isArray(propertiesData)) {
        setProperties(propertiesData);
      } else {
        console.error('propertiesData is not an array:', propertiesData);
        setDebugInfo(prev => prev + `\nERROR: propertiesData is not an array: ${typeof propertiesData}`);
        setProperties([]);
      }

      // Get existing allocations
      try {
        const allocationsResponse = await adminService.getAgentAllocations();
        const allocationsData = extractDataFromResponse(allocationsResponse);
        
        console.log('Extracted allocations:', allocationsData);
        setDebugInfo(prev => prev + `\nExtracted ${allocationsData.length} allocations`);
        
        if (Array.isArray(allocationsData)) {
          setAllocations(allocationsData);
        } else {
          console.error('allocationsData is not an array:', allocationsData);
          setDebugInfo(prev => prev + `\nERROR: allocationsData is not an array: ${typeof allocationsData}`);
          setAllocations([]);
        }
      } catch (allocError) {
        console.warn('Agent allocations endpoint not available, using empty array');
        setDebugInfo(prev => prev + '\nAgent allocations endpoint not available');
        setAllocations([]);
      }

      setDebugInfo(prev => prev + '\nData fetch completed successfully');

    } catch (err) {
      console.error('Error fetching data:', err);
      const errorMsg = `Failed to load data: ${err.message}. Please check if the backend is running and try again.`;
      setError(errorMsg);
      setDebugInfo(prev => prev + `\nError: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePropertyToggle = (propertyId) => {
    setSelectedProperties(prev => 
      prev.includes(propertyId) 
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleAssignProperties = async () => {
    if (!selectedAgent) {
      alert('Please select an agent');
      return;
    }
    if (selectedProperties.length === 0) {
      alert('Please select at least one property');
      return;
    }

    try {
      setSaving(true);
      
      const agent = agents.find(a => a.id === selectedAgent);
      const propertyNames = properties
        .filter(p => selectedProperties.includes(p.id))
        .map(p => p.name)
        .join(', ');
      
      // Try to use the API if available
      try {
        await adminService.assignPropertiesToAgent(selectedAgent, selectedProperties);
        alert(`Successfully assigned properties: ${propertyNames} to agent: ${agent.first_name} ${agent.last_name}`);
      } catch (apiError) {
        // If API fails, still show success message for demo
        alert(`DEMO: Would assign properties: ${propertyNames} to agent: ${agent.first_name} ${agent.last_name}`);
      }
      
      // Reset form
      setSelectedProperties([]);
      setSelectedAgent('');
      // Refresh data to show updated allocations
      fetchData();
    } catch (err) {
      console.error('Error assigning properties:', err);
      alert('Failed to assign properties. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAllocation = async (allocationId) => {
    if (!confirm('Are you sure you want to remove this allocation?')) return;

    try {
      await adminService.removeAgentAllocation(allocationId);
      alert('Allocation removed successfully!');
      fetchData(); // Refresh data
    } catch (err) {
      console.error('Error removing allocation:', err);
      alert('Failed to remove allocation. Please try again.');
    }
  };

  const getAgentProperties = (agentId) => {
    return allocations.filter(allocation => allocation.agent_id === agentId);
  };

  const getPropertyName = (propertyId) => {
    const property = properties.find(p => p.id === propertyId);
    return property ? property.name : 'Unknown Property';
  };

  const getAgentName = (agentId) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? `${agent.first_name} ${agent.last_name}` : 'Unknown Agent';
  };

  const getAssignedAgentForProperty = (propertyId) => {
    const allocation = allocations.find(a => a.property_id === propertyId);
    return allocation ? getAgentName(allocation.agent_id) : null;
  };

  // Function to manually create a test agent (for development)
  const createTestAgent = async () => {
    try {
      // This would typically call your backend API to create an agent
      // For now, we'll just simulate it by adding to local state
      const testAgent = {
        id: 'test-agent-' + Date.now(),
        first_name: 'Test',
        last_name: 'Agent',
        email: 'test.agent@example.com',
        role: 'agent'
      };
      
      setAgents(prev => [...prev, testAgent]);
      alert('Test agent created locally. In production, this would call your backend API.');
    } catch (err) {
      console.error('Error creating test agent:', err);
      alert('Failed to create test agent');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading agent allocation data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4">{error}</div>
        <div className="text-sm text-gray-600 mb-4">
          Please ensure:
          <ul className="list-disc list-inside mt-2">
            <li>Backend server is running</li>
            <li>API endpoints are accessible</li>
            <li>There are users with 'agent' role in the database</li>
          </ul>
        </div>
        <button
          onClick={fetchData}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 mr-2"
        >
          Retry Loading Data
        </button>
        <button
          onClick={createTestAgent}
          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
        >
          Create Test Agent (Dev)
        </button>
      </div>
    );
  }

  const unassignedProperties = properties.filter(property => 
    !allocations.some(allocation => allocation.property_id === property.id)
  );

  const assignedProperties = properties.filter(property => 
    allocations.some(allocation => allocation.property_id === property.id)
  );

  return (
    <div className="space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agent Allocation</h1>
        <p className="text-gray-600 text-sm mt-1">Assign properties to agents for management and complaint handling</p>
      </div>

      {/* Debug Information */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <details>
          <summary className="cursor-pointer font-semibold text-yellow-800">
            Debug Information (Click to expand) - Showing API Response Structure
          </summary>
          <div className="mt-2 p-2 bg-white rounded text-xs font-mono text-yellow-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
            {debugInfo || 'No debug information yet...'}
          </div>
        </details>
        <div className="mt-2 text-xs text-yellow-700">
          <p>Agents found: {agents.length}</p>
          <p>Properties found: {properties.length}</p>
          <p>Allocations found: {allocations.length}</p>
          {agents.length > 0 && (
            <p>Agent IDs: {agents.map(a => `${a.first_name} ${a.last_name} (${a.id})`).join(', ')}</p>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-800">Available Agents</p>
              <p className="text-2xl font-bold text-blue-600">{agents.length}</p>
            </div>
            <div className="text-blue-600 text-xl">👥</div>
          </div>
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-800">Total Properties</p>
              <p className="text-2xl font-bold text-green-600">{properties.length}</p>
            </div>
            <div className="text-green-600 text-xl">🏠</div>
          </div>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-800">Unassigned Properties</p>
              <p className="text-2xl font-bold text-purple-600">{unassignedProperties.length}</p>
            </div>
            <div className="text-purple-600 text-xl">📋</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assignment Form */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Assign Properties to Agent</h3>
            <button 
              onClick={createTestAgent}
              className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
            >
              + Test Agent
            </button>
          </div>
          
          {/* Agent Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Agent
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Choose an agent...</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.first_name} {agent.last_name} - {agent.email} (Role: {agent.role})
                </option>
              ))}
            </select>
            {agents.length === 0 && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                <p className="text-red-700 text-sm">
                  No agents found in the database. Possible issues:
                </p>
                <ul className="text-red-600 text-xs list-disc list-inside mt-1">
                  <li>No users have role set to 'agent'</li>
                  <li>The role field might be using different values (check console for debug info)</li>
                  <li>API endpoint /users might not be returning expected data structure</li>
                </ul>
                <button
                  onClick={fetchData}
                  className="mt-2 text-blue-600 text-sm underline"
                >
                  Check console for detailed debug information
                </button>
              </div>
            )}
          </div>

          {/* Property Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Properties to Assign ({selectedProperties.length} selected)
            </label>
            <div className="max-h-60 overflow-y-auto border border-gray-300 rounded-md p-2">
              {properties.length === 0 ? (
                <p className="text-gray-500 text-sm p-2">No properties available</p>
              ) : (
                properties.map(property => (
                  <div key={property.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                    <input
                      type="checkbox"
                      id={`property-${property.id}`}
                      checked={selectedProperties.includes(property.id)}
                      onChange={() => handlePropertyToggle(property.id)}
                      disabled={allocations.some(a => a.property_id === property.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label htmlFor={`property-${property.id}`} className="flex-1 text-sm">
                      <span className="font-medium">{property.name}</span>
                      <span className="text-gray-500 ml-2">
                        ({property.occupied_units || 0}/{property.total_units || 0} units)
                      </span>
                      {allocations.some(a => a.property_id === property.id) && (
                        <span className="text-xs text-orange-600 ml-2">
                          (Already assigned)
                        </span>
                      )}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={handleAssignProperties}
            disabled={saving || !selectedAgent || selectedProperties.length === 0}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Assigning...
              </span>
            ) : (
              `Assign ${selectedProperties.length} Properties to Agent`
            )}
          </button>
        </div>

        {/* Current Allocations */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Current Allocations</h3>
            <button 
              onClick={fetchData}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Refresh
            </button>
          </div>
          
          {agents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No agents available in the system</p>
              <p className="text-sm mt-2">
                To assign properties, you need users with role 'agent'. Check the debug information above for details.
              </p>
              <button
                onClick={createTestAgent}
                className="mt-4 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
              >
                Create Test Agent (Development)
              </button>
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {agents.map(agent => {
                const agentProperties = getAgentProperties(agent.id);
                return (
                  <div key={agent.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {agent.first_name} {agent.last_name}
                        </h4>
                        <p className="text-sm text-gray-600">{agent.email}</p>
                        <p className="text-xs text-gray-500">Role: {agent.role} | ID: {agent.id}</p>
                      </div>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        {agentProperties.length} properties
                      </span>
                    </div>
                    
                    {agentProperties.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No properties assigned yet</p>
                    ) : (
                      <div className="space-y-2">
                        {agentProperties.map(allocation => (
                          <div key={allocation.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                            <span className="text-sm font-medium">{getPropertyName(allocation.property_id)}</span>
                            <button
                              onClick={() => handleRemoveAllocation(allocation.id)}
                              className="text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Unassigned Properties */}
      {unassignedProperties.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Properties Needing Agent Assignment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unassignedProperties.map(property => (
              <div key={property.id} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900">{property.name}</h4>
                <p className="text-sm text-gray-600 mb-2">{property.address}</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Total Units:</span>
                    <span className="font-medium">{property.total_units || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Occupied Units:</span>
                    <span className="font-medium text-green-600">{property.occupied_units || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Occupancy Rate:</span>
                    <span className="font-medium text-blue-600">
                      {property.total_units ? Math.round(((property.occupied_units || 0) / property.total_units) * 100) : 0}%
                    </span>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                    Needs Agent Assignment
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Properties with Agents Assigned */}
      {assignedProperties.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Properties with Assigned Agents</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assignedProperties.map(property => {
              const agentName = getAssignedAgentForProperty(property.id);
              return (
                <div key={property.id} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900">{property.name}</h4>
                  <p className="text-sm text-gray-600 mb-2">{property.address}</p>
                  <div className="space-y-1 text-xs mb-3">
                    <div className="flex justify-between">
                      <span>Total Units:</span>
                      <span className="font-medium">{property.total_units || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Occupied Units:</span>
                      <span className="font-medium text-green-600">{property.occupied_units || 0}</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                      Assigned to: {agentName}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentAllocation;