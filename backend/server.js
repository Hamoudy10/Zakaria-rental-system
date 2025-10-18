const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import database connection
const { query } = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const propertyRoutes = require('./routes/properties');
const paymentRoutes = require('./routes/payments');
const allocationRoutes = require('./routes/allocations');
const complaintRoutes = require('./routes/complaints'); // Add this line


const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await query('SELECT NOW()');
    
    res.status(200).json({
      status: 'OK',
      message: 'Zakaria Rental System API is running',
      database: 'Connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error',
      message: 'Database connection failed',
      database: 'Disconnected',
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/allocations', allocationRoutes);

// System settings endpoints
app.get('/api/admin/settings', async (req, res) => {
  try {
    const settingsResult = await query(
      'SELECT * FROM admin_settings ORDER BY setting_key'
    );

    res.json({
      success: true,
      settings: settingsResult.rows
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
});

// Update system setting
app.put('/api/admin/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const updatedSetting = await query(
      `INSERT INTO admin_settings (setting_key, setting_value) 
       VALUES ($1, $2) 
       ON CONFLICT (setting_key) 
       DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP 
       RETURNING *`,
      [key, value]
    );

    res.json({
      success: true,
      message: 'Setting updated successfully',
      setting: updatedSetting.rows[0]
    });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update setting'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found: ' + req.originalUrl
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
});