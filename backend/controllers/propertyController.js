const pool = require('../config/database');

const getProperties = async (req, res) => {
  try {
    const query = `
      SELECT p.*, 
             COUNT(pu.id) as unit_count,
             COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units,
             COUNT(CASE WHEN pu.is_occupied = false THEN 1 END) as available_units_count,
             u.first_name as created_by_name
      FROM properties p 
      LEFT JOIN property_units pu ON p.id = pu.property_id
      LEFT JOIN users u ON p.created_by = u.id
      GROUP BY p.id, u.first_name
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
    const query = `
      SELECT p.*, 
             u.first_name as created_by_name,
             u.email as created_by_email
      FROM properties p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = $1
    `;
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    // Get property units
    const unitsQuery = `
      SELECT * FROM property_units 
      WHERE property_id = $1 
      ORDER BY unit_number
    `;
    const unitsResult = await pool.query(unitsQuery, [id]);

    // Get property images
    const imagesQuery = `
      SELECT * FROM property_images 
      WHERE property_id = $1 
      ORDER BY uploaded_at DESC
    `;
    const imagesResult = await pool.query(imagesQuery, [id]);
    
    res.json({ 
      success: true, 
      data: {
        ...rows[0],
        units: unitsResult.rows,
        images: imagesResult.rows
      }
    });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching property' });
  }
};

const createProperty = async (req, res) => {
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
      unit_type = 'bedsitter'
    } = req.body;
    
    console.log('📝 Creating new property with data:', req.body);
    
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

    // Insert property with unit_type
    const propertyResult = await client.query(
      `INSERT INTO properties 
        (property_code, name, address, county, town, description, total_units, available_units, unit_type, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [property_code, name, address, county, town, description, total_units, total_units, unit_type, req.user.id]
    );

    // Create default units if total_units > 0
    if (total_units > 0) {
      for (let i = 1; i <= total_units; i++) {
        await client.query(
          `INSERT INTO property_units 
            (property_id, unit_code, unit_type, unit_number, rent_amount, deposit_amount, description, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            propertyResult.rows[0].id,
            `${property_code}-UNIT-${i}`,
            unit_type, // Use the property's unit_type
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
    console.error('Create property error:', error);
    
    // Handle invalid unit_type enum value
    if (error.code === '22P02') {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit_type value. Must be one of: bedsitter, studio, one_bedroom, two_bedroom, three_bedroom'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error creating property',
      error: error.message 
    });
  } finally {
    client.release();
  }
};

const updateProperty = async (req, res) => {
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
      unit_type
    } = req.body;

    // Check if property exists
    const propertyCheck = await pool.query(
      'SELECT id, property_code FROM properties WHERE id = $1',
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

    // Update property with unit_type
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
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 
       RETURNING *`,
      [property_code, name, address, county, town, description, total_units, unit_type, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    
    res.json({
      success: true,
      message: 'Property updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update property error:', error);
    
    // Handle invalid unit_type enum value
    if (error.code === '22P02') {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit_type value. Must be one of: bedsitter, studio, one_bedroom, two_bedroom, three_bedroom'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error updating property',
      error: error.message 
    });
  }
};

const deleteProperty = async (req, res) => {
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
    console.error('Delete property error:', error);
    
    // Handle foreign key constraint errors
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete property due to existing references in other tables'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error deleting property',
      error: error.message 
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty
};