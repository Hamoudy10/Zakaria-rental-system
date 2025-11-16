// backend/controllers/agentPermissionController.js
const db = require('../config/database');

const agentPermissionController = {
  // Get all agents with their permissions
  getAllAgents: async (req, res) => {
    try {
      const query = `
        SELECT 
          u.id,
          u.national_id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone_number,
          u.is_active,
          u.created_at,
          COUNT(DISTINCT c.id) as assigned_complaints,
          COUNT(DISTINCT p.id) as managed_properties
        FROM users u
        LEFT JOIN complaints c ON u.id = c.assigned_agent AND c.status IN ('open', 'in_progress')
        LEFT JOIN property_units pu ON c.unit_id = pu.id
        LEFT JOIN properties p ON pu.property_id = p.id
        WHERE u.role = 'agent'
        GROUP BY u.id, u.national_id, u.first_name, u.last_name, u.email, u.phone_number, u.is_active, u.created_at
        ORDER BY u.first_name, u.last_name
      `;

      const result = await db.query(query);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching agents:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch agents'
      });
    }
  },

  // Update agent permissions and status
  updateAgentPermissions: async (req, res) => {
    try {
      const { id } = req.params;
      const { is_active, assigned_properties, permissions } = req.body;

      // Verify the user is an agent
      const agentCheck = await db.query(
        'SELECT id FROM users WHERE id = $1 AND role = $2',
        [id, 'agent']
      );

      if (agentCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found'
        });
      }

      // Update agent active status
      await db.query(
        'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [is_active, id]
      );

      // Here you can add logic to handle assigned properties and specific permissions
      // For now, we'll just update the basic status

      res.json({
        success: true,
        message: 'Agent permissions updated successfully'
      });
    } catch (error) {
      console.error('Error updating agent permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update agent permissions'
      });
    }
  },

  // Get agent performance metrics
  getAgentPerformance: async (req, res) => {
    try {
      const { id } = req.params;

      const performanceQuery = `
        SELECT 
          u.id,
          u.first_name,
          u.last_name,
          COUNT(c.id) as total_complaints,
          COUNT(CASE WHEN c.status = 'resolved' THEN 1 END) as resolved_complaints,
          COUNT(CASE WHEN c.status IN ('open', 'in_progress') THEN 1 END) as active_complaints,
          AVG(CASE WHEN c.tenant_satisfaction_rating IS NOT NULL THEN c.tenant_satisfaction_rating END) as avg_satisfaction,
          AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.raised_at))/86400) as avg_resolution_days
        FROM users u
        LEFT JOIN complaints c ON u.id = c.assigned_agent
        WHERE u.id = $1 AND u.role = 'agent'
        GROUP BY u.id, u.first_name, u.last_name
      `;

      const result = await db.query(performanceQuery, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found'
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error fetching agent performance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch agent performance'
      });
    }
  }
};

module.exports = agentPermissionController;