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

    // Validate property_code format (alphanumeric, uppercase, no spaces)
    const propertyCodeRegex = /^[A-Z0-9]+$/;
    if (!propertyCodeRegex.test(property_code)) {
      return res.status(400).json({
        success: false,
        message: 'Property code must be uppercase alphanumeric with no spaces (e.g., PROP001)'
      });
    }

    // Validate total_units is a positive number
    if (total_units <= 0 || total_units > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Total units must be a positive number between 1 and 1000'
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

    // Create default units with improved unit codes
    if (total_units > 0) {
      for (let i = 1; i <= total_units; i++) {
        // Generate unit code: PROP001-001, PROP001-002, etc.
        const unitCode = `${property_code}-${i.toString().padStart(3, '0')}`;
        
        // Generate descriptive unit number based on unit type
        let unitNumber;
        switch(unit_type) {
          case 'bedsitter':
            unitNumber = `BS${i}`;
            break;
          case 'studio':
            unitNumber = `ST${i}`;
            break;
          case 'one_bedroom':
            unitNumber = `1B${i}`;
            break;
          case 'two_bedroom':
            unitNumber = `2B${i}`;
            break;
          case 'three_bedroom':
            unitNumber = `3B${i}`;
            break;
          default:
            unitNumber = i.toString();
        }

        await client.query(
          `INSERT INTO property_units 
            (property_id, unit_code, unit_type, unit_number, rent_amount, deposit_amount, description, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            propertyResult.rows[0].id,
            unitCode, // Format: PROP001-001
            unit_type,
            unitNumber, // More descriptive unit number
            0, // default rent amount
            0, // default deposit amount
            `${unit_type.replace('_', ' ').toUpperCase()} - Unit ${i} of ${name}`,
            req.user.id
          ]
        );

        console.log(`✅ Created unit: ${unitCode} (${unitNumber})`);
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

    // Validate property_code format if provided
    if (property_code) {
      const propertyCodeRegex = /^[A-Z0-9]+$/;
      if (!propertyCodeRegex.test(property_code)) {
        return res.status(400).json({
          success: false,
          message: 'Property code must be uppercase alphanumeric with no spaces (e.g., PROP001)'
        });
      }
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

// NEW: Get unit by unit code (for payment processing)
const getUnitByCode = async (req, res) => {
  try {
    const { unitCode } = req.params;
    
    console.log('🔍 Looking up unit by code:', unitCode);
    
    const query = `
      SELECT 
        pu.*,
        p.name as property_name,
        p.property_code,
        p.address as property_address,
        p.county,
        p.town,
        ta.tenant_id,
        t.first_name as tenant_first_name,
        t.last_name as tenant_last_name,
        t.phone_number as tenant_phone,
        t.email as tenant_email,
        ta.monthly_rent,
        ta.lease_start_date,
        ta.lease_end_date,
        ta.is_active as allocation_active
      FROM property_units pu
      LEFT JOIN properties p ON pu.property_id = p.id
      LEFT JOIN tenant_allocations ta ON pu.id = ta.unit_id AND ta.is_active = true
      LEFT JOIN tenants t ON ta.tenant_id = t.id
      WHERE pu.unit_code = $1
    `;
    
    const { rows } = await pool.query(query, [unitCode]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }
    
    const unit = rows[0];
    
    // Get payment history for this unit
    if (unit.tenant_id) {
      const paymentsQuery = `
        SELECT 
          amount,
          payment_month,
          status,
          payment_date,
          mpesa_receipt_number
        FROM rent_payments 
        WHERE unit_id = $1 
        ORDER BY payment_month DESC 
        LIMIT 6
      `;
      const paymentsResult = await pool.query(paymentsQuery, [unit.id]);
      unit.payment_history = paymentsResult.rows;
    }
    
    console.log('✅ Unit found:', {
      unit_code: unit.unit_code,
      property: unit.property_name,
      tenant: unit.tenant_first_name ? `${unit.tenant_first_name} ${unit.tenant_last_name}` : 'No tenant',
      monthly_rent: unit.monthly_rent
    });
    
    res.json({
      success: true,
      data: unit
    });
  } catch (error) {
    console.error('Get unit by code error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching unit',
      error: error.message
    });
  }
};

// NEW: Create individual unit
const createUnit = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const {
      unit_code,
      unit_type,
      unit_number,
      rent_amount,
      deposit_amount,
      description,
      features
    } = req.body;

    // Validate required fields
    if (!unit_code || !unit_type || !unit_number || !rent_amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: unit_code, unit_type, unit_number, rent_amount'
      });
    }

    // Check if property exists
    const propertyCheck = await pool.query(
      'SELECT id, property_code FROM properties WHERE id = $1',
      [propertyId]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Check if unit code already exists
    const existingUnit = await pool.query(
      'SELECT id FROM property_units WHERE unit_code = $1',
      [unit_code]
    );

    if (existingUnit.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Unit code already exists'
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

    // Create the unit
    const result = await pool.query(
      `INSERT INTO property_units 
        (property_id, unit_code, unit_type, unit_number, rent_amount, deposit_amount, description, features, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        propertyId,
        unit_code,
        unit_type,
        unit_number,
        rent_amount,
        deposit_amount || 0,
        description,
        features || {},
        req.user.id
      ]
    );

    // Update property unit count
    await pool.query(
      `UPDATE properties 
       SET total_units = total_units + 1,
           available_units = available_units + 1
       WHERE id = $1`,
      [propertyId]
    );

    res.status(201).json({
      success: true,
      message: 'Unit created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create unit error:', error);
    
    // Handle invalid unit_type enum value
    if (error.code === '22P02') {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit_type value. Must be one of: bedsitter, studio, one_bedroom, two_bedroom, three_bedroom'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error creating unit',
      error: error.message
    });
  }
};

// Get properties assigned to current agent
const getAgentProperties = async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    
    let query = `
      SELECT DISTINCT p.*, 
             (SELECT COUNT(*) FROM property_units pu WHERE pu.property_id = p.id AND pu.is_occupied = false) as available_units_count
      FROM properties p
      INNER JOIN agent_property_assignments apa ON p.id = apa.property_id
      WHERE apa.agent_id = $1 AND apa.is_active = true AND p.is_active = true
    `;
    
    const params = [req.user.id];
    let paramCount = 2;

    if (search) {
      query += ` AND (p.name ILIKE $${paramCount} OR p.property_code ILIKE $${paramCount} OR p.address ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY p.name`;

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get agent properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching properties',
      error: error.message
    });
  }
};

// NEW: Update unit
const updateUnit = async (req, res) => {
  try {
    const { unitId } = req.params;
    const {
      unit_code,
      unit_type,
      unit_number,
      rent_amount,
      deposit_amount,
      description,
      features,
      is_active
    } = req.body;

    // Check if unit exists
    const unitCheck = await pool.query(
      'SELECT id, unit_code, is_occupied FROM property_units WHERE id = $1',
      [unitId]
    );

    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }

    const currentUnit = unitCheck.rows[0];

    // Prevent updating unit code if unit is occupied
    if (unit_code && unit_code !== currentUnit.unit_code && currentUnit.is_occupied) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change unit code for an occupied unit'
      });
    }

    // Check if new unit code already exists
    if (unit_code && unit_code !== currentUnit.unit_code) {
      const existingUnit = await pool.query(
        'SELECT id FROM property_units WHERE unit_code = $1 AND id != $2',
        [unit_code, unitId]
      );

      if (existingUnit.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Unit code already exists'
        });
      }
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

    const result = await pool.query(
      `UPDATE property_units 
       SET unit_code = COALESCE($1, unit_code),
           unit_type = COALESCE($2, unit_type),
           unit_number = COALESCE($3, unit_number),
           rent_amount = COALESCE($4, rent_amount),
           deposit_amount = COALESCE($5, deposit_amount),
           description = COALESCE($6, description),
           features = COALESCE($7, features),
           is_active = COALESCE($8, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        unit_code,
        unit_type,
        unit_number,
        rent_amount,
        deposit_amount,
        description,
        features,
        is_active,
        unitId
      ]
    );

    res.json({
      success: true,
      message: 'Unit updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update unit error:', error);
    
    // Handle invalid unit_type enum value
    if (error.code === '22P02') {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit_type value. Must be one of: bedsitter, studio, one_bedroom, two_bedroom, three_bedroom'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error updating unit',
      error: error.message
    });
  }
};

// Add these to propertyController.js
const uploadPropertyImages = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No images uploaded' });
    }

    const imagePromises = req.files.map(file => {
      return pool.query(
        'INSERT INTO property_images (property_id, image_url, uploaded_at) VALUES ($1, $2, NOW()) RETURNING *',
        [id, file.path] // file.path is the Cloudinary URL from your middleware
      );
    });

    await Promise.all(imagePromises);
    res.json({ success: true, message: 'Images uploaded successfully' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Server error uploading images' });
  }
};

const deletePropertyImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;
    // 1. Delete from database
    await pool.query('DELETE FROM property_images WHERE id = $1 AND property_id = $2', [imageId, id]);
    // Note: To delete from Cloudinary, you'd call your deleteCloudinaryImage utility here
    res.json({ success: true, message: 'Image deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
};

module.exports = {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  getUnitByCode,
  createUnit,
  getAgentProperties,
  updateUnit,
  uploadPropertyImages,
  deletePropertyImage
};