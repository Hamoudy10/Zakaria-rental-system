const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenantController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { uploadIDImages, uploadTenantAgreement } = require('../middleware/uploadMiddleware');

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
// Route to delete a tenant (ADMIN ONLY - tenants must be unallocated)
router.delete('/:id', requireRole(['admin']), tenantController.deleteTenant);

// ✅ SINGLE ROUTE for ID image upload (using multer middleware)
router.post('/:id/upload-id', uploadIDImages, tenantController.uploadIDImages);

// Tenant agreement files
router.post('/:id/agreements', uploadTenantAgreement, tenantController.uploadTenantAgreement);
router.get('/:id/agreements', tenantController.getTenantAgreements);
router.get('/:id/agreements/:documentId/download', tenantController.getTenantAgreementDownloadUrl);
router.delete('/:id/agreements/:documentId', tenantController.deleteTenantAgreement);

// Route to get tenant's ID images
router.get('/:id/id-images', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = require('../config/database');
    
    const result = await pool.query(
      'SELECT id_front_image, id_back_image FROM tenants WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get ID images error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get ID images'
    });
  }
});

// Route to delete ID images
router.delete('/:id/id-images/:type', async (req, res) => {
  try {
    const { id, type } = req.params;
    
    if (!['front', 'back'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image type. Use "front" or "back"'
      });
    }

    const pool = require('../config/database');
    const imageField = type === 'front' ? 'id_front_image' : 'id_back_image';

    const updateQuery = `
      UPDATE tenants 
      SET ${imageField} = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, id_front_image, id_back_image
    `;

    const result = await pool.query(updateQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.json({
      success: true,
      message: `ID ${type} image deleted successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Delete ID image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ID image'
    });
  }
});

module.exports = router;
