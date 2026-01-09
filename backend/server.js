// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { initializeDefaultSettings } = require('./controllers/adminSettingsController');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== GLOBAL ERROR HANDLING ====================
process.on('unhandledRejection', (reason) => {
  console.error('🔥 UNHANDLED REJECTION 🔥', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION 🔥', err);
});

// ==================== CREATE HTTP SERVER ====================
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { 
    origin: process.env.FRONTEND_URL || "http://localhost:5173", 
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// ==================== SOCKET.IO MIDDLEWARE ====================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.userName = `${decoded.first_name} ${decoded.last_name}`;
    next();
  } catch {
    next(new Error('Authentication error'));
  }
});

// ==================== INITIALIZE SERVICES ====================

// Initialize default settings on startup
const initializeServices = async () => {
  try {
    // Initialize default settings first
    await initializeDefaultSettings();
    console.log('✅ Default admin settings initialized');
    
    // Start cron service
    const cronService = require('./services/cronService');
    await cronService.start();
    console.log('✅ Cron service started successfully');
    
    // Initialize chat service
    const ChatService = require('./services/chatService');
    new ChatService(io);
    console.log('💬 Chat service initialized');
    
  } catch (error) {
    console.error('❌ Error initializing services:', error);
  }
};

// ==================== ROUTES SETUP ====================

// Test & health check endpoints
app.get('/api/test', (req, res) => res.json({ 
  success: true, 
  message: 'Server is working!', 
  timestamp: new Date().toISOString(),
  version: '1.0.0'
}));

app.get('/api/health', (req, res) => res.json({ 
  success: true, 
  message: 'Server healthy', 
  timestamp: new Date().toISOString(),
  uptime: process.uptime()
}));

// Helper function for optional routes
const loadRoute = (path, file, name, placeholderData = []) => {
  try {
    const route = require(file);
    if (!route) throw new Error('Route module is null/undefined');
    app.use(path, route);
    console.log(`✅ Loaded ${name} routes: ${path}`);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.warn(`⚠️ ${name} routes not found, using placeholder`);
      app.use(path, (req, res) => res.json({ 
        success: true, 
        message: `${name} routes under development`, 
        data: placeholderData 
      }));
    } else {
      console.error("❌ Failed to load ${name} routes:", err.message);
      app.use(path, (req, res) => res.status(500).json({ 
        success: false, 
        message: "${name} temporarily unavailable"
      }));
    }
  }
};

// ==================== CORE ROUTES (Manually loaded for control) ====================

// Load core routes first (these are critical)
try {
  // Auth routes
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Loaded Auth routes');
} catch (err) {
  console.error('❌ Failed to load Auth routes:', err.message);
}

try {
  // Users routes
  const userRoutes = require('./routes/users');
  app.use('/api/users', userRoutes);
  console.log('✅ Loaded Users routes');
} catch (err) {
  console.error('❌ Failed to load Users routes:', err.message);
}

try {
  // Properties routes
  const propertyRoutes = require('./routes/properties');
  app.use('/api/properties', propertyRoutes);
  console.log('✅ Loaded Properties routes');
} catch (err) {
  console.error('❌ Failed to load Properties routes:', err.message);
}

try {
  // Payments routes (CRITICAL for billing system)
  const paymentRoutes = require('./routes/payments');
  app.use('/api/payments', paymentRoutes);
  console.log('✅ Loaded Payments routes');
} catch (err) {
  console.error('❌ Failed to load Payments routes:', err.message);
}

try {
  // Complaints routes
  const complaintRoutes = require('./routes/complaints');
  app.use('/api/complaints', complaintRoutes);
  console.log('✅ Loaded Complaints routes');
} catch (err) {
  console.error('❌ Failed to load Complaints routes:', err.message);
}

// ==================== ADMIN ROUTES ====================
// Using the updated adminRoutes.js that includes both dashboard and settings
try {
  app.use('/api/admin', adminRoutes);
  console.log('✅ Loaded Admin routes (includes dashboard and settings)');
} catch (err) {
  console.error('❌ Failed to load Admin routes:', err.message);
}

// ==================== CRON ROUTES ====================
try {
  const cronRoutes = require('./routes/cronRoutes');
  app.use('/api/cron', cronRoutes);
  console.log('✅ Loaded Cron routes');
} catch (err) {
  console.error('❌ Failed to load Cron routes:', err.message);
}

// ==================== WATER BILLS ROUTES ====================
try {
  const waterBillRoutes = require('./routes/waterBills');
  app.use('/api/water-bills', waterBillRoutes);
  console.log('✅ Loaded Water Bills routes');
} catch (err) {
  console.error('❌ Failed to load Water Bills routes:', err.message);
}

// ==================== OPTIONAL ROUTES (Using helper) ====================
const optionalRoutes = [
  { path: '/api/tenants', file: './routes/tenants', name: 'Tenants' },
  { path: '/api/agents', file: './routes/agents', name: 'Agents' },
  { path: '/api/salary-payments', file: './routes/salaryPayments', name: 'Salary Payments' },
  { path: '/api/agent-permissions', file: './routes/agentPermissions', name: 'Agent Permissions' },
  { path: '/api/chat', file: './routes/chat', name: 'Chat' },
  { path: '/api/agent-properties', file: './routes/agentProperties', name: 'Agent Properties' },
  { path: '/api/reports', file: './routes/reports', name: 'Reports' },
  { path: '/api/notifications', file: './routes/notifications', name: 'Notifications' },
  { path: '/api/units', file: './routes/units', name: 'Units' },
  { path: '/api/allocations', file: './routes/allocations', name: 'Allocations' }
];

optionalRoutes.forEach(r => loadRoute(r.path, r.file, r.name));

// ==================== ERROR HANDLING MIDDLEWARE ====================

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route not found: ${req.originalUrl}`,
    availableEndpoints: [
      '/api/auth/*',
      '/api/users/*',
      '/api/properties/*',
      '/api/payments/*',
      '/api/complaints/*',
      '/api/admin/*',
      '/api/cron/*',
      '/api/water-bills/*'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🚨 Global error handler:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});


// ==================== START SERVER ====================
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`========================================`);
  
  // Initialize services after server starts
  initializeServices();
});

module.exports = { app, server, io };
