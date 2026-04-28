// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./config/database');
const activityLogMiddleware = require('./middleware/activityLogMiddleware');
const { createRateLimiter } = require('./middleware/rateLimit');
const { initializeDefaultSettings } = require('./controllers/adminSettingsController');
const { initializeMessageTemplateSystem } = require('./controllers/messageTemplateController');
const adminRoutes = require('./routes/adminRoutes');
const expenseRoutes = require('./routes/expenses');

const app = express();

// ==================== MIDDLEWARE ====================
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "frame-ancestors": ["'none'"],
      },
    },
    frameguard: { action: "deny" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin" },
  }),
);
app.use(
  cors({
    origin: [
      "https://zakaria-rental-system.vercel.app",
      "http://localhost:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
    optionsSuccessStatus: 204,
  }),
);

// Body parsers MUST come BEFORE routes
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 600,
  message: "Too many requests. Please slow down.",
  skip: (req) =>
    req.path.startsWith("/payments/c2b") || req.path.startsWith("/whatsapp"),
});
app.use('/api', apiLimiter);

app.use(activityLogMiddleware);
// ==================== FILE UPLOAD CONFIGURATION ====================
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory');
}

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

    // Initialize message templates schema/defaults
    await initializeMessageTemplateSystem();
    console.log('Message template system initialized');
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

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static('uploads'));

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

// Deep health check for uptime monitoring (includes DB + last callback visibility)
app.get('/api/health/deep', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW() AS db_now');
    const inboxResult = await pool.query(
      `SELECT MAX(received_at) AS last_callback_at FROM mpesa_callback_inbox`
    );

    const lastCallbackAt = inboxResult.rows?.[0]?.last_callback_at || null;
    const secondsSinceLastCallback = lastCallbackAt
      ? Math.floor((Date.now() - new Date(lastCallbackAt).getTime()) / 1000)
      : null;

    return res.json({
      success: true,
      message: 'Server and database healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db_time: dbResult.rows?.[0]?.db_now || null,
      last_callback_at: lastCallbackAt,
      seconds_since_last_callback: secondsSinceLastCallback
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: 'Deep health check failed',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

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
      console.error(`❌ Failed to load ${name} routes:`, err.message);
      app.use(path, (req, res) => res.status(500).json({ 
        success: false, 
        message: `${name} temporarily unavailable`
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

try{
  // Add this with your other route registrations
  app.use('/api/expenses', expenseRoutes);

  console.log('✅ Loaded expenses routes');
}catch(err){
  console.error('❌ Failed to load expenses routes:', err.message);
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
  // WhatsApp webhook routes (NO AUTH) for Meta status callbacks
  const whatsappWebhookRoutes = require('./routes/whatsappWebhook');
  app.use('/api/whatsapp', whatsappWebhookRoutes);
  console.log('✅ Loaded WhatsApp webhook routes');
} catch (err) {
  console.error('❌ Failed to load WhatsApp webhook routes:', err.message);
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

//======================= TENANTS ROUTE TEST ====================
console.log('🔍 Testing tenant route loading...');
try {
  const testRoute = require('./routes/tenants');
  console.log('✅ Tenant route loaded successfully');
} catch (error) {
  console.error('❌ Error loading tenant route:', error.message);
  console.error('❌ Error stack:', error.stack);
}

// ==================== OPTIONAL ROUTES (Using helper) ====================
const optionalRoutes = [
  { path: '/api/tenants', file: './routes/tenants', name: 'Tenants' },
  { path: '/api/agents', file: './routes/agents', name: 'Agents' },
  { path: '/api/salary-payments', file: './routes/salaryPayments', name: 'Salary Payments' },
  { path: '/api/agent-permissions', file: './routes/agentPermissions', name: 'Agent Permissions' },
  { path: '/api/chat', file: './routes/chat', name: 'Chat' },
  { path: '/api/ai-agent', file: './routes/aiAgent', name: 'AI Agent' },
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

// ✅ CRITICAL: Export io instance so it can be used in other files
module.exports = { app, server, io };
