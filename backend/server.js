// server.js - FIXED VERSION WITH CHAT MODULE
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const socketIo = require('socket.io');
const authMiddleware = require('./middleware/authMiddleware');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

process.on('unhandledRejection', (reason) => {
  console.error('🔥 UNHANDLED REJECTION STACK TRACE 🔥');
  console.error(reason?.stack || reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION STACK TRACE 🔥');
  console.error(err.stack);
});


console.log('=== SERVER STARTING ===');

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO with authentication
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.userName = `${decoded.first_name} ${decoded.last_name}`;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Initialize Chat Service
try {
  console.log('🔄 Initializing Chat Service...');
  const ChatService = require('./services/chatService');
  const chatService = new ChatService(io);
  console.log('✅ Chat Service initialized');
} catch (error) {
  console.log('⚠️ Chat Service initialization failed:', error.message);
}

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

// NEW: Load chat routes
console.log('🔄 Loading Chat routes...');
try {
  const chatRoutes = require('./routes/chat');
  app.use('/api/chat', chatRoutes);
  console.log('✅ Chat routes loaded');
} catch (error) {
  console.log(`❌ Chat routes failed: ${error.message}`);
  // Create placeholder for chat routes
  app.use('/api/chat', (req, res) => {
    res.json({ 
      success: true, 
      message: 'Chat routes are under development',
      data: [] 
    });
  });
}

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

// NEW: Load agent property routes
console.log('🔄 Loading Agent Property routes...');
try {
  const agentPropertyRoutes = require('./routes/agentProperties');
  app.use('/api/agent-properties', agentPropertyRoutes);
  console.log('✅ Agent Property routes loaded');
} catch (error) {
  console.log(`❌ Agent Property routes failed: ${error.message}`);
  // Create placeholder for agent properties
  app.use('/api/agent-properties', (req, res) => {
    res.json({ 
      success: true, 
      message: 'Agent property routes are under development',
      data: [] 
    });
  });
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


// Use server.listen instead of app.listen for Socket.IO
server.listen(PORT, '0.0.0.0',() => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Test URL: http://localhost:${PORT}/api/test`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`💬 Chat service: Socket.IO server initialized`);
});