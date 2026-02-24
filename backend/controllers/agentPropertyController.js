// backend/controllers/agentPropertyController.js
const db = require('../config/database');

// Assign properties to agent
const assignPropertiesToAgent = async (req, res) => {
  const client = await db.connect(); // Use the pool connection
  
  try {
    const { agent_id, property_ids } = req.body;
    const assigned_by = req.user.id;

    console.log('Assigning properties to agent:', {
      agent_id,
      property_ids,
      assigned_by
    });

    await client.query('BEGIN');

    // Deactivate existing assignments for this agent
    await client.query(
      'UPDATE agent_property_assignments SET is_active = false WHERE agent_id = $1',
      [agent_id]
    );

    // Insert new assignments
    for (const property_id of property_ids) {
      // Check if assignment already exists
      const existingAssignment = await client.query(
        'SELECT id FROM agent_property_assignments WHERE agent_id = $1 AND property_id = $2',
        [agent_id, property_id]
      );

      if (existingAssignment.rows.length > 0) {
        // Reactivate existing assignment
        await client.query(
          'UPDATE agent_property_assignments SET is_active = true, assigned_by = $1, assigned_at = CURRENT_TIMESTAMP WHERE agent_id = $2 AND property_id = $3',
          [assigned_by, agent_id, property_id]
        );
      } else {
        // Create new assignment
        await client.query(
          `INSERT INTO agent_property_assignments 
           (agent_id, property_id, assigned_by, is_active) 
           VALUES ($1, $2, $3, true)`,
          [agent_id, property_id, assigned_by]
        );
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Properties assigned successfully',
      data: { agent_id, property_ids }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning properties to agent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign properties to agent',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Get all agent allocations (for admin)
const getAgentAllocations = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        apa.*,
        u.first_name as agent_first_name, 
        u.last_name as agent_last_name,
        p.name as property_name,
        p.property_code,
        admin.first_name as assigned_by_first_name,
        admin.last_name as assigned_by_last_name
      FROM agent_property_assignments apa
      JOIN users u ON u.id = apa.agent_id
      JOIN properties p ON p.id = apa.property_id
      JOIN users admin ON admin.id = apa.assigned_by
      WHERE apa.is_active = true
      ORDER BY apa.assigned_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error('Error fetching agent allocations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent allocations',
      error: error.message
    });
  }
};

// Get assigned properties for logged-in agent
const getMyProperties = async (req, res) => {
  try {
    const { user } = req;

    let query = `
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM property_units pu WHERE pu.property_id = p.id AND pu.is_occupied = true) as occupied_units,
        (SELECT COUNT(*) FROM property_units pu WHERE pu.property_id = p.id) as total_units
      FROM properties p
    `;
    
    const params = [];

    // If Agent, filter by assignment
    if (user.role === 'agent') {
      query += `
        JOIN agent_property_assignments apa ON p.id = apa.property_id
        WHERE apa.agent_id = $1 AND apa.is_active = true
      `;
      params.push(user.id);
    }

    query += ` ORDER BY p.name`;

    const { rows } = await db.query(query, params);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch properties' });
  }
};

// Get assigned tenants (Agent) OR All tenants (Admin)
const getMyTenants = async (req, res) => {
  try {
    const { user } = req;

    let query = `
      SELECT DISTINCT
        t.*,
        ta.unit_id,
        pu.unit_code,
        pu.unit_number,
        COALESCE(ta.monthly_rent, pu.rent_amount, 0) as monthly_rent,
        LEAST(GREATEST(COALESCE(ta.rent_due_day, 1), 1), 28) as rent_due_day,
        p.name as property_name,
        p.id as property_id,
        COALESCE(pm.rent_paid, 0) as rent_paid,
        GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) as rent_due,
        COALESCE(wp.water_bill, 0) as water_bill,
        COALESCE(wp.water_paid, 0) as water_paid,
        GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) as water_due,
        GREATEST(0, COALESCE(ta.arrears_balance, 0)) as arrears,
        (
          GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
          GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) +
          GREATEST(0, COALESCE(ta.arrears_balance, 0))
        ) as total_due,
        (
          GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
          GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) +
          GREATEST(0, COALESCE(ta.arrears_balance, 0))
        ) as balance_due,
        (
          GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
          GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) +
          GREATEST(0, COALESCE(ta.arrears_balance, 0))
        ) as amount_due,
        TO_CHAR(
          MAKE_DATE(
            EXTRACT(YEAR FROM CURRENT_DATE)::int,
            EXTRACT(MONTH FROM CURRENT_DATE)::int,
            LEAST(GREATEST(COALESCE(ta.rent_due_day, 1), 1), 28)
          ),
          'YYYY-MM-DD'
        ) as due_date,
        CASE 
          WHEN (
            GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
            GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) +
            GREATEST(0, COALESCE(ta.arrears_balance, 0))
          ) <= 0 THEN 'paid'
          ELSE 'pending'
        END as payment_status
      FROM tenants t
      JOIN tenant_allocations ta ON ta.tenant_id = t.id
      JOIN property_units pu ON pu.id = ta.unit_id
      JOIN properties p ON p.id = pu.property_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(
          CASE
            WHEN (
              COALESCE(rp.allocated_to_rent, 0) +
              COALESCE(rp.allocated_to_water, 0) +
              COALESCE(rp.allocated_to_arrears, 0)
            ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
            ELSE COALESCE(rp.amount, 0)
          END
        ), 0) as rent_paid
        FROM rent_payments rp
        WHERE rp.tenant_id = t.id
          AND rp.unit_id = pu.id
          AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
          AND rp.status = 'completed'
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE((
            SELECT wb.amount
            FROM water_bills wb
            WHERE wb.tenant_id = t.id
              AND (wb.unit_id = pu.id OR wb.unit_id IS NULL)
              AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', CURRENT_DATE)
            ORDER BY CASE WHEN wb.unit_id = pu.id THEN 0 ELSE 1 END
            LIMIT 1
          ), 0) AS water_bill,
          COALESCE((
            SELECT SUM(COALESCE(rp.allocated_to_water, 0))
            FROM rent_payments rp
            WHERE rp.tenant_id = t.id
              AND rp.unit_id = pu.id
              AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
              AND rp.status = 'completed'
          ), 0) AS water_paid
      ) wp ON TRUE
    `;

    const params = [];

    // If Agent, filter by assignment
    if (user.role === 'agent') {
      query += `
        JOIN agent_property_assignments apa ON apa.property_id = p.id
        WHERE apa.agent_id = $1 
          AND apa.is_active = true 
          AND ta.is_active = true
      `;
      params.push(user.id);
    } else {
      // Admin: ensure we only get active allocations
      query += ` WHERE ta.is_active = true `;
    }

    query += ` ORDER BY p.name, pu.unit_code`;

    const { rows } = await db.query(query, params);

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tenants' });
  }
};

// Get assigned complaints (Agent) OR All complaints (Admin)
const getMyComplaints = async (req, res) => {
  try {
    const { user } = req;
    const { status } = req.query;

    let query = `
      SELECT 
        c.*,
        t.first_name as tenant_first_name,
        t.last_name as tenant_last_name,
        t.phone_number as tenant_phone,
        pu.unit_code,
        p.name as property_name,
        agent.first_name as assigned_agent_first_name,
        agent.last_name as assigned_agent_last_name
      FROM complaints c
      JOIN tenants t ON t.id = c.tenant_id
      JOIN property_units pu ON pu.id = c.unit_id
      JOIN properties p ON p.id = pu.property_id
      LEFT JOIN users agent ON agent.id = c.assigned_agent
    `;

    const params = [];

    // If Agent, filter by assignment
    if (user.role === 'agent') {
      query += `
        JOIN agent_property_assignments apa ON apa.property_id = p.id
        WHERE apa.agent_id = $1 AND apa.is_active = true
      `;
      params.push(user.id);
    } else {
      query += ` WHERE 1=1 `; // dummy clause for admin filtering
    }

    if (status && status !== 'all') {
      query += ` AND c.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY c.raised_at DESC`;

    const { rows } = await db.query(query, params);

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error('Error fetching complaints:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch complaints' });
  }
};

// Get dashboard stats for agent
const getAgentDashboardStats = async (req, res) => {
  try {
    const agent_id = req.user.id;

    // Get assigned properties count
    const propertiesResult = await db.query(
      `SELECT COUNT(*) FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true`,
      [agent_id]
    );

    // Get active complaints count
    const complaintsResult = await db.query(`
      SELECT COUNT(*) 
      FROM complaints c
      JOIN property_units pu ON pu.id = c.unit_id
      JOIN agent_property_assignments apa ON apa.property_id = pu.property_id
      WHERE apa.agent_id = $1 AND apa.is_active = true AND c.status IN ('open', 'in_progress')
    `, [agent_id]);

    // Get pending payments count based on current-month total due (rent + water + arrears).
    const paymentsResult = await db.query(`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT
          t.id,
          (
            GREATEST(0, COALESCE(ta.monthly_rent, pu.rent_amount, 0) - COALESCE(pm.rent_paid, 0)) +
            GREATEST(0, COALESCE(wp.water_bill, 0) - COALESCE(wp.water_paid, 0)) +
            GREATEST(0, COALESCE(ta.arrears_balance, 0))
          ) AS total_due
        FROM tenants t
        JOIN tenant_allocations ta ON ta.tenant_id = t.id
        JOIN property_units pu ON pu.id = ta.unit_id
        JOIN agent_property_assignments apa ON apa.property_id = pu.property_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(
            CASE
              WHEN (
                COALESCE(rp.allocated_to_rent, 0) +
                COALESCE(rp.allocated_to_water, 0) +
                COALESCE(rp.allocated_to_arrears, 0)
              ) > 0 THEN COALESCE(rp.allocated_to_rent, 0)
              ELSE COALESCE(rp.amount, 0)
            END
          ), 0) AS rent_paid
          FROM rent_payments rp
          WHERE rp.tenant_id = t.id
            AND rp.unit_id = pu.id
            AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
            AND rp.status = 'completed'
        ) pm ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COALESCE((
              SELECT wb.amount
              FROM water_bills wb
              WHERE wb.tenant_id = t.id
                AND (wb.unit_id = pu.id OR wb.unit_id IS NULL)
                AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', CURRENT_DATE)
              ORDER BY CASE WHEN wb.unit_id = pu.id THEN 0 ELSE 1 END
              LIMIT 1
            ), 0) AS water_bill,
            COALESCE((
              SELECT SUM(COALESCE(rp.allocated_to_water, 0))
              FROM rent_payments rp
              WHERE rp.tenant_id = t.id
                AND rp.unit_id = pu.id
                AND DATE_TRUNC('month', rp.payment_month) = DATE_TRUNC('month', CURRENT_DATE)
                AND rp.status = 'completed'
            ), 0) AS water_paid
        ) wp ON TRUE
        WHERE apa.agent_id = $1
          AND apa.is_active = true
          AND ta.is_active = true
      ) balances
      WHERE balances.total_due > 0
    `, [agent_id]);

    // Get resolved complaints this week
    const resolvedResult = await db.query(`
      SELECT COUNT(*) 
      FROM complaints c
      JOIN property_units pu ON pu.id = c.unit_id
      JOIN agent_property_assignments apa ON apa.property_id = pu.property_id
      WHERE apa.agent_id = $1 
        AND apa.is_active = true 
        AND c.status = 'resolved'
        AND c.resolved_at >= date_trunc('week', CURRENT_DATE)
    `, [agent_id]);

    res.json({
      success: true,
      data: {
        assignedProperties: parseInt(propertiesResult.rows[0].count),
        activeComplaints: parseInt(complaintsResult.rows[0].count),
        pendingPayments: parseInt(paymentsResult.rows[0].count),
        resolvedThisWeek: parseInt(resolvedResult.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Error fetching agent dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
};

// Remove agent allocation
const removeAgentAllocation = async (req, res) => {
  const client = await db.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Soft delete the allocation
    await client.query(
      'UPDATE agent_property_assignments SET is_active = false WHERE id = $1',
      [id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Agent allocation removed successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error removing agent allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove agent allocation',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  assignPropertiesToAgent,
  getAgentAllocations,
  getMyProperties,
  getMyTenants,
  getMyComplaints,
  getAgentDashboardStats,
  removeAgentAllocation
};
