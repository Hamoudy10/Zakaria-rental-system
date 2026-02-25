// backend/routes/properties.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { uploadPropertyImages, uploadUnitImages, deleteCloudinaryImage } = require('../middleware/uploadMiddleware');

// ==================== GET ALL PROPERTIES ====================
router.get('/', protect, async (req, res) => {
  try {
    console.log('Fetching properties for user role:', req.user.role);
    
    // If user is agent, get only assigned properties
    if (req.user.role === 'agent') {
      const agentProperties = await pool.query(`
        SELECT DISTINCT p.*, 
          COUNT(pu.id) as unit_count,
          COUNT(CASE WHEN pu.is_occupied = true THEN 1 END) as occupied_units,
          COUNT(CASE WHEN pu.is_occupied = false THEN 1 END) as available_units_count
        FROM properties p
        LEFT JOIN property_units pu ON p.id = pu.property_id
        INNER JOIN agent_property_assignments apa ON p.id = apa.property_id
        WHERE apa.agent_id = $1 
        AND apa.is_active = true
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `, [req.user.id]);
      
      console.log(`Found ${agentProperties.rows.length} assigned properties for agent ${req.user.id}`);
      return res.json({ 
        success: true, 
        count: agentProperties.rows.length,
        data: agentProperties.rows 
      });
    }
    
    // For admins, get all properties
    console.log('Fetching all properties for admin...');
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

// ==================== SHOWCASE ROUTES (Must be BEFORE /:id) ====================

// GET SHOWCASE PROPERTIES LIST - Agents can view all properties for marketing
router.get('/showcase/list', protect, async (req, res) => {
  try {
    console.log('📋 Fetching showcase properties list for user:', req.user.id);
    
    // Return all properties (no agent assignment filter for marketing purposes)
    const result = await pool.query(`
      SELECT 
        p.id,
        p.property_code,
        p.name,
        p.address,
        p.county,
        p.town,
        p.description,
        p.total_units,
        p.available_units,
        p.created_at
      FROM properties p
      ORDER BY p.name ASC
    `);
    
    console.log(`✅ Found ${result.rows.length} properties for showcase`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Error fetching showcase properties:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching properties for showcase',
      error: error.message
    });
  }
});

// GET SHOWCASE PROPERTY DETAILS - Full property data for marketing (no assignment check)
router.get('/showcase/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 Fetching showcase details for property: ${id}`);
    
    // Get property details
    const propertyResult = await pool.query(`
      SELECT 
        p.*,
        u.first_name || ' ' || u.last_name as created_by_name
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
    
    const property = propertyResult.rows[0];
    
    // Get all units for this property
    const unitsResult = await pool.query(`
      SELECT * FROM property_units 
      WHERE property_id = $1 AND is_active = true
      ORDER BY unit_number ASC
    `, [id]);
    
    // Get all images (property-level: unit_id IS NULL)
    let imagesResult = { rows: [] };
    try {
      imagesResult = await pool.query(`
        SELECT * FROM property_images 
        WHERE property_id = $1 AND unit_id IS NULL
        ORDER BY display_order ASC, uploaded_at DESC
      `, [id]);
    } catch (imgError) {
      console.log('Note: property_images query failed:', imgError.message);
    }
    
    console.log(`✅ Showcase data: ${unitsResult.rows.length} units, ${imagesResult.rows.length} images`);
    
    res.json({
      success: true,
      data: {
        ...property,
        units: unitsResult.rows,
        images: imagesResult.rows
      }
    });
  } catch (error) {
    console.error('❌ Error fetching showcase property details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching property showcase details',
      error: error.message
    });
  }
});

// ==================== STANDALONE UNIT IMAGES ROUTE (Must be BEFORE /:id) ====================
// This allows fetching unit images without needing the property ID

router.get('/units/:unitId/images', protect, async (req, res) => {
  try {
    const { unitId } = req.params;
    
    console.log(`📷 Fetching images for unit: ${unitId}`);
    
    // Verify unit exists
    const unitCheck = await pool.query(
      'SELECT id, unit_code, property_id FROM property_units WHERE id = $1',
      [unitId]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }
    
    // Get unit images (Option A: unit_id matches)
    const result = await pool.query(`
      SELECT pi.*, u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM property_images pi
      LEFT JOIN users u ON pi.uploaded_by = u.id
      WHERE pi.unit_id = $1
      ORDER BY pi.display_order ASC, pi.uploaded_at DESC
    `, [unitId]);
    
    console.log(`✅ Found ${result.rows.length} images for unit ${unitId}`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Error fetching unit images:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unit images',
      error: error.message
    });
  }
});

// ==================== GET SINGLE PROPERTY WITH UNITS AND IMAGES (Option A) ====================
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    let query = `
      SELECT p.*, 
        u.first_name as created_by_name,
        u.email as created_by_email
      FROM properties p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = $1
    `;
    
    const params = [id];
    
    if (req.user.role === 'agent') {
      query += `
        AND EXISTS (
          SELECT 1 FROM agent_property_assignments apa 
          WHERE apa.property_id = p.id 
          AND apa.agent_id = $2 
          AND apa.is_active = true
        )
      `;
      params.push(req.user.id);
    }
    
    const propertyResult = await pool.query(query, params);
    
    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Property not found or not accessible' 
      });
    }

    // Get property units
    const unitsResult = await pool.query(`
      SELECT * FROM property_units 
      WHERE property_id = $1 
      ORDER BY unit_number
    `, [id]);

    // Get ALL images for this property (Option A - includes both property and unit images)
    let imagesResult = { rows: [] };
    try {
      imagesResult = await pool.query(`
        SELECT * FROM property_images 
        WHERE property_id = $1 
        ORDER BY display_order ASC, uploaded_at DESC
      `, [id]);
    } catch (imgError) {
      console.log('Note: property_images query failed:', imgError.message);
    }

    res.json({ 
      success: true, 
      data: {
        ...propertyResult.rows[0],
        units: unitsResult.rows,
        images: imagesResult.rows  // Contains ALL images (property + unit), frontend segregates by unit_id
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

// ==================== PROPERTY IMAGES ROUTES (Option A) ====================

// GET PROPERTY IMAGES (property-level only)
router.get('/:id/images', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
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
    
    if (req.user.role === 'agent') {
      const assignmentCheck = await pool.query(
        `SELECT 1 FROM agent_property_assignments 
         WHERE property_id = $1 AND agent_id = $2 AND is_active = true`,
        [id, req.user.id]
      );
      
      if (assignmentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not assigned to this property.'
        });
      }
    }
    
    // Option A: Get only property-level images (unit_id IS NULL)
    const result = await pool.query(`
      SELECT pi.*, u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM property_images pi
      LEFT JOIN users u ON pi.uploaded_by = u.id
      WHERE pi.property_id = $1 AND pi.unit_id IS NULL
      ORDER BY pi.display_order ASC, pi.uploaded_at DESC
    `, [id]);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching property images:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching property images',
      error: error.message
    });
  }
});

// UPLOAD PROPERTY IMAGES (Admin only) - Option A: unit_id = NULL
router.post('/:id/images', protect, adminOnly, uploadPropertyImages, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { captions } = req.body;
    
    console.log(`📤 Uploading property images for property ${id}`);
    
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
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images provided'
      });
    }
    
    // Get current max display_order
    const maxOrderResult = await client.query(
      'SELECT COALESCE(MAX(display_order), 0) as max_order FROM property_images WHERE property_id = $1 AND unit_id IS NULL',
      [id]
    );
    let displayOrder = maxOrderResult.rows[0].max_order;
    
    // Parse captions if provided
    let captionArray = [];
    if (captions) {
      try {
        captionArray = typeof captions === 'string' ? JSON.parse(captions) : captions;
      } catch (e) {
        captionArray = [];
      }
    }
    
    const insertedImages = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      displayOrder++;
      
      const caption = captionArray[i] || null;
      
      // Option A: Insert with unit_id = NULL for property images
      const result = await client.query(
        `INSERT INTO property_images (property_id, unit_id, image_url, image_type, caption, display_order, uploaded_by)
         VALUES ($1, NULL, $2, 'property', $3, $4, $5)
         RETURNING *`,
        [id, file.path, caption, displayOrder, req.user.id]
      );
      
      insertedImages.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Successfully uploaded ${insertedImages.length} property images`);
    
    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${insertedImages.length} image(s)`,
      data: insertedImages
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error uploading property images:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading property images',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// DELETE PROPERTY IMAGE (Admin only)
router.delete('/:id/images/:imageId', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, imageId } = req.params;
    
    console.log(`🗑️ Deleting property image ${imageId} from property ${id}`);
    
    // Option A: Check that it's a property image (unit_id IS NULL)
    const imageCheck = await client.query(
      'SELECT * FROM property_images WHERE id = $1 AND property_id = $2 AND unit_id IS NULL',
      [imageId, id]
    );
    
    if (imageCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found or does not belong to this property'
      });
    }
    
    const imageUrl = imageCheck.rows[0].image_url;
    
    await client.query('DELETE FROM property_images WHERE id = $1', [imageId]);
    
    // Delete from Cloudinary
    if (deleteCloudinaryImage) {
      await deleteCloudinaryImage(imageUrl);
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Successfully deleted property image ${imageId}`);
    
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error deleting property image:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting property image',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ==================== UNIT IMAGES ROUTES (Option A) ====================

// GET UNIT IMAGES (with property context)
router.get('/:id/units/:unitId/images', protect, async (req, res) => {
  try {
    const { id, unitId } = req.params;
    
    // Verify unit exists and belongs to property
    const unitCheck = await pool.query(
      'SELECT id, unit_code FROM property_units WHERE id = $1 AND property_id = $2',
      [unitId, id]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found or does not belong to this property'
      });
    }
    
    if (req.user.role === 'agent') {
      const assignmentCheck = await pool.query(
        `SELECT 1 FROM agent_property_assignments 
         WHERE property_id = $1 AND agent_id = $2 AND is_active = true`,
        [id, req.user.id]
      );
      
      if (assignmentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not assigned to this property.'
        });
      }
    }
    
    // Option A: Get images where unit_id matches
    const result = await pool.query(`
      SELECT pi.*, u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM property_images pi
      LEFT JOIN users u ON pi.uploaded_by = u.id
      WHERE pi.unit_id = $1
      ORDER BY pi.display_order ASC, pi.uploaded_at DESC
    `, [unitId]);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching unit images:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unit images',
      error: error.message
    });
  }
});

// UPLOAD UNIT IMAGES (Admin only) - Option A: unit_id = populated
router.post('/:id/units/:unitId/images', protect, adminOnly, uploadUnitImages, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, unitId } = req.params;
    const { captions } = req.body;
    
    console.log(`📤 Uploading unit images for unit ${unitId} in property ${id}`);
    
    // Verify property exists
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
    
    // Verify unit exists and belongs to property
    const unitCheck = await client.query(
      'SELECT id, unit_code FROM property_units WHERE id = $1 AND property_id = $2',
      [unitId, id]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found or does not belong to this property'
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images provided'
      });
    }
    
    // Get current max display_order for this unit
    const maxOrderResult = await client.query(
      'SELECT COALESCE(MAX(display_order), 0) as max_order FROM property_images WHERE unit_id = $1',
      [unitId]
    );
    let displayOrder = maxOrderResult.rows[0].max_order;
    
    // Parse captions if provided
    let captionArray = [];
    if (captions) {
      try {
        captionArray = typeof captions === 'string' ? JSON.parse(captions) : captions;
      } catch (e) {
        captionArray = [];
      }
    }
    
    const insertedImages = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      displayOrder++;
      
      const caption = captionArray[i] || null;
      
      // Option A: Insert with unit_id populated for unit images
      const result = await client.query(
        `INSERT INTO property_images (property_id, unit_id, image_url, image_type, caption, display_order, uploaded_by)
         VALUES ($1, $2, $3, 'unit', $4, $5, $6)
         RETURNING *`,
        [id, unitId, file.path, caption, displayOrder, req.user.id]
      );
      
      insertedImages.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Successfully uploaded ${insertedImages.length} unit images for unit ${unitId}`);
    
    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${insertedImages.length} image(s)`,
      data: insertedImages
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error uploading unit images:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading unit images',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// DELETE UNIT IMAGE (Admin only)
router.delete('/:id/units/:unitId/images/:imageId', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, unitId, imageId } = req.params;
    
    console.log(`🗑️ Deleting unit image ${imageId} from unit ${unitId}`);
    
    // Option A: Check that it's a unit image (unit_id matches)
    const imageCheck = await client.query(
      'SELECT * FROM property_images WHERE id = $1 AND unit_id = $2',
      [imageId, unitId]
    );
    
    if (imageCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found or does not belong to this unit'
      });
    }
    
    const imageUrl = imageCheck.rows[0].image_url;
    
    await client.query('DELETE FROM property_images WHERE id = $1', [imageId]);
    
    // Delete from Cloudinary
    if (deleteCloudinaryImage) {
      await deleteCloudinaryImage(imageUrl);
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Successfully deleted unit image ${imageId}`);
    
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error deleting unit image:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting unit image',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ==================== PROPERTY CRUD ROUTES ====================

// CREATE NEW PROPERTY (POST)
router.post('/', protect, adminOnly, async (req, res) => {
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
      total_units
    } = req.body;
    
    console.log('📝 Creating new property with data:', req.body);
    console.log('👤 Created by user ID:', req.user.id);
    
    const parsedTotalUnits = Number(total_units);

    if (
      !property_code ||
      !name ||
      !address ||
      !county ||
      !town ||
      total_units === undefined ||
      total_units === null ||
      Number.isNaN(parsedTotalUnits)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: property_code, name, address, county, town, total_units'
      });
    }

    if (parsedTotalUnits < 0 || parsedTotalUnits > 1000) {
      return res.status(400).json({
        success: false,
        message: 'total_units must be between 0 and 1000'
      });
    }

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

    const propertyResult = await client.query(
      `INSERT INTO properties 
        (property_code, name, address, county, town, description, total_units, available_units, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [property_code, name, address, county, town, description, parsedTotalUnits, parsedTotalUnits, req.user.id]
    );

    // Create default units
    if (parsedTotalUnits > 0) {
      for (let i = 1; i <= parsedTotalUnits; i++) {
        await client.query(
          `INSERT INTO property_units 
            (property_id, unit_code, unit_type, unit_number, rent_amount, deposit_amount, description, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            propertyResult.rows[0].id,
            `${property_code}-UNIT-${i}`,
            'bedsitter',
            i.toString(),
            0,
            0,
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
    
    res.status(500).json({ 
      success: false, 
      message: 'Error creating property',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// UPDATE PROPERTY (PUT)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      property_code, 
      name, 
      address, 
      county, 
      town, 
      description, 
      total_units
    } = req.body;

    const propertyCheck = await pool.query(
      'SELECT id, name, property_code FROM properties WHERE id = $1',
      [id]
    );
    
    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Property not found' 
      });
    }

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

    const result = await pool.query(
      `UPDATE properties 
       SET property_code = COALESCE($1, property_code),
           name = COALESCE($2, name),
           address = COALESCE($3, address),
           county = COALESCE($4, county),
           town = COALESCE($5, town),
           description = COALESCE($6, description),
           total_units = COALESCE($7, total_units),
           updated_at = NOW()
       WHERE id = $8 
       RETURNING *`,
      [property_code, name, address, county, town, description, total_units, id]
    );
    
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

// DELETE PROPERTY (DELETE)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
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

    // Get all images to delete from Cloudinary
    let propertyImages = { rows: [] };
    try {
      propertyImages = await client.query(
        'SELECT image_url FROM property_images WHERE property_id = $1',
        [id]
      );
    } catch (imgError) {
      console.log('Note: property_images query failed');
    }

    // Delete property units first
    await client.query('DELETE FROM property_units WHERE property_id = $1', [id]);
    
    // Delete property images
    try {
      await client.query('DELETE FROM property_images WHERE property_id = $1', [id]);
    } catch (imgError) {
      console.log('Note: property_images delete failed');
    }
    
    // Delete the property
    await client.query('DELETE FROM properties WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    // Delete from Cloudinary
    for (const img of propertyImages.rows) {
      if (deleteCloudinaryImage) {
        await deleteCloudinaryImage(img.image_url);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Property "${propertyCheck.rows[0].name}" deleted successfully` 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting property:', error);
    
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

// ==================== UNIT MANAGEMENT ROUTES ====================

// GET PROPERTY UNITS
router.get('/:id/units', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    let query = `
      SELECT * FROM property_units 
      WHERE property_id = $1 AND is_active = true
    `;
    
    const params = [id];
    
    if (req.user.role === 'agent') {
      query += `
        AND EXISTS (
          SELECT 1 FROM properties p
          INNER JOIN agent_property_assignments apa ON p.id = apa.property_id
          WHERE p.id = $1
          AND apa.agent_id = $2
          AND apa.is_active = true
        )
      `;
      params.push(req.user.id);
    }
    
    query += ` ORDER BY unit_number`;
    
    const result = await pool.query(query, params);
    
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

// CREATE NEW UNIT FOR A PROPERTY (POST)
router.post('/:id/units', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const {
      unit_code,
      unit_type = 'bedsitter',
      unit_number,
      rent_amount = 0,
      deposit_amount = 0,
      description = '',
      features = {}
    } = req.body;
    
    console.log(`🔄 Creating unit for property ${id} with data:`, req.body);
    
    const propertyCheck = await client.query(
      `SELECT p.* FROM properties p WHERE p.id = $1`,
      [id]
    );
    
    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    const property = propertyCheck.rows[0];
    
    if (!unit_number) {
      return res.status(400).json({
        success: false,
        message: 'unit_number is required'
      });
    }
    
    const validUnitTypes = ['bedsitter', 'studio', 'one_bedroom', 'two_bedroom', 'three_bedroom', 'shop', 'hall'];
    if (!validUnitTypes.includes(unit_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid unit_type. Must be one of: ${validUnitTypes.join(', ')}`
      });
    }
    
    const finalUnitCode = unit_code || `${property.property_code}-${unit_number || 'UNIT'}`;
    
    const existingUnit = await client.query(
      'SELECT id FROM property_units WHERE unit_code = $1',
      [finalUnitCode]
    );
    
    if (existingUnit.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Unit code already exists'
      });
    }
    
    const unitResult = await client.query(
      `INSERT INTO property_units 
       (property_id, unit_code, unit_type, unit_number, rent_amount, deposit_amount, description, features, is_occupied, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        finalUnitCode,
        unit_type,
        unit_number || '001',
        rent_amount,
        deposit_amount,
        description,
        features,
        false,
        req.user.id
      ]
    );
    
    await client.query(
      `UPDATE properties 
       SET total_units = COALESCE(total_units, 0) + 1,
           available_units = COALESCE(available_units, 0) + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
    
    await client.query('COMMIT');
    
    console.log(`✅ Unit created successfully: ${finalUnitCode}`);
    
    res.status(201).json({
      success: true,
      message: 'Unit created successfully',
      data: unitResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating unit:', error);
    
    if (error.code === '22P02') {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit_type value'
      });
    }
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Unit code already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating unit',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// UPDATE UNIT (PUT)
router.put('/:id/units/:unitId', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, unitId } = req.params;
    const updates = req.body;
    
    console.log(`🔄 Updating unit ${unitId} in property ${id} with:`, updates);
    
    const propertyCheck = await client.query(
      'SELECT id FROM properties WHERE id = $1',
      [id]
    );
    
    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    const unitCheck = await client.query(
      'SELECT * FROM property_units WHERE id = $1 AND property_id = $2',
      [unitId, id]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found or does not belong to this property'
      });
    }
    
    if (updates.unit_type) {
      const validUnitTypes = ['bedsitter', 'studio', 'one_bedroom', 'two_bedroom', 'three_bedroom', 'shop', 'hall'];
      if (!validUnitTypes.includes(updates.unit_type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid unit_type. Must be one of: ${validUnitTypes.join(', ')}`
        });
      }
    }
    
    if (updates.unit_code && updates.unit_code !== unitCheck.rows[0].unit_code) {
      const existingUnit = await client.query(
        'SELECT id FROM property_units WHERE unit_code = $1 AND id != $2',
        [updates.unit_code, unitId]
      );
      
      if (existingUnit.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Unit code already exists'
        });
      }
    }
    
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    const allowedFields = ['unit_code', 'unit_type', 'unit_number', 'rent_amount', 'deposit_amount', 'description', 'features'];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = $${paramCount}`);
        updateValues.push(updates[field]);
        paramCount++;
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(unitId, id);
    
    const query = `
      UPDATE property_units 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount} AND property_id = $${paramCount + 1}
      RETURNING *
    `;
    
    const result = await client.query(query, updateValues);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Unit updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating unit:', error);
    
    if (error.code === '22P02') {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit_type value'
      });
    }
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Unit code already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating unit',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// DELETE UNIT (DELETE)
router.delete('/:id/units/:unitId', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, unitId } = req.params;
    
    console.log(`🗑️ Deleting unit ${unitId} from property ${id}`);
    
    const unitCheck = await client.query(
      `SELECT * FROM property_units 
       WHERE id = $1 AND property_id = $2`,
      [unitId, id]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found or does not belong to this property'
      });
    }
    
    const unit = unitCheck.rows[0];
    
    if (unit.is_occupied) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an occupied unit'
      });
    }
    
    const hasTenants = await client.query(
      'SELECT 1 FROM tenant_allocations WHERE unit_id = $1',
      [unitId]
    );
    
    if (hasTenants.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete unit with tenant allocation history'
      });
    }
    
    const hasPayments = await client.query(
      'SELECT 1 FROM rent_payments WHERE unit_id = $1',
      [unitId]
    );
    
    if (hasPayments.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete unit with payment history'
      });
    }
    
    // Get unit images to delete from Cloudinary
    let unitImages = { rows: [] };
    try {
      unitImages = await client.query(
        'SELECT image_url FROM property_images WHERE unit_id = $1',
        [unitId]
      );
    } catch (imgError) {
      console.log('Note: unit images query failed');
    }
    
    // Delete unit images from database
    try {
      await client.query('DELETE FROM property_images WHERE unit_id = $1', [unitId]);
    } catch (imgError) {
      console.log('Note: unit images delete failed');
    }
    
    await client.query(
      'DELETE FROM property_units WHERE id = $1',
      [unitId]
    );
    
    await client.query(
      `UPDATE properties 
       SET total_units = GREATEST(0, total_units - 1),
           available_units = GREATEST(0, available_units - 1),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
    
    await client.query('COMMIT');
    
    // Delete from Cloudinary
    for (const img of unitImages.rows) {
      if (deleteCloudinaryImage) {
        await deleteCloudinaryImage(img.image_url);
      }
    }
    
    res.json({
      success: true,
      message: `Unit ${unit.unit_code} deleted successfully`
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting unit:', error);
    
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete unit due to existing references in other tables'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error deleting unit',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// GET SINGLE UNIT DETAILS
router.get('/:id/units/:unitId', protect, async (req, res) => {
  try {
    const { id, unitId } = req.params;
    
    let query = `
      SELECT pu.*, p.name as property_name, p.property_code
      FROM property_units pu
      JOIN properties p ON pu.property_id = p.id
      WHERE pu.id = $1 AND pu.property_id = $2
    `;
    
    const params = [unitId, id];
    
    if (req.user.role === 'agent') {
      query += `
        AND EXISTS (
          SELECT 1 FROM agent_property_assignments apa 
          WHERE apa.property_id = p.id 
          AND apa.agent_id = $3 
          AND apa.is_active = true
        )
      `;
      params.push(req.user.id);
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found or not accessible'
      });
    }
    
    // Get tenant info if unit is occupied
    let tenantInfo = null;
    if (result.rows[0].is_occupied) {
      const tenantResult = await pool.query(`
        SELECT t.*, ta.lease_start_date, ta.lease_end_date, ta.monthly_rent
        FROM tenants t
        JOIN tenant_allocations ta ON t.id = ta.tenant_id
        WHERE ta.unit_id = $1 AND ta.is_active = true
      `, [unitId]);
      
      if (tenantResult.rows.length > 0) {
        tenantInfo = tenantResult.rows[0];
      }
    }
    
    // Get unit images (Option A)
    let unitImages = { rows: [] };
    try {
      unitImages = await pool.query(
        'SELECT * FROM property_images WHERE unit_id = $1 ORDER BY display_order ASC',
        [unitId]
      );
    } catch (imgError) {
      console.log('Note: unit images query failed');
    }
    
    res.json({
      success: true,
      data: {
        ...result.rows[0],
        current_tenant: tenantInfo,
        images: unitImages.rows
      }
    });
    
  } catch (error) {
    console.error('Error fetching unit details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unit details',
      error: error.message
    });
  }
});

// UPDATE UNIT OCCUPANCY STATUS
router.patch('/:id/units/:unitId/occupancy', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, unitId } = req.params;
    const { is_occupied } = req.body;
    
    if (typeof is_occupied !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'is_occupied must be a boolean value'
      });
    }
    
    const unitCheck = await client.query(
      'SELECT * FROM property_units WHERE id = $1 AND property_id = $2',
      [unitId, id]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found or does not belong to this property'
      });
    }
    
    const currentStatus = unitCheck.rows[0].is_occupied;
    
    if (currentStatus === is_occupied) {
      return res.json({
        success: true,
        message: `Unit is already ${is_occupied ? 'occupied' : 'vacant'}`
      });
    }
    
    await client.query(
      'UPDATE property_units SET is_occupied = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [is_occupied, unitId]
    );
    
    const increment = is_occupied ? -1 : 1;
    await client.query(
      `UPDATE properties 
       SET available_units = GREATEST(0, available_units + $1),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [increment, id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Unit marked as ${is_occupied ? 'occupied' : 'vacant'} successfully`
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
