const pool = require('../config/database');

// @desc    Get all allocations
// @route   GET /api/allocations
// @access  Private (Admin, Agent)
const getAllocations = async (req, res) => {
  try {
    console.log('Getting all allocations...');
    const query = `
      SELECT a.*, u.name as tenant_name, p.name as property_name, un.unit_number
      FROM allocations a
      LEFT JOIN users u ON a.tenant_id = u.id
      LEFT JOIN units un ON a.unit_id = un.id
      LEFT JOIN properties p ON un.property_id = p.id
      ORDER BY a.created_at DESC
    `;
    
    const { rows } = await pool.query(query);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get allocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching allocations'
    });
  }
};

// @desc    Get single allocation
// @route   GET /api/allocations/:id
// @access  Private (Admin, Agent)
const getAllocation = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Getting allocation with ID:', id);
    
    const query = `
      SELECT a.*, u.name as tenant_name, p.name as property_name, un.unit_number
      FROM allocations a
      LEFT JOIN users u ON a.tenant_id = u.id
      LEFT JOIN units un ON a.unit_id = un.id
      LEFT JOIN properties p ON un.property_id = p.id
      WHERE a.id = $1
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Get allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching allocation'
    });
  }
};

// @desc    Create allocation
// @route   POST /api/allocations
// @access  Private (Admin, Agent)
const createAllocation = async (req, res) => {
  try {
    const { tenant_id, unit_id, start_date, end_date, rent_amount } = req.body;
    console.log('Creating allocation:', req.body);
    
    // Check if unit is already allocated
    const checkQuery = `
      SELECT * FROM allocations 
      WHERE unit_id = $1 AND (end_date IS NULL OR end_date > CURRENT_DATE)
    `;
    const checkResult = await pool.query(checkQuery, [unit_id]);
    
    if (checkResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Unit is already allocated'
      });
    }
    
    const insertQuery = `
      INSERT INTO allocations (tenant_id, unit_id, start_date, end_date, rent_amount)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const { rows } = await pool.query(insertQuery, [
      tenant_id, 
      unit_id, 
      start_date, 
      end_date, 
      rent_amount
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Allocation created successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Create allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating allocation'
    });
  }
};

// @desc    Update allocation
// @route   PUT /api/allocations/:id
// @access  Private (Admin, Agent)
const updateAllocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_id, unit_id, start_date, end_date, rent_amount } = req.body;
    console.log('Updating allocation:', id, req.body);
    
    const query = `
      UPDATE allocations 
      SET tenant_id = $1, unit_id = $2, start_date = $3, end_date = $4, rent_amount = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      tenant_id, 
      unit_id, 
      start_date, 
      end_date, 
      rent_amount, 
      id
    ]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Allocation updated successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Update allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating allocation'
    });
  }
};

// @desc    Delete allocation
// @route   DELETE /api/allocations/:id
// @access  Private (Admin, Agent)
const deleteAllocation = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting allocation:', id);
    
    const query = 'DELETE FROM allocations WHERE id = $1 RETURNING *';
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Allocation deleted successfully'
    });
  } catch (error) {
    console.error('Delete allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting allocation'
    });
  }
};

module.exports = {
  getAllocations,
  getAllocation,
  createAllocation,
  updateAllocation,
  deleteAllocation
};