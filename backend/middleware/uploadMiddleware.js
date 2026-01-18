// backend/middleware/uploadMiddleware.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// ============================================
// 1. VERIFY & CONFIGURE CLOUDINARY
// ============================================
console.log('🔍 Cloudinary Config Check:');
console.log('  CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? '✓ Set' : '✗ MISSING');
console.log('  API_KEY:', process.env.CLOUDINARY_API_KEY ? '✓ Set' : '✗ MISSING');
console.log('  API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '✓ Set' : '✗ MISSING');

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ CRITICAL: Cloudinary environment variables are missing!');
  console.error('   Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ============================================
// 2. CONFIGURE CLOUDINARY STORAGE WITH LIMITS
// ============================================
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    console.log(`📤 Uploading ${file.fieldname} for tenant:`, req.params.id);
    console.log(`   Original name: ${file.originalname}`);
    console.log(`   MIME type: ${file.mimetype}`);
    console.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
    
    return {
      folder: 'zakaria_rental/id_images',
      public_id: `${req.params.id}-${Date.now()}-${file.fieldname}`,
      resource_type: 'auto',
      // Add transformation to optimize image size
      transformation: [
        { width: 1500, height: 1500, crop: 'limit' }, // Limit max dimensions
        { quality: 'auto:good', fetch_format: 'auto' } // Auto optimize
      ]
    };
  },
});

// ============================================
// 3. FILE FILTER (Validate file types)
// ============================================
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    console.log(`✅ File type accepted: ${file.mimetype}`);
    cb(null, true);
  } else {
    console.log(`❌ File type rejected: ${file.mimetype}`);
    cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WebP are allowed.`), false);
  }
};

// ============================================
// 4. CREATE MULTER INSTANCE WITH LIMITS
// ============================================
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 2 // Maximum 2 files total
  }
});

// ============================================
// 5. MIDDLEWARE WITH ERROR HANDLING
// ============================================
const uploadIDImages = (req, res, next) => {
  const uploadFields = upload.fields([
    { name: 'id_front_image', maxCount: 1 },
    { name: 'id_back_image', maxCount: 1 }
  ]);

  uploadFields(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors
      console.error('❌ Multer Error:', err);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 10MB per image.'
        });
      }
      
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: 'Too many files. Maximum 2 images allowed.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`
      });
    } else if (err) {
      // Other errors (file type, Cloudinary, etc.)
      console.error('❌ Upload Error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to upload images'
      });
    }
    
    // Success - proceed to next middleware
    console.log('✅ Upload middleware completed successfully');
    next();
  });
};

module.exports = { uploadIDImages };