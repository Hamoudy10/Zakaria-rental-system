const { query } = require('../config/database');

const getComplaints = async (req, res) => {
  try {
    const complaintsResult = await query(`
      SELECT c.*,
             u.first_name as tenant_first_name,
             u.last_name as tenant_last_name,
             u.phone_number as tenant_phone,
             p.name as property_name,
             pu.unit_number,
             a.first_name as agent_first_name,
             a.last_name as agent_last_name
      FROM complaints c
      LEFT JOIN users u ON c.tenant_id = u.id
      LEFT JOIN property_units pu ON c.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users a ON c.assigned_agent = a.id
      ORDER BY c.raised_at DESC
    `);

    res.json({
      success: true,
      complaints: complaintsResult.rows
    });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints'
    });
  }
};

const getComplaintById = async (req, res) => {
  try {
    const { id } = req.params;

    const complaintResult = await query(`
      SELECT c.*,
             u.first_name as tenant_first_name,
             u.last_name as tenant_last_name,
             u.phone_number as tenant_phone,
             p.name as property_name,
             pu.unit_number,
             a.first_name as agent_first_name,
             a.last_name as agent_last_name
      FROM complaints c
      LEFT JOIN users u ON c.tenant_id = u.id
      LEFT JOIN property_units pu ON c.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users a ON c.assigned_agent = a.id
      WHERE c.id = $1
    `, [id]);

    if (complaintResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Get complaint updates
    const updatesResult = await query(`
      SELECT * FROM complaint_updates 
      WHERE complaint_id = $1 
      ORDER BY created_at DESC
    `, [id]);

    res.json({
      success: true,
      complaint: {
        ...complaintResult.rows[0],
        updates: updatesResult.rows
      }
    });
  } catch (error) {
    console.error('Get complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaint'
    });
  }
};

const createComplaint = async (req, res) => {
  try {
    const {
      tenant_id,
      unit_id,
      title,
      description,
      category,
      priority
    } = req.body;

    const newComplaint = await query(
      `INSERT INTO complaints 
       (tenant_id, unit_id, title, description, category, priority, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'open') 
       RETURNING *`,
      [tenant_id, unit_id, title, description, category, priority || 'medium']
    );

    res.json({
      success: true,
      complaint: newComplaint.rows[0]
    });
  } catch (error) {
    console.error('Create complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create complaint'
    });
  }
};

const updateComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      updateFields.push(`${key} = $${paramCount}`);
      updateValues.push(updates[key]);
      paramCount++;
    });

    updateValues.push(id);

    const updatedComplaint = await query(
      `UPDATE complaints 
       SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramCount} 
       RETURNING *`,
      updateValues
    );

    if (updatedComplaint.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    res.json({
      success: true,
      complaint: updatedComplaint.rows[0]
    });
  } catch (error) {
    console.error('Update complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update complaint'
    });
  }
};

const assignComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;

    const updatedComplaint = await query(
      `UPDATE complaints 
       SET assigned_agent = $1, status = 'in_progress', acknowledged_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [agentId, id]
    );

    if (updatedComplaint.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Add update record
    await query(
      `INSERT INTO complaint_updates (complaint_id, updated_by, update_text, update_type) 
       VALUES ($1, $2, $3, 'assignment')`,
      [id, req.user?.id, `Complaint assigned to agent`]
    );

    res.json({
      success: true,
      message: 'Complaint assigned successfully',
      complaint: updatedComplaint.rows[0]
    });
  } catch (error) {
    console.error('Assign complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign complaint'
    });
  }
};

const resolveComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_details, resolved_by } = req.body;

    const updatedComplaint = await query(
      `UPDATE complaints 
       SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = $1
       WHERE id = $2 
       RETURNING *`,
      [resolved_by, id]
    );

    if (updatedComplaint.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Add resolution update
    await query(
      `INSERT INTO complaint_updates (complaint_id, updated_by, update_text, update_type) 
       VALUES ($1, $2, $3, 'resolution')`,
      [id, resolved_by, `Complaint resolved: ${resolution_details}`]
    );

    res.json({
      success: true,
      message: 'Complaint resolved successfully',
      complaint: updatedComplaint.rows[0]
    });
  } catch (error) {
    console.error('Resolve complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve complaint'
    });
  }
};

const addComplaintUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { update_text, update_type } = req.body;

    const newUpdate = await query(
      `INSERT INTO complaint_updates (complaint_id, updated_by, update_text, update_type) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [id, req.user?.id, update_text, update_type || 'general']
    );

    res.json({
      success: true,
      update: newUpdate.rows[0]
    });
  } catch (error) {
    console.error('Add complaint update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add complaint update'
    });
  }
};

const getTenantComplaints = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const complaintsResult = await query(`
      SELECT c.*,
             p.name as property_name,
             pu.unit_number,
             a.first_name as agent_first_name,
             a.last_name as agent_last_name
      FROM complaints c
      LEFT JOIN property_units pu ON c.unit_id = pu.id
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN users a ON c.assigned_agent = a.id
      WHERE c.tenant_id = $1
      ORDER BY c.raised_at DESC
    `, [tenantId]);

    res.json({
      success: true,
      complaints: complaintsResult.rows
    });
  } catch (error) {
    console.error('Get tenant complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant complaints'
    });
  }
};

module.exports = {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  assignComplaint,
  resolveComplaint,
  addComplaintUpdate,
  getTenantComplaints
};