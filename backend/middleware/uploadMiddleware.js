const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage for ID images
const idImagesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = req.params.id || 'temp';
    const tenantUploadDir = path.join(uploadDir, 'id-images', tenantId);
    
    // Create directory for this tenant if it doesn't exist
    if (!fs.existsSync(tenantUploadDir)) {
      fs.mkdirSync(tenantUploadDir, { recursive: true });
    }
    
    cb(null, tenantUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${uniqueId}${fileExtension}`;
    cb(null, filename);
  }
});

// File filter for ID images
const idImagesFileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isMimeTypeValid = allowedMimeTypes.includes(file.mimetype);
  const isExtensionValid = allowedExtensions.includes(fileExtension);
  
  if (isMimeTypeValid && isExtensionValid) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, JPG, PNG, GIF, and WebP images are allowed.'), false);
  }
};

// Configure multer instances
const uploadIDImages = multer({
  storage: idImagesStorage,
  fileFilter: idImagesFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 2 // Maximum 2 files (front and back)
  }
});

// Single file upload (for profile images)
const uploadSingleImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadDir, 'profile-images');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const uniqueId = uuidv4();
      const fileExtension = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${uniqueId}${fileExtension}`);
    }
  }),
  fileFilter: idImagesFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Middleware to handle ID image uploads
const handleIDImageUpload = uploadIDImages.fields([
  { name: 'id_front_image', maxCount: 1 },
  { name: 'id_back_image', maxCount: 1 }
]);

// Utility function to get file URL
const getFileUrl = (req, filePath) => {
  if (!filePath) return null;
  
  // If it's already a URL (from previous upload), return as is
  if (filePath.startsWith('http')) {
    return filePath;
  }
  
  // Construct full URL
  const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  const relativePath = filePath.replace(/^.*[\\\/]uploads[\\\/]/, 'uploads/');
  return `${baseUrl}/${relativePath}`;
};

// Utility function to delete old files
const deleteOldFile = (filePath) => {
  if (!filePath || filePath.startsWith('http')) return;
  
  try {
    const fullPath = path.join(__dirname, '../', filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted old file: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error);
  }
};

module.exports = {
  handleIDImageUpload,
  uploadSingleImage,
  getFileUrl,
  deleteOldFile,
  uploadDir
};