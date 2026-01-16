BACKEND ARCHITECTURE & CONVENTIONS

EXPRESS APPLICATION STRUCTURE
Standard MVC Pattern with Services Layer:
- Controllers: Handle HTTP requests/responses
- Services: Contain business logic, database operations
- Models: Database schema (implicit via SQL)

DEPENDENCIES & CONFIGURATION
Key Packages:
- express: Web framework with router
- pg + pool: PostgreSQL connection pooling
- jsonwebtoken: JWT authentication (HS256 algorithm)
- bcryptjs: Password hashing (10 rounds)
- socket.io: Real-time communication
- node-cron: Task scheduling for automated billing
- dotenv: Environment configuration
- helmet + cors: Security middleware

NEW CORE MODULES IMPLEMENTED

1. Cron Service (/backend/services/cronService.js)
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

2. Billing Service (/backend/services/billingService.js)
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

3. Enhanced Payment Controller
Payment Allocation Logic:
- First Priority: Pay off arrears (oldest debts first)
- Second Priority: Pay current water bill
- Third Priority: Pay current month's rent
- Remainder: Mark as advance payment for future months

Updated SMS Notifications:
- Bill Notification: Rent + Water + Arrears breakdown
- Payment Confirmation: Allocation details and remaining balance
- Admin Alerts: Real-time payment notifications with breakdown

4. Admin Settings Controller (/backend/controllers/adminSettingsController.js)
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

AUTOMATED BILLING SYSTEM
End-of-Month Automation:
- Cron Service: Separate service for scheduled tasks
- Run Date: 28th of each month (configurable)
- Bulk SMS: Queue-based sending with rate limiting
- Skip Logic: Tenants with advance payments get no SMS
- Failure Handling: Failed SMS logged, agents notified

CONTROLLER PATTERNS
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

AUTHENTICATION MIDDLEWARE
JWT Verification Flow (middleware/authMiddleware.js):
- Extract token from Authorization: Bearer <token> header
- Verify with jsonwebtoken.verify()
- Attach user to req.user for downstream use
- Role-based access control in route handlers

Protected Route Example:
const { protect, adminOnly } = require('../middleware/authMiddleware');
router.post('/', protect, adminOnly, createProperty);
router.get('/:id', protect, getProperty);

DATABASE OPERATIONS
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

MPESA INTEGRATION PATTERNS
Payment Processing Flow:
1. Initiate: Client → POST /api/payments/mpesa with phone/amount
2. Callback: Safaricom → POST /api/payments/mpesa/callback
3. Confirmation: Update rent_payments + mpesa_transactions
4. Notification: Send SMS/email confirmation

Transaction States:
pending → processing → completed/failed
Store mpesa_code, checkout_request_id, merchant_request_id
Validate amount matches expected rent

BILLING & ARREARS SYSTEM
New Components:
1. BillingService (/backend/services/billingService.js):
   - Calculates total due: rent + water + arrears
   - Allocates payments: arrears → water → rent → advance
   - Generates monthly bills for all tenants
   - Updates arrears balances automatically

Payment Allocation Logic:
1. First: Pay off arrears (oldest debts)
2. Second: Pay current water bill
3. Third: Pay current month's rent
4. Remainder: Mark as advance payment for future months

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

ADMIN SETTINGS FOR BILLING
Required Settings in admin_settings table:
Key               Default                   Validation
billing_day       28                        1-28
paybill_number    ''                        5-10 digits
company_name      'Rental Management'       Text
sms_billing_template Template               Text with variables
late_fee_percentage 5                       0-50
grace_period_days   5                       0-30
sms_enabled        true                     boolean
auto_billing_enabled true                   boolean

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

CHAT MODULE BACKEND PATTERNS
Controller-Service Pattern for chat:
HTTP Request → chatController.js (REST API) → chatService.js (Socket.io + Business Logic) → Database

Socket.io Room Architecture:
socket.on('connection', async (socket) => {
  socket.join(`user_${socket.userId}`);
  const convs = await db.query('SELECT conversation_id FROM chat_participants...');
  convs.rows.forEach(row => {
    socket.join(`conversation_${row.conversation_id}`);
  });
});

Real-time Message Broadcasting:
// Dual broadcast pattern
io.to(`conversation_${conversationId}`).emit('new_message', { message, conversationId });
io.to(`user_${participant.user_id}`).emit('chat_notification', { type: 'new_message', conversationId, message, unreadCount: 1 });

NOTIFICATIONS SYSTEM BACKEND PATTERNS
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

Notification Types:
- payment_success: Tenant payment successful
- payment_received: Admin received payment
- payment_failed: Payment failure
- payment_carry_forward: Amount carried forward
- salary_paid: Agent salary paid
- complaint_created: New complaint
- complaint_resolved: Complaint resolved
- announcement: Broadcast message
- system_alert: System-wide alert

WATER BILL INTEGRATION (/backend/controllers/waterBillController.js)
Purpose: Enhanced water bill management with SMS integration
Key Methods:
- checkMissingWaterBills(): Identifies tenants without water bills for specific month
- createWaterBill(): Creates water bills with tenant name resolution
- listWaterBills(): Lists water bills with tenant and property information
- Enhanced agent property filtering for all operations

Water Bill SMS Integration:
- Pre-flight checking: Warns agents about tenants missing water bills
- Graceful handling: Tenants without water bills get KSh 0 in SMS
- Flexible timing: SMS can be sent anytime, even with incomplete data
- Agent warnings: Clear indication of which tenants lack water bills

Water Bills Routes (/backend/routes/waterBills.js)
New API Endpoints:
- GET /api/water-bills/missing-tenants - Check which tenants lack water bills
- POST /api/water-bills - Create water bill
- GET /api/water-bills - List water bills
- GET /api/water-bills/:id - Get specific water bill
- DELETE /api/water-bills/:id - Delete water bill

Security Implementation:
- All endpoints protected by agentOrAdmin middleware
- Agent property filtering via agent_property_assignments table
- Proper error handling with meaningful messages

AGENT SMS MANAGEMENT SYSTEM
Purpose: Agent-scoped SMS management with property filtering
Key Features:
- Agent-triggered billing SMS with water bill verification
- Agent-scoped failed SMS viewing and retry
- Property filtering via agent_property_assignments table
- Missing water bill warning system

Endpoints Created:
- POST /api/cron/agent/trigger-billing - Trigger billing SMS for agent's properties
- GET  /api/cron/agent/failed-sms - View failed SMS (agent property filtered)
- POST /api/cron/agent/retry-sms - Retry failed SMS (agent property filtered)

Agent Workflow:
1. Agent inputs water bills one-by-one via /api/water-bills
2. Agent triggers billing SMS via /api/cron/agent/trigger-billing
3. System checks for missing water bills and warns agent
4. Agent confirms to proceed (water=0 for missing bills)
5. System queues SMS for all tenants in agents properties
6. Agent monitors failed SMS via filtered endpoints
7. Agent retries failed SMS for their properties only

Security Implementation:
- All agent endpoints filter by agent_property_assignments table
- Agents can only access SMS for their assigned properties
- Property validation before SMS queuing
- Role-based access control (agentOnly middleware)

DATABASE INTEGRATION:
New SMS Queue Table Schema:
id (uuid): Primary key
recipient_phone (varchar): Formatted phone number (254XXXXXXXXX)
message (text): SMS message content
message_type (varchar): 'bill_notification', 'payment_confirmation'
status (varchar): 'pending', 'sent', 'failed'
billing_month (varchar): Month in YYYY-MM format
attempts (integer): Number of retry attempts (max 3)
error_message (text): Last error message
created_at (timestamp): When SMS was queued
agent_id (uuid): Reference to users.id (who triggered)

Key Queries for Agent SMS Management:
-- Agent's Failed SMS Query
SELECT sq.*, t.first_name, t.last_name, pu.unit_code, p.name as property_name
FROM sms_queue sq
LEFT JOIN tenants t ON sq.recipient_phone = t.phone_number
LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
LEFT JOIN property_units pu ON ta.unit_id = pu.id
LEFT JOIN properties p ON pu.property_id = p.id
WHERE sq.status = 'failed' AND sq.message_type = 'bill_notification' AND p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true);

AGENT REPORTS SYSTEM - ENDPOINT VERIFICATION

✅ WORKING ENDPOINTS:

1. Properties:
   - GET /api/properties/agent/assigned - Returns agent's assigned properties
   - Response format: { success, data: [properties], count }

2. Agent Properties Redirects:
   - GET /api/agents/tenants/payments → Redirects to /api/agent-properties/my-tenants
   - GET /api/agents/complaints → Redirects to /api/agent-properties/my-complaints

❓ ENDPOINTS TO VERIFY/CREATE:

1. Agent Tenants Endpoint:
   - Expected: GET /api/agent-properties/my-tenants
   - Purpose: List all tenants in agent's assigned properties
   - Should include tenant details, unit info, property info

2. Agent Payments Endpoint:
   - Current: None specifically for agent reports
   - Need: GET /api/agent-properties/my-payments or similar
   - Should return payments filtered by agent's properties

3. Revenue Report Endpoint:
   - Need: GET /api/agent-properties/revenue-summary
   - Should return aggregated revenue data by property/period

4. Water Bills with Agent Filtering:
   - Existing: GET /api/water-bills (needs agent filtering)
   - Should return water bills for agent's properties only

5. SMS History with Agent Filtering:
   - Existing: GET /api/cron/sms-history (needs agent filtering)
   - Should return SMS sent to tenants in agent's properties

REQUIRED BACKEND UPDATES:

1. Create Agent Reports Controller:
   - Create agentReportsController.js with 7 report functions
   - Each function must filter by agent_property_assignments table

2. Add Agent Reports Routes:
   - Create agentReports.js routes file
   - Register routes in server.js
   - Test endpoints with Postman

3. Update Existing Endpoints:
   - Add agent filtering to water bills endpoint
   - Add agent filtering to SMS history endpoint

AGENT FILTERING PATTERN:
All agent report endpoints should follow this pattern:

const query = `
SELECT ...
FROM ...
WHERE property_id IN (
 SELECT property_id FROM agent_property_assignments 
 WHERE agent_id = $1 AND is_active = true
)
`;

ERROR HANDLING STRATEGY
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

DATA INTEGRITY RULES (NEW)
Billing Integrity:
- No duplicate billing: One bill per tenant per month
- Water bill validation: Must exist before billing can proceed
- Advance payment detection: Skip SMS if advance covers total due
- Arrears calculation: Auto-updates after each payment

Payment Allocation Rules:
- Sum validation: allocated_to_rent + allocated_to_water + allocated_to_arrears = amount
- Negative prevention: Allocation amounts cannot be negative
- Consistency: Allocation must match payment type (rent/water/arrears)

PERFORMANCE OPTIMIZATIONS (ADDED)
New Indexes for Billing:
-- Fast arrears queries
CREATE INDEX idx_tenant_allocations_arrears ON tenant_allocations(arrears_balance) WHERE arrears_balance > 0;

-- Fast water bill lookup by tenant and month
CREATE INDEX idx_water_bills_tenant_month ON water_bills(tenant_id, bill_month);

-- Fast billing history queries
CREATE INDEX idx_billing_runs_month_date ON billing_runs(month DESC, run_date DESC);

Query Optimization for Monthly Billing:
- Use CTEs for complex billing calculations
- Batch updates for arrears adjustments
- Pagination for large tenant lists (>1000)

DEBUGGING & TROUBLESHOOTING
Common Issues:

1. 404 Route Not Found: /api/cron/agent/trigger-billing
   Cause: Route not properly registered in server.js
   Solution: Verify cronRoutes.js is loaded in server.js

2. SQL Column Error: column p.is_active does not exist
   Root Cause: properties table doesn't have is_active column
   Solution: Removed all references to p.is_active, kept only apa.is_active (agent_property_assignments)

3. Agent Data Isolation Issues
   Cause: Missing agent_property_assignments joins in queries
   Solution: All agent queries must include property filtering via agent_property_assignments table

TESTING & DEVELOPMENT
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

API ENDPOINT SPECIFICATIONS UPDATED (UPDATE 6.0)

Unit Creation Endpoint (POST /api/properties/:id/units):

Expected Request Body:

json
{
  "unit_number": "01",
  "unit_type": "studio",
  "rent_amount": 10000,
  "deposit_amount": 10000,
  "description": "Unit description",
  "features": {}  // Empty object, not array
}
Backend Processing:

Unit Code Generation: unit_code = property_code + "-" + unit_number

Example: Property "MJ" + Unit "01" = "MJ-01"

Features Storage: Stored as JSONB object in database

Defaults Applied: is_occupied = false, is_active = true

Response Format:

json
{
  "success": true,
  "message": "Unit created successfully",
  "data": {
    "id": "uuid",
    "property_id": "uuid",
    "unit_code": "MJ-01",
    "unit_type": "studio",
    "unit_number": "01",
    "rent_amount": "10000.00",
    "deposit_amount": "10000.00",
    "description": "Unit description",
    "features": {},
    "is_occupied": false,
    "is_active": true,
    "created_at": "2026-01-15T13:34:13.185Z"
  }
}
Property Units Endpoint (GET /api/properties/:id/units):

Response Format:

json
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
    // ... more units
  ]
}
Important Backend Rules:

Unit Code Uniqueness: Enforced at database level (UNIQUE constraint)

Property Validation: Unit must belong to an existing property

Data Type Enforcement: rent_amount and deposit_amount stored as NUMERIC

Feature Format: Stored as JSONB, accepts any valid JSON object

Frontend-Backend Integration Notes:

Data Flow for Unit Creation:

Frontend → POST /api/properties/:id/units (without unit_code)

Backend → Validates data, generates unit_code, saves to database

Backend → Returns complete unit object with generated unit_code

Frontend → Updates PropertyContext state with returned data

Frontend → UI re-renders with new unit

Error Handling Patterns:

400 Bad Request: Invalid data format (features as array, missing required fields)

404 Not Found: Property doesn't exist

409 Conflict: Unit code already exists

500 Server Error: Database or server issues

Testing Recommendations:

Test with Postman: Verify endpoint accepts correct format

Test unit code generation: Confirm pattern matches expectations

Test features storage: Verify JSONB storage works correctly

Test error cases: Validate error responses are helpful

DATABASE SCHEMA CLARIFICATIONS (UPDATE 6.0)

property_units Table - Critical Fields:

sql
CREATE TABLE property_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id),
  unit_code VARCHAR(50) UNIQUE NOT NULL,      -- Generated: property_code + "-" + unit_number
  unit_type VARCHAR(20) NOT NULL,             -- bedsitter, studio, one_bedroom, etc.
  unit_number VARCHAR(20) NOT NULL,           -- Display number: "01", "101", etc.
  rent_amount NUMERIC(10,2) NOT NULL,
  deposit_amount NUMERIC(10,2) DEFAULT 0,
  description TEXT,
  features JSONB DEFAULT '{}'::jsonb,         -- Stored as object, NOT array
  is_occupied BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CHECK (rent_amount > 0),
  CHECK (unit_number ~ '^[A-Za-z0-9-]+$')    -- Alphanumeric unit numbers
);
Important Notes on Features Field:

Type: JSONB (Binary JSON for PostgreSQL)

Default: '{}'::jsonb (empty object)

Storage: Objects like {"Parking": true, "Balcony": false}

Querying: Use features->>'Parking' = 'true' for filtering

Indexing: Consider GIN index if querying features frequently

Unit Code Generation Logic:

sql
-- Backend generates this during unit creation
unit_code = CONCAT(
  (SELECT property_code FROM properties WHERE id = :property_id),
  '-',
  :unit_number
)
Example Unit Records:

sql
INSERT INTO property_units 
  (property_id, unit_code, unit_number, unit_type, rent_amount, deposit_amount, features)
VALUES
  ('ca72aa5b-da16-4792-9c56-cd0a306d251e', 'MJ-01', '01', 'studio', 10000.00, 10000.00, '{}'),
  ('ca72aa5b-da16-4792-9c56-cd0a306d251e', 'MJ-02', '02', 'studio', 10000.00, 10000.00, '{}'),
  ('ca72aa5b-da16-4792-9c56-cd0a306d251e', 'MJ-03', '03', 'studio', 10000.00, 10000.00, '{}');
Recommended Indexes for Performance:

sql
-- For fast property unit lookups
CREATE INDEX idx_property_units_property_id ON property_units(property_id);

-- For unit code lookups (already indexed via UNIQUE constraint)

-- For occupancy status filtering
CREATE INDEX idx_property_units_occupied ON property_units(is_occupied) WHERE is_active = true;

-- For features querying if needed
CREATE INDEX idx_property_units_features ON property_units USING GIN(features);
Data Integrity Rules:

Unit Code Uniqueness: Enforced database-wide, not just per property

Property Existence: Foreign key ensures property exists

Positive Rent: CHECK constraint prevents negative rent

Valid Unit Numbers: Regex enforces alphanumeric format

Frontend Integration Points:

Display: Use unit_code for identification, unit_number for display

Features: Parse JSONB object into frontend state

Status: Use is_occupied for vacancy indicators

Stats: Calculate occupancy from is_occupied flag

Migration Considerations:
If changing features from array to object, run:

sql
UPDATE property_units 
SET features = '{}'::jsonb 
WHERE features = '[]'::jsonb OR features IS NULL;
SUMMARY OF FIXES (UPDATE 6.0):
Fixed PropertyContext.jsx:

Removed caching that prevented unit fetching

Added parallel unit fetching for all properties

Improved state management for immediate UI updates

Added comprehensive error logging

Fixed UnitManagement.jsx:

Corrected data format (features as object, not array)

Removed unit_code field (backend generates it)

Added refreshProperties for real-time updates

Added debug logging for troubleshooting

Fixed API Integration:

Correct request format for unit creation

Proper error handling for 400/404/409 errors

Real-time state synchronization

Fixed Database Schema Understanding:

Clarified features field as JSONB object

Documented unit code generation logic

Added proper indexing recommendations

Current System Status: Unit Management is now fully functional with proper data flow between frontend and backend.

END OF BACKEND ARCHITECTURE SUMMARY