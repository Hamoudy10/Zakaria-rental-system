const pool = require('../config/database');

const getProperties = async (req, res) => {
  try {
    const query = `
      SELECT p.*, u.name as owner_name 
      FROM properties p 
      LEFT JOIN users u ON p.owner_id = u.id 
      ORDER BY p.created_at DESC
    `;
    const { rows } = await pool.query(query);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching properties' });
  }
};

const getProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'SELECT * FROM properties WHERE id = $1';
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching property' });
  }
};

const createProperty = async (req, res) => {
  try {
    const { name, address, type, units, owner_id } = req.body;
    const query = `
      INSERT INTO properties (name, address, type, units, owner_id) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
    const { rows } = await pool.query(query, [name, address, type, units, owner_id]);
    
    res.status(201).json({
      success: true,
      message: 'Property created successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ success: false, message: 'Server error creating property' });
  }
};

const updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, type, units, owner_id } = req.body;
    const query = `
      UPDATE properties 
      SET name = $1, address = $2, type = $3, units = $4, owner_id = $5, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $6 
      RETURNING *
    `;
    const { rows } = await pool.query(query, [name, address, type, units, owner_id, id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    
    res.json({
      success: true,
      message: 'Property updated successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ success: false, message: 'Server error updating property' });
  }
};

const deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM properties WHERE id = $1 RETURNING *';
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    
    res.json({ success: true, message: 'Property deleted successfully' });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting property' });
  }
};

module.exports = {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty
};