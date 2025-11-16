// backend/controllers/agentController.js
const db = require('../config/database');

const agentController = {
  // Get dashboard statistics for agent
  getDashboardStats: async (req, res) => {
    try {
      const agentId = req.user.id;

      // Get assigned properties count
      const propertiesQuery = `
        SELECT COUNT(DISTINCT p.id) as assigned_properties
        FROM properties p
        INNER JOIN property_units pu ON p.id = pu.property_id
        INNER JOIN complaints c ON pu.id = c.unit_id
        WHERE c.assigned_agent = $1
      `;

      // Get active complaints count
      const activeComplaintsQuery = `
        SELECT COUNT(*) as active_complaints
        FROM complaints
        WHERE assigned_agent = $1 AND status IN ('open', 'in_progress')
      `;

      // Get resolved this month count
      const resolvedThisMonthQuery = `
        SELECT COUNT(*) as resolved_this_month
        FROM complaints
        WHERE assigned_agent = $1 
          AND status = 'resolved'
          AND EXTRACT(MONTH FROM resolved_at) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM resolved_at) = EXTRACT(YEAR FROM CURRENT_DATE)
      `;

      // Get pending tasks (complaints + other tasks)
      const pendingTasksQuery = `
        SELECT COUNT(*) as pending_tasks
        FROM complaints
        WHERE assigned_agent = $1 AND status IN ('open', 'in_progress')
      `;

      const [
        propertiesResult,
        activeComplaintsResult,
        resolvedResult,
        pendingTasksResult
      ] = await Promise.all([
        db.query(propertiesQuery, [agentId]),
        db.query(activeComplaintsQuery, [agentId]),
        db.query(resolvedThisMonthQuery, [agentId]),
        db.query(pendingTasksQuery, [agentId])
      ]);

      const stats = {
        assignedProperties: parseInt(propertiesResult.rows[0]?.assigned_properties) || 0,
        activeComplaints: parseInt(activeComplaintsResult.rows[0]?.active_complaints) || 0,
        resolvedThisMonth: parseInt(resolvedResult.rows[0]?.resolved_this_month) || 0,
        pendingTasks: parseInt(pendingTasksResult.rows[0]?.pending_tasks) || 0
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching agent dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard statistics'
      });
    }
  },

  // Get assigned properties for agent
  getAssignedProperties: async (req, res) => {
    try {
      const agentId = req.user.id;

      const query = `
        SELECT DISTINCT 
          p.id,
          p.property_code,
          p.name,
          p.address,
          p.county,
          p.town,
          p.total_units,
          p.available_units,
          COUNT(DISTINCT ta.id) as occupied_units,
          COUNT(DISTINCT CASE WHEN c.status IN ('open', 'in_progress') THEN c.id END) as active_complaints
        FROM properties p
        INNER JOIN property_units pu ON p.id = pu.property_id
        INNER JOIN complaints c ON pu.id = c.unit_id
        LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
        WHERE c.assigned_agent = $1
        GROUP BY p.id, p.property_code, p.name, p.address, p.county, p.town, p.total_units, p.available_units
        ORDER BY p.name
      `;

      const result = await db.query(query, [agentId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching assigned properties:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch assigned properties'
      });
    }
  },

  // Get recent activities for agent
  getRecentActivities: async (req, res) => {
    try {
      const agentId = req.user.id;

      const query = `
        SELECT 
          c.id,
          c.title,
          c.description,
          c.priority,
          c.status,
          c.raised_at as created_at,
          p.name as property_name,
          pu.unit_number,
          'complaint' as type
        FROM complaints c
        INNER JOIN property_units pu ON c.unit_id = pu.id
        INNER JOIN properties p ON pu.property_id = p.id
        WHERE c.assigned_agent = $1
        ORDER BY c.raised_at DESC
        LIMIT 10
      `;

      const result = await db.query(query, [agentId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching recent activities:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recent activities'
      });
    }
  },

  // Get performance metrics for agent
  getPerformanceMetrics: async (req, res) => {
    try {
      const agentId = req.user.id;

      // Satisfaction rate (from resolved complaints with feedback)
      const satisfactionQuery = `
        SELECT 
          COALESCE(AVG(tenant_satisfaction_rating), 0) as satisfaction_rate
        FROM complaints
        WHERE assigned_agent = $1 
          AND status = 'resolved'
          AND tenant_satisfaction_rating IS NOT NULL
      `;

      // Average resolution time
      const resolutionTimeQuery = `
        SELECT 
          COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - raised_at))/86400), 0) as avg_resolution_time
        FROM complaints
        WHERE assigned_agent = $1 
          AND status = 'resolved'
          AND resolved_at IS NOT NULL
      `;

      // On-time completion rate (resolved within 7 days)
      const onTimeCompletionQuery = `
        SELECT 
          COUNT(*) as total_resolved,
          COUNT(CASE WHEN EXTRACT(EPOCH FROM (resolved_at - raised_at))/86400 <= 7 THEN 1 END) as on_time_resolved,
          CASE 
            WHEN COUNT(*) > 0 THEN ROUND((COUNT(CASE WHEN EXTRACT(EPOCH FROM (resolved_at - raised_at))/86400 <= 7 THEN 1 END) * 100.0 / COUNT(*)), 2)
            ELSE 0
          END as on_time_completion_rate
        FROM complaints
        WHERE assigned_agent = $1 
          AND status = 'resolved'
          AND resolved_at IS NOT NULL
      `;

      // Monthly tasks count
      const monthlyTasksQuery = `
        SELECT COUNT(*) as monthly_tasks
        FROM complaints
        WHERE assigned_agent = $1
          AND EXTRACT(MONTH FROM raised_at) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM raised_at) = EXTRACT(YEAR FROM CURRENT_DATE)
      `;

      const [
        satisfactionResult,
        resolutionTimeResult,
        onTimeResult,
        monthlyTasksResult
      ] = await Promise.all([
        db.query(satisfactionQuery, [agentId]),
        db.query(resolutionTimeQuery, [agentId]),
        db.query(onTimeCompletionQuery, [agentId]),
        db.query(monthlyTasksQuery, [agentId])
      ]);

      const metrics = {
        satisfactionRate: Math.round(satisfactionResult.rows[0]?.satisfaction_rate * 20 || 0), // Convert 1-5 scale to percentage
        avgResolutionTime: Math.round(resolutionTimeResult.rows[0]?.avg_resolution_time * 10) / 10 || 0,
        onTimeCompletion: parseFloat(onTimeResult.rows[0]?.on_time_completion_rate) || 0,
        monthlyTasks: parseInt(monthlyTasksResult.rows[0]?.monthly_tasks) || 0
      };

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance metrics'
      });
    }
  },

  // Get tenants with payment status for assigned properties
  getTenantsWithPaymentStatus: async (req, res) => {
    try {
      const agentId = req.user.id;

      const query = `
        SELECT DISTINCT
          u.id,
          u.first_name,
          u.last_name,
          u.phone_number,
          u.email,
          p.name as property_name,
          pu.unit_number as unit_name,
          ta.monthly_rent,
          (
            SELECT COUNT(*)
            FROM complaints c
            WHERE c.tenant_id = u.id 
              AND c.status IN ('open', 'in_progress')
          ) as active_complaints,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM rent_payments rp 
              WHERE rp.tenant_id = u.id 
                AND rp.payment_month = DATE_TRUNC('month', CURRENT_DATE)
                AND rp.status = 'completed'
            ) THEN 'paid'
            WHEN ta.rent_due_day < EXTRACT(DAY FROM CURRENT_DATE) THEN 'overdue'
            ELSE 'due'
          END as payment_status
        FROM users u
        INNER JOIN tenant_allocations ta ON u.id = ta.tenant_id
        INNER JOIN property_units pu ON ta.unit_id = pu.id
        INNER JOIN properties p ON pu.property_id = p.id
        INNER JOIN complaints c ON pu.id = c.unit_id
        WHERE c.assigned_agent = $1
          AND u.role = 'tenant'
          AND ta.is_active = true
        ORDER BY u.first_name, u.last_name
      `;

      const result = await db.query(query, [agentId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching tenants with payment status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tenants data'
      });
    }
  },

  // Get assigned complaints
  getAssignedComplaints: async (req, res) => {
    try {
      const agentId = req.user.id;

      const query = `
        SELECT 
          c.*,
          p.name as property_name,
          pu.unit_number,
          CONCAT(t.first_name, ' ', t.last_name) as tenant_name,
          t.phone_number as tenant_phone
        FROM complaints c
        INNER JOIN property_units pu ON c.unit_id = pu.id
        INNER JOIN properties p ON pu.property_id = p.id
        LEFT JOIN users t ON c.tenant_id = t.id
        WHERE c.assigned_agent = $1
        ORDER BY 
          CASE 
            WHEN c.priority = 'high' THEN 1
            WHEN c.priority = 'medium' THEN 2
            WHEN c.priority = 'low' THEN 3
            ELSE 4
          END,
          c.raised_at DESC
      `;

      const result = await db.query(query, [agentId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching assigned complaints:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch complaints'
      });
    }
  },

  // Update complaint status
  updateComplaintStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, update_text, update_type } = req.body;
      const agentId = req.user.id;

      // Verify the complaint is assigned to this agent
      const verifyQuery = 'SELECT * FROM complaints WHERE id = $1 AND assigned_agent = $2';
      const verifyResult = await db.query(verifyQuery, [id, agentId]);

      if (verifyResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Complaint not found or not assigned to you'
        });
      }

      let updateQuery = '';
      let queryParams = [];

      if (status === 'in_progress') {
        updateQuery = `
          UPDATE complaints 
          SET status = $1, acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING *
        `;
        queryParams = [status, agentId, id];
      } else if (status === 'resolved') {
        updateQuery = `
          UPDATE complaints 
          SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING *
        `;
        queryParams = [status, agentId, id];
      } else {
        updateQuery = `
          UPDATE complaints 
          SET status = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        queryParams = [status, id];
      }

      const result = await db.query(updateQuery, queryParams);

      // Add complaint update if update_text is provided
      if (update_text && update_type) {
        await db.query(
          'INSERT INTO complaint_updates (complaint_id, updated_by, update_text, update_type) VALUES ($1, $2, $3, $4)',
          [id, agentId, update_text, update_type]
        );
      }

      res.json({
        success: true,
        data: result.rows[0],
        message: 'Complaint status updated successfully'
      });
    } catch (error) {
      console.error('Error updating complaint status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update complaint status'
      });
    }
  },

  // Get salary history for agent
  getSalaryHistory: async (req, res) => {
    try {
      const agentId = req.user.id;

      const query = `
        SELECT 
          sp.*,
          CONCAT(u.first_name, ' ', u.last_name) as paid_by_name
        FROM salary_payments sp
        LEFT JOIN users u ON sp.paid_by = u.id
        WHERE sp.agent_id = $1
        ORDER BY sp.payment_month DESC, sp.created_at DESC
      `;

      const result = await db.query(query, [agentId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching salary history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch salary history'
      });
    }
  }
};

module.exports = agentController;