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
// 2. CONFIGURE CLOUDINARY STORAGE FOR ID IMAGES
// ============================================
const idImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    console.log(`📤 Uploading ${file.fieldname} for tenant:`, req.params.id);
    console.log(`   Original name: ${file.originalname}`);
    console.log(`   MIME type: ${file.mimetype}`);
    
    return {
      folder: 'zakaria_rental/id_images',
      public_id: `${req.params.id}-${Date.now()}-${file.fieldname}`,
      resource_type: 'auto',
      transformation: [
        { width: 1500, height: 1500, crop: 'limit' },
        { quality: 'auto:good', fetch_format: 'auto' }
      ]
    };
  },
});

// ============================================
// 3. CONFIGURE CLOUDINARY STORAGE FOR PROFILE IMAGES
// ============================================
const profileImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const userId = req.user?.id || 'unknown';
    console.log(`📤 Uploading profile image for user:`, userId);
    console.log(`   Original name: ${file.originalname}`);
    console.log(`   MIME type: ${file.mimetype}`);
    
    return {
      folder: 'zakaria_rental/profile_images',
      public_id: `profile-${userId}-${Date.now()}`,
      resource_type: 'auto',
      transformation: [
        { width: 500, height: 500, crop: 'fill', gravity: 'face' },
        { quality: 'auto:good', fetch_format: 'auto' }
      ]
    };
  },
});

// ============================================
// 4. CONFIGURE CLOUDINARY STORAGE FOR COMPANY LOGO
// ============================================
const companyLogoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    console.log(`📤 Uploading company logo`);
    console.log(`   Original name: ${file.originalname}`);
    console.log(`   MIME type: ${file.mimetype}`);
    
    return {
      folder: 'zakaria_rental/company',
      public_id: `company-logo-${Date.now()}`,
      resource_type: 'auto',
      transformation: [
        { width: 300, height: 300, crop: 'limit' }, // Limit to max dimensions, preserve aspect ratio
        { quality: 'auto:best', fetch_format: 'auto' }
      ]
    };
  },
});

// ============================================
// 5. FILE FILTER (Validate file types)
// ============================================
const imageFileFilter = (req, file, cb) => {
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
// 6. CREATE MULTER INSTANCES
// ============================================

// For tenant ID images
const idImageUpload = multer({
  storage: idImageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 2
  }
});

// For user profile images
const profileImageUpload = multer({
  storage: profileImageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max for profile images
    files: 1
  }
});

// For company logo
const companyLogoUpload = multer({
  storage: companyLogoStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max for logo
    files: 1
  }
});

// ============================================
// 7. MIDDLEWARE FOR ID IMAGES (EXISTING)
// ============================================
const uploadIDImages = (req, res, next) => {
  const uploadFields = idImageUpload.fields([
    { name: 'id_front_image', maxCount: 1 },
    { name: 'id_back_image', maxCount: 1 }
  ]);

  uploadFields(req, res, (err) => {
    if (err instanceof multer.MulterError) {
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
      console.error('❌ Upload Error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to upload images'
      });
    }
    
    console.log('✅ ID image upload middleware completed successfully');
    next();
  });
};

// ============================================
// 8. MIDDLEWARE FOR PROFILE IMAGE
// ============================================
const uploadProfileImage = (req, res, next) => {
  const uploadSingle = profileImageUpload.single('profile_image');

  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('❌ Multer Error:', err);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB for profile image.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`
      });
    } else if (err) {
      console.error('❌ Upload Error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to upload profile image'
      });
    }
    
    console.log('✅ Profile image upload middleware completed successfully');
    if (req.file) {
      console.log('📁 Uploaded file:', req.file.path);
    }
    next();
  });
};

// ============================================
// 9. MIDDLEWARE FOR COMPANY LOGO
// ============================================
const uploadCompanyLogo = (req, res, next) => {
  const uploadSingle = companyLogoUpload.single('company_logo');

  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('❌ Multer Error:', err);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB for company logo.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`
      });
    } else if (err) {
      console.error('❌ Upload Error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Failed to upload company logo'
      });
    }
    
    console.log('✅ Company logo upload middleware completed successfully');
    if (req.file) {
      console.log('📁 Uploaded logo:', req.file.path);
    }
    next();
  });
};

// ============================================
// 10. UTILITY: DELETE IMAGE FROM CLOUDINARY
// ============================================
const deleteCloudinaryImage = async (imageUrl) => {
  if (!imageUrl) return;
  
  try {
    // Extract public_id from Cloudinary URL
    const urlParts = imageUrl.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    if (uploadIndex === -1) return;
    
    // Get everything after 'upload/v{version}/'
    const pathAfterUpload = urlParts.slice(uploadIndex + 2).join('/');
    // Remove file extension
    const publicId = pathAfterUpload.replace(/\.[^/.]+$/, '');
    
    console.log(`🗑️ Deleting Cloudinary image: ${publicId}`);
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('✅ Cloudinary delete result:', result);
    return result;
  } catch (error) {
    console.error('❌ Error deleting Cloudinary image:', error);
  }
};

module.exports = { 
  uploadIDImages, 
  uploadProfileImage,
  uploadCompanyLogo,
  deleteCloudinaryImage 
};