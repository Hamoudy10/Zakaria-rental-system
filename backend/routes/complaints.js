// backend/routes/complaints.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const {
  getComplaints,
  getComplaint,
  createComplaint,
  updateComplaint,
  deleteComplaint
} = require('../controllers/complaintController');

// Use proper auth middleware
const protect = authMiddleware;
const authorize = requireRole;

console.log('Complaints routes loaded');

// ============================================
// GET ALL COMPLAINTS (with advanced filtering)
// ============================================
router.get('/', protect, authorize(['admin', 'agent', 'tenant']), getComplaints);

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
router.get('/:id', protect, getComplaint);

// ============================================
// CREATE NEW COMPLAINT
// ============================================
router.post('/', protect, authorize(['tenant', 'admin', 'agent']), createComplaint);

// ============================================
// UPDATE COMPLAINT (PUT) - CRITICAL FIX
// ============================================
router.put('/:id', protect, authorize(['admin', 'agent', 'tenant']), updateComplaint);

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
        complaint_id, y_updated_by, update_text, update_type
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
// DELETE COMPLAINT
// ============================================
router.delete('/:id', protect, authorize(['admin']), deleteComplaint);

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