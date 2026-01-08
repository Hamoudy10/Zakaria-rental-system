# Backend Architecture & Conventions

## 🏗️ EXPRESS APPLICATION STRUCTURE
Standard MVC Pattern with Services Layer:
- Controllers: Handle HTTP requests/responses
- Services: Contain business logic, database operations
- Models: Database schema (implicit via SQL)

## 📦 DEPENDENCIES & CONFIGURATION
Key Packages:
- express: Web framework with router
- pg + pool: PostgreSQL connection pooling
- jsonwebtoken: JWT authentication (HS256 algorithm)
- bcryptjs: Password hashing (10 rounds)
- socket.io: Real-time communication
- node-cron: Task scheduling for automated billing
- dotenv: Environment configuration
- helmet + cors: Security middleware

## 🎯 NEW CORE MODULES IMPLEMENTED

### 1. Cron Service (/backend/services/cronService.js)
Purpose: Automated monthly billing and SMS notifications
Features:
- Runs on configurable day (default: 28th) at 9:00 AM
- Generates bills for all active tenants
- Sends SMS via queue system with rate limiting
- Skips tenants with advance payments
- Logs billing runs to billing_runs table
- Notifies admins of success/failure

Scheduling:
// Default schedule: 9:00 AM on billing_day of each month
const cronSchedule = `0 9 ${billingDay} * *`;

// SMS queue processing: every 5 minutes
'*/5 * * * *' // Processes pending SMS

### 2. Billing Service (/backend/services/billingService.js)
Purpose: Calculate bills and allocate payments
Key Methods:
- calculateTenantBill(): Computes rent + water + arrears
- generateMonthlyBills(): Creates bills for all tenants
- allocatePayment(): Splits payment: arrears → water → rent → advance
- updateArrearsBalance(): Updates outstanding balances

Bill Calculation:
Total Due = Rent Due + Water Due + Arrears Due
Rent Due = Monthly Rent - Rent Paid (current month)
Water Due = Water Bill Amount - Water Paid (current month)
Arrears Due = Previous Arrears - Arrears Paid

### 3. Enhanced Payment Controller
Payment Allocation Logic:
- First Priority: Pay off arrears (oldest debts first)
- Second Priority: Pay current water bill
- Third Priority: Pay current month's rent
- Remainder: Mark as advance payment for future months

Updated SMS Notifications:
- Bill Notification: Rent + Water + Arrears breakdown
- Payment Confirmation: Allocation details and remaining balance
- Admin Alerts: Real-time payment notifications with breakdown

### 4. Admin Settings Controller (/backend/controllers/adminSettingsController.js)
Enhanced Features:
- Validation: Billing day (1-28), paybill number (5-10 digits), etc.
- Automatic Cron Restart: When billing day changes
- Grouped Settings: Billing, SMS, M-Pesa, fees, general categories
- Default Initialization: Auto-creates required settings on server start

Key Settings:
- billing_day: Day of month for auto-billing (1-28)
- paybill_number: Business paybill for SMS instructions
- company_name: For SMS signature
- sms_billing_template: Customizable message template
- late_fee_percentage: Default late penalty (0-50%)
- grace_period_days: Grace period before late fee (0-30 days)

## ⏰ AUTOMATED BILLING SYSTEM
End-of-Month Automation:
- Cron Service: Separate service for scheduled tasks
- Run Date: 28th of each month (configurable)
- Bulk SMS: Queue-based sending with rate limiting
- Skip Logic: Tenants with advance payments get no SMS
- Failure Handling: Failed SMS logged, agents notified

Admin Settings for Billing:
- Paybill Number: Configured in admin_settings
- Billing Date: Day of month for automation
- SMS Templates: Customizable message formats
- Retry Logic: Configurable retry attempts

Agent Fallback Interface:
- Manual SMS: Send to tenants who didn't receive
- Bulk Retry: Retry all failed SMS with one click
- Notification: Agents get alerts for failed automation

## 🎯 CONTROLLER PATTERNS
Standard Controller Structure:
- Async/Await with try-catch blocks
- Transaction management for multi-step operations
- Input validation before database operations
- Consistent response format: { success, data, message }
- Proper error logging with context

Example Controller Pattern (from propertyController.js):
const createProperty = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    if (!req.body.property_code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Property code required' 
      });
    }
    
    const result = await client.query(
      `INSERT INTO properties (...) VALUES (...) RETURNING *`,
      [values]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Property created',
      data: result.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Property code already exists'
      });
    }
    
    console.error('Create property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating property',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

## 🔐 AUTHENTICATION MIDDLEWARE
JWT Verification Flow (middleware/authMiddleware.js):
- Extract token from Authorization: Bearer <token> header
- Verify with jsonwebtoken.verify()
- Attach user to req.user for downstream use
- Role-based access control in route handlers

Protected Route Example:
const { protect, adminOnly } = require('../middleware/authMiddleware');
router.post('/', protect, adminOnly, createProperty);
router.get('/:id', protect, getProperty);

## 💾 DATABASE OPERATIONS
Connection Pooling (config/database.js):
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

Query Patterns:
- Use parameterized queries ($1, $2) to prevent SQL injection
- Return specific columns, not SELECT *
- Use joins for related data (properties + units + images)
- Implement soft deletes where appropriate (is_active flag)

## 💰 MPESA INTEGRATION PATTERNS
Payment Processing Flow:
1. Initiate: Client → POST /api/payments/mpesa with phone/amount
2. Callback: Safaricom → POST /api/payments/mpesa/callback
3. Confirmation: Update rent_payments + mpesa_transactions
4. Notification: Send SMS/email confirmation

Transaction States:
pending → processing → completed/failed
Store mpesa_code, checkout_request_id, merchant_request_id
Validate amount matches expected rent

## 🔧 SERVICE LAYER PATTERNS
Separation of Concerns:
- Controllers: Handle HTTP requests/responses
- Services: Contain business logic, database operations
- Models: Database schema (implicit via SQL)

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

## 🧾 BILLING & ARREARS SYSTEM
New Components:
1. BillingService (/backend/services/billingService.js):
   - Calculates total due: rent + water + arrears
   - Allocates payments: arrears → water → rent → advance
   - Generates monthly bills for all tenants
   - Updates arrears balances automatically

2. Enhanced Payment Tracking:
   - tenant_allocations.arrears_balance: Track outstanding amounts
   - rent_payments.allocated_to_*: Split payments between rent/water/arrears
   - Smart allocation prioritizes arrears first

Billing Calculation Flow:
1. Rent: From tenant_allocations.monthly_rent
2. Water: From water_bills.amount for the month
3. Arrears: From tenant_allocations.arrears_balance
4. Advance: From rent_payments.is_advance_payment (skip SMS if covered)

Payment Allocation Logic:
1. First: Pay off arrears (oldest debts)
2. Second: Pay current water bill
3. Third: Pay current month's rent
4. Remainder: Mark as advance payment for future months

SMS Templates Enhanced:
- Bill notifications include rent/water/arrears breakdown
- Payment confirmations show allocation details
- Admin alerts include payment breakdown

## 🔄 UPDATED PAYMENT FLOW
End-to-Month Billing Process:
1. Cron Job Triggered (28th of month, 9:00 AM)
2. Bill Generation: Calculate rent + water + arrears for each tenant
3. SMS Queue: Create SMS messages in sms_queue table
4. SMS Processing: Send SMS with rate limiting (200ms between messages)
5. Result Logging: Record success/failure in billing_runs table
6. Admin Notification: Send in-app notifications to all admins

Payment Processing Flow:
1. Tenant Payment: Via paybill using unit code as account number
2. Payment Allocation: Automatic split between rent/water/arrears
3. SMS Confirmation: Sent to tenant and admin with breakdown
4. Arrears Update: Update tenant_allocations.arrears_balance
5. Advance Handling: Mark remainder as advance payment

Total Due Calculation:
Total Due = Rent Due + Water Due + Arrears Due
Rent Due = Monthly Rent - Rent Paid (current month)
Water Due = Water Bill Amount - Water Paid (current month)
Arrears Due = Previous Arrears Balance - Arrears Paid

Payment Allocation Algorithm:
// Priority-based allocation
const allocatePayment = (amount, rentDue, waterDue, arrearsDue) => {
  let remaining = amount;
  const allocation = { rent: 0, water: 0, arrears: 0, advance: 0 };
  
  // 1. Pay arrears first
  allocation.arrears = Math.min(remaining, arrearsDue);
  remaining -= allocation.arrears;
  
  // 2. Pay water bill
  allocation.water = Math.min(remaining, waterDue);
  remaining -= allocation.water;
  
  // 3. Pay rent
  allocation.rent = Math.min(remaining, rentDue);
  remaining -= allocation.rent;
  
  // 4. Remainder is advance
  allocation.advance = remaining;
  
  return allocation;
};

## 📊 ADMIN SETTINGS FOR BILLING
Required Settings in admin_settings table:
Key               Default                   Description                    Validation
billing_day       28                        Day of month for auto-billing  1-28
paybill_number    ''                        Business paybill for SMS       5-10 digits
company_name      'Rental Management'       SMS signature                  Text
sms_billing_template Template               SMS message template           Text with variables
late_fee_percentage 5                       Late fee percentage           0-50
grace_period_days   5                       Grace period before late fee  0-30
sms_enabled        true                     Enable SMS notifications       boolean
auto_billing_enabled true                   Enable automatic billing      boolean

SMS Template Variables:
{
  tenantName: "John Doe",
  month: "2024-03",
  unitCode: "PROP001-001",
  rent: 15000,
  water: 500,
  arrears: 2000,
  total: 17500,
  paybill: "123456"
}

## ⚠️ DATA INTEGRITY RULES (NEW)
Billing Integrity:
- No duplicate billing: One bill per tenant per month
- Water bill validation: Must exist before billing can proceed
- Advance payment detection: Skip SMS if advance covers total due
- Arrears calculation: Auto-updates after each payment

Payment Allocation Rules:
- Sum validation: allocated_to_rent + allocated_to_water + allocated_to_arrears = amount
- Negative prevention: Allocation amounts cannot be negative
- Consistency: Allocation must match payment type (rent/water/arrears)

## 📈 PERFORMANCE OPTIMIZATIONS (ADDED)
New Indexes for Billing:
-- Fast arrears queries
CREATE INDEX idx_tenant_allocations_arrears 
ON tenant_allocations(arrears_balance) 
WHERE arrears_balance > 0;

-- Fast water bill lookup by tenant and month
CREATE INDEX idx_water_bills_tenant_month 
ON water_bills(tenant_id, bill_month);

-- Fast billing history queries
CREATE INDEX idx_billing_runs_month_date 
ON billing_runs(month DESC, run_date DESC);

Query Optimization for Monthly Billing:
- Use CTEs for complex billing calculations
- Batch updates for arrears adjustments
- Pagination for large tenant lists (>1000)

## 📊 ERROR HANDLING STRATEGY
HTTP Status Codes:
- 200: Success
- 201: Created
- 400: Bad request (validation errors)
- 401: Unauthorized (invalid/missing token)
- 403: Forbidden (insufficient permissions)
- 404: Not found
- 409: Conflict (duplicate data)
- 500: Server error

Error Response Format:
{
  "success": false,
  "message": "Human-readable error message",
  "error": "Technical details in development only"
}

## 🧪 TESTING & DEVELOPMENT
Local Development:
npm run dev  # Uses nodemon for auto-restart

Database Migrations:
- Migration files in /migrations/
- Run manually or via deployment script
- Always backup before migration

API Testing:
- Use Postman/Insomnia collections
- Test all user roles (admin, agent, tenant)
- Test error scenarios (invalid tokens, missing data)

Backend running on Render: https://zakaria-rental-system.onrender.com
API Documentation available at /api-docs (if implemented)

## 💬 CHAT MODULE BACKEND PATTERNS
Controller-Service Pattern for chat:
HTTP Request → chatController.js (REST API) → chatService.js (Socket.io + Business Logic) → Database

Key Backend Patterns:
1. Transaction Management:
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

2. Socket.io Room Architecture:
socket.on('connection', async (socket) => {
  // Personal room for user-specific notifications
  socket.join(`user_${socket.userId}`);
  
  // Auto-join conversation rooms
  const convs = await db.query('SELECT conversation_id FROM chat_participants...');
  convs.rows.forEach(row => {
    socket.join(`conversation_${row.conversation_id}`);
  });
});

3. Real-time Message Broadcasting:
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

## 🔔 NOTIFICATIONS SYSTEM BACKEND PATTERNS
Controller-Service Pattern:
HTTP Request → notificationController.js (Rate Limiting + Validation) → NotificationService.js (Business Logic) → Database

Key Backend Patterns:
1. Rate Limiting Implementation:
const userRequestTimestamps = new Map();
const RATE_LIMIT_WINDOW = 2000;

const checkRateLimit = (userId, endpoint) => {
  const key = `${userId}-${endpoint}`;
  const lastRequest = userRequestTimestamps.get(key);
  
  if (lastRequest && (Date.now() - lastRequest) < RATE_LIMIT_WINDOW) {
    return false;
  }
  
  userRequestTimestamps.set(key, Date.now());
  return true;
};

2. Pagination & Filtering:
let query = `SELECT * FROM notifications WHERE user_id = $1`;
const queryParams = [userId];

if (type) {
  query += ` AND type = $${queryParams.length + 1}`;
  queryParams.push(type);
}

query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
queryParams.push(limit, offset);

3. Broadcast Notifications (Admin Only):
// Role-based broadcasting
if (req.user.role !== 'admin') {
  return res.status(403).json({ success: false, message: 'Admin only' });
}

// Role filtering
let userQuery = 'SELECT id FROM users WHERE is_active = true';
if (target_roles && target_roles.length > 0) {
  userQuery += ` AND role = ANY($1)`;
}

Notification Service Layer (notificationService.js):
1. Specialized Notification Creators:
static async createPaymentNotification(paymentData) {
  const { tenantId, amount, paymentMonth, allocatedAmount, carryForwardAmount } = paymentData;
  
  // Tenant notification
  let tenantMessage = `Your rent payment of KSh ${amount} has been processed. `;
  if (carryForwardAmount > 0) {
    tenantMessage += `KSh ${allocatedAmount} applied to ${paymentMonth}, KSh ${carryForwardAmount} carried forward.`;
  }
}

2. Notification Types & Purposes:
- payment_success: Tenant payment successful
- payment_received: Admin received payment
- payment_failed: Payment failure
- payment_carry_forward: Amount carried forward
- salary_paid: Agent salary paid
- salary_processed: Admin processed salary
- complaint_created: New complaint
- complaint_resolved: Complaint resolved
- announcement: Broadcast message
- system_alert: System-wide alert
- maintenance: Maintenance notice
- reminder: Payment reminder

## ⚡ PERFORMANCE OPTIMIZATIONS
Implemented:
- Smart Polling: 30s → 5min exponential backoff on 429
- Debounced Filtering: 800ms delay on filter changes
- Database Indexing: User ID, read status, creation date
- Pagination: 20 notifications per page
- Conditional Rendering: Only fetches when dropdown opens

## 🐛 DEBUGGING & TROUBLESHOOTING
Common Issues:
1. Notifications Not Updating:
console.log('Backoff interval:', backoffRef.current);
console.log('Auth status:', isAuthenticated());
console.log('Last fetch:', lastFetchTime);

2. 429 Rate Limit Errors:
Cause: More than 1 request every 2 seconds per endpoint
Solution: Frontend automatically retries with backoff
Debug: Check userRequestTimestamps Map in controller

3. Missing Chat Notifications:
// Verify chat context is available
const { getTotalUnreadCount } = useChat();
console.log('Chat unread count:', getTotalUnreadCount());

## 📊 PERFORMANCE METRICS
Key Metrics to Monitor:
- Polling Frequency: Average time between requests
- 429 Rate: Percentage of rate-limited requests
- Response Time: P95 for notification endpoints
- Unread Count Accuracy: Frontend vs backend consistency
- Broadcast Performance: Time to notify 1000+ users

Optimization Checklist:
- Database indexes on user_id, is_read, created_at
- Query optimization for getNotifications
- Frontend debouncing on filter changes
- Backend rate limiting tuned for expected load
- Caching layer for frequent requests