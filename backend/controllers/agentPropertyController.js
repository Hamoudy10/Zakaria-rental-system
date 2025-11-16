// backend/controllers/agentPropertyController.js
const db = require('../config/database');

const agentPropertyController = {
  // Assign properties to agent
  assignPropertiesToAgent: async (req, res) => {
    try {
      const { agent_id, property_ids } = req.body;
      const assigned_by = req.user.id; // From auth middleware

      console.log('Assigning properties to agent:', { agent_id, property_ids, assigned_by });

      // Validate input
      if (!agent_id || !property_ids || !Array.isArray(property_ids)) {
        return res.status(400).json({
          success: false,
          message: 'Agent ID and property IDs array are required'
        });
      }

      const client = await db.getClient();
      
      try {
        await client.query('BEGIN');

        // Insert each property assignment
        for (const property_id of property_ids) {
          await client.query(
            `INSERT INTO agent_property_assignments (agent_id, property_id, assigned_by, is_active) 
             VALUES ($1, $2, $3, true) 
             ON CONFLICT (agent_id, property_id) 
             DO UPDATE SET is_active = true, assigned_at = CURRENT_TIMESTAMP`,
            [agent_id, property_id, assigned_by]
          );
        }

        await client.query('COMMIT');

        res.json({
          success: true,
          message: `Successfully assigned ${property_ids.length} properties to agent`
        });

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error assigning properties to agent:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign properties to agent',
        error: error.message
      });
    }
  },

  // Remove agent property assignment
  removeAgentPropertyAssignment: async (req, res) => {
    try {
      const { allocationId } = req.params;

      const result = await db.query(
        'UPDATE agent_property_assignments SET is_active = false WHERE id = $1 RETURNING *',
        [allocationId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Agent property assignment not found'
        });
      }

      res.json({
        success: true,
        message: 'Agent property assignment removed successfully'
      });

    } catch (error) {
      console.error('Error removing agent property assignment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove agent property assignment',
        error: error.message
      });
    }
  },

  // Get all agent property assignments (for admin)
  getAllAgentPropertyAssignments: async (req, res) => {
    try {
      const result = await db.query(`
        SELECT 
          apa.*,
          agent.first_name as agent_first_name,
          agent.last_name as agent_last_name,
          agent.email as agent_email,
          property.name as property_name,
          property.address as property_address,
          admin.first_name as assigned_by_first_name,
          admin.last_name as assigned_by_last_name
        FROM agent_property_assignments apa
        JOIN users agent ON apa.agent_id = agent.id
        JOIN properties property ON apa.property_id = property.id
        JOIN users admin ON apa.assigned_by = admin.id
        WHERE apa.is_active = true
        ORDER BY apa.assigned_at DESC
      `);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('Error fetching agent property assignments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch agent property assignments',
        error: error.message
      });
    }
  },

  // Get properties assigned to current agent
  getMyAssignedProperties: async (req, res) => {
    try {
      const agent_id = req.user.id;

      const result = await db.query(`
        SELECT 
          p.*,
          COUNT(pu.id) as total_units,
          COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units,
          COUNT(CASE WHEN c.status = 'open' THEN 1 END) as active_complaints
        FROM properties p
        JOIN agent_property_assignments apa ON p.id = apa.property_id
        LEFT JOIN property_units pu ON p.id = pu.property_id
        LEFT JOIN complaints c ON p.id = c.property_id AND c.status = 'open'
        WHERE apa.agent_id = $1 AND apa.is_active = true
        GROUP BY p.id
        ORDER BY p.name
      `, [agent_id]);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('Error fetching assigned properties:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch assigned properties',
        error: error.message
      });
    }
  },

  // Get tenants in assigned properties
  getMyTenants: async (req, res) => {
    try {
      const agent_id = req.user.id;

      const result = await db.query(`
        SELECT DISTINCT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone_number,
          u.national_id,
          p.name as property_name,
          pu.unit_number,
          ta.lease_start_date,
          ta.lease_end_date,
          ta.monthly_rent,
          (
            SELECT COUNT(*) 
            FROM complaints c 
            WHERE c.tenant_id = u.id AND c.status = 'open'
          ) as active_complaints,
          (
            SELECT COALESCE(SUM(amount), 0)
            FROM rent_payments rp
            WHERE rp.tenant_id = u.id
            AND rp.payment_month = date_trunc('month', CURRENT_DATE)
            AND rp.status = 'completed'
          ) as paid_this_month,
          ta.monthly_rent - COALESCE((
            SELECT SUM(amount)
            FROM rent_payments rp
            WHERE rp.tenant_id = u.id
            AND rp.payment_month = date_trunc('month', CURRENT_DATE)
            AND rp.status = 'completed'
          ), 0) as balance_due,
          CASE 
            WHEN (
              SELECT SUM(amount)
              FROM rent_payments rp
              WHERE rp.tenant_id = u.id
              AND rp.payment_month = date_trunc('month', CURRENT_DATE)
              AND rp.status = 'completed'
            ) >= ta.monthly_rent THEN 'paid'
            WHEN (
              SELECT SUM(amount)
              FROM rent_payments rp
              WHERE rp.tenant_id = u.id
              AND rp.payment_month = date_trunc('month', CURRENT_DATE)
              AND rp.status = 'completed'
            ) > 0 THEN 'partial'
            ELSE 'due'
          END as payment_status
        FROM users u
        JOIN tenant_allocations ta ON u.id = ta.tenant_id
        JOIN property_units pu ON ta.unit_id = pu.id
        JOIN properties p ON pu.property_id = p.id
        JOIN agent_property_assignments apa ON p.id = apa.property_id
        WHERE apa.agent_id = $1 
          AND apa.is_active = true
          AND ta.is_active = true
          AND u.role = 'tenant'
        ORDER BY p.name, u.first_name, u.last_name
      `, [agent_id]);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('Error fetching assigned tenants:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch assigned tenants',
        error: error.message
      });
    }
  },

  // Get complaints for assigned properties
  getMyComplaints: async (req, res) => {
    try {
      const agent_id = req.user.id;
      const { status } = req.query;

      let query = `
        SELECT 
          c.*,
          p.name as property_name,
          pu.unit_number,
          tenant.first_name as tenant_first_name,
          tenant.last_name as tenant_last_name,
          agent.first_name as assigned_agent_first_name,
          agent.last_name as assigned_agent_last_name,
          TO_CHAR(c.raised_at, 'YYYY-MM-DD HH24:MI:SS') as raised_at_formatted,
          TO_CHAR(c.resolved_at, 'YYYY-MM-DD HH24:MI:SS') as resolved_at_formatted
        FROM complaints c
        JOIN properties p ON c.property_id = p.id
        LEFT JOIN property_units pu ON c.unit_id = pu.id
        JOIN users tenant ON c.tenant_id = tenant.id
        LEFT JOIN users agent ON c.assigned_agent = agent.id
        JOIN agent_property_assignments apa ON p.id = apa.property_id
        WHERE apa.agent_id = $1 AND apa.is_active = true
      `;

      const params = [agent_id];

      if (status) {
        query += ` AND c.status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY c.raised_at DESC`;

      const result = await db.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('Error fetching assigned complaints:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch assigned complaints',
        error: error.message
      });
    }
  },

  // Get dashboard stats for agent
  getAgentDashboardStats: async (req, res) => {
    try {
      const agent_id = req.user.id;

      // Get assigned properties count
      const propertiesResult = await db.query(`
        SELECT COUNT(*) as count
        FROM agent_property_assignments
        WHERE agent_id = $1 AND is_active = true
      `, [agent_id]);

      // Get active complaints count
      const complaintsResult = await db.query(`
        SELECT COUNT(*) as count
        FROM complaints c
        JOIN agent_property_assignments apa ON c.property_id = apa.property_id
        WHERE apa.agent_id = $1 AND apa.is_active = true AND c.status = 'open'
      `, [agent_id]);

      // Get resolved this month count
      const resolvedResult = await db.query(`
        SELECT COUNT(*) as count
        FROM complaints c
        JOIN agent_property_assignments apa ON c.property_id = apa.property_id
        WHERE apa.agent_id = $1 AND apa.is_active = true 
          AND c.status = 'resolved'
          AND EXTRACT(MONTH FROM c.resolved_at) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM c.resolved_at) = EXTRACT(YEAR FROM CURRENT_DATE)
      `, [agent_id]);

      // Get tenants with due payments
      const paymentsResult = await db.query(`
        SELECT COUNT(DISTINCT u.id) as count
        FROM users u
        JOIN tenant_allocations ta ON u.id = ta.tenant_id
        JOIN property_units pu ON ta.unit_id = pu.id
        JOIN agent_property_assignments apa ON pu.property_id = apa.property_id
        WHERE apa.agent_id = $1 
          AND apa.is_active = true
          AND ta.is_active = true
          AND u.role = 'tenant'
          AND ta.monthly_rent > COALESCE((
            SELECT SUM(amount)
            FROM rent_payments rp
            WHERE rp.tenant_id = u.id
            AND rp.payment_month = date_trunc('month', CURRENT_DATE)
            AND rp.status = 'completed'
          ), 0)
      `, [agent_id]);

      res.json({
        success: true,
        data: {
          assignedProperties: parseInt(propertiesResult.rows[0].count),
          activeComplaints: parseInt(complaintsResult.rows[0].count),
          resolvedThisMonth: parseInt(resolvedResult.rows[0].count),
          pendingPayments: parseInt(paymentsResult.rows[0].count)
        }
      });

    } catch (error) {
      console.error('Error fetching agent dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch agent dashboard stats',
        error: error.message
      });
    }
  }
};

module.exports = agentPropertyController;