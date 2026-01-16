BACKEND ARCHITECTURE & CONVENTIONS - SUMMARY

EXPRESS APPLICATION STRUCTURE:
Standard MVC Pattern with Services Layer:
- Controllers: Handle HTTP requests/responses
- Services: Contain business logic, database operations
- Models: Database schema (implicit via SQL)

DEPENDENCIES:
- express: Web framework
- pg + pool: PostgreSQL connection pooling
- jsonwebtoken: JWT authentication (HS256)
- bcryptjs: Password hashing (10 rounds)
- socket.io: Real-time communication
- node-cron: Task scheduling
- dotenv: Environment configuration
- helmet + cors: Security middleware

NEW CORE MODULES IMPLEMENTED:

1. Cron Service (/backend/services/cronService.js):
   - Automated monthly billing on configurable day (default: 28th at 9:00 AM)
   - Generates bills for all active tenants
   - Sends SMS via queue system with rate limiting
   - Skips tenants with advance payments
   - Logs billing runs to billing_runs table

2. Billing Service (/backend/services/billingService.js):
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

3. Enhanced Payment Controller:
   Payment Allocation Logic:
   - First Priority: Pay off arrears (oldest debts first)
   - Second Priority: Pay current water bill
   - Third Priority: Pay current month's rent
   - Remainder: Mark as advance payment for future months

4. Admin Settings Controller (/backend/controllers/adminSettingsController.js):
   Features:
   - Validation: Billing day (1-28), paybill number (5-10 digits)
   - Automatic Cron Restart: When billing day changes
   - Grouped Settings: Billing, SMS, M-Pesa, fees, general categories
   - Default Initialization: Auto-creates settings on server start

   Key Settings:
   - billing_day: Day of month for auto-billing (1-28)
   - paybill_number: Business paybill for SMS instructions
   - company_name: For SMS signature
   - sms_billing_template: Customizable message template
   - late_fee_percentage: Default late penalty (0-50%)
   - grace_period_days: Grace period before late fee (0-30 days)

CONTROLLER PATTERNS:
Standard Controller Structure:
- Async/Await with try-catch blocks
- Transaction management for multi-step operations
- Input validation before database operations
- Consistent response format: { success, data, message }
- Proper error logging with context

Example Controller Pattern:
const createProperty = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!req.body.property_code) {
      return res.status(400).json({ success: false, message: 'Property code required' });
    }
    const result = await client.query(`INSERT INTO properties (...) VALUES (...) RETURNING *`, [values]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Property created', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Property code already exists' });
    }
    console.error('Create property error:', error);
    res.status(500).json({ success: false, message: 'Server error creating property' });
  } finally {
    client.release();
  }
};

AUTHENTICATION MIDDLEWARE:
JWT Verification Flow (middleware/authMiddleware.js):
- Extract token from Authorization: Bearer <token> header
- Verify with jsonwebtoken.verify()
- Attach user to req.user for downstream use
- Role-based access control in route handlers

Protected Route Example:
const { protect, adminOnly } = require('../middleware/authMiddleware');
router.post('/', protect, adminOnly, createProperty);
router.get('/:id', protect, getProperty);

DATABASE OPERATIONS:
Connection Pooling (config/database.js):
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

Query Patterns:
- Use parameterized queries ($1, $2) to prevent SQL injection
- Return specific columns, not SELECT *
- Use joins for related data (properties + units + images)
- Implement soft deletes (is_active flag)

MPESA INTEGRATION PATTERNS:
Payment Processing Flow:
1. Initiate: Client → POST /api/payments/mpesa with phone/amount
2. Callback: Safaricom → POST /api/payments/mpesa/callback
3. Confirmation: Update rent_payments + mpesa_transactions
4. Notification: Send SMS/email confirmation

Transaction States: pending → processing → completed/failed

BILLING & ARREARS SYSTEM:
Payment Allocation Algorithm:
const allocatePayment = (amount, rentDue, waterDue, arrearsDue) => {
  let remaining = amount;
  const allocation = { rent: 0, water: 0, arrears: 0, advance: 0 };
  allocation.arrears = Math.min(remaining, arrearsDue);
  remaining -= allocation.arrears;
  allocation.water = Math.min(remaining, waterDue);
  remaining -= allocation.water;
  allocation.rent = Math.min(remaining, rentDue);
  remaining -= allocation.rent;
  allocation.advance = remaining;
  return allocation;
};

CHAT MODULE BACKEND PATTERNS:
Controller-Service Pattern:
HTTP Request → chatController.js (REST API) → chatService.js (Socket.io + Business Logic) → Database

Socket.io Room Architecture:
socket.on('connection', async (socket) => {
  socket.join(`user_${socket.userId}`);
  const convs = await db.query('SELECT conversation_id FROM chat_participants...');
  convs.rows.forEach(row => { socket.join(`conversation_${row.conversation_id}`); });
});

Real-time Message Broadcasting:
io.to(`conversation_${conversationId}`).emit('new_message', { message, conversationId });
io.to(`user_${participant.user_id}`).emit('chat_notification', { type: 'new_message', conversationId, message, unreadCount: 1 });

NOTIFICATIONS SYSTEM BACKEND PATTERNS:
Controller-Service Pattern:
HTTP Request → notificationController.js (Rate Limiting + Validation) → NotificationService.js (Business Logic) → Database

Rate Limiting Implementation:
const userRequestTimestamps = new Map();
const RATE_LIMIT_WINDOW = 2000;
const checkRateLimit = (userId, endpoint) => {
  const key = `${userId}-${endpoint}`;
  const lastRequest = userRequestTimestamps.get(key);
  if (lastRequest && (Date.now() - lastRequest) < RATE_LIMIT_WINDOW) { return false; }
  userRequestTimestamps.set(key, Date.now());
  return true;
};

WATER BILL INTEGRATION (/backend/controllers/waterBillController.js):
Purpose: Enhanced water bill management with SMS integration
Key Methods:
- checkMissingWaterBills(): Identifies tenants without water bills
- createWaterBill(): Creates water bills with tenant name resolution
- listWaterBills(): Lists water bills with tenant/property info
- Agent property filtering for all operations

Water Bill SMS Integration:
- Pre-flight checking: Warns agents about tenants missing water bills
- Graceful handling: Tenants without water bills get KSh 0 in SMS
- Agent warnings: Clear indication of which tenants lack water bills

Water Bills Routes (/backend/routes/waterBills.js):
API Endpoints:
- GET /api/water-bills/missing-tenants - Check tenants without water bills
- POST /api/water-bills - Create water bill
- GET /api/water-bills - List water bills
- GET /api/water-bills/:id - Get specific water bill
- DELETE /api/water-bills/:id - Delete water bill

AGENT SMS MANAGEMENT SYSTEM:
Purpose: Agent-scoped SMS management with property filtering
Key Features:
- Agent-triggered billing SMS with water bill verification
- Agent-scoped failed SMS viewing and retry
- Property filtering via agent_property_assignments table
- Missing water bill warning system

Endpoints Created:
- POST /api/cron/agent/trigger-billing - Trigger billing SMS for agent's properties
- GET  /api/cron/agent/failed-sms - View failed SMS (agent filtered)
- POST /api/cron/agent/retry-sms - Retry failed SMS (agent filtered)

Agent Workflow:
1. Agent inputs water bills via /api/water-bills
2. Agent triggers billing SMS via /api/cron/agent/trigger-billing
3. System checks for missing water bills and warns agent
4. Agent confirms to proceed (water=0 for missing bills)
5. System queues SMS for all tenants in agent's properties
6. Agent monitors failed SMS via filtered endpoints
7. Agent retries failed SMS for their properties only

DATABASE INTEGRATION - SMS Queue Table Schema:
- id (uuid): Primary key
- recipient_phone (varchar): Formatted phone (254XXXXXXXXX)
- message (text): SMS message content
- message_type (varchar): 'bill_notification', 'payment_confirmation'
- status (varchar): 'pending', 'sent', 'failed'
- billing_month (varchar): Month in YYYY-MM format
- attempts (integer): Number of retry attempts (max 3)
- error_message (text): Last error message
- created_at (timestamp): When SMS was queued
- agent_id (uuid): Reference to users.id (who triggered)

Key Query for Agent SMS Management:
SELECT sq.*, t.first_name, t.last_name, pu.unit_code, p.name as property_name
FROM sms_queue sq
LEFT JOIN tenants t ON sq.recipient_phone = t.phone_number
LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
LEFT JOIN property_units pu ON ta.unit_id = pu.id
LEFT JOIN properties p ON pu.property_id = p.id
WHERE sq.status = 'failed' AND sq.message_type = 'bill_notification' 
  AND p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true);

AGENT REPORTS SYSTEM - ENDPOINT STATUS:

✅ WORKING ENDPOINTS:
1. Properties: GET /api/properties/agent/assigned - Returns agent's assigned properties
2. Agent Properties Redirects: 
   - GET /api/agents/tenants/payments → Redirects to /api/agent-properties/my-tenants
   - GET /api/agents/complaints → Redirects to /api/agent-properties/my-complaints

❓ ENDPOINTS TO VERIFY/CREATE:
1. Agent Tenants: GET /api/agent-properties/my-tenants (needs implementation)
2. Agent Payments: GET /api/agent-properties/my-payments (needs implementation)
3. Revenue Report: GET /api/agent-properties/revenue-summary (needs implementation)
4. Water Bills with Agent Filtering: GET /api/water-bills (needs agent filtering)
5. SMS History with Agent Filtering: GET /api/cron/sms-history (needs agent filtering)

REQUIRED BACKEND UPDATES:
1. Create Agent Reports Controller: agentReportsController.js with 7 report functions
2. Add Agent Reports Routes: agentReports.js routes file
3. Update Existing Endpoints: Add agent filtering to water bills and SMS history

AGENT FILTERING PATTERN:
All agent report endpoints should follow:
SELECT ... FROM ... WHERE property_id IN (
 SELECT property_id FROM agent_property_assignments 
 WHERE agent_id = $1 AND is_active = true
)

ERROR HANDLING STRATEGY:
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
{ "success": false, "message": "Human-readable error", "error": "Technical details in development only" }

DATA INTEGRITY RULES:
Billing Integrity:
- No duplicate billing: One bill per tenant per month
- Water bill validation: Must exist before billing can proceed
- Advance payment detection: Skip SMS if advance covers total due
- Arrears calculation: Auto-updates after each payment

Payment Allocation Rules:
- Sum validation: allocated_to_rent + allocated_to_water + allocated_to_arrears = amount
- Negative prevention: Allocation amounts cannot be negative
- Consistency: Allocation must match payment type

PERFORMANCE OPTIMIZATIONS:
New Indexes for Billing:
- CREATE INDEX idx_tenant_allocations_arrears ON tenant_allocations(arrears_balance) WHERE arrears_balance > 0;
- CREATE INDEX idx_water_bills_tenant_month ON water_bills(tenant_id, bill_month);
- CREATE INDEX idx_billing_runs_month_date ON billing_runs(month DESC, run_date DESC);

DEBUGGING & TROUBLESHOOTING:
Common Issues:
1. 404 Route Not Found: /api/cron/agent/trigger-billing
   Solution: Verify cronRoutes.js is loaded in server.js

2. SQL Column Error: column p.is_active does not exist
   Root Cause: properties table doesn't have is_active column
   Solution: Removed references to p.is_active, kept only apa.is_active (agent_property_assignments)

3. Agent Data Isolation Issues
   Cause: Missing agent_property_assignments joins in queries
   Solution: All agent queries must include property filtering via agent_property_assignments table

API ENDPOINT SPECIFICATIONS (UPDATE 6.0):

Unit Creation Endpoint (POST /api/properties/:id/units):
Expected Request Body:
{
  "unit_number": "01",
  "unit_type": "studio",
  "rent_amount": 10000,
  "deposit_amount": 10000,
  "description": "Unit description",
  "features": {}  // Empty object, not array
}

Backend Processing:
- Unit Code Generation: unit_code = property_code + "-" + unit_number
- Example: Property "MJ" + Unit "01" = "MJ-01"
- Features Storage: Stored as JSONB object in database
- Defaults: is_occupied = false, is_active = true

Property Units Endpoint (GET /api/properties/:id/units):
Response Format:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "unit_code": "MJ-01",
      "unit_number": "01",
      "unit_type": "studio",
      "rent_amount": "10000.00",
      "deposit_amount": "10000.00",
      "is_occupied": false,
      "features": {},
      "created_at": "2026-01-15T13:34:13.185Z"
    }
  ]
}

Important Backend Rules:
- Unit Code Uniqueness: Enforced at database level (UNIQUE constraint)
- Property Validation: Unit must belong to existing property
- Data Type Enforcement: rent_amount/deposit_amount stored as NUMERIC
- Feature Format: Stored as JSONB, accepts any valid JSON object

UPDATE 8.0 - PRODUCTION DEPLOYMENT & ROUTE LOADING FIXES:

SERVER LOADING PATTERNS ENHANCED:
1. Fixed File Path Resolution: Loading './routes/tenant' instead of './routes/tenants'
2. Fixed Error Message Typos: "unavialable" → "unavailable"
3. Added Debug Logging for route loading failures

TENANTS ROUTE FILE UPDATED (tenants.js):
1. Removed multer dependency to avoid production issues
2. Simplified ID Upload Route: Accepts base64/URLs instead of file uploads
3. Added proper database pool import

CRON CONTROLLER FIXES:
Added missing getSMSHistory function to prevent route loading failure:
const getSMSHistory = async (req, res) => {
  try {
    // Query logic for SMS history
    const result = await pool.query(...);
    res.json({ success: true, data: result.rows, pagination: {...} });
  } catch (error) {
    console.error('Error fetching SMS history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch SMS history' });
  }
};

PRODUCTION DEPLOYMENT CONCERNS ADDRESSED:
1. Package Dependencies: Multer added to package.json for Render deployment
2. File Uploads in Production: Simplified to accept URLs/base64 until multer is configured
3. Environment-Specific Configuration: Check for process.env.NODE_ENV === 'production'

EXPECTED LOADING SEQUENCE AFTER FIXES:
✅ Default admin settings initialized
✅ Loaded Auth routes
✅ Loaded Users routes
✅ Loaded Properties routes
✅ Loaded Payments routes
✅ Loaded Complaints routes
✅ Loaded Admin routes
✅ Loaded Cron routes
✅ Loaded Water Bills routes
✅ Loaded Tenants routes  // No more placeholder
✅ Loaded Agents routes
✅ Loaded Salary Payments routes
✅ Loaded Agent Permissions routes
✅ Loaded Chat routes
✅ Loaded Agent Properties routes
✅ Loaded Reports routes
✅ Loaded Notifications routes
✅ Loaded Units routes
✅ Loaded Allocations routes

MIGRATION RECOMMENDATION FOR FILE UPLOADS:
For production file uploads without multer dependency issues:
1. Use cloud storage (AWS S3, Google Cloud Storage)
2. Accept pre-signed URLs from frontend
3. Store only file URLs in database
4. Avoid server-side file handling for scalability

LAST UPDATED: After Update 8.0 - All route loading issues resolved, production-ready backend.
UPDATE 9.0 - MULTER FILE UPLOAD IMPLEMENTATION:

MULTER MIDDLEWARE CREATED (/backend/middleware/uploadMiddleware.js):
- File storage: Local filesystem in 'uploads/id_images/' directory
- File naming: tenantId-timestamp-random.extension (prevents collisions)
- File validation: Only accepts .jpeg, .jpg, .png images
- Size limit: 5MB per file
- Middleware: uploadIDImages handles two fields (id_front_image, id_back_image)

ROUTES FIXED (/backend/routes/tenants.js):
- Removed duplicate POST /:id/upload-id route (was causing 400 errors)
- Single route now: router.post('/:id/upload-id', uploadIDImages, tenantController.uploadIDImages)
- Eliminated base64 handling route that conflicted with FormData route

TENANT CONTROLLER UPDATED (/backend/controllers/tenantController.js):
- uploadIDImages function now processes req.files (from Multer) instead of req.body
- Stores relative file paths in database: '/uploads/id_images/filename'
- Added error handling with file cleanup on failure
- Returns image URLs in API response

STATIC FILE SERVING (server.js):
- Added: app.use('/uploads', express.static('uploads'));
- Images accessible at: https://zakaria-rental-system.onrender.com/uploads/id_images/filename

FILE UPLOAD FLOW:
1. Frontend → POST /api/tenants/:id/upload-id with FormData
2. Multer middleware → Validates & saves files to uploads/id_images/
3. Controller → Updates database with file paths
4. Response → Returns image URLs for frontend display

ERROR HANDLING ENHANCEMENTS:
- File type validation at middleware level
- Size limit enforcement (5MB)
- Database transaction safety
- File cleanup on tenant not found or server errors

PRODUCTION DEPLOYMENT NOTES:
⚠️ CURRENT: Local file storage works for development/testing
⚠️ RECOMMENDED: Cloud storage (AWS S3) for production scalability
⚠️ FILE SYSTEM: Render/Heroku have ephemeral filesystems - files lost on redeploy

DATABASE STORAGE FORMAT:
- id_front_image: VARCHAR storing path like '/uploads/id_images/tenant-uuid-1234567890.jpg'
- id_back_image: VARCHAR storing similar path format
- NOT storing base64 strings anymore

SECURITY MEASURES:
- File extension validation
- MIME type checking
- Size limiting
- Unique filenames to prevent overwrites
UPDATE 10.0 - CLOUDINARY FILE UPLOAD IMPLEMENTATION

MIDDLEWARE REDESIGN (/backend/middleware/uploadMiddleware.js):
-   REPLACED: Local `multer.diskStorage` with `CloudinaryStorage` from `multer-storage-cloudinary`.
-   CONFIGURATION: Cloudinary SDK configured using environment variables.
-   UPLOAD FLOW: Files are held in memory and streamed directly to Cloudinary, avoiding Render's ephemeral disk.
-   PARAMETERS: Files are organized in the `zakaria_rental/id_images/` folder with unique public IDs.
-   RESULT: The middleware attaches file objects to `req.files` containing Cloudinary's response data (including `.path` which is the image URL).

CONTROLLER UPDATE (/backend/controllers/tenantController.js):
-   The `uploadIDImages` function now processes `req.files[fieldname][0].path` (the Cloudinary secure URL) instead of a local file path.
-   Database update query stores the full Cloudinary URL (e.g., `https://res.cloudinary.com/...`).
-   Removed all filesystem cleanup logic (e.g., `fs.unlinkSync`) as Cloudinary manages storage.
-   API response returns the Cloudinary URLs for frontend use.

ENVIRONMENT VARIABLES (Render Dashboard):
-   `CLOUDINARY_CLOUD_NAME`
-   `CLOUDINARY_API_KEY`
-   `CLOUDINARY_API_SECRET`

DEPENDENCIES (package.json):
-   ADDED: `"cloudinary": "^2.5.1"`
-   ADDED: `"multer-storage-cloudinary": "^5.0.0"`

PRODUCTION NOTES:
-   The free tier includes 25 credits/month. Monitor usage in the Cloudinary console.
-   Credentials are securely managed via environment variables.
-   The system is now decoupled from the host server's filesystem, enabling true scalability.