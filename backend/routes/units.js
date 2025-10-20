// routes/units.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { protect } = require('../middleware/authMiddleware');

// GET units by property
router.get('/properties/:propertyId/units', protect, async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM property_units 
      WHERE property_id = $1 
      ORDER BY unit_number
    `, [propertyId]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching units',
      error: error.message
    });
  }
});

// ADD unit to property
router.post('/properties/:propertyId/units', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { propertyId } = req.params;
    const {
      unit_code,
      unit_number,
      unit_type,
      rent_amount,
      deposit_amount,
      description,
      features = [],
      is_occupied = false
    } = req.body;
    
    console.log('📝 Adding unit to property:', propertyId);
    console.log('Unit data:', req.body);
    
    // Validate required fields
    if (!unit_code || !unit_number || !unit_type || !rent_amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: unit_code, unit_number, unit_type, rent_amount'
      });
    }
    
    // Check if property exists
    const propertyCheck = await client.query(
      'SELECT id, name FROM properties WHERE id = $1',
      [propertyId]
    );
    
    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Check if unit code already exists in this property
    const existingUnit = await client.query(
      'SELECT id FROM property_units WHERE property_id = $1 AND unit_code = $2',
      [propertyId, unit_code]
    );
    
    if (existingUnit.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Unit with this code already exists in this property'
      });
    }
    
    // Insert the unit
    const unitResult = await client.query(
      `INSERT INTO property_units (
        property_id, unit_code, unit_number, unit_type, rent_amount, 
        deposit_amount, description, features, is_occupied, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        propertyId,
        unit_code,
        unit_number,
        unit_type,
        rent_amount,
        deposit_amount || rent_amount, // Default deposit to rent amount if not provided
        description,
        JSON.stringify(features), // Store features as JSON
        is_occupied,
        req.user.id
      ]
    );
    
    // Update property's available_units count
    if (!is_occupied) {
      await client.query(
        'UPDATE properties SET available_units = available_units + 1 WHERE id = $1',
        [propertyId]
      );
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Unit added successfully:', unitResult.rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Unit added successfully',
      data: unitResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding unit:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error adding unit',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// UPDATE unit
router.put('/properties/:propertyId/units/:unitId', protect, async (req, res) => {
  try {
    const { propertyId, unitId } = req.params;
    const {
      unit_code,
      unit_number,
      unit_type,
      rent_amount,
      deposit_amount,
      description,
      features
    } = req.body;
    
    // Check if unit exists and belongs to property
    const unitCheck = await pool.query(
      'SELECT id, is_occupied FROM property_units WHERE id = $1 AND property_id = $2',
      [unitId, propertyId]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found in this property'
      });
    }
    
    // Check if unit code is being changed and if it already exists
    if (unit_code) {
      const existingCode = await pool.query(
        'SELECT id FROM property_units WHERE property_id = $1 AND unit_code = $2 AND id != $3',
        [propertyId, unit_code, unitId]
      );
      
      if (existingCode.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Unit code already exists in this property'
        });
      }
    }
    
    const result = await pool.query(
      `UPDATE property_units 
       SET unit_code = COALESCE($1, unit_code),
           unit_number = COALESCE($2, unit_number),
           unit_type = COALESCE($3, unit_type),
           rent_amount = COALESCE($4, rent_amount),
           deposit_amount = COALESCE($5, deposit_amount),
           description = COALESCE($6, description),
           features = COALESCE($7, features),
           updated_at = NOW()
       WHERE id = $8 AND property_id = $9
       RETURNING *`,
      [
        unit_code, 
        unit_number, 
        unit_type, 
        rent_amount, 
        deposit_amount, 
        description,
        features ? JSON.stringify(features) : null,
        unitId, 
        propertyId
      ]
    );
    
    res.json({
      success: true,
      message: 'Unit updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating unit',
      error: error.message
    });
  }
});

// DELETE unit
router.delete('/properties/:propertyId/units/:unitId', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { propertyId, unitId } = req.params;
    
    // Check if unit exists and belongs to property
    const unitCheck = await client.query(
      'SELECT id, is_occupied FROM property_units WHERE id = $1 AND property_id = $2',
      [unitId, propertyId]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found in this property'
      });
    }
    
    // Check if unit is occupied
    if (unitCheck.rows[0].is_occupied) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete occupied unit. Please vacate the unit first.'
      });
    }
    
    // Delete the unit
    await client.query(
      'DELETE FROM property_units WHERE id = $1 AND property_id = $2',
      [unitId, propertyId]
    );
    
    // Update property's available_units count
    await client.query(
      'UPDATE properties SET available_units = available_units - 1 WHERE id = $1',
      [propertyId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Unit deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting unit:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error deleting unit',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// UPDATE unit occupancy
router.patch('/properties/:propertyId/units/:unitId/occupancy', protect, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { propertyId, unitId } = req.params;
    const { is_occupied } = req.body;
    
    // Check if unit exists and belongs to property
    const unitCheck = await client.query(
      'SELECT id, is_occupied FROM property_units WHERE id = $1 AND property_id = $2',
      [unitId, propertyId]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found in this property'
      });
    }
    
    const currentOccupancy = unitCheck.rows[0].is_occupied;
    
    // If occupancy status is not changing, return early
    if (currentOccupancy === is_occupied) {
      return res.json({
        success: true,
        message: `Unit is already ${is_occupied ? 'occupied' : 'vacant'}`,
        data: unitCheck.rows[0]
      });
    }
    
    // Update unit occupancy
    const result = await client.query(
      `UPDATE property_units 
       SET is_occupied = $1, updated_at = NOW()
       WHERE id = $2 AND property_id = $3
       RETURNING *`,
      [is_occupied, unitId, propertyId]
    );
    
    // Update property's available_units count
    if (is_occupied) {
      // Unit is now occupied, decrease available units
      await client.query(
        'UPDATE properties SET available_units = available_units - 1 WHERE id = $1',
        [propertyId]
      );
    } else {
      // Unit is now vacant, increase available units
      await client.query(
        'UPDATE properties SET available_units = available_units + 1 WHERE id = $1',
        [propertyId]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Unit ${is_occupied ? 'marked as occupied' : 'marked as vacant'}`,
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating unit occupancy:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error updating unit occupancy',
      error: error.message
    });
  } finally {
    client.release();
  }
});

module.exports = router;