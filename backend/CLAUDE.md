# Backend Architecture & Conventions

## 🏗️ EXPRESS APPLICATION STRUCTURE
**Standard MVC Pattern with Services Layer:**

## 📦 DEPENDENCIES & CONFIGURATION
**Key Packages:**
- `express`: Web framework with router
- `pg` + `pool`: PostgreSQL connection pooling
- `jsonwebtoken`: JWT authentication (HS256 algorithm)
- `bcryptjs`: Password hashing (10 rounds)
- `socket.io`: Real-time communication
- `dotenv`: Environment configuration
- `helmet` + `cors`: Security middleware

**Environment Variables (`.env`):**
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zakaria_rental
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret_here
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret

Example Route Structure:
// In server.js
app.use('/api/properties', propertyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);

🎯 CONTROLLER PATTERNS
Standard Controller Structure:

Async/Await with try-catch blocks

Transaction management for multi-step operations

Input validation before database operations

Consistent response format: { success, data, message }

Proper error logging with context

Example Controller Pattern (from propertyController.js):
const createProperty = async (req, res) => {
  const client = await pool.connect(); // Get connection from pool
  
  try {
    await client.query('BEGIN'); // Start transaction
    
    // 1. Validate input
    if (!req.body.property_code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Property code required' 
      });
    }
    
    // 2. Business logic
    const result = await client.query(
      `INSERT INTO properties (...) VALUES (...) RETURNING *`,
      [values]
    );
    
    // 3. Commit transaction
    await client.query('COMMIT');
    
    // 4. Return success
    res.status(201).json({
      success: true,
      message: 'Property created',
      data: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback on error
    
    // 5. Handle specific errors
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        success: false,
        message: 'Property code already exists'
      });
    }
    
    // 6. Generic error response
    console.error('Create property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating property',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release(); // Always release connection
  }
};

🔐 AUTHENTICATION MIDDLEWARE
JWT Verification Flow (middleware/authMiddleware.js):

Extract token from Authorization: Bearer <token> header

Verify with jsonwebtoken.verify()

Attach user to req.user for downstream use

Role-based access control in route handlers

Protected Route Example:
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.post('/', protect, adminOnly, createProperty);
router.get('/:id', protect, getProperty); // Any authenticated user

💾 DATABASE OPERATIONS
Connection Pooling (config/database.js):
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
Query Patterns:

Use parameterized queries ($1, $2) to prevent SQL injection

Return specific columns, not SELECT *

Use joins for related data (properties + units + images)

Implement soft deletes where appropriate (is_active flag)

💰 MPESA INTEGRATION PATTERNS
Payment Processing Flow:
Initiate: Client → POST /api/payments/mpesa with phone/amount

Callback: Safaricom → POST /api/payments/mpesa/callback

Confirmation: Update rent_payments + mpesa_transactions

Notification: Send SMS/email confirmation

Transaction States:

pending → processing → completed/failed

Store mpesa_code, checkout_request_id, merchant_request_id

Validate amount matches expected rent

🔧 SERVICE LAYER PATTERNS
Separation of Concerns:

Controllers: Handle HTTP requests/responses

Services: Contain business logic, database operations

Models: Database schema (implicit via SQL)

Example Service Pattern:
// services/notificationService.js
class NotificationService {
  async sendPaymentNotification(paymentData) {
    // 1. Create notification record
    // 2. Queue SMS/email
    // 3. Update payment status
    // 4. Return result
  }
}

📊 ERROR HANDLING STRATEGY
HTTP Status Codes:

200: Success

201: Created

400: Bad request (validation errors)

401: Unauthorized (invalid/missing token)

403: Forbidden (insufficient permissions)

404: Not found

409: Conflict (duplicate data)

500: Server error

Error Response Format:
{
  "success": false,
  "message": "Human-readable error message",
  "error": "Technical details in development only"
}
🧪 TESTING & DEVELOPMENT
Local Development:
npm run dev  # Uses nodemon for auto-restart

Database Migrations:

Migration files in /migrations/

Run manually or via deployment script

Always backup before migration

API Testing:

Use Postman/Insomnia collections

Test all user roles (admin, agent, tenant)

Test error scenarios (invalid tokens, missing data)

Backend running on Render: https://zakaria-rental-system.onrender.com
API Documentation available at /api-docs (if implemented)

---
Controller-Service Pattern for chat
HTTP Request → chatController.js (REST API) → chatService.js (Socket.io + Business Logic) → Database
Key Backend Patterns
1. Transaction Management (for multi-step operations)
// In chatController.js - createConversation
const client = await db.connect();
try {
  await client.query('BEGIN');
  
  // 1. Create conversation
  const conversationResult = await client.query(`INSERT INTO chat_conversations... RETURNING *`);
  
  // 2. Add participants
  await client.query(`INSERT INTO chat_participants...`);
  
  await client.query('COMMIT');
  return conversationResult.rows[0];
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
2. Socket.io Room Architecture
// In chatService.js - setupSocketHandlers
socket.on('connection', async (socket) => {
  // Personal room for user-specific notifications
  socket.join(`user_${socket.userId}`);
  
  // Auto-join conversation rooms
  const convs = await db.query('SELECT conversation_id FROM chat_participants...');
  convs.rows.forEach(row => {
    socket.join(`conversation_${row.conversation_id}`);
  });
  
  // Manual room management
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
  });
});
3. Real-time Message Broadcasting
// Dual broadcast pattern
// 1. To conversation room (all participants)
io.to(`conversation_${conversationId}`).emit('new_message', {
  message: message,
  conversationId: conversationId
});

// 2. To individual users (for notifications)
io.to(`user_${participant.user_id}`).emit('chat_notification', {
  type: 'new_message',
  conversationId: conversationId,
  message: message,
  unreadCount: 1
});
4. Conversation Types & Validation
// Direct chat validation
if (conversationType === 'direct') {
  if (participantIds.length !== 1) {
    throw new Error('Direct chat must have exactly one recipient');
  }
  
  // Check for existing conversation
  const existing = await db.query(`
    SELECT c.id FROM chat_conversations c
    JOIN chat_participants p1 ON c.id = p1.conversation_id
    JOIN chat_participants p2 ON c.id = p2.conversation_id
    WHERE c.conversation_type = 'direct'
      AND p1.user_id = $1
      AND p2.user_id = $2
  `, [creatorId, participantIds[0]]);
  
  // Return existing if found (prevent duplicates)
  if (existing.rows.length > 0) return existing.rows[0];
}

⚙️ BACKEND ARCHITECTURE
Controller-Service Pattern
HTTP Request → notificationController.js (Rate Limiting + Validation) → NotificationService.js (Business Logic) → Database
Key Backend Patterns
1. Rate Limiting Implementation
// 2-second window per user per endpoint
const userRequestTimestamps = new Map();
const RATE_LIMIT_WINDOW = 2000;

const checkRateLimit = (userId, endpoint) => {
  const key = `${userId}-${endpoint}`;
  const lastRequest = userRequestTimestamps.get(key);
  
  if (lastRequest && (Date.now() - lastRequest) < RATE_LIMIT_WINDOW) {
    return false; // Rate limited
  }
  
  userRequestTimestamps.set(key, Date.now());
  return true;
};

// Usage in controllers
if (!checkRateLimit(userId, 'getNotifications')) {
  return res.status(429).json({
    success: false,
    message: 'Too many requests. Please wait a moment.'
  });
}
2. Pagination & Filtering
// Dynamic query building in getNotifications
let query = `SELECT * FROM notifications WHERE user_id = $1`;
const queryParams = [userId];

if (type) {
  query += ` AND type = $${queryParams.length + 1}`;
  queryParams.push(type);
}

if (is_read !== undefined) {
  query += ` AND is_read = $${queryParams.length + 1}`;
  queryParams.push(is_read === 'true');
}

query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
queryParams.push(limit, offset);

3. Broadcast Notifications (Admin Only)
// Target role-based broadcasting
const createBroadcastNotification = async (req, res) => {
  // Admin validation
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  
  // Role filtering
  let userQuery = 'SELECT id FROM users WHERE is_active = true';
  if (target_roles && target_roles.length > 0) {
    userQuery += ` AND role = ANY($1)`;
  }
  
  // Bulk creation
  const notificationsData = users.map(user => ({
    userId: user.id,
    title,
    message,
    type: 'announcement',
    relatedEntityType: 'broadcast'
  }));
  
  await NotificationService.createBulkNotifications(notificationsData);
};
Notification Service Layer (notificationService.js)
1. Specialized Notification Creators
// Payment notifications with financial details
static async createPaymentNotification(paymentData) {
  const { tenantId, amount, paymentMonth, allocatedAmount, carryForwardAmount } = paymentData;
  
  // Tenant notification
  let tenantMessage = `Your rent payment of KSh ${amount} has been processed. `;
  if (carryForwardAmount > 0) {
    tenantMessage += `KSh ${allocatedAmount} applied to ${paymentMonth}, KSh ${carryForwardAmount} carried forward.`;
  }
  
  // Admin notifications (all admins)
  const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
  const notifications = [];
  
  // Create for tenant + all admins
  return await this.createBulkNotifications(notifications);
}
2. Notification Types & Purposestype NotificationType = 
  | 'payment_success'      // Tenant payment successful
  | 'payment_received'     // Admin received payment
  | 'payment_failed'       // Payment failure
  | 'payment_carry_forward' // Amount carried forward
  | 'salary_paid'          // Agent salary paid
  | 'salary_processed'     // Admin processed salary
  | 'complaint_created'    // New complaint
  | 'complaint_resolved'   // Complaint resolved
  | 'announcement'         // Broadcast message
  | 'system_alert'         // System-wide alert
  | 'maintenance'          // Maintenance notice
  | 'reminder';            // Payment reminder
  
⚡ PERFORMANCE OPTIMIZATIONS
Implemented
Smart Polling: 30s → 5min exponential backoff on 429

Debounced Filtering: 800ms delay on filter changes

Database Indexing: User ID, read status, creation date

Pagination: 20 notifications per page

Conditional Rendering: Only fetches when dropdown opens

Recommended
WebSocket Push: For truly real-time (vs polling)

Notification Groups: Group similar notifications

Local Caching: Cache notifications in IndexedDB

Background Sync: Use Service Workers for offline

🐛 DEBUGGING & TROUBLESHOOTING
Common Issues
1. Notifications Not Updating
// Check polling status
console.log('Backoff interval:', backoffRef.current);
console.log('Auth status:', isAuthenticated());
console.log('Last fetch:', lastFetchTime);

// Check rate limiting
// Backend logs: "Rate limit exceeded for user X on getNotifications"
2. 429 Rate Limit Errors

Cause: More than 1 request every 2 seconds per endpoint

Solution: Frontend automatically retries with backoff

Debug: Check userRequestTimestamps Map in controller

3. Missing Chat Notifications
// Verify chat context is available
const { getTotalUnreadCount } = useChat();
console.log('Chat unread count:', getTotalUnreadCount());

// Check socket connection
socket.on('connect', () => console.log('Socket connected'));
socket.on('connect_error', (err) => console.error('Socket error:', err));

 DEPLOYMENT CONFIGURATION
Environment Variables
# Notification-specific (if needed)
NOTIFICATION_POLL_INTERVAL=30000
NOTIFICATION_MAX_BACKOFF=300000
NOTIFICATION_RATE_LIMIT_WINDOW=2000

# Frontend
VITE_NOTIFICATION_POLLING=true
VITE_NOTIFICATION_DEBOUNCE=300
Monitoring & Logging
// Backend logging
console.log(`📨 Creating notification:`, { userId, title, type });
console.log(`✅ Notification created successfully`);
console.log(`❌ Notification error:`, error.message);

// Frontend logging
console.log('🔄 Polling notifications, backoff:', backoffRef.current);
console.log('⚠️ Rate limited (429), retrying in 5s...');
📊 PERFORMANCE METRICS
Key Metrics to Monitor
Polling Frequency: Average time between requests

429 Rate: Percentage of rate-limited requests

Response Time: P95 for notification endpoints

Unread Count Accuracy: Frontend vs backend consistency

Broadcast Performance: Time to notify 1000+ users
Optimization Checklist
Database indexes on user_id, is_read, created_at

Query optimization for getNotifications

Frontend debouncing on filter changes

Backend rate limiting tuned for expected load

Caching layer for frequent requests
