// ============================================
// UPDATED complaints.js ROUTES FILE
// Replace your existing backend/routes/complaints.js with this
// ============================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Use proper auth middleware
const protect = authMiddleware;
const authorize = requireRole;

console.log('Complaints routes loaded');

// ============================================
// GET ALL COMPLAINTS (with advanced filtering)
// ============================================
router.get('/', protect, authorize(['admin', 'agent', 'tenant']), async (req, res) => {
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
        t.first_name as tenant_first_name,
        t.last_name as tenant_last_name,
        t.phone_number as tenant_phone,
        p.name as property_name,
        p.id as property_id,
        pu.unit_number,
        pu.unit_code,
        agent.first_name as agent_first_name,
        agent.last_name as agent_last_name,
        (SELECT COUNT(*) FROM complaint_steps cs WHERE cs.complaint_id = c.id) as total_steps,
        (SELECT COUNT(*) FROM complaint_steps cs WHERE cs.complaint_id = c.id AND cs.is_completed = true) as completed_steps
      FROM complaints c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN property_units pu ON c.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON c.assigned_agent = agent.id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 0;

    // Role-based filtering
    if (req.user.role === 'tenant') {
      paramCount++;
      query += ` AND c.tenant_id = $${paramCount}`;
      queryParams.push(req.user.id);
    } else if (req.user.role === 'agent') {
      // Agent can only see complaints from their assigned properties
      query += ` AND pu.property_id IN (
        SELECT property_id FROM agent_property_assignments 
        WHERE agent_id = $${++paramCount} AND is_active = true
      )`;
      queryParams.push(req.user.id);
    }

    // Add filters
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
      query += ` AND (c.category = $${paramCount} OR c.categories ? $${paramCount})`;
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

    // Ordering
    query += ` ORDER BY 
      CASE c.status 
        WHEN 'open' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'resolved' THEN 3
        ELSE 4
      END,
      CASE c.priority 
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END,
      c.raised_at DESC`;
    
    // Pagination
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(parseInt(limit));
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await pool.query(query, queryParams);
    
    console.log(`Found ${result.rows.length} complaints`);
    
    res.json({
      success: true,
      count: result.rows.length,
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

// ============================================
// GET COMPLAINT STATISTICS (MUST come before /:id)
// ============================================
router.get('/stats/overview', protect, authorize(['admin', 'agent']), async (req, res) => {
  try {
    let whereClause = '';
    const queryParams = [];
    
    if (req.user.role === 'agent') {
      whereClause = `WHERE c.unit_id IN (
        SELECT pu.id FROM property_units pu
        WHERE pu.property_id IN (
          SELECT property_id FROM agent_property_assignments 
          WHERE agent_id = $1 AND is_active = true
        )
      )`;
      queryParams.push(req.user.id);
    }
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_complaints,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_complaints,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_complaints,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_complaints,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority
      FROM complaints c
      ${whereClause}
    `, queryParams);
    
    res.json({
      success: true,
      data: statsResult.rows[0]
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

// ============================================
// GET COMPLAINT STEPS (MUST come before /:id)
// ============================================
router.get('/:id/steps', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        cs.*,
        u.first_name as completed_by_first_name,
        u.last_name as completed_by_last_name,
        creator.first_name as created_by_first_name,
        creator.last_name as created_by_last_name
      FROM complaint_steps cs
      LEFT JOIN users u ON cs.completed_by = u.id
      LEFT JOIN users creator ON cs.created_by = creator.id
      WHERE cs.complaint_id = $1
      ORDER BY cs.step_order ASC
    `, [id]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching complaint steps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaint steps',
      error: error.message
    });
  }
});

// ============================================
// GET COMPLAINT BY ID (with steps)
// ============================================
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get complaint details
    const complaintResult = await pool.query(`
      SELECT 
        c.*,
        t.first_name as tenant_first_name,
        t.last_name as tenant_last_name,
        t.phone_number as tenant_phone,
        p.name as property_name,
        p.address as property_address,
        pu.unit_number,
        pu.unit_code,
        agent.first_name as agent_first_name,
        agent.last_name as agent_last_name
      FROM complaints c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN property_units pu ON c.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users agent ON c.assigned_agent = agent.id
      WHERE c.id = $1
    `, [id]);
    
    if (complaintResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    const complaint = complaintResult.rows[0];

    // Get complaint steps
    const stepsResult = await pool.query(`
      SELECT 
        cs.*,
        u.first_name as completed_by_name
      FROM complaint_steps cs
      LEFT JOIN users u ON cs.completed_by = u.id
      WHERE cs.complaint_id = $1
      ORDER BY cs.step_order ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        ...complaint,
        steps: stepsResult.rows
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

// ============================================
// CREATE NEW COMPLAINT
// ============================================
router.post('/', protect, authorize(['tenant', 'admin', 'agent']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      tenant_id,
      unit_id,
      title,
      description,
      category,
      categories,
      priority = 'medium'
    } = req.body;
    
    console.log('📝 Creating new complaint:', req.body);
    
    // Validate required fields
    if (!unit_id || !title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: unit_id, title, description'
      });
    }
    
    // Get tenant_id from the request or use the provided one
    const finalTenantId = req.user.role === 'tenant' ? req.user.id : tenant_id;
    
    if (!finalTenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    // Prepare categories as JSONB
    const categoriesJson = categories 
      ? JSON.stringify(categories) 
      : JSON.stringify([category]);
    
    // Create the complaint
    const complaintResult = await client.query(
      `INSERT INTO complaints (
        tenant_id, unit_id, title, description, category, categories, priority, status
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'open')
      RETURNING *`,
      [
        finalTenantId,
        unit_id,
        title,
        description,
        category || (categories && categories[0]),
        categoriesJson,
        priority
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

// ============================================
// GET COMPLAINT STEPS
// ============================================
router.get('/:id/steps', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        cs.*,
        u.first_name as completed_by_first_name,
        u.last_name as completed_by_last_name,
        creator.first_name as created_by_first_name,
        creator.last_name as created_by_last_name
      FROM complaint_steps cs
      LEFT JOIN users u ON cs.completed_by = u.id
      LEFT JOIN users creator ON cs.created_by = creator.id
      WHERE cs.complaint_id = $1
      ORDER BY cs.step_order ASC
    `, [id]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching complaint steps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaint steps',
      error: error.message
    });
  }
});

// ============================================
// ADD COMPLAINT STEP
// ============================================
router.post('/:id/steps', protect, authorize(['admin', 'agent']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { step_order, step_description } = req.body;
    
    if (!step_description) {
      return res.status(400).json({
        success: false,
        message: 'Step description is required'
      });
    }
    
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
    
    // Get the next step order if not provided
    let finalStepOrder = step_order;
    if (!finalStepOrder) {
      const maxOrderResult = await client.query(
        'SELECT COALESCE(MAX(step_order), 0) + 1 as next_order FROM complaint_steps WHERE complaint_id = $1',
        [id]
      );
      finalStepOrder = maxOrderResult.rows[0].next_order;
    }
    
    // Insert the step
    const stepResult = await client.query(
      `INSERT INTO complaint_steps (
        complaint_id, step_order, step_description, created_by
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [id, finalStepOrder, step_description, req.user.id]
    );
    
    // Update complaint status to in_progress if it's open
    await client.query(
      `UPDATE complaints 
       SET status = 'in_progress', 
           acknowledged_at = COALESCE(acknowledged_at, NOW()),
           acknowledged_by = COALESCE(acknowledged_by, $2)
       WHERE id = $1 AND status = 'open'`,
      [id, req.user.id]
    );
    
    // Add update record
    await client.query(
      `INSERT INTO complaint_updates (
        complaint_id, updated_by, update_text, update_type
      ) VALUES ($1, $2, $3, $4)`,
      [id, req.user.id, `Servicing step added: ${step_description}`, 'step_added']
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Step added successfully',
      data: stepResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding complaint step:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding complaint step',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ============================================
// ADD MULTIPLE STEPS (BULK)
// ============================================
router.post('/:id/steps/bulk', protect, authorize(['admin', 'agent']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { steps } = req.body;
    
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Steps array is required'
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
    
    const insertedSteps = [];
    
    for (let i = 0; i < steps.length; i++) {
      const stepDescription = typeof steps[i] === 'string' ? steps[i] : steps[i].step_description;
      
      if (stepDescription && stepDescription.trim()) {
        const stepResult = await client.query(
          `INSERT INTO complaint_steps (
            complaint_id, step_order, step_description, created_by
          ) VALUES ($1, $2, $3, $4)
          RETURNING *`,
          [id, i + 1, stepDescription.trim(), req.user.id]
        );
        insertedSteps.push(stepResult.rows[0]);
      }
    }
    
    // Update complaint status to in_progress
    await client.query(
      `UPDATE complaints 
       SET status = 'in_progress', 
           acknowledged_at = NOW(),
           acknowledged_by = $2,
           assigned_agent = COALESCE(assigned_agent, $2)
       WHERE id = $1`,
      [id, req.user.id]
    );
    
    // Add update record
    await client.query(
      `INSERT INTO complaint_updates (
        complaint_id, updated_by, update_text, update_type
      ) VALUES ($1, $2, $3, $4)`,
      [id, req.user.id, `${insertedSteps.length} servicing steps added. Work has begun.`, 'servicing_started']
    );

    // Notify tenant
    await client.query(
      `INSERT INTO notifications (
        user_id, title, message, type, related_entity_type, related_entity_id
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        complaintCheck.rows[0].tenant_id,
        'Complaint Being Serviced',
        `Your complaint "${complaintCheck.rows[0].title}" is now being worked on.`,
        'complaint',
        'complaint',
        id
      ]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: `${insertedSteps.length} steps added successfully`,
      data: insertedSteps
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding complaint steps:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding complaint steps',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ============================================
// TOGGLE STEP COMPLETION
// ============================================
router.patch('/:complaintId/steps/:stepId', protect, authorize(['admin', 'agent']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { complaintId, stepId } = req.params;
    const { is_completed } = req.body;
    
    // Update the step
    const updateResult = await client.query(
      `UPDATE complaint_steps 
       SET is_completed = $1,
           completed_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
           completed_by = CASE WHEN $1 = true THEN $2 ELSE NULL END
       WHERE id = $3 AND complaint_id = $4
       RETURNING *`,
      [is_completed, req.user.id, stepId, complaintId]
    );
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Step not found'
      });
    }
    
    // Check if all steps are now completed
    const allStepsResult = await client.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_completed = true THEN 1 END) as completed
       FROM complaint_steps 
       WHERE complaint_id = $1`,
      [complaintId]
    );
    
    const { total, completed } = allStepsResult.rows[0];
    const allCompleted = parseInt(total) > 0 && parseInt(total) === parseInt(completed);
    
    // If all steps completed, mark complaint as resolved
    if (allCompleted) {
      await client.query(
        `UPDATE complaints 
         SET status = 'resolved',
             resolved_at = NOW(),
             resolved_by = $2
         WHERE id = $1`,
        [complaintId, req.user.id]
      );
      
      // Get complaint for notification
      const complaintResult = await client.query(
        'SELECT title, tenant_id FROM complaints WHERE id = $1',
        [complaintId]
      );
      
      // Add update record
      await client.query(
        `INSERT INTO complaint_updates (
          complaint_id, updated_by, update_text, update_type
        ) VALUES ($1, $2, $3, $4)`,
        [complaintId, req.user.id, 'All steps completed. Complaint resolved.', 'resolved']
      );

      // Notify tenant
      if (complaintResult.rows.length > 0) {
        await client.query(
          `INSERT INTO notifications (
            user_id, title, message, type, related_entity_type, related_entity_id
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            complaintResult.rows[0].tenant_id,
            'Complaint Resolved',
            `Your complaint "${complaintResult.rows[0].title}" has been fully resolved.`,
            'complaint',
            'complaint',
            complaintId
          ]
        );
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: is_completed ? 'Step marked as completed' : 'Step marked as pending',
      data: updateResult.rows[0],
      allCompleted
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error toggling step:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating step',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ============================================
// DELETE STEP
// ============================================
router.delete('/:complaintId/steps/:stepId', protect, authorize(['admin']), async (req, res) => {
  try {
    const { complaintId, stepId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM complaint_steps WHERE id = $1 AND complaint_id = $2 RETURNING *',
      [stepId, complaintId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Step not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Step deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting step:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting step',
      error: error.message
    });
  }
});

// ============================================
// UPDATE COMPLAINT STATUS
// ============================================
router.patch('/:id/status', protect, authorize(['admin', 'agent']), async (req, res) => {
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
    
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    let updateQuery = `
      UPDATE complaints 
      SET status = $1, updated_at = NOW()
    `;
    const queryParams = [status, id];
    
    if (status === 'in_progress') {
      updateQuery += `, acknowledged_at = COALESCE(acknowledged_at, NOW()), acknowledged_by = COALESCE(acknowledged_by, $3)`;
      queryParams.push(req.user.id);
    } else if (status === 'resolved') {
      updateQuery += `, resolved_at = COALESCE(resolved_at, NOW()), resolved_by = COALESCE(resolved_by, $3)`;
      queryParams.push(req.user.id);
    }
    
    updateQuery += ` WHERE id = $2 RETURNING *`;
    
    const updateResult = await client.query(updateQuery, queryParams);
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    // Add update record
    await client.query(
      `INSERT INTO complaint_updates (
        complaint_id, updated_by, update_text, update_type
      ) VALUES ($1, $2, $3, $4)`,
      [id, req.user.id, `Status changed to ${status}.`, 'status_change']
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

// ============================================
// ASSIGN COMPLAINT
// ============================================
router.patch('/:id/assign', protect, authorize(['admin', 'agent']), async (req, res) => {
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
    
    // Check if agent exists
    const agentCheck = await pool.query(
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
    
    const updateResult = await client.query(
      `UPDATE complaints 
       SET assigned_agent = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [agent_id, id]
    );
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
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

// ============================================
// GET COMPLAINT STATISTICS
// ============================================
router.get('/stats/overview', protect, authorize(['admin', 'agent']), async (req, res) => {
  try {
    let whereClause = '';
    const queryParams = [];
    
    if (req.user.role === 'agent') {
      whereClause = `WHERE c.unit_id IN (
        SELECT pu.id FROM property_units pu
        WHERE pu.property_id IN (
          SELECT property_id FROM agent_property_assignments 
          WHERE agent_id = $1 AND is_active = true
        )
      )`;
      queryParams.push(req.user.id);
    }
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_complaints,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_complaints,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_complaints,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_complaints,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority
      FROM complaints c
      ${whereClause}
    `, queryParams);
    
    res.json({
      success: true,
      data: statsResult.rows[0]
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

// ============================================
// UPDATE COMPLAINT (PUT)
// ============================================
router.put('/:id', protect, authorize(['admin', 'agent', 'tenant']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const {
      title,
      description,
      category,
      categories,
      priority,
      assigned_agent,
      status
    } = req.body;
    
    console.log('📝 Updating complaint:', id, req.body);
    
    // Check if complaint exists
    const complaintCheck = await client.query(
      'SELECT * FROM complaints WHERE id = $1',
      [id]
    );
    
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
    
    // Tenants can only update certain fields
    if (req.user.role === 'tenant') {
      if (assigned_agent || status) {
        return res.status(403).json({
          success: false,
          message: 'Tenants cannot assign agents or change status'
        });
      }
    }
    
    // Prepare categories JSON if provided
    let categoriesJson = null;
    if (categories && Array.isArray(categories)) {
      categoriesJson = JSON.stringify(categories);
    }
    
    // Update the complaint
    const updateResult = await client.query(
      `UPDATE complaints 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           categories = COALESCE($4::jsonb, categories),
           priority = COALESCE($5, priority),
           assigned_agent = COALESCE($6, assigned_agent),
           status = COALESCE($7, status),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        title,
        description,
        category,
        categoriesJson,
        priority,
        assigned_agent,
        status,
        id
      ]
    );

    // Create update record
    await client.query(
      `INSERT INTO complaint_updates (
        complaint_id, updated_by, update_text, update_type
      ) VALUES ($1, $2, $3, $4)`,
      [
        id,
        req.user.id,
        'Complaint details updated.',
        'updated'
      ]
    );
    
    await client.query('COMMIT');
    
    console.log('✅ Complaint updated successfully');
    
    res.json({
      success: true,
      message: 'Complaint updated successfully',
      data: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating complaint:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating complaint',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ============================================
// DELETE COMPLAINT
// ============================================
router.delete('/:id', protect, authorize(['admin']), async (req, res) => {
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
    
    // Delete complaint steps first
    await client.query('DELETE FROM complaint_steps WHERE complaint_id = $1', [id]);
    
    // Delete complaint updates
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

// ============================================
// ADD COMPLAINT UPDATE/COMMENT
// ============================================
router.post('/:id/updates', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { update_text, update_type = 'comment' } = req.body;
    
    if (!update_text) {
      return res.status(400).json({
        success: false,
        message: 'Update text is required'
      });
    }
    
    // Check if complaint exists
    const complaintCheck = await client.query(
      'SELECT id, tenant_id FROM complaints WHERE id = $1',
      [id]
    );
    
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
    
    // Create the update
    const updateResult = await client.query(
      `INSERT INTO complaint_updates (
        complaint_id, updated_by, update_text, update_type
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [id, req.user.id, update_text, update_type]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Update added successfully',
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

module.exports = router;