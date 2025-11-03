import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const TenantComplaints = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'new'
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    unit_id: '',
    title: '',
    description: '',
    category: '',
    priority: 'medium'
  });
  const [units, setUnits] = useState([]);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchComplaints();
    } else {
      fetchUserUnits();
    }
  }, [activeTab]);

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/complaints/my-complaints', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch complaints');
      }
      
      setComplaints(data);
    } catch (error) {
      console.error('Error fetching complaints:', error);
      alert('Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserUnits = async () => {
    try {
      const response = await fetch('/api/tenant/units', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setUnits(data);
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit complaint');
      }

      setFormData({
        unit_id: '',
        title: '',
        description: '',
        category: '',
        priority: 'medium'
      });
      
      setActiveTab('list');
      alert('Complaint submitted successfully!');
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      open: { color: 'bg-yellow-100 text-yellow-800', label: 'Open' },
      in_progress: { color: 'bg-blue-100 text-blue-800', label: 'In Progress' },
      resolved: { color: 'bg-green-100 text-green-800', label: 'Resolved' },
      closed: { color: 'bg-gray-100 text-gray-800', label: 'Closed' }
    };
    
    const config = statusConfig[status] || statusConfig.open;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getPriorityBadge = (priority) => {
    const priorityConfig = {
      high: { color: 'bg-red-100 text-red-800', label: 'High' },
      medium: { color: 'bg-orange-100 text-orange-800', label: 'Medium' },
      low: { color: 'bg-green-100 text-green-800', label: 'Low' }
    };
    
    const config = priorityConfig[priority] || priorityConfig.medium;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header Section */}
      <div className="bg-white rounded-lg shadow-sm p-4 md:p-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">Complaints & Maintenance</h1>
        <p className="text-sm md:text-base text-gray-600">Submit and track your maintenance requests</p>
      </div>

      {/* Tab Navigation - Mobile Optimized */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex-1 min-w-0 py-3 px-4 text-center font-medium text-xs md:text-sm min-h-[44px] touch-manipulation ${
                activeTab === 'list'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              My Complaints
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`flex-1 min-w-0 py-3 px-4 text-center font-medium text-xs md:text-sm min-h-[44px] touch-manipulation ${
                activeTab === 'new'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Submit New
            </button>
          </nav>
        </div>

        <div className="p-4 md:p-6">
          {/* Complaints List View */}
          {activeTab === 'list' && (
            <>
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-3">
                    {complaints.map((complaint) => (
                      <div key={complaint.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">
                              {complaint.title}
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">{complaint.category}</p>
                          </div>
                          <div className="flex flex-col items-end space-y-1 ml-2">
                            {getPriorityBadge(complaint.priority)}
                            {getStatusBadge(complaint.status)}
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <span className="text-xs text-gray-600">
                            Unit {complaint.unit_number}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(complaint.raised_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Complaint
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Unit
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Priority
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {complaints.map((complaint) => (
                          <tr key={complaint.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {complaint.title}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {complaint.category}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              {complaint.unit_number}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              {getPriorityBadge(complaint.priority)}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              {getStatusBadge(complaint.status)}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(complaint.raised_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {complaints.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm md:text-base">
                      No complaints found
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* New Complaint Form */}
          {activeTab === 'new' && (
            <div className="max-w-2xl mx-auto">
              <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Unit *
                  </label>
                  <select
                    name="unit_id"
                    value={formData.unit_id}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
                  >
                    <option value="">Select a unit</option>
                    {units.map((unit) => (
                      <option key={unit.unit_id} value={unit.unit_id}>
                        {unit.property_name} - Unit {unit.unit_number}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    placeholder="Brief description of the issue"
                    className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category *
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
                  >
                    <option value="">Select category</option>
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="structural">Structural</option>
                    <option value="appliance">Appliance</option>
                    <option value="security">Security</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priority
                  </label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] touch-manipulation"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    required
                    rows="4"
                    placeholder="Please provide detailed information about the issue..."
                    className="w-full px-3 py-3 text-sm md:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical touch-manipulation"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 text-sm md:text-base font-medium min-h-[44px] touch-manipulation transition-colors duration-200"
                >
                  {loading ? 'Submitting...' : 'Submit Complaint'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TenantComplaints;