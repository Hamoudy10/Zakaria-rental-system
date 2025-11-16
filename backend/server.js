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
try {
  console.log('🔄 Loading AUTH routes...');
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ AUTH ROUTES LOADED');
} catch (error) {
  console.log(`❌ AUTH routes failed: ${error.message}`);
}

// Core routes that must exist
const requiredRoutes = [
  { path: '/api/users', file: './routes/users', name: 'Users' },
  { path: '/api/properties', file: './routes/properties', name: 'Properties' },
  { path: '/api/payments', file: './routes/payments', name: 'Payments' },
  { path: '/api/complaints', file: './routes/complaints', name: 'Complaints' },
  { path: '/api/reports', file: './routes/reports', name: 'Reports' },
  { path: '/api/notifications', file: './routes/notifications', name: 'Notifications' }
];

requiredRoutes.forEach(route => {
  try {
    console.log(`🔄 Loading ${route.name} routes from: ${route.file}`);
    const routeModule = require(route.file);
    
    // FIXED: Remove the function check - routers are objects
    // Just check if the module exists and is truthy
    if (!routeModule) {
      throw new Error('Route module is undefined or null');
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

// Optional routes - these might not exist yet
const optionalRoutes = [
  { path: '/api/tenants', file: './routes/tenants', name: 'Tenants' },
  { path: '/api/agent', file: './routes/agents', name: 'Agent' },
  { path: '/api/salary-payments', file: './routes/salaryPayments', name: 'Salary Payments' },
  { path: '/api/admin/agent-permissions', file: './routes/agentPermissions', name: 'Agent Permissions' }
];

optionalRoutes.forEach(route => {
  try {
    console.log(`🔄 Loading ${route.name} routes from: ${route.file}`);
    const routeModule = require(route.file);
    
    // FIXED: Remove the function check
    if (!routeModule) {
      throw new Error('Route module is undefined or null');
    }
    
    app.use(route.path, routeModule);
    console.log(`✅ ${route.name} routes loaded`);
    
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log(`⚠️ ${route.name} routes not found - creating placeholder`);
      // Create placeholder route that returns empty data
      app.use(route.path, (req, res) => {
        res.json({ 
          success: true, 
          message: `${route.name} routes are under development`,
          data: [] 
        });
      });
    } else {
      console.log(`❌ ${route.name} routes failed: ${error.message}`);
      app.use(route.path, (req, res) => {
        res.status(500).json({
          success: false,
          message: `${route.name} routes are temporarily unavailable`
        });
      });
    }
  }
});

// Load units routes
console.log('🔄 Loading Units routes...');
try {
  const unitsRoutes = require('./routes/units');
  app.use('/api', unitsRoutes);
  console.log('✅ Units routes loaded');
} catch (error) {
  console.log(`❌ Units routes failed: ${error.message}`);
}

// Load allocations routes
console.log('🔄 Loading Allocations routes...');
try {
  const allocationsRoutes = require('./routes/allocations');
  app.use('/api/allocations', allocationsRoutes);
  console.log('✅ Allocations routes loaded');
} catch (error) {
  console.log(`❌ Allocations routes failed: ${error.message}`);
}

console.log('=== ALL ROUTES LOADED ===');

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
});