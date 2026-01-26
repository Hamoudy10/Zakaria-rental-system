// routes/units.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/authMiddleware'); // FIXED: Changed protect to authMiddleware

// GET units by property
router.get('/properties/:propertyId/units', authMiddleware, async (req, res) => { // FIXED: Changed protect to authMiddleware
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
router.post('/properties/:propertyId/units', authMiddleware, async (req, res) => { // FIXED: Changed protect to authMiddleware
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

router.post('/image-counts', protect, async (req, res) => {
  try {
    const { unitIds } = req.body;
    
    if (!Array.isArray(unitIds) || unitIds.length === 0) {
      return res.json({
        success: true,
        data: {}
      });
    }
    
    try {
      const result = await pool.query(`
        SELECT unit_id, COUNT(*) as image_count
        FROM unit_images
        WHERE unit_id = ANY($1::uuid[])
        GROUP BY unit_id
      `, [unitIds]);
      
      // Convert to object for easy lookup
      const counts = {};
      result.rows.forEach(row => {
        counts[row.unit_id] = parseInt(row.image_count);
      });
      
      res.json({
        success: true,
        data: counts
      });
    } catch (err) {
      // Table might not exist
      console.log('Note: unit_images table may not exist:', err.message);
      res.json({
        success: true,
        data: {}
      });
    }
  } catch (error) {
    console.error('Error fetching image counts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching image counts',
      error: error.message
    });
  }
});

// GET UNIT IMAGES
router.get('/:unitId/images', protect, async (req, res) => {
  try {
    const { unitId } = req.params;
    
    // Verify unit exists
    const unitCheck = await pool.query(
      'SELECT pu.id, pu.unit_code, pu.property_id FROM property_units pu WHERE pu.id = $1',
      [unitId]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }
    
    const unit = unitCheck.rows[0];
    
    // If user is agent, check if they're assigned to this property
    if (req.user.role === 'agent') {
      const assignmentCheck = await pool.query(
        `SELECT 1 FROM agent_property_assignments 
         WHERE property_id = $1 AND agent_id = $2 AND is_active = true`,
        [unit.property_id, req.user.id]
      );
      
      if (assignmentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not assigned to this property.'
        });
      }
    }
    
    // Try to get images, return empty array if table doesn't exist
    try {
      const result = await pool.query(`
        SELECT ui.*, u.first_name || ' ' || u.last_name as uploaded_by_name
        FROM unit_images ui
        LEFT JOIN users u ON ui.uploaded_by = u.id
        WHERE ui.unit_id = $1
        ORDER BY ui.display_order ASC, ui.uploaded_at DESC
      `, [unitId]);
      
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
    } catch (imgError) {
      // Table might not exist yet
      console.log('Note: unit_images table may not exist yet:', imgError.message);
      res.json({
        success: true,
        data: [],
        count: 0
      });
    }
  } catch (error) {
    console.error('Error fetching unit images:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unit images',
      error: error.message
    });
  }
});

// UPLOAD UNIT IMAGES (Admin only)
router.post('/:unitId/images', protect, adminOnly, uploadUnitImages, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { unitId } = req.params;
    const { captions } = req.body;
    
    console.log(`📤 Uploading images for unit ${unitId}`);
    
    // Verify unit exists
    const unitCheck = await client.query(
      'SELECT id, unit_code FROM property_units WHERE id = $1',
      [unitId]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }
    
    // Check if any files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images provided'
      });
    }
    
    // Get current max display_order
    let displayOrder = 0;
    try {
      const maxOrderResult = await client.query(
        'SELECT COALESCE(MAX(display_order), 0) as max_order FROM unit_images WHERE unit_id = $1',
        [unitId]
      );
      displayOrder = maxOrderResult.rows[0].max_order;
    } catch (err) {
      console.log('Note: unit_images table may be empty or not exist');
    }
    
    // Parse captions if provided
    let captionArray = [];
    if (captions) {
      try {
        captionArray = typeof captions === 'string' ? JSON.parse(captions) : captions;
      } catch (e) {
        captionArray = [];
      }
    }
    
    // Insert each uploaded image
    const insertedImages = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      displayOrder++;
      
      const caption = captionArray[i] || null;
      
      const result = await client.query(
        `INSERT INTO unit_images (unit_id, image_url, caption, display_order, uploaded_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [unitId, file.path, caption, displayOrder, req.user.id]
      );
      
      insertedImages.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Successfully uploaded ${insertedImages.length} images for unit ${unitId}`);
    
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

// UPDATE UNIT IMAGE (Caption, Display Order)
router.patch('/:unitId/images/:imageId', protect, adminOnly, async (req, res) => {
  try {
    const { unitId, imageId } = req.params;
    const { caption, display_order } = req.body;
    
    // Verify image exists and belongs to this unit
    const imageCheck = await pool.query(
      'SELECT * FROM unit_images WHERE id = $1 AND unit_id = $2',
      [imageId, unitId]
    );
    
    if (imageCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found or does not belong to this unit'
      });
    }
    
    // Build update query
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
      `UPDATE unit_images SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    
    res.json({
      success: true,
      message: 'Image updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating unit image:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating unit image',
      error: error.message
    });
  }
});

// DELETE UNIT IMAGE (Admin only)
router.delete('/:unitId/images/:imageId', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { unitId, imageId } = req.params;
    
    console.log(`🗑️ Deleting image ${imageId} from unit ${unitId}`);
    
    // Verify image exists and belongs to this unit
    const imageCheck = await client.query(
      'SELECT * FROM unit_images WHERE id = $1 AND unit_id = $2',
      [imageId, unitId]
    );
    
    if (imageCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found or does not belong to this unit'
      });
    }
    
    const imageUrl = imageCheck.rows[0].image_url;
    
    // Delete from database
    await client.query('DELETE FROM unit_images WHERE id = $1', [imageId]);
    
    // Delete from Cloudinary
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

// REORDER UNIT IMAGES (Bulk update display_order)
router.put('/:unitId/images/reorder', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { unitId } = req.params;
    const { imageOrder } = req.body; // Array of { id, display_order }
    
    if (!Array.isArray(imageOrder) || imageOrder.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'imageOrder must be a non-empty array of { id, display_order }'
      });
    }
    
    // Update each image's display_order
    for (const item of imageOrder) {
      await client.query(
        `UPDATE unit_images 
         SET display_order = $1 
         WHERE id = $2 AND unit_id = $3`,
        [item.display_order, item.id, unitId]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Image order updated successfully'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reordering unit images:', error);
    res.status(500).json({
      success: false,
      message: 'Error reordering unit images',
      error: error.message
    });
  } finally {
    client.release();
  }
});


// UPDATE unit
router.put('/properties/:propertyId/units/:unitId', authMiddleware, async (req, res) => { // FIXED: Changed protect to authMiddleware
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
           features = COALESCE($7, features)
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
router.delete('/properties/:propertyId/units/:unitId', authMiddleware, async (req, res) => { // FIXED: Changed protect to authMiddleware
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
router.patch('/properties/:propertyId/units/:unitId/occupancy', authMiddleware, async (req, res) => { // FIXED: Changed protect to authMiddleware
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
       SET is_occupied = $1
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