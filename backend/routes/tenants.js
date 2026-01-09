const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenantController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); // You'll need to create this

// All routes require authentication
router.use(protect);

// Route to get all tenants (with pagination and search)
router.get('/', tenantController.getTenants);

// Route to get available units for tenant allocation
router.get('/available-units', tenantController.getAvailableUnits);

// Route to get a single tenant by ID
router.get('/:id', tenantController.getTenant);

// Route to create a new tenant (with optional allocation)
router.post('/', tenantController.createTenant);

// Route to update a tenant
router.put('/:id', tenantController.updateTenant);

// Route to delete a tenant
router.delete('/:id', tenantController.deleteTenant);

// New route for uploading ID images
router.post('/:id/upload-id', upload.array('id_images', 2), async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    // Update tenant with image URLs
    const updates = {};
    if (files[0]) updates.id_front_image = files[0].path; // Adjust based on your storage
    if (files[1]) updates.id_back_image = files[1].path;

    const result = await pool.query(
      `UPDATE tenants 
       SET id_front_image = COALESCE($1, id_front_image),
           id_back_image = COALESCE($2, id_back_image),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [updates.id_front_image, updates.id_back_image, id]
    );

    res.json({
      success: true,
      message: 'ID images uploaded successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('ID upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload ID images'
    });
  }
});

module.exports = router;