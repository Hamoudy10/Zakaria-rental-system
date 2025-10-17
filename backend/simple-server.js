const express = require('express');
const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: '🎉 Backend is working!',
    endpoints: {
      health: '/api/health',
      login: '/api/auth/login (POST)',
      users: '/api/users'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running perfectly!',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/auth/login', (req, res) => {
  console.log('Login attempt:', req.body);
  res.json({
    success: true,
    message: 'Login successful!',
    user: {
      id: 1,
      email: req.body.email,
      name: 'Test User',
      role: 'admin'
    },
    token: 'test-jwt-token-12345'
  });
});

app.get('/api/users', (req, res) => {
  res.json({
    users: [
      { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      { id: 2, name: 'Test Tenant', email: 'tenant@test.com', role: 'tenant' }
    ]
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🎊 SIMPLE BACKEND SERVER STARTED!');
  console.log(`📍 Server running on: http://localhost:${PORT}`);
  console.log(`📍 Also available on: http://127.0.0.1:${PORT}`);
  console.log(`📍 And: http://0.0.0.0:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log(`   GET  http://localhost:${PORT}/`);
  console.log(`   GET  http://localhost:${PORT}/api/health`);
  console.log(`   POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   GET  http://localhost:${PORT}/api/users`);
});