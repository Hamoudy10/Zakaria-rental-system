// ============================================
// FIXED complaintController.js
// Replace your existing backend/controllers/complaintController.js with this
// ============================================

const pool = require('../config/database');

console.log('✅ Complaint controller loaded successfully');

// Get all complaints
const getComplaints = async (req, res) => {
  try {
    console.log('getComplaints function called');
    let query = `
      SELECT c.*, u.name as tenant_name, p.name as property_name
      FROM complaints c
      LEFT JOIN users u ON c.tenant_id = u.id
      LEFT JOIN properties p ON c.property_id = p.id
    `;
    let params = [];
    
    if (req.user.role === 'tenant') {
      query += ' WHERE c.tenant_id = $1';
      params = [req.user.userId];
    }
    
    query += ' ORDER BY c.created_at DESC';
    
    const { rows } = await pool.query(query, params);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching complaints'
    });
  }
};

// Get single complaint
const getComplaint = async (req, res) => {
  try {
    console.log('getComplaint function called');
    const { id } = req.params;
    
    const query = `
      SELECT c.*, u.name as tenant_name, p.name as property_name
      FROM complaints c
      LEFT JOIN users u ON c.tenant_id = u.id
      LEFT JOIN properties p ON c.property_id = p.id
      WHERE c.id = $1
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    if (req.user.role === 'tenant' && rows[0].tenant_id !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Get complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching complaint'
    });
  }
};

// Create complaint
const createComplaint = async (req, res) => {
  try {
    console.log('createComplaint function called');
    const { property_id, title, description, priority } = req.body;
    
    const query = `
      INSERT INTO complaints (tenant_id, property_id, title, description, priority, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      req.user.userId,
      property_id,
      title,
      description,
      priority || 'medium'
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Create complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating complaint'
    });
  }
};

// Update complaint - MAIN UPDATE FUNCTION
const updateComplaint = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('updateComplaint function called');
    const { id } = req.params;
    const { 
      status, 
      response, 
      title, 
      description, 
      priority,
      category,
      categories,
      assigned_agent,
      tenant_id,
      unit_id
    } = req.body;
    
    console.log('📝 Updating complaint:', id);
    console.log('📝 Request body:', req.body);
    
    // Check if complaint exists
    const checkResult = await client.query(
      'SELECT * FROM complaints WHERE id = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    const complaint = checkResult.rows[0];
    
    // Authorization check for tenants
    if (req.user.role === 'tenant' && complaint.tenant_id !== req.user.userId && complaint.tenant_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Prepare categories JSON if provided
    let categoriesJson = null;
    if (categories && Array.isArray(categories)) {
      categoriesJson = JSON.stringify(categories);
    }
    
    let query;
    let values;
    
    if (req.user.role === 'tenant') {
      // Tenants can only update basic fields
      query = `
        UPDATE complaints 
        SET title = COALESCE($1, title), 
            description = COALESCE($2, description), 
            priority = COALESCE($3, priority),
            category = COALESCE($4, category),
            categories = COALESCE($5::jsonb, categories),
            updated_at = NOW()
        WHERE id = $6 AND tenant_id = $7
        RETURNING *
      `;
      values = [title, description, priority, category, categoriesJson, id, req.user.userId || req.user.id];
    } else {
      // Admins and agents can update all fields
      query = `
        UPDATE complaints 
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            priority = COALESCE($3, priority),
            status = COALESCE($4, status), 
            response = COALESCE($5, response),
            category = COALESCE($6, category),
            categories = COALESCE($7::jsonb, categories),
            assigned_agent = COALESCE($8, assigned_agent),
            tenant_id = COALESCE($9, tenant_id),
            unit_id = COALESCE($10, unit_id),
            updated_at = NOW()
        WHERE id = $11
        RETURNING *
      `;
      values = [title, description, priority, status, response, category, categoriesJson, assigned_agent, tenant_id, unit_id, id];
    }
    
    const { rows } = await client.query(query, values);
    
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Complaint not found or access denied'
      });
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Complaint updated successfully');
    
    res.json({
      success: true,
      message: 'Complaint updated successfully',
      data: rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Update complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating complaint',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Delete complaint
const deleteComplaint = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('deleteComplaint function called');
    const { id } = req.params;
    
    // Delete related records first
    await client.query('DELETE FROM complaint_steps WHERE complaint_id = $1', [id]);
    await client.query('DELETE FROM complaint_updates WHERE complaint_id = $1', [id]);
    
    // Delete the complaint
    const { rows } = await client.query('DELETE FROM complaints WHERE id = $1 RETURNING *', [id]);
    
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Complaint deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting complaint'
    });
  } finally {
    client.release();
  }
};

// Get complaint steps
const getComplaintSteps = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        cs.*,
        u.first_name as completed_by_first_name,
        u.last_name as completed_by_last_name
      FROM complaint_steps cs
      LEFT JOIN users u ON cs.completed_by = u.id
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
};

// Add complaint step
const addComplaintStep = async (req, res) => {
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
    
    // Get the next step order if not provided
    let finalStepOrder = step_order;
    if (!finalStepOrder) {
      const maxOrderResult = await client.query(
        'SELECT COALESCE(MAX(step_order), 0) + 1 as next_order FROM complaint_steps WHERE complaint_id = $1',
        [id]
      );
      finalStepOrder = maxOrderResult.rows[0].next_order;
    }
    
    const stepResult = await client.query(
      `INSERT INTO complaint_steps (
        complaint_id, step_order, step_description, created_by
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [id, finalStepOrder, step_description, req.user.id]
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
};

// Toggle step completion
const toggleStepCompletion = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, stepId } = req.params;
    const { is_completed } = req.body;
    
    const updateResult = await client.query(
      `UPDATE complaint_steps 
       SET is_completed = $1,
           completed_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
           completed_by = CASE WHEN $1 = true THEN $2 ELSE NULL END
       WHERE id = $3 AND complaint_id = $4
       RETURNING *`,
      [is_completed, req.user.id, stepId, id]
    );
    
    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Step not found'
      });
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: is_completed ? 'Step marked as completed' : 'Step marked as pending',
      data: updateResult.rows[0]
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
};

// Export all functions
module.exports = {
  getComplaints,
  getComplaint,
  createComplaint,
  updateComplaint,
  deleteComplaint,
  getComplaintSteps,
  addComplaintStep,
  toggleStepCompletion
};