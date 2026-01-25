// ============================================
// UPDATED ComplaintContext.jsx
// Replace your existing src/context/ComplaintContext.jsx with this
// ============================================

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
  const fetchComplaints = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await complaintAPI.getComplaints(params);
      const complaintsData = response.data?.data || response.data?.complaints || [];
      setComplaints(Array.isArray(complaintsData) ? complaintsData : []);
      return complaintsData;
    } catch (err) {
      console.error('Error fetching complaints:', err);
      setError(err.response?.data?.message || 'Failed to fetch complaints');
      setComplaints([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get single complaint with steps
  const getComplaint = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const response = await complaintAPI.getComplaint(id);
      const complaint = response.data?.data || response.data;
      return complaint;
    } catch (err) {
      console.error('Error fetching complaint:', err);
      setError(err.response?.data?.message || 'Failed to fetch complaint');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new complaint
  const createComplaint = useCallback(async (complaintData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await complaintAPI.createComplaint(complaintData);
      const newComplaint = response.data?.data || response.data;
      
      // Add to local state
      setComplaints(prev => [newComplaint, ...prev]);
      
      return newComplaint;
    } catch (err) {
      console.error('Error creating complaint:', err);
      setError(err.response?.data?.message || 'Failed to create complaint');
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
      const response = await complaintAPI.updateComplaint(complaintId, updates);
      const updatedComplaint = response.data?.data || response.data;
      
      // Update local state
      setComplaints(prev => prev.map(complaint => 
        complaint.id === complaintId ? { ...complaint, ...updatedComplaint } : complaint
      ));
      
      return updatedComplaint;
    } catch (err) {
      console.error('Error updating complaint:', err);
      setError(err.response?.data?.message || 'Failed to update complaint');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update complaint status
  const updateComplaintStatus = useCallback(async (complaintId, status) => {
    setLoading(true);
    setError(null);
    try {
      const response = await complaintAPI.updateComplaintStatus(complaintId, status);
      const updatedComplaint = response.data?.data || response.data;
      
      // Update local state
      setComplaints(prev => prev.map(complaint => 
        complaint.id === complaintId ? { ...complaint, status, ...updatedComplaint } : complaint
      ));
      
      return updatedComplaint;
    } catch (err) {
      console.error('Error updating complaint status:', err);
      setError(err.response?.data?.message || 'Failed to update complaint status');
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
      const response = await complaintAPI.assignComplaint(complaintId, agentId);
      const updatedComplaint = response.data?.data || response.data;
      
      // Update local state
      setComplaints(prev => prev.map(complaint => 
        complaint.id === complaintId 
          ? { ...complaint, assigned_agent: agentId, ...updatedComplaint } 
          : complaint
      ));
      
      return updatedComplaint;
    } catch (err) {
      console.error('Error assigning complaint:', err);
      setError(err.response?.data?.message || 'Failed to assign complaint');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get complaint steps
  const getComplaintSteps = useCallback(async (complaintId) => {
    try {
      const response = await complaintAPI.getComplaintSteps(complaintId);
      return response.data?.data || response.data || [];
    } catch (err) {
      console.error('Error fetching complaint steps:', err);
      throw err;
    }
  }, []);

  // Add step to complaint
  const addComplaintStep = useCallback(async (complaintId, stepData) => {
    try {
      const response = await complaintAPI.addComplaintStep(complaintId, stepData);
      return response.data?.data || response.data;
    } catch (err) {
      console.error('Error adding complaint step:', err);
      setError(err.response?.data?.message || 'Failed to add step');
      throw err;
    }
  }, []);

  // Add multiple steps to complaint
  const addMultipleSteps = useCallback(async (complaintId, steps) => {
    try {
      const response = await complaintAPI.addMultipleSteps(complaintId, steps);
      
      // Update complaint status in local state
      setComplaints(prev => prev.map(complaint => 
        complaint.id === complaintId 
          ? { ...complaint, status: 'in_progress' } 
          : complaint
      ));
      
      return response.data?.data || response.data;
    } catch (err) {
      console.error('Error adding complaint steps:', err);
      setError(err.response?.data?.message || 'Failed to add steps');
      throw err;
    }
  }, []);

  // Toggle step completion
  const toggleComplaintStep = useCallback(async (complaintId, stepId, isCompleted) => {
    try {
      const response = await complaintAPI.toggleComplaintStep(complaintId, stepId, isCompleted);
      const result = response.data;
      
      // If all steps completed, update complaint status
      if (result.allCompleted) {
        setComplaints(prev => prev.map(complaint => 
          complaint.id === complaintId 
            ? { ...complaint, status: 'resolved' } 
            : complaint
        ));
      }
      
      return result;
    } catch (err) {
      console.error('Error toggling step:', err);
      setError(err.response?.data?.message || 'Failed to update step');
      throw err;
    }
  }, []);

  // Delete step
  const deleteComplaintStep = useCallback(async (complaintId, stepId) => {
    try {
      await complaintAPI.deleteComplaintStep(complaintId, stepId);
    } catch (err) {
      console.error('Error deleting step:', err);
      setError(err.response?.data?.message || 'Failed to delete step');
      throw err;
    }
  }, []);

  // Resolve complaint
  const resolveComplaint = useCallback(async (complaintId, resolutionData = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await complaintAPI.resolveComplaint(complaintId, resolutionData);
      const updatedComplaint = response.data?.data || response.data;
      
      // Update local state
      setComplaints(prev => prev.map(complaint => 
        complaint.id === complaintId 
          ? { 
              ...complaint, 
              status: 'resolved',
              resolved_at: new Date().toISOString(),
              ...updatedComplaint 
            } 
          : complaint
      ));
      
      return updatedComplaint;
    } catch (err) {
      console.error('Error resolving complaint:', err);
      setError(err.response?.data?.message || 'Failed to resolve complaint');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Add complaint update/comment
  const addComplaintUpdate = useCallback(async (complaintId, updateData) => {
    try {
      const response = await complaintAPI.addComplaintUpdate(complaintId, updateData);
      return response.data?.data || response.data;
    } catch (err) {
      console.error('Error adding complaint update:', err);
      setError(err.response?.data?.message || 'Failed to add update');
      throw err;
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
    const safeComplaints = Array.isArray(complaints) ? complaints : [];
    
    return {
      total: safeComplaints.length,
      open: safeComplaints.filter(c => c.status === 'open').length,
      inProgress: safeComplaints.filter(c => c.status === 'in_progress').length,
      resolved: safeComplaints.filter(c => c.status === 'resolved').length,
      highPriority: safeComplaints.filter(c => c.priority === 'high').length
    };
  }, [complaints]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = React.useMemo(() => ({
    // State
    complaints,
    loading,
    error,
    selectedComplaint,
    setSelectedComplaint,
    
    // CRUD Operations
    fetchComplaints,
    getComplaint,
    createComplaint,
    updateComplaint,
    updateComplaintStatus,
    assignComplaint,
    resolveComplaint,
    addComplaintUpdate,
    
    // Steps Operations
    getComplaintSteps,
    addComplaintStep,
    addMultipleSteps,
    toggleComplaintStep,
    deleteComplaintStep,
    
    // Filter Functions
    getComplaintsByStatus,
    getComplaintsByPriority,
    getAgentComplaints,
    getComplaintStats,
    
    // Utilities
    clearError
  }), [
    complaints,
    loading,
    error,
    selectedComplaint,
    fetchComplaints,
    getComplaint,
    createComplaint,
    updateComplaint,
    updateComplaintStatus,
    assignComplaint,
    resolveComplaint,
    addComplaintUpdate,
    getComplaintSteps,
    addComplaintStep,
    addMultipleSteps,
    toggleComplaintStep,
    deleteComplaintStep,
    getComplaintsByStatus,
    getComplaintsByPriority,
    getAgentComplaints,
    getComplaintStats,
    clearError
  ]);

  return (
    <ComplaintContext.Provider value={value}>
      {children}
    </ComplaintContext.Provider>
  );
};

export default ComplaintContext;