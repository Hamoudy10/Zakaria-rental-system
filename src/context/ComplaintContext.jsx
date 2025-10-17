import React, { createContext, useState, useContext, useCallback } from 'react';
import { complaintAPI } from '../services/api';

const ComplaintContext = createContext(undefined);

export const useComplaint = () => {
  const context = useContext(ComplaintContext);
  if (context === undefined) {
    throw new Error('useComplaint must be used within a ComplaintProvider');
  }
  return context;
};

export const ComplaintProvider = ({ children }) => {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  // Fetch all complaints
  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await complaintAPI.getComplaints();
      setComplaints(response.data.complaints || []);
    } catch (err) {
      console.error('Error fetching complaints:', err);
      setError('Failed to fetch complaints');
      setComplaints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new complaint
  const createComplaint = useCallback(async (complaintData) => {
    setLoading(true);
    setError(null);
    try {
      const newComplaint = {
        id: Math.random().toString(36).substr(2, 9),
        ...complaintData,
        status: 'open',
        raised_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        tenant: {
          id: complaintData.tenant_id,
          first_name: 'Tenant',
          last_name: 'User'
        },
        unit: {
          id: complaintData.unit_id,
          unit_code: 'UNIT001'
        }
      };
      
      setComplaints(prev => [...prev, newComplaint]);
      return newComplaint;
    } catch (err) {
      console.error('Error creating complaint:', err);
      setError('Failed to create complaint');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update complaint
  const updateComplaint = useCallback(async (complaintId, updates) => {
    setLoading(true);
    setError(null);
    try {
      setComplaints(prev => prev.map(complaint => 
        complaint.id === complaintId ? { ...complaint, ...updates } : complaint
      ));
    } catch (err) {
      console.error('Error updating complaint:', err);
      setError('Failed to update complaint');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Assign complaint to agent
  const assignComplaint = useCallback(async (complaintId, agentId) => {
    setLoading(true);
    setError(null);
    try {
      setComplaints(prev => prev.map(complaint => 
        complaint.id === complaintId 
          ? { 
              ...complaint, 
              assigned_agent: agentId,
              status: 'in_progress',
              acknowledged_at: new Date().toISOString()
            } 
          : complaint
      ));
    } catch (err) {
      console.error('Error assigning complaint:', err);
      setError('Failed to assign complaint');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Resolve complaint
  const resolveComplaint = useCallback(async (complaintId, resolutionData) => {
    setLoading(true);
    setError(null);
    try {
      setComplaints(prev => prev.map(complaint => 
        complaint.id === complaintId 
          ? { 
              ...complaint, 
              status: 'resolved',
              resolved_at: new Date().toISOString(),
              ...resolutionData
            } 
          : complaint
      ));
    } catch (err) {
      console.error('Error resolving complaint:', err);
      setError('Failed to resolve complaint');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Add complaint update
  const addComplaintUpdate = useCallback(async (complaintId, updateData) => {
    setLoading(true);
    setError(null);
    try {
      const newUpdate = {
        id: Math.random().toString(36).substr(2, 9),
        complaint_id: complaintId,
        ...updateData,
        created_at: new Date().toISOString()
      };
      
      // In a real app, this would be a separate API call
      // For now, we'll just update the local state
      return newUpdate;
    } catch (err) {
      console.error('Error adding complaint update:', err);
      setError('Failed to add complaint update');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get complaints by status
  const getComplaintsByStatus = useCallback((status) => {
    return complaints.filter(complaint => complaint.status === status);
  }, [complaints]);

  // Get complaints by priority
  const getComplaintsByPriority = useCallback((priority) => {
    return complaints.filter(complaint => complaint.priority === priority);
  }, [complaints]);

  // Get agent complaints
  const getAgentComplaints = useCallback((agentId) => {
    return complaints.filter(complaint => complaint.assigned_agent === agentId);
  }, [complaints]);

  // Get complaint statistics
  const getComplaintStats = useCallback(() => {
    const openComplaints = complaints.filter(c => c.status === 'open').length;
    const inProgressComplaints = complaints.filter(c => c.status === 'in_progress').length;
    const resolvedComplaints = complaints.filter(c => c.status === 'resolved').length;
    const highPriority = complaints.filter(c => c.priority === 'high').length;
    
    return {
      total: complaints.length,
      open: openComplaints,
      inProgress: inProgressComplaints,
      resolved: resolvedComplaints,
      highPriority
    };
  }, [complaints]);

  const value = React.useMemo(() => ({
    complaints,
    loading,
    error,
    selectedComplaint,
    setSelectedComplaint,
    fetchComplaints,
    createComplaint,
    updateComplaint,
    assignComplaint,
    resolveComplaint,
    addComplaintUpdate,
    getComplaintsByStatus,
    getComplaintsByPriority,
    getAgentComplaints,
    getComplaintStats,
    clearError: () => setError(null)
  }), [
    complaints,
    loading,
    error,
    selectedComplaint,
    fetchComplaints,
    createComplaint,
    updateComplaint,
    assignComplaint,
    resolveComplaint,
    addComplaintUpdate,
    getComplaintsByStatus,
    getComplaintsByPriority,
    getAgentComplaints,
    getComplaintStats
  ]);

  return (
    <ComplaintContext.Provider value={value}>
      {children}
    </ComplaintContext.Provider>
  );
};