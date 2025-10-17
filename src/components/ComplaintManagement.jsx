import React, { useState, useEffect } from 'react';
import { useComplaint } from '../context/ComplaintContext';
import { useAllocation } from '../context/TenantAllocationContext';
import { useUser } from '../context/UserContext';

const ComplaintManagement = () => {
  const {
    complaints,
    loading,
    error,
    fetchComplaints,
    createComplaint,
    updateComplaint,
    assignComplaint,
    resolveComplaint,
    getComplaintStats,
    clearError
  } = useComplaint();

  const { allocations } = useAllocation();
  const { users } = useUser();

  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [complaintData, setComplaintData] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'medium',
    unit_id: ''
  });
  const [resolutionData, setResolutionData] = useState({
    resolution_notes: '',
    tenant_feedback: '',
    tenant_satisfaction_rating: 5
  });
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // SAFE CHECK: Ensure data is always arrays
  const safeComplaints = Array.isArray(complaints) ? complaints : [];
  const safeAllocations = Array.isArray(allocations) ? allocations : [];
  const safeUsers = Array.isArray(users) ? users : [];

  // Get active allocations for complaint creation
  const activeAllocations = safeAllocations.filter(allocation => allocation.is_active);

  // Get available agents
  const availableAgents = safeUsers.filter(user => user.role === 'agent' && user.is_active);

  // Filter complaints based on selected filters
  const filteredComplaints = safeComplaints.filter(complaint => {
    const matchesStatus = !filterStatus || complaint.status === filterStatus;
    const matchesPriority = !filterPriority || complaint.priority === filterPriority;
    return matchesStatus && matchesPriority;
  });

  // Load complaints on component mount
  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!showComplaintModal) {
      setComplaintData({
        title: '',
        description: '',
        category: '',
        priority: 'medium',
        unit_id: ''
      });
    }
  }, [showComplaintModal]);

  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    clearError();
    
    try {
      const allocation = activeAllocations.find(a => a.id === complaintData.unit_id);

      if (!allocation) {
        alert('Please select a unit');
        return;
      }

      await createComplaint({
        tenant_id: allocation.tenant_id,
        ...complaintData
      });

      alert('Complaint submitted successfully!');
      setShowComplaintModal(false);
    } catch (error) {
      console.error('Error creating complaint:', error);
    }
  };

  const handleAssignComplaint = async (complaintId) => {
    try {
      await assignComplaint(complaintId, selectedAgent);
      alert('Complaint assigned successfully!');
      setShowAssignModal(false);
      setSelectedAgent('');
    } catch (error) {
      console.error('Error assigning complaint:', error);
    }
  };

  const handleResolveComplaint = async (complaintId) => {
    try {
      await resolveComplaint(complaintId, resolutionData);
      alert('Complaint resolved successfully!');
      setShowResolveModal(false);
      setResolutionData({
        resolution_notes: '',
        tenant_feedback: '',
        tenant_satisfaction_rating: 5
      });
    } catch (error) {
      console.error('Error resolving complaint:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-KE');
    } catch {
      return 'Invalid Date';
    }
  };

  // Get complaint statistics
  const complaintStats = getComplaintStats();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading complaints...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Complaint Management</h2>
          <p className="text-gray-600">Manage tenant complaints and maintenance requests</p>
        </div>
        <button
          onClick={() => setShowComplaintModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={activeAllocations.length === 0}
        >
          Submit Complaint
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button 
            onClick={clearError}
            className="float-right text-red-800 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{complaintStats.total}</div>
            <div className="text-sm text-gray-600">Total Complaints</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{complaintStats.open}</div>
            <div className="text-sm text-gray-600">Open</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{complaintStats.inProgress}</div>
            <div className="text-sm text-gray-600">In Progress</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{complaintStats.resolved}</div>
            <div className="text-sm text-gray-600">Resolved</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{complaintStats.highPriority}</div>
            <div className="text-sm text-gray-600">High Priority</div>
          </div>
        </div>
      </div>

      {/* Complaint Modal */}
      {showComplaintModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Submit New Complaint</h3>
            <form onSubmit={handleCreateComplaint} className="space-y-4">
              {/* Unit Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Unit *</label>
                <select
                  value={complaintData.unit_id}
                  onChange={(e) => setComplaintData({...complaintData, unit_id: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Choose a unit</option>
                  {activeAllocations.map(allocation => (
                    <option key={allocation.id} value={allocation.id}>
                      {allocation.tenant?.first_name || 'Unknown'} {allocation.tenant?.last_name || 'Tenant'} - 
                      {allocation.unit?.unit_code || 'Unknown Unit'}
                    </option>
                  ))}
                </select>
                {activeAllocations.length === 0 && (
                  <p className="text-sm text-red-600 mt-1">No active tenant allocations found.</p>
                )}
              </div>

              {/* Complaint Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Title *</label>
                <input
                  type="text"
                  placeholder="Brief description of the issue"
                  value={complaintData.title}
                  onChange={(e) => setComplaintData({...complaintData, title: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description *</label>
                <textarea
                  placeholder="Detailed description of the issue..."
                  value={complaintData.description}
                  onChange={(e) => setComplaintData({...complaintData, description: e.target.value})}
                  rows={4}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Category *</label>
                  <select
                    value={complaintData.category}
                    onChange={(e) => setComplaintData({...complaintData, category: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select Category</option>
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="structural">Structural</option>
                    <option value="appliance">Appliance</option>
                    <option value="security">Security</option>
                    <option value="cleanliness">Cleanliness</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Priority *</label>
                  <select
                    value={complaintData.priority}
                    onChange={(e) => setComplaintData({...complaintData, priority: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button 
                  type="submit" 
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex-1"
                >
                  Submit Complaint
                </button>
                <button
                  type="button"
                  onClick={() => setShowComplaintModal(false)}
                  className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Assign Complaint</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600">Complaint: {selectedComplaint.title}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Agent *</label>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Choose an agent</option>
                  {availableAgents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.first_name} {agent.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-4 pt-4">
                <button 
                  onClick={() => handleAssignComplaint(selectedComplaint.id)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex-1"
                  disabled={!selectedAgent}
                >
                  Assign
                </button>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Resolve Complaint</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600">Complaint: {selectedComplaint.title}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Resolution Notes *</label>
                <textarea
                  placeholder="Describe how the complaint was resolved..."
                  value={resolutionData.resolution_notes}
                  onChange={(e) => setResolutionData({...resolutionData, resolution_notes: e.target.value})}
                  rows={4}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tenant Feedback</label>
                <textarea
                  placeholder="Tenant feedback about the resolution..."
                  value={resolutionData.tenant_feedback}
                  onChange={(e) => setResolutionData({...resolutionData, tenant_feedback: e.target.value})}
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Satisfaction Rating</label>
                <select
                  value={resolutionData.tenant_satisfaction_rating}
                  onChange={(e) => setResolutionData({...resolutionData, tenant_satisfaction_rating: parseInt(e.target.value)})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={5}>5 Stars - Excellent</option>
                  <option value={4}>4 Stars - Very Good</option>
                  <option value={3}>3 Stars - Good</option>
                  <option value={2}>2 Stars - Fair</option>
                  <option value={1}>1 Star - Poor</option>
                </select>
              </div>
              <div className="flex space-x-4 pt-4">
                <button 
                  onClick={() => handleResolveComplaint(selectedComplaint.id)}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex-1"
                >
                  Mark Resolved
                </button>
                <button
                  onClick={() => setShowResolveModal(false)}
                  className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complaints List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            Complaints ({filteredComplaints.length})
            {(filterStatus || filterPriority) && ' (Filtered)'}
          </h3>
          <div className="flex space-x-4">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="p-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="p-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button
              onClick={() => { setFilterStatus(''); setFilterPriority(''); }}
              className="bg-gray-500 text-white px-3 py-2 rounded-md text-sm hover:bg-gray-600"
            >
              Clear
            </button>
          </div>
        </div>
        
        {filteredComplaints.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🔧</div>
            <p>No complaints found</p>
            <p className="text-sm">
              {filterStatus || filterPriority ? 'Try changing your filters' : 'Submit complaints to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Complaint Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Tenant & Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Category & Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Status & Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredComplaints.map((complaint) => (
                  <tr key={complaint.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
                        {complaint.title}
                      </div>
                      <div className="text-sm text-gray-500 line-clamp-2">
                        {complaint.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
                        {complaint.tenant?.first_name || 'Unknown'} {complaint.tenant?.last_name || 'Tenant'}
                      </div>
                      <div className="text-sm text-gray-500 whitespace-nowrap">
                        {complaint.unit?.unit_code || 'Unknown Unit'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 whitespace-nowrap capitalize">
                        {complaint.category}
                      </div>
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getPriorityColor(complaint.priority)}`}>
                        {complaint.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(complaint.status)}`}>
                        {complaint.status.replace('_', ' ')}
                      </span>
                      <div className="text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(complaint.raised_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {complaint.status === 'open' && (
                        <button
                          onClick={() => {
                            setSelectedComplaint(complaint);
                            setShowAssignModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 whitespace-nowrap"
                        >
                          Assign
                        </button>
                      )}
                      {complaint.status === 'in_progress' && (
                        <button
                          onClick={() => {
                            setSelectedComplaint(complaint);
                            setShowResolveModal(true);
                          }}
                          className="text-green-600 hover:text-green-900 whitespace-nowrap"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComplaintManagement;