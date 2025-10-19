const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/authMiddleware');

// Get all properties
router.get('/', auth, async (req, res) => {
  try {
    console.log('Fetching all properties...');
    const result = await pool.query(`
      SELECT p.*, 
             COUNT(pu.id) as unit_count,
             COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units
      FROM properties p
      LEFT JOIN property_units pu ON p.id = pu.property_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    
    console.log(`Found ${result.rows.length} properties`);
    res.json({ 
      success: true, 
      data: result.rows 
    });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching properties',
      error: error.message 
    });
  }
});

// Get single property
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Property not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching property',
      error: error.message 
    });
  }
});

// CREATE NEW PROPERTY - THIS IS THE MISSING ROUTE!
router.post('/', auth, async (req, res) => {
  try {
    const { property_code, name, address, county, town, description, total_units } = req.body;
    
    console.log('📝 Creating new property with data:', req.body);
    console.log('👤 Created by user ID:', req.user.id);
    
    // Validate required fields
    if (!property_code || !name || !address || !county || !town || !total_units) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const result = await pool.query(
      `INSERT INTO properties (property_code, name, address, county, town, description, total_units, available_units, created_by, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [property_code, name, address, county, town, description, total_units, total_units, req.user.id]
    );
    
    console.log('✅ Property created successfully:', result.rows[0]);
    
    res.status(201).json({ 
      success: true, 
      message: 'Property created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error creating property:', error);
    
    // Handle duplicate property code
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        success: false,
        message: 'Property code already exists'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Error creating property',
      error: error.message 
    });
  }
});

// Update property
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { property_code, name, address, county, town, description, total_units } = req.body;
    
    const result = await pool.query(
      `UPDATE properties 
       SET property_code = $1, name = $2, address = $3, county = $4, town = $5, description = $6, total_units = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [property_code, name, address, county, town, description, total_units, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Property not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Property updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating property',
      error: error.message 
    });
  }
});

// Delete property
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Property not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Property deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting property',
      error: error.message 
    });
  }
});

module.exports = router;