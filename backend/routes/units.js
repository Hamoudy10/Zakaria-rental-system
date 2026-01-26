// routes/units.js - CORRECTED FOR OPTION A
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { uploadUnitImages, deleteCloudinaryImage } = require('../middleware/uploadMiddleware');

// ==================== UNIT CRUD ROUTES ====================

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
router.post('/properties/:propertyId/units', protect, adminOnly, async (req, res) => {
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
      features = {},
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
        deposit_amount || rent_amount,
        description,
        features,
        is_occupied,
        req.user.id
      ]
    );
    
    // Update property's total_units and available_units count
    await client.query(
      `UPDATE properties 
       SET total_units = COALESCE(total_units, 0) + 1,
           available_units = CASE WHEN $2 = false THEN COALESCE(available_units, 0) + 1 ELSE COALESCE(available_units, 0) END
       WHERE id = $1`,
      [propertyId, is_occupied]
    );
    
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
router.put('/properties/:propertyId/units/:unitId', protect, adminOnly, async (req, res) => {
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
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND property_id = $9
       RETURNING *`,
      [
        unit_code, 
        unit_number, 
        unit_type, 
        rent_amount, 
        deposit_amount, 
        description,
        features,
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
router.delete('/properties/:propertyId/units/:unitId', protect, adminOnly, async (req, res) => {
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
    
    // Delete unit images from property_images table (Option A)
    const unitImages = await client.query(
      'SELECT image_url FROM property_images WHERE unit_id = $1',
      [unitId]
    );
    
    await client.query('DELETE FROM property_images WHERE unit_id = $1', [unitId]);
    
    // Delete the unit
    await client.query(
      'DELETE FROM property_units WHERE id = $1 AND property_id = $2',
      [unitId, propertyId]
    );
    
    // Update property's unit counts
    await client.query(
      `UPDATE properties 
       SET total_units = GREATEST(0, COALESCE(total_units, 0) - 1),
           available_units = GREATEST(0, COALESCE(available_units, 0) - 1)
       WHERE id = $1`,
      [propertyId]
    );
    
    await client.query('COMMIT');
    
    // Delete images from Cloudinary
    for (const img of unitImages.rows) {
      if (deleteCloudinaryImage) {
        await deleteCloudinaryImage(img.image_url);
      }
    }
    
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
router.patch('/properties/:propertyId/units/:unitId/occupancy', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { propertyId, unitId } = req.params;
    const { is_occupied } = req.body;
    
    if (typeof is_occupied !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'is_occupied must be a boolean value'
      });
    }
    
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
       SET is_occupied = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND property_id = $3
       RETURNING *`,
      [is_occupied, unitId, propertyId]
    );
    
    // Update property's available_units count
    const increment = is_occupied ? -1 : 1;
    await client.query(
      `UPDATE properties 
       SET available_units = GREATEST(0, COALESCE(available_units, 0) + $1)
       WHERE id = $2`,
      [increment, propertyId]
    );
    
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

// ==================== UNIT IMAGE ROUTES (OPTION A - Uses property_images table) ====================

// GET image counts for multiple units (bulk query for UI badges)
router.post('/image-counts', protect, async (req, res) => {
  try {
    const { unitIds } = req.body;
    
    if (!Array.isArray(unitIds) || unitIds.length === 0) {
      return res.json({
        success: true,
        data: {}
      });
    }
    
    // Option A: Query property_images table with unit_id filter
    const result = await pool.query(`
      SELECT unit_id, COUNT(*) as image_count
      FROM property_images
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
  } catch (error) {
    console.error('Error fetching image counts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching image counts',
      error: error.message
    });
  }
});

// GET UNIT IMAGES (Option A - from property_images table)
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
    
    // Option A: Get images from property_images where unit_id matches
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

// UPLOAD UNIT IMAGES (Admin only) - Option A: Inserts into property_images with unit_id
router.post('/:unitId/images', protect, adminOnly, uploadUnitImages, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { unitId } = req.params;
    const { captions } = req.body;
    
    console.log(`📤 Uploading images for unit ${unitId}`);
    
    // Verify unit exists and get property_id
    const unitCheck = await client.query(
      'SELECT id, unit_code, property_id FROM property_units WHERE id = $1',
      [unitId]
    );
    
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found'
      });
    }
    
    const propertyId = unitCheck.rows[0].property_id;
    
    // Check if any files were uploaded
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
    
    // Insert each uploaded image into property_images with unit_id (Option A)
    const insertedImages = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      displayOrder++;
      
      const caption = captionArray[i] || null;
      
      const result = await client.query(
        `INSERT INTO property_images (property_id, unit_id, image_url, image_type, caption, display_order, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [propertyId, unitId, file.path, 'unit', caption, displayOrder, req.user.id]
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

// UPDATE UNIT IMAGE (Caption, Display Order) - Option A
router.patch('/:unitId/images/:imageId', protect, adminOnly, async (req, res) => {
  try {
    const { unitId, imageId } = req.params;
    const { caption, display_order } = req.body;
    
    // Verify image exists and belongs to this unit (Option A: property_images table)
    const imageCheck = await pool.query(
      'SELECT * FROM property_images WHERE id = $1 AND unit_id = $2',
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
      `UPDATE property_images SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
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

// DELETE UNIT IMAGE (Admin only) - Option A
router.delete('/:unitId/images/:imageId', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { unitId, imageId } = req.params;
    
    console.log(`🗑️ Deleting image ${imageId} from unit ${unitId}`);
    
    // Verify image exists and belongs to this unit (Option A: property_images table)
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
    
    // Delete from database
    await client.query('DELETE FROM property_images WHERE id = $1', [imageId]);
    
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

// REORDER UNIT IMAGES (Bulk update display_order) - Option A
router.put('/:unitId/images/reorder', protect, adminOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { unitId } = req.params;
    const { imageOrder } = req.body;
    
    if (!Array.isArray(imageOrder) || imageOrder.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'imageOrder must be a non-empty array of { id, display_order }'
      });
    }
    
    // Update each image's display_order (Option A: property_images table)
    for (const item of imageOrder) {
      await client.query(
        `UPDATE property_images 
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

module.exports = router;