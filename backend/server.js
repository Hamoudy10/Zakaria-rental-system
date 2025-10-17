const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Zakaria Rental System API is running',
    timestamp: new Date().toISOString()
  });
});

// Simple auth route
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Simple mock authentication
  if (email && password) {
    res.status(200).json({
      success: true,
      message: 'Login successful!',
      data: {
        user: {
          id: '1',
          email: email,
          role: 'admin',
          first_name: 'Admin',
          last_name: 'User'
        },
        token: 'mock_jwt_token_for_development'
      }
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }
});

// Simple register route
app.post('/api/auth/register', (req, res) => {
  const { email, password, first_name, last_name, phone_number } = req.body;
  
  if (email && password && first_name && last_name && phone_number) {
    res.status(201).json({
      success: true,
      message: 'User registered successfully!',
      data: {
        user: {
          id: '2',
          email: email,
          role: 'tenant',
          first_name: first_name,
          last_name: last_name,
          phone_number: phone_number
        },
        token: 'mock_jwt_token_for_development'
      }
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }
});

// Test users route
app.get('/api/users', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      users: [
        {
          id: '1',
          email: 'admin@example.com',
          role: 'admin',
          first_name: 'System',
          last_name: 'Administrator'
        }
      ]
    }
  });
});

// Test properties route
app.get('/api/properties', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      properties: [
        {
          id: '1',
          property_code: 'WL001',
          name: 'Westlands Apartments',
          address: '123 Westlands Road',
          county: 'Nairobi',
          town: 'Westlands',
          total_units: 24,
          available_units: 5
        }
      ]
    }
  });
});


// In your backend server.js, add these routes:

// Get all properties
app.get('/api/properties', (req, res) => {
  // TODO: Query database for properties
  res.json({
    properties: [
      {
        id: '1',
        property_code: 'WL001',
        name: 'Westlands Apartments',
        address: '123 Westlands Road, Nairobi',
        county: 'Nairobi',
        town: 'Westlands',
        description: 'Luxury apartments in Westlands',
        total_units: 24,
        available_units: 8,
        created_at: new Date().toISOString()
      }
    ]
  });
});

// Create property
app.post('/api/properties', (req, res) => {
  const propertyData = req.body;
  // TODO: Insert into database
  const newProperty = {
    id: Math.random().toString(36).substr(2, 9),
    ...propertyData,
    available_units: propertyData.total_units,
    created_at: new Date().toISOString()
  };
  res.json(newProperty);
});

// Update property
app.put('/api/properties/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  // TODO: Update in database
  res.json({ success: true, message: 'Property updated' });
});

// Delete property
app.delete('/api/properties/:id', (req, res) => {
  const { id } = req.params;
  // TODO: Delete from database
  res.json({ success: true, message: 'Property deleted' });
});

// 404 handler - FIXED for Express 4
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
  console.log(`🔐 Test login: POST http://localhost:${PORT}/api/auth/login`);
});