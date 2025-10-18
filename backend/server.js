// server.js - ROBUST VERSION
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

// Always load auth first (we know it works)
app.use('/api/auth', require('./routes/auth'));
console.log('✅ Auth routes loaded');

// Load other routes with try-catch
const routes = [
  { path: '/api/users', file: './routes/users', name: 'Users' },
  { path: '/api/properties', file: './routes/properties', name: 'Properties' },
  { path: '/api/payments', file: './routes/payments', name: 'Payments' },
  { path: '/api/complaints', file: './routes/complaints', name: 'Complaints' },
  { path: '/api/reports', file: './routes/reports', name: 'Reports' },
  { path: '/api/notifications', file: './routes/notifications', name: 'Notifications' }
];

routes.forEach(route => {
  try {
    app.use(route.path, require(route.file));
    console.log(`✅ ${route.name} routes loaded`);
  } catch (error) {
    console.log(`❌ ${route.name} routes failed: ${error.message}`);
    // Create a simple fallback route
    app.use(route.path, (req, res) => {
      res.status(500).json({
        success: false,
        message: `${route.name} routes are temporarily unavailable`
      });
    });
  }
});

console.log('=== ALL ROUTES ATTEMPTED ===');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Test URL: http://localhost:${PORT}/api/test`);
});