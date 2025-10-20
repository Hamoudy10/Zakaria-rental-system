// server.js - FIXED VERSION
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

console.log('=== SERVER STARTING ===');

// Test route
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is working!',
    timestamp: new Date().toISOString()
  });
});

// Import and use all routes with better error handling
console.log('Loading routes...');

// Always load auth first
app.use('/api/auth', require('./routes/auth'));
console.log('✅ Auth routes loaded');

// Load core routes
const coreRoutes = [
  { path: '/api/users', file: './routes/users', name: 'Users' },
  { path: '/api/properties', file: './routes/properties', name: 'Properties' },
  { path: '/api/payments', file: './routes/payments', name: 'Payments' },
  { path: '/api/complaints', file: './routes/complaints', name: 'Complaints' },
  { path: '/api/reports', file: './routes/reports', name: 'Reports' },
  { path: '/api/notifications', file: './routes/notifications', name: 'Notifications' }
];

coreRoutes.forEach(route => {
  try {
    console.log(`🔄 Loading ${route.name} routes from: ${route.file}`);
    const routeModule = require(route.file);
    
    if (typeof routeModule !== 'function') {
      throw new Error(`Expected a function but got: ${typeof routeModule}`);
    }
    
    app.use(route.path, routeModule);
    console.log(`✅ ${route.name} routes loaded`);
    
  } catch (error) {
    console.log(`❌ ${route.name} routes failed: ${error.message}`);
    
    // Create a simple fallback route
    app.use(route.path, (req, res) => {
      res.status(500).json({
        success: false,
        message: `${route.name} routes are temporarily unavailable: ${error.message}`
      });
    });
  }
});

// Load units routes with proper error handling
console.log('🔄 Loading Units routes...');
try {
  const unitsRoutes = require('./routes/units');
  
  if (typeof unitsRoutes !== 'function') {
    throw new Error(`Expected a function but got: ${typeof unitsRoutes}`);
  }
  
  app.use('/api', unitsRoutes);
  console.log('✅ Units routes loaded');
  
} catch (error) {
  console.log(`❌ Units routes failed: ${error.message}`);
  
  // Create fallback routes for units
  app.use('/api/properties/:propertyId/units', (req, res) => {
    res.status(500).json({
      success: false,
      message: `Units routes are temporarily unavailable: ${error.message}`
    });
  });
}

// Load allocations routes with proper error handling - FIXED
console.log('🔄 Loading Allocations routes...');
try {
  const allocationsRoutes = require('./routes/allocations');
  
  if (typeof allocationsRoutes !== 'function') {
    throw new Error(`Expected a function but got: ${typeof allocationsRoutes}`);
  }
  
  app.use('/api/allocations', allocationsRoutes);
  console.log('✅ Allocations routes loaded');
  
} catch (error) {
  console.log(`❌ Allocations routes failed: ${error.message}`);
  console.log('🔍 Full error for Allocations:', error);
  
  // Create fallback routes for allocations
  app.use('/api/allocations', (req, res) => {
    res.status(500).json({
      success: false,
      message: `Allocations routes are temporarily unavailable: ${error.message}`
    });
  });
}

console.log('=== ALL ROUTES ATTEMPTED ===');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  });
});

// Global error handler for unhandled routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Test URL: http://localhost:${PORT}/api/test`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Allocations endpoint: http://localhost:${PORT}/api/allocations`);
});