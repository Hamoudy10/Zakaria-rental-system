// backend/middleware/uploadMiddleware.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// 1. Configure Cloudinary SDK with your credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Configure Multer to use Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // This function determines the upload parameters for each file
    return {
      folder: 'zakaria_rental/id_images', // Organize files in this folder
      public_id: `${req.params.id}-${Date.now()}-${file.fieldname}`, // Unique filename
      resource_type: 'auto', // Let Cloudinary detect image/video
    };
  },
});

// 3. Create the Multer upload instance
const upload = multer({ storage: storage });

// 4. Middleware for handling the two specific image fields
const uploadIDImages = upload.fields([
  { name: 'id_front_image', maxCount: 1 },
  { name: 'id_back_image', maxCount: 1 }
]);

module.exports = { uploadIDImages };