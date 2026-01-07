// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Global error logging
process.on('unhandledRejection', (reason) => console.error('🔥 UNHANDLED REJECTION 🔥', reason));
process.on('uncaughtException', (err) => console.error('🔥 UNCAUGHT EXCEPTION 🔥', err));

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: process.env.FRONTEND_URL || "http://localhost:5173", methods: ["GET", "POST"] }
});

// Socket.IO auth middleware
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

// Initialize Chat Service
try {
  const ChatService = require('./services/chatService');
  new ChatService(io);
  console.log('💬 Chat service initialized');
} catch (err) {
  console.warn('⚠️ Chat Service failed to initialize:', err.message);
}

// ----------------------- ROUTES SETUP -----------------------

// Test & health check
app.get('/api/test', (req, res) => res.json({ success: true, message: 'Server is working!', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ success: true, message: 'Server healthy', timestamp: new Date().toISOString() }));

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
      app.use(path, (req, res) => res.json({ success: true, message: `${name} routes under development`, data: placeholderData }));
    } else {
      console.error(`❌ Failed to load ${name} routes:`, err.message);
      app.use(path, (req, res) => res.status(500).json({ success: false, message: `${name} temporarily unavailable` }));
    }
  }
};

// ----------------------- CORE ROUTES -----------------------
const coreRoutes = [
  { path: '/api/auth', file: './routes/auth', name: 'Auth' },
  { path: '/api/users', file: './routes/users', name: 'Users' },
  { path: '/api/properties', file: './routes/properties', name: 'Properties' },
  { path: '/api/payments', file: './routes/payments', name: 'Payments' },
  { path: '/api/complaints', file: './routes/complaints', name: 'Complaints' },
  { path: '/api/reports', file: './routes/reports', name: 'Reports' },
  { path: '/api/notifications', file: './routes/notifications', name: 'Notifications' },
];

coreRoutes.forEach(r => loadRoute(r.path, r.file, r.name));

// ----------------------- OPTIONAL ROUTES -----------------------
const optionalRoutes = [
  { path: '/api/tenants', file: './routes/tenants', name: 'Tenants' },
  { path: '/api/agent', file: './routes/agents', name: 'Agents' },
  { path: '/api/salary-payments', file: './routes/salaryPayments', name: 'Salary Payments' },
  { path: '/api/admin/agent-permissions', file: './routes/agentPermissions', name: 'Agent Permissions' },
  { path: '/api/chat', file: './routes/chat', name: 'Chat' },
  { path: '/api/agent-properties', file: './routes/agentProperties', name: 'Agent Properties' },
  { path: '/api/admin/dashboard', file: './routes/adminRoutes', name: 'Admin Dashboard' }, // ✅ Explicitly added
  { path: '/api/admin-settings', file: './routes/adminSettings', name: 'Admin Settings' }, // ✅ ADD THIS
  { path: '/api', file: './routes/units', name: 'Units' },
  { path: '/api/allocations', file: './routes/allocations', name: 'Allocations' }
];

optionalRoutes.forEach(r => loadRoute(r.path, r.file, r.name));

// Catch-all for undefined routes
app.use('*', (req, res) => res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` }));

// ----------------------- START SERVER -----------------------
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));

module.exports = { app, server, io };
