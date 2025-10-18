const pool = require('../config/database');

console.log('Complaint controller loaded successfully');

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

// Update complaint
const updateComplaint = async (req, res) => {
  try {
    console.log('updateComplaint function called');
    const { id } = req.params;
    const { status, response, title, description, priority } = req.body;
    
    let query;
    let values;
    
    if (req.user.role === 'tenant') {
      query = `
        UPDATE complaints 
        SET title = $1, description = $2, priority = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND tenant_id = $5
        RETURNING *
      `;
      values = [title, description, priority, id, req.user.userId];
    } else {
      query = `
        UPDATE complaints 
        SET status = $1, response = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      values = [status, response, id];
    }
    
    const { rows } = await pool.query(query, values);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Complaint updated successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Update complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating complaint'
    });
  }
};

// Delete complaint
const deleteComplaint = async (req, res) => {
  try {
    console.log('deleteComplaint function called');
    const { id } = req.params;
    
    const query = 'DELETE FROM complaints WHERE id = $1 RETURNING *';
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Complaint deleted successfully'
    });
  } catch (error) {
    console.error('Delete complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting complaint'
    });
  }
};

// Explicitly export each function
module.exports.getComplaints = getComplaints;
module.exports.getComplaint = getComplaint;
module.exports.createComplaint = createComplaint;
module.exports.updateComplaint = updateComplaint;
module.exports.deleteComplaint = deleteComplaint;