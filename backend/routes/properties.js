const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { uploadPropertyImages, deleteCloudinaryImage } = require('../middleware/uploadMiddleware');

// GET ALL PROPERTIES (For admins) OR AGENT ASSIGNED PROPERTIES
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
    
    // For admins, get all properties (original logic)
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

// GET AGENT ASSIGNED PROPERTIES (Explicit endpoint)
router.get('/agent/assigned', protect, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only agents can access assigned properties.'
      });
    }
    
    const query = `
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
          ORDER BY p.name
        `;
    
    const result = await pool.query(query, [req.user.id]);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching agent properties:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching agent properties',
      error: error.message
    });
  }
});

// GET SINGLE PROPERTY WITH UNITS
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

    // Get property images (with fallback if table doesn't exist)
    let imagesResult = { rows: [] };
    try {
      imagesResult = await pool.query(`
        SELECT * FROM property_images 
        WHERE property_id = $1 
        ORDER BY display_order ASC, uploaded_at DESC
      `, [id]);
    } catch (imgError) {
      console.log('Note: property_images table may not exist yet:', imgError.message);
    }

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

// ==================== PROPERTY IMAGES ROUTES ====================

// GET PROPERTY IMAGES
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
    
    try {
      const result = await pool.query(`
        SELECT pi.*, u.first_name || ' ' || u.last_name as uploaded_by_name
        FROM property_images pi
        LEFT JOIN users u ON pi.uploaded_by = u.id
        WHERE pi.property_id = $1
        ORDER BY pi.display_order ASC, pi.uploaded_at DESC
      `, [id]);
      
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
    } catch (imgError) {
      console.log('Note: property_images table may not exist yet');
      res.json({
        success: true,
        data: [],
        count: 0
      });
    }
  } catch (error) {
    console.error('Error fetching property images:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching property images',
      error: error.message
    });
  }
});

// UPLOAD PROPERTY IMAGES (Admin only)
router.post('/:id/images', protect, adminOnly, uploadPropertyImages, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { captions } = req.body;
    
    console.log(`📤 Uploading images for property ${id}`);
    
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
    
    const maxOrderResult = await client.query(
      'SELECT COALESCE(MAX(display_order), 0) as max_order FROM property_images WHERE property_id = $1',
      [id]
    );
    let displayOrder = maxOrderResult.rows[0].max_order;
    
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
      
      const result = await client.query(
        `INSERT INTO property_images (property_id, image_url, caption, display_order, uploaded_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, file.path, caption, displayOrder, req.user.id]
      );
      
      insertedImages.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Successfully uploaded ${insertedImages.length} images for property ${id}`);
    
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

// UPDATE PROPERTY IMAGE (Caption, Display Order)
router.patch('/:id/images/:imageId', protect, adminOnly, async (req, res) => {
  try {
    const { id, imageId } = req.params;
    const { caption, display_order } = req.body;
    
    const imageCheck = await pool.query(
      'SELECT * FROM property_images WHERE id = $1 AND property_id = $2',
      [imageId, id]
    );
    
    if (imageCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found or does not belong to this property'
      });
    }
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (caption !== undefined) {
      updates.push(`caption = $${paramCount}`);
      values.push(caption);
      paramCount++;
    }
    
    if (display_order !== undefined) {
      updates.push(`display_order = $${paramCount}`);
      values.push(display_order);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    values.push(imageId);
    
    const result = await pool.query(
      `UPDATE property_images SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    
    res.json({
      success: true,
      message: 'Image updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating property image:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating property image',
      error: error.message
    });
  }
});

// DELETE PROPERTY IMAGE (Admin only)
router.delete('/:id/images/:imageId', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, imageId } = req.params;
    
    console.log(`🗑️ Deleting image ${imageId} from property ${id}`);
    
    const imageCheck = await client.query(
      'SELECT * FROM property_images WHERE id = $1 AND property_id = $2',
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
    
    if (deleteCloudinaryImage) {
      await deleteCloudinaryImage(imageUrl);
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Successfully deleted image ${imageId}`);
    
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

// REORDER PROPERTY IMAGES
router.put('/:id/images/reorder', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { imageOrder } = req.body;
    
    if (!Array.isArray(imageOrder) || imageOrder.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'imageOrder must be a non-empty array of { id, display_order }'
      });
    }
    
    for (const item of imageOrder) {
      await client.query(
        `UPDATE property_images 
         SET display_order = $1 
         WHERE id = $2 AND property_id = $3`,
        [item.display_order, item.id, id]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Image order updated successfully'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reordering property images:', error);
    res.status(500).json({
      success: false,
      message: 'Error reordering property images',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ==================== END PROPERTY IMAGES ROUTES ====================

// CREATE NEW PROPERTY (POST) - WITHOUT unit_type at property level
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
    
    if (!property_code || !name || !address || !county || !town || !total_units) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: property_code, name, address, county, town, total_units'
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
      [property_code, name, address, county, town, description, total_units, total_units, req.user.id]
    );

    if (total_units > 0) {
      for (let i = 1; i <= total_units; i++) {
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

// UPDATE PROPERTY (PUT) - WITHOUT unit_type at property level
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

    let propertyImages = { rows: [] };
    try {
      propertyImages = await client.query(
        'SELECT image_url FROM property_images WHERE property_id = $1',
        [id]
      );
    } catch (imgError) {
      console.log('Note: property_images table may not exist yet');
    }

    await client.query('DELETE FROM property_units WHERE property_id = $1', [id]);
    
    try {
      await client.query('DELETE FROM property_images WHERE property_id = $1', [id]);
    } catch (imgError) {
      console.log('Note: property_images table may not exist yet');
    }
    
    await client.query('DELETE FROM properties WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
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

// GET PROPERTY STATISTICS
router.get('/:id/stats', protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    let query = `
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
    
    query += ` GROUP BY p.id, p.total_units, p.available_units`;
    
    const statsResult = await pool.query(query, params);

    if (statsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or not accessible'
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
    
    if (result.rows.length === 0 && req.user.role === 'agent') {
      return res.status(403).json({
        success: false,
        message: 'Access denied or property not found'
      });
    }
    
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

// ==================== UNIT MANAGEMENT ROUTES ====================

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
    
    res.json({
      success: true,
      data: {
        ...result.rows[0],
        current_tenant: tenantInfo
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