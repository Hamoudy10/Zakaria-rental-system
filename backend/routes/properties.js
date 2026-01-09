const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/authMiddleware');

// GET ALL PROPERTIES
router.get('/', authMiddleware, async (req, res) => {
  try {
    console.log('Fetching all properties...');
    const result = await pool.query(`
      SELECT p.*, 
             COUNT(pu.id) as unit_count,
             COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units,
             COUNT(CASE WHEN pu.is_occupied = false THEN 1 END) as available_units_count
      FROM properties p
      LEFT JOIN property_units pu ON p.id = pu.property_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    
    console.log(`Found ${result.rows.length} properties`);
    res.json({ 
      success: true, 
      count: result.rows.length,
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

// GET SINGLE PROPERTY WITH UNITS
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get property details
    const propertyResult = await pool.query(`
      SELECT p.*, 
             u.first_name as created_by_name,
             u.email as created_by_email
      FROM properties p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = $1
    `, [id]);
    
    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Property not found' 
      });
    }

    // Get property units
    const unitsResult = await pool.query(`
      SELECT * FROM property_units 
      WHERE property_id = $1 
      ORDER BY unit_number
    `, [id]);

    // Get property images
    const imagesResult = await pool.query(`
      SELECT * FROM property_images 
      WHERE property_id = $1 
      ORDER BY uploaded_at DESC
    `, [id]);

    res.json({ 
      success: true, 
      data: {
        ...propertyResult.rows[0],
        units: unitsResult.rows,
        images: imagesResult.rows
      }
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

// CREATE NEW PROPERTY (POST) - UPDATED WITH UNIT_TYPE
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { 
      property_code, 
      name, 
      address, 
      county, 
      town, 
      description, 
      total_units,
      unit_type = 'bedsitter' // Added unit_type with default
    } = req.body;
    
    console.log('📝 Creating new property with data:', req.body);
    console.log('👤 Created by user ID:', req.user.id);
    
    // Validate required fields
    if (!property_code || !name || !address || !county || !town || !total_units) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: property_code, name, address, county, town, total_units'
      });
    }

    // Validate unit_type
    const validUnitTypes = ['bedsitter', 'studio', 'one_bedroom', 'two_bedroom', 'three_bedroom'];
    if (!validUnitTypes.includes(unit_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid unit_type. Must be one of: ${validUnitTypes.join(', ')}`
      });
    }

    // Check if property code already exists
    const existingProperty = await client.query(
      'SELECT id FROM properties WHERE property_code = $1',
      [property_code]
    );
    
    if (existingProperty.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Property code already exists'
      });
    }

    // Insert property - UPDATED WITH UNIT_TYPE
    const propertyResult = await client.query(
      `INSERT INTO properties 
        (property_code, name, address, county, town, description, total_units, available_units, unit_type, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [property_code, name, address, county, town, description, total_units, total_units, unit_type, req.user.id]
    );

    // Create default units if total_units > 0 - UPDATED TO USE PROPERTY'S UNIT_TYPE
    if (total_units > 0) {
      for (let i = 1; i <= total_units; i++) {
        await client.query(
          `INSERT INTO property_units 
            (property_id, unit_code, unit_type, unit_number, rent_amount, deposit_amount, description, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            propertyResult.rows[0].id,
            `${property_code}-UNIT-${i}`,
            unit_type, // Use the property's unit_type instead of hardcoded 'residential'
            i.toString(),
            0, // default rent amount
            0, // default deposit amount
            `Unit ${i} of ${name}`,
            req.user.id
          ]
        );
      }
    }

    await client.query('COMMIT');
    
    console.log('✅ Property created successfully:', propertyResult.rows[0]);
    
    res.status(201).json({ 
      success: true, 
      message: 'Property created successfully',
      data: propertyResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating property:', error);
    
    // Handle invalid unit_type enum value
    if (error.code === '22P02') {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit_type value. Must be one of: bedsitter, studio, one_bedroom, two_bedroom, three_bedroom'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Error creating property',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// UPDATE PROPERTY (PUT) - UPDATED WITH UNIT_TYPE
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      property_code, 
      name, 
      address, 
      county, 
      town, 
      description, 
      total_units,
      unit_type // Added unit_type
    } = req.body;

    // Check if property exists
    const propertyCheck = await pool.query(
      'SELECT id, name FROM properties WHERE id = $1',
      [id]
    );
    
    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Property not found' 
      });
    }

    // Validate unit_type if provided
    if (unit_type) {
      const validUnitTypes = ['bedsitter', 'studio', 'one_bedroom', 'two_bedroom', 'three_bedroom'];
      if (!validUnitTypes.includes(unit_type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid unit_type. Must be one of: ${validUnitTypes.join(', ')}`
        });
      }
    }

    // Check if property code is being changed and if it already exists
    if (property_code && property_code !== propertyCheck.rows[0].property_code) {
      const existingCode = await pool.query(
        'SELECT id FROM properties WHERE property_code = $1 AND id != $2',
        [property_code, id]
      );
      
      if (existingCode.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Property code already exists'
        });
      }
    }

    // UPDATED QUERY WITH UNIT_TYPE
    const result = await pool.query(
      `UPDATE properties 
       SET property_code = COALESCE($1, property_code),
           name = COALESCE($2, name),
           address = COALESCE($3, address),
           county = COALESCE($4, county),
           town = COALESCE($5, town),
           description = COALESCE($6, description),
           total_units = COALESCE($7, total_units),
           unit_type = COALESCE($8, unit_type),
           updated_at = NOW()
       WHERE id = $9 
       RETURNING *`,
      [property_code, name, address, county, town, description, total_units, unit_type, id]
    );
    
    res.json({ 
      success: true, 
      message: 'Property updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating property:', error);
    
    // Handle invalid unit_type enum value
    if (error.code === '22P02') {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit_type value. Must be one of: bedsitter, studio, one_bedroom, two_bedroom, three_bedroom'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Error updating property',
      error: error.message 
    });
  }
});

// DELETE PROPERTY (DELETE)
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if property exists
    const propertyCheck = await client.query(
      'SELECT id, name FROM properties WHERE id = $1',
      [id]
    );
    
    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Property not found' 
      });
    }

    // Check if property has occupied units
    const occupiedUnits = await client.query(
      `SELECT COUNT(*) as occupied_count 
       FROM property_units 
       WHERE property_id = $1 AND is_occupied = true`,
      [id]
    );

    if (parseInt(occupiedUnits.rows[0].occupied_count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete property with occupied units. Please reassign tenants first.'
      });
    }

    // Check if property has related payments or complaints
    const relatedPayments = await client.query(
      'SELECT COUNT(*) as payment_count FROM rent_payments WHERE unit_id IN (SELECT id FROM property_units WHERE property_id = $1)',
      [id]
    );

    const relatedComplaints = await client.query(
      'SELECT COUNT(*) as complaint_count FROM complaints WHERE unit_id IN (SELECT id FROM property_units WHERE property_id = $1)',
      [id]
    );

    if (parseInt(relatedPayments.rows[0].payment_count) > 0 || parseInt(relatedComplaints.rows[0].complaint_count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete property with historical payments or complaints. Consider archiving instead.'
      });
    }

    // Delete property units first
    await client.query('DELETE FROM property_units WHERE property_id = $1', [id]);
    
    // Delete property images
    await client.query('DELETE FROM property_images WHERE property_id = $1', [id]);
    
    // Delete the property
    await client.query('DELETE FROM properties WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `Property "${propertyCheck.rows[0].name}" deleted successfully` 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting property:', error);
    
    // Handle foreign key constraint errors
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete property due to existing references in other tables'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting property',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// GET PROPERTY STATISTICS
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const statsResult = await pool.query(`
      SELECT 
        p.total_units,
        p.available_units,
        COUNT(pu.id) as current_units,
        COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units,
        COUNT(CASE WHEN pu.is_occupied = false THEN 1 END) as vacant_units,
        COALESCE(SUM(rp.amount), 0) as total_rent_collected,
        COUNT(rp.id) as total_payments
      FROM properties p
      LEFT JOIN property_units pu ON p.id = pu.property_id
      LEFT JOIN rent_payments rp ON pu.id = rp.unit_id
      WHERE p.id = $1
      GROUP BY p.id, p.total_units, p.available_units
    `, [id]);

    if (statsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    res.json({
      success: true,
      data: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching property stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching property statistics',
      error: error.message
    });
  }
});

router.get('/agent/assigned', protect, agentOnly, getAgentProperties);

// In your property routes file (backend/routes/propertyRoutes.js or similar)
router.get('/:id/units', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM property_units 
      WHERE property_id = $1 AND is_active = true
      ORDER BY unit_number
    `, [id]);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching property units:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property units'
    });
  }
});

module.exports = router;