const db = require('../config/database');

const agentController = {
  getDashboardStats: async (req, res) => {
    try {
      const agentId = req.user.id;

      // Get assigned properties count
      const propertiesCount = await db.query(
        `SELECT COUNT(*) FROM properties WHERE assigned_agent_id = $1`,
        [agentId]
      );

      // Get active complaints count
      const activeComplaints = await db.query(
        `SELECT COUNT(*) FROM complaints WHERE assigned_agent = $1 AND status = 'open'`,
        [agentId]
      );

      // Get resolved complaints this month
      const resolvedThisMonth = await db.query(
        `SELECT COUNT(*) FROM complaints 
         WHERE assigned_agent = $1 AND status = 'resolved' 
         AND DATE_PART('month', resolved_at) = DATE_PART('month', CURRENT_DATE)`,
        [agentId]
      );

      // Get pending tasks
      const pendingTasks = await db.query(
        `SELECT COUNT(*) FROM complaints 
         WHERE assigned_agent = $1 AND status IN ('open', 'in_progress')`,
        [agentId]
      );

      res.json({
        data: {
          assignedProperties: parseInt(propertiesCount.rows[0].count),
          activeComplaints: parseInt(activeComplaints.rows[0].count),
          resolvedThisMonth: parseInt(resolvedThisMonth.rows[0].count),
          pendingTasks: parseInt(pendingTasks.rows[0].count)
        }
      });
    } catch (error) {
      console.error('Error fetching agent dashboard stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getAssignedProperties: async (req, res) => {
    try {
      const agentId = req.user.id;

      const properties = await db.query(
        `SELECT 
          p.id, p.name, p.address, p.total_units,
          COUNT(DISTINCT pu.id) as occupied_units,
          COUNT(DISTINCT c.id) as active_complaints
         FROM properties p
         LEFT JOIN property_units pu ON p.id = pu.property_id AND pu.is_occupied = true
         LEFT JOIN complaints c ON p.id = c.property_id AND c.status = 'open'
         WHERE p.assigned_agent_id = $1
         GROUP BY p.id, p.name, p.address, p.total_units`,
        [agentId]
      );

      res.json({
        data: properties.rows
      });
    } catch (error) {
      console.error('Error fetching assigned properties:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getTenantsWithPaymentStatus: async (req, res) => {
    try {
      const agentId = req.user.id;

      const tenants = await db.query(
        `SELECT 
          u.id, u.first_name, u.last_name, u.phone_number,
          p.name as property_name,
          pu.unit_number as unit_name,
          ta.monthly_rent,
          COUNT(DISTINCT c.id) as active_complaints,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM rent_payments rp 
              WHERE rp.tenant_id = u.id 
              AND rp.payment_month = DATE_TRUNC('month', CURRENT_DATE)
              AND rp.status = 'completed'
            ) THEN 'paid'
            WHEN CURRENT_DATE > (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '5 days') THEN 'overdue'
            ELSE 'due'
          END as payment_status
         FROM users u
         INNER JOIN tenant_allocations ta ON u.id = ta.tenant_id
         INNER JOIN property_units pu ON ta.unit_id = pu.id
         INNER JOIN properties p ON pu.property_id = p.id
         LEFT JOIN complaints c ON u.id = c.tenant_id AND c.status = 'open'
         WHERE p.assigned_agent_id = $1 AND u.role = 'tenant'
         GROUP BY u.id, u.first_name, u.last_name, u.phone_number, p.name, pu.unit_number, ta.monthly_rent`,
        [agentId]
      );

      res.json({
        data: tenants.rows
      });
    } catch (error) {
      console.error('Error fetching tenants with payment status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getRecentActivities: async (req, res) => {
    try {
      const agentId = req.user.id;

      const activities = await db.query(
        `SELECT 
          'complaint' as type,
          c.title as description,
          p.name as property_name,
          c.priority,
          c.raised_at as created_at
         FROM complaints c
         INNER JOIN properties p ON c.property_id = p.id
         WHERE c.assigned_agent = $1
         UNION ALL
         SELECT 
          'maintenance' as type,
          'Maintenance completed' as description,
          p.name as property_name,
          'low' as priority,
          CURRENT_TIMESTAMP as created_at
         FROM maintenance_requests mr
         INNER JOIN properties p ON mr.property_id = p.id
         WHERE mr.assigned_agent_id = $1 AND mr.status = 'completed'
         ORDER BY created_at DESC
         LIMIT 10`,
        [agentId]
      );

      res.json({
        data: activities.rows
      });
    } catch (error) {
      console.error('Error fetching recent activities:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getPerformanceMetrics: async (req, res) => {
    try {
      const agentId = req.user.id;

      // Calculate satisfaction rate from complaint feedback
      const satisfactionRate = await db.query(
        `SELECT 
          ROUND(AVG(COALESCE(tenant_satisfaction_rating, 0)) * 100) as satisfaction_rate
         FROM complaints 
         WHERE assigned_agent = $1 AND tenant_satisfaction_rating IS NOT NULL`,
        [agentId]
      );

      // Calculate average resolution time
      const avgResolutionTime = await db.query(
        `SELECT 
          ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - raised_at)) / 86400)::numeric, 1) as avg_days
         FROM complaints 
         WHERE assigned_agent = $1 AND resolved_at IS NOT NULL`,
        [agentId]
      );

      // Calculate on-time completion rate
      const onTimeCompletion = await db.query(
        `SELECT 
          ROUND((COUNT(CASE WHEN resolved_at <= acknowledged_at + INTERVAL '7 days' THEN 1 END) * 100.0 / COUNT(*))) as on_time_rate
         FROM complaints 
         WHERE assigned_agent = $1 AND resolved_at IS NOT NULL`,
        [agentId]
      );

      // Count monthly tasks
      const monthlyTasks = await db.query(
        `SELECT COUNT(*) as task_count
         FROM complaints 
         WHERE assigned_agent = $1 
         AND DATE_PART('month', raised_at) = DATE_PART('month', CURRENT_DATE)`,
        [agentId]
      );

      res.json({
        data: {
          satisfactionRate: satisfactionRate.rows[0]?.satisfaction_rate || 0,
          avgResolutionTime: avgResolutionTime.rows[0]?.avg_days || 0,
          onTimeCompletion: onTimeCompletion.rows[0]?.on_time_rate || 0,
          monthlyTasks: parseInt(monthlyTasks.rows[0]?.task_count) || 0
        }
      });
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = agentController;