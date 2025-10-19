const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Simple inline middleware for testing
const protect = (req, res, next) => {
  req.user = { 
    id: 'test-user-id', 
    userId: 'test', 
    role: 'admin',
    first_name: 'Test',
    last_name: 'User'
  };
  next();
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
  };
};

console.log('Complaints routes loaded');

// GET ALL COMPLAINTS (with advanced filtering)
router.get('/', protect, authorize('admin', 'agent', 'tenant'), async (req, res) => {
  try {
    console.log('Fetching all complaints...');
    
    const { 
      status, 
      priority, 
      category, 
      assigned_agent,
      tenant_id,
      page = 1, 
      limit = 20,
      start_date,
      end_date
    } = req.query;
    
    let query = `
      SELECT 
        c.*,
        tenant.first_name as tenant_first_name,
        tenant.last_name as tenant_last_name,
        tenant.phone_number as tenant_phone,
        p.name as property_name,
        pu.unit_number,
        pu.unit_code,
        agent.first_name as agent_first_name,
        agent.last_name as agent_last_name,
        COUNT(cu.id) as update_count
      FROM complaints c
      LEFT JOIN users tenant ON c.tenant_id = tenant.id
      LEFT JOIN property_units pu ON c.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON c.assigned_agent = agent.id
      LEFT JOIN complaint_updates cu ON c.id = cu.complaint_id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 0;

    // Role-based filtering
    if (req.user.role === 'tenant') {
      paramCount++;
      query += ` AND c.tenant_id = $${paramCount}`;
      queryParams.push(req.user.id);
    }

    // Add filters based on query parameters
    if (status) {
      paramCount++;
      query += ` AND c.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (priority) {
      paramCount++;
      query += ` AND c.priority = $${paramCount}`;
      queryParams.push(priority);
    }

    if (category) {
      paramCount++;
      query += ` AND c.category = $${paramCount}`;
      queryParams.push(category);
    }

    if (assigned_agent) {
      paramCount++;
      query += ` AND c.assigned_agent = $${paramCount}`;
      queryParams.push(assigned_agent);
    }

    if (tenant_id && (req.user.role === 'admin' || req.user.role === 'agent')) {
      paramCount++;
      query += ` AND c.tenant_id = $${paramCount}`;
      queryParams.push(tenant_id);
    }

    if (start_date) {
      paramCount++;
      query += ` AND c.raised_at >= $${paramCount}`;
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND c.raised_at <= $${paramCount}`;
      queryParams.push(end_date);
    }

    // Add grouping and ordering
    query += ` GROUP BY c.id, tenant.first_name, tenant.last_name, tenant.phone_number, 
              p.name, pu.unit_number, pu.unit_code, agent.first_name, agent.last_name
              ORDER BY 
                CASE c.priority 
                  WHEN 'high' THEN 1
                  WHEN 'medium' THEN 2
                  WHEN 'low' THEN 3
                END,
                c.raised_at DESC`;
    
    // Add pagination
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await pool.query(query, queryParams);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) 
      FROM complaints c
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (req.user.role === 'tenant') {
      countParamCount++;
      countQuery += ` AND c.tenant_id = $${countParamCount}`;
      countParams.push(req.user.id);
    }

    if (status) {
      countParamCount++;
      countQuery += ` AND c.status = $${countParamCount}`;
      countParams.push(status);
    }

    if (priority) {
      countParamCount++;
      countQuery += ` AND c.priority = $${countParamCount}`;
      countParams.push(priority);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    
    console.log(`Found ${result.rows.length} complaints`);
    
    res.json({
      success: true,
      count: result.rows.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching complaints:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaints',
      error: error.message
    });
  }
});

// GET COMPLAINT BY ID
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Fetching complaint with ID: ${id}`);
    
    // Get complaint details
    const complaintResult = await pool.query(`
      SELECT 
        c.*,
        tenant.first_name as tenant_first_name,
        tenant.last_name as tenant_last_name,
        tenant.phone_number as tenant_phone,
        tenant.email as tenant_email,
        p.name as property_name,
        p.address as property_address,
        pu.unit_number,
        pu.unit_code,
        agent.first_name as agent_first_name,
        agent.last_name as agent_last_name,
        agent.phone_number as agent_phone,
        acknowledged_by_user.first_name as acknowledged_by_name,
        resolved_by_user.first_name as resolved_by_name
      FROM complaints c
      LEFT JOIN users tenant ON c.tenant_id = tenant.id
      LEFT JOIN property_units pu ON c.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON c.assigned_agent = agent.id
      LEFT JOIN users acknowledged_by_user ON c.acknowledged_by = acknowledged_by_user.id
      LEFT JOIN users resolved_by_user ON c.resolved_by = resolved_by_user.id
      WHERE c.id = $1
    `, [id]);
    
    if (complaintResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Check authorization - tenants can only see their own complaints
    const complaint = complaintResult.rows[0];
    if (req.user.role === 'tenant' && complaint.tenant_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get complaint updates
    const updatesResult = await pool.query(`
      SELECT 
        cu.*,
        u.first_name as updated_by_name,
        u.role as updated_by_role
      FROM complaint_updates cu
      LEFT JOIN users u ON cu.updated_by = u.id
      WHERE cu.complaint_id = $1
      ORDER BY cu.created_at ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        ...complaint,
        updates: updatesResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching complaint:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaint',
      error: error.message
    });
  }
});

// CREATE NEW COMPLAINT (POST)
router.post('/', protect, authorize('tenant', 'admin', 'agent'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      unit_id,
      title,
      description,
      category,
      priority = 'medium'
    } = req.body;
    
    console.log('📝 Creating new complaint with data:', req.body);
    
    // Validate required fields
    if (!unit_id || !title || !description || !category) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: unit_id, title, description, category'
      });
    }
    
    // For tenants, automatically set tenant_id to current user
    const tenant_id = req.user.role === 'tenant' ? req.user.id : req.body.tenant_id;
    
    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    // Verify tenant exists and has access to the unit
    const tenantUnitCheck = await client.query(`
      SELECT ta.id 
      FROM tenant_allocations ta
      WHERE ta.tenant_id = $1 AND ta.unit_id = $2 AND ta.is_active = true
    `, [tenant_id, unit_id]);
    
    if (tenantUnitCheck.rows.length === 0 && req.user.role === 'tenant') {
      return res.status(403).json({
        success: false,
        message: 'You are not allocated to this unit'
      });
    }
    
    // Verify unit exists
    const unitCheck = await client.query(`
      SELECT pu.*, p.name as property_name
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      WHERE pu.id = $1
    `, [unit_id]);
    
    if (unitCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Property unit not found'
      });
    }
    
    // Create the complaint
    const complaintResult = await client.query(
      `INSERT INTO complaints (
        tenant_id, unit_id, title, description, category, priority, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        tenant_id,
        unit_id,
        title,
        description,
        category,
        priority,
        'open'
      ]
    );

    // Create initial complaint update
    await client.query(
      `INSERT INTO complaint_updates (
        complaint_id, updated_by, update_text, update_type
      ) VALUES ($1, $2, $3, $4)`,
      [
        complaintResult.rows[0].id,
        req.user.id,
        'Complaint submitted successfully.',
        'created'
      ]
    );

    // Create notification for agents/admins
    const agentsResult = await client.query(
      `SELECT id FROM users WHERE role IN ('admin', 'agent') AND is_active = true`
    );

    for (const agent of agentsResult.rows) {
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, related_entity_type, related_entity_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          agent.id,
          'New Complaint Submitted',
          `New ${priority} priority complaint: ${title}`,
          'complaint',
          'complaint',
          complaintResult.rows[0].id
        ]
      );
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Complaint created successfully');
    
    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: complaintResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating complaint:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error creating complaint',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// UPDATE COMPLAINT (PUT)
router.put('/:id', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const {
      title,
      description,
      category,
      priority,
      assigned_agent,
      status
    } = req.body;
    
    // Check if complaint exists and user has access
    const complaintCheck = await client.query(`
      SELECT c.*, u.role as user_role
      FROM complaints c
      LEFT JOIN users u ON c.tenant_id = u.id
      WHERE c.id = $1
    `, [id]);
    
    if (complaintCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    const complaint = complaintCheck.rows[0];
    
    // Authorization check
    if (req.user.role === 'tenant' && complaint.tenant_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Tenants can only update certain fields
    if (req.user.role === 'tenant') {
      if (assigned_agent || status) {
        return res.status(403).json({
          success: false,
          message: 'Tenants cannot assign agents or change status'
        });
      }
    }
    
    // Update the complaint
    const updateResult = await client.query(
      `UPDATE complaints 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           priority = COALESCE($4, priority),
           assigned_agent = COALESCE($5, assigned_agent),
           status = COALESCE($6, status),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        title,
        description,
        category,
        priority,
        assigned_agent,
        status,
        id
      ]
    );

    // Create update record if there are significant changes
    if (title || description || category || priority || assigned_agent || status) {
      let updateText = 'Complaint updated.';
      if (assigned_agent) {
        const agentResult = await client.query(
          'SELECT first_name, last_name FROM users WHERE id = $1',
          [assigned_agent]
        );
        const agentName = agentResult.rows.length > 0 
          ? `${agentResult.rows[0].first_name} ${agentResult.rows[0].last_name}`
          : 'Unknown Agent';
        updateText += ` Assigned to ${agentName}.`;
      }
      if (status) {
        updateText += ` Status changed to ${status}.`;
      }

      await client.query(
        `INSERT INTO complaint_updates (
          complaint_id, updated_by, update_text, update_type
        ) VALUES ($1, $2, $3, $4)`,
        [
          id,
          req.user.id,
          updateText,
          'updated'
        ]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Complaint updated successfully',
      data: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating complaint:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating complaint',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// DELETE COMPLAINT (DELETE)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if complaint exists
    const complaintCheck = await client.query(
      'SELECT id, title FROM complaints WHERE id = $1',
      [id]
    );
    
    if (complaintCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    // Delete complaint updates first
    await client.query('DELETE FROM complaint_updates WHERE complaint_id = $1', [id]);
    
    // Delete the complaint
    await client.query('DELETE FROM complaints WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Complaint "${complaintCheck.rows[0].title}" deleted successfully`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting complaint:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting complaint',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ADD COMPLAINT UPDATE (POST)
router.post('/:id/updates', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const {
      update_text,
      update_type = 'update'
    } = req.body;
    
    if (!update_text) {
      return res.status(400).json({
        success: false,
        message: 'Update text is required'
      });
    }
    
    // Check if complaint exists and user has access
    const complaintCheck = await client.query(`
      SELECT c.* 
      FROM complaints c
      WHERE c.id = $1
    `, [id]);
    
    if (complaintCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    const complaint = complaintCheck.rows[0];
    
    // Authorization check - tenants can only update their own complaints
    if (req.user.role === 'tenant' && complaint.tenant_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Create the update
    const updateResult = await client.query(
      `INSERT INTO complaint_updates (
        complaint_id, updated_by, update_text, update_type
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [
        id,
        req.user.id,
        update_text,
        update_type
      ]
    );

    // Create notification for the tenant
    if (req.user.role !== 'tenant') {
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, related_entity_type, related_entity_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          complaint.tenant_id,
          'Complaint Update',
          `Your complaint "${complaint.title}" has been updated.`,
          'complaint',
          'complaint',
          id
        ]
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Complaint update added successfully',
      data: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding complaint update:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding complaint update',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// UPDATE COMPLAINT STATUS (PATCH)
router.patch('/:id/status', protect, authorize('admin', 'agent'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    // Valid status values
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Check if complaint exists
    const complaintCheck = await client.query(
      'SELECT id, title, tenant_id, status FROM complaints WHERE id = $1',
      [id]
    );
    
    if (complaintCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    const complaint = complaintCheck.rows[0];
    
    // Update complaint status with additional fields based on status
    let updateQuery = `
      UPDATE complaints 
      SET status = $1, updated_at = NOW()
    `;
    const queryParams = [status, id];
    
    if (status === 'in_progress' && !complaint.acknowledged_at) {
      updateQuery += `, acknowledged_at = NOW(), acknowledged_by = $3`;
      queryParams.push(req.user.id);
    } else if (status === 'resolved' && !complaint.resolved_at) {
      updateQuery += `, resolved_at = NOW(), resolved_by = $3`;
      queryParams.push(req.user.id);
    }
    
    updateQuery += ` WHERE id = $2 RETURNING *`;
    
    const updateResult = await client.query(updateQuery, queryParams);
    
    // Create status update record
    await client.query(
      `INSERT INTO complaint_updates (
        complaint_id, updated_by, update_text, update_type
      ) VALUES ($1, $2, $3, $4)`,
      [
        id,
        req.user.id,
        `Status changed to ${status}.`,
        'status_change'
      ]
    );

    // Notify tenant of status change
    await client.query(
      `INSERT INTO notifications (
        user_id, title, message, type, related_entity_type, related_entity_id
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        complaint.tenant_id,
        'Complaint Status Updated',
        `Your complaint "${complaint.title}" status has been changed to ${status}.`,
        'complaint',
        'complaint',
        id
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Complaint status updated to ${status}`,
      data: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating complaint status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating complaint status',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ASSIGN COMPLAINT TO AGENT (PATCH)
router.patch('/:id/assign', protect, authorize('admin', 'agent'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { agent_id } = req.body;
    
    if (!agent_id) {
      return res.status(400).json({
        success: false,
        message: 'Agent ID is required'
      });
    }
    
    // Check if complaint exists
    const complaintCheck = await client.query(
      'SELECT id, title, tenant_id FROM complaints WHERE id = $1',
      [id]
    );
    
    if (complaintCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    // Check if agent exists and is actually an agent
    const agentCheck = await client.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1 AND role IN ($2, $3)',
      [agent_id, 'agent', 'admin']
    );
    
    if (agentCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Agent not found or invalid role'
      });
    }
    
    const agent = agentCheck.rows[0];
    
    // Update complaint assignment
    const updateResult = await client.query(
      `UPDATE complaints 
       SET assigned_agent = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [agent_id, id]
    );
    
    // Create assignment update record
    await client.query(
      `INSERT INTO complaint_updates (
        complaint_id, updated_by, update_text, update_type
      ) VALUES ($1, $2, $3, $4)`,
      [
        id,
        req.user.id,
        `Complaint assigned to ${agent.first_name} ${agent.last_name}.`,
        'assignment'
      ]
    );

    // Notify assigned agent
    await client.query(
      `INSERT INTO notifications (
        user_id, title, message, type, related_entity_type, related_entity_id
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        agent_id,
        'New Complaint Assigned',
        `You have been assigned to complaint: ${complaintCheck.rows[0].title}`,
        'complaint',
        'complaint',
        id
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Complaint assigned to ${agent.first_name} ${agent.last_name}`,
      data: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning complaint:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning complaint',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// GET COMPLAINT STATISTICS
router.get('/stats/overview', protect, authorize('admin', 'agent'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const queryParams = [];
    
    if (start_date && end_date) {
      dateFilter = 'WHERE raised_at BETWEEN $1 AND $2';
      queryParams.push(start_date, end_date);
    }
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_complaints,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_complaints,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_complaints,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_complaints,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_complaints,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
        COUNT(CASE WHEN priority = 'medium' THEN 1 END) as medium_priority,
        COUNT(CASE WHEN priority = 'low' THEN 1 END) as low_priority,
        COUNT(DISTINCT tenant_id) as unique_tenants,
        COUNT(DISTINCT assigned_agent) as active_agents
      FROM complaints
      ${dateFilter}
    `, queryParams);
    
    const categoryResult = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM complaints ${dateFilter}), 2) as percentage
      FROM complaints
      ${dateFilter}
      GROUP BY category
      ORDER BY count DESC
    `, queryParams);
    
    const monthlyResult = await pool.query(`
      SELECT 
        DATE(raised_at) as complaint_date,
        COUNT(*) as daily_count,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as daily_resolved
      FROM complaints
      WHERE raised_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(raised_at)
      ORDER BY complaint_date DESC
    `);
    
    res.json({
      success: true,
      data: {
        overview: statsResult.rows[0],
        by_category: categoryResult.rows,
        trends: monthlyResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching complaint statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaint statistics',
      error: error.message
    });
  }
});

module.exports = router;