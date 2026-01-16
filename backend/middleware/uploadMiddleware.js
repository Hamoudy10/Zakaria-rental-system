const multer = require('multer');
const path = require('path');

// Configure storage location and filename
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Files will be saved in 'uploads/id_images/'
    cb(null, 'uploads/id_images/');
  },
  filename: function (req, file, cb) {
    // Create unique filename: tenantId-timestamp-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.params.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to allow only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only .jpeg, .jpg, and .png images are allowed'));
  }
};

// Create the multer upload instance
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: fileFilter
});

// Middleware to handle the specific fields for ID upload
const uploadIDImages = upload.fields([
  { name: 'id_front_image', maxCount: 1 },
  { name: 'id_back_image', maxCount: 1 }
]);

module.exports = { uploadIDImages };