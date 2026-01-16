DATABASE SCHEMA & BUSINESS LOGIC - SUMMARY

DATABASE OVERVIEW:
- Technology: PostgreSQL 15+ on Supabase
- UUIDs: All primary keys use uuid_generate_v4()
- Timestamps: created_at, updated_at patterns throughout
- Soft Deletes: is_active flags instead of hard deletes

CORE USER TABLES:

1. users - System Users (Admins, Agents):
   - id (uuid): Primary key
   - national_id: Kenyan national ID (required, unique)
   - email, phone_number: Contact info
   - password_hash: bcrypt hashed password
   - role: ENUM('admin', 'agent', 'tenant')
   - is_active: Soft delete flag
   - notification_preferences: JSONB for communication settings

2. tenants - Rental Tenants:
   - id (uuid): Primary key
   - national_id: Kenyan national ID (required, unique)
   - first_name, last_name, phone_number
   - id_front_image, id_back_image: KYC documentation
   - emergency_contact_name, emergency_contact_phone

PROPERTY MANAGEMENT TABLES:

1. properties - Rental Properties:
   - id (uuid): Primary key
   - property_code: Unique identifier (e.g., "PROP001")
   - name, address, county, town: Location data
   - total_units, available_units: Inventory tracking
   - unit_type: ENUM default for property
   - created_by: References users.id

2. property_units - Individual Rental Units:
   - id (uuid): Primary key
   - property_id: References properties.id
   - unit_code: Unique identifier (e.g., "PROP001-001")
   - unit_type: ENUM('bedsitter', 'studio', 'one_bedroom', 'two_bedroom', 'three_bedroom')
   - unit_number: Display number (e.g., "BS1", "2B3")
   - rent_amount, deposit_amount: Monetary values
   - is_occupied: Boolean occupancy status
   - features: JSONB for amenities list

TENANT ALLOCATION TABLES:

tenant_allocations - Unit Assignments:
- id (uuid): Primary key
- tenant_id: References tenants.id
- unit_id: References property_units.id
- lease_start_date, lease_end_date: Lease period
- monthly_rent: Specific rent for this allocation
- security_deposit: Collected amount
- rent_due_day: Day of month rent is due (default: 1)
- grace_period_days: Days before late fee (default: 5)
- is_active: Current active allocation flag
- arrears_balance NUMERIC DEFAULT 0 (Total outstanding arrears)
- last_billing_date DATE (Last bill generation date)
- next_billing_date DATE (Next scheduled billing)

PAYMENT TABLES:

rent_payments - Rent Payment Records:
- id (uuid): Primary key
- tenant_id, unit_id: Payment context
- mpesa_transaction_id: Safaricom transaction ID
- mpesa_receipt_number: M-Pesa confirmation code
- phone_number: Payer's phone (254 format)
- amount: Payment amount
- payment_month: Which month's rent (YYYY-MM-01)
- status: ENUM('pending', 'processing', 'completed', 'failed', 'overdue')
- late_fee: Calculated late penalty
- is_late_payment: Boolean flag
- allocated_to_rent NUMERIC DEFAULT 0 (Amount applied to rent)
- allocated_to_water NUMERIC DEFAULT 0 (Amount applied to water bill)
- allocated_to_arrears NUMERIC DEFAULT 0 (Amount applied to arrears)
- remaining_balance NUMERIC DEFAULT 0 (Balance after payment)

ENHANCED BILLING SYSTEM:

billing_runs Table (Audit log for automated monthly billing):
- id (uuid): Primary key
- month (varchar): Billing month in YYYY-MM format
- total_tenants (integer): Number of active tenants during billing
- bills_sent (integer): Number of SMS successfully sent
- bills_failed (integer): Number of SMS that failed
- skipped (integer): Tenants skipped (due to advance payments)
- failed_details (jsonb): Array of failed SMS with error details
- skipped_details (jsonb): Array of skipped tenants with reasons
- run_date (timestamp): When billing run was executed
- created_at (timestamp): Record creation time

COMPLAINT MANAGEMENT TABLES:

complaints - Tenant Complaints:
- id (uuid): Primary key
- tenant_id, unit_id: Complaint context
- title, description, category: Complaint details
- priority: ENUM('low', 'medium', 'high', 'urgent')
- status: ENUM('open', 'acknowledged', 'in_progress', 'resolved', 'closed')
- assigned_agent: References users.id (agent role)
- raised_at, acknowledged_at, resolved_at: Timeline
- tenant_feedback, tenant_satisfaction_rating: Resolution feedback

CHAT TABLES:

1. chat_conversations:
   - id (uuid): Primary key
   - conversation_type: ENUM('direct', 'group')
   - title: Required for group conversations
   - created_by: References users.id
   - is_active: Boolean active flag

2. chat_messages:
   - id (uuid): Primary key
   - conversation_id: References chat_conversations.id
   - sender_id: References users.id
   - message_text: Text content
   - message_type: ENUM('text', 'image', 'file', 'system')
   - is_deleted: Soft delete flag

3. chat_participants:
   - id (uuid): Primary key
   - conversation_id: References chat_conversations.id
   - user_id: References users.id
   - joined_at: When user joined
   - is_active: Boolean active flag
   - role: ENUM('member', 'admin') for group conversations

ADMINISTRATION TABLES:

admin_settings - System Configuration:
- id (uuid): Primary key
- setting_key: Unique setting identifier
- setting_value: Text value (parsed as needed)
- description: Human-readable explanation

Key Settings:
- mpesa_paybill_number: Business paybill
- mpesa_passkey: Lipa Na M-Pesa passkey
- late_fee_percentage: Default late penalty (e.g., "5")
- company_name, contact_phone
- billing_day: Day of month for auto-billing (e.g., "28")
- paybill_number: Business paybill for SMS instructions
- sms_billing_template: Customizable billing message

DATA INTEGRITY RULES:
1. Unique Constraints: users.national_id, properties.property_code, property_units.unit_code
2. Check Constraints: rent_amount > 0, phone_number format validation, payment_month first day of month
3. Business Rules: Only one active allocation per tenant/unit, unit_code format: {property_code}-{3-digit-sequence}

PERFORMANCE OPTIMIZATIONS (Indexes):
- All foreign key columns indexed
- property_units.is_occupied + property_id
- rent_payments.payment_month + tenant_id
- billing_runs.month DESC, run_date DESC
- tenant_allocations.arrears_balance WHERE arrears_balance > 0
- water_bills.tenant_id + bill_month

ENHANCED ARREARS TRACKING:
Updated tenant_allocations Table:
- arrears_balance: Total outstanding arrears
- last_billing_date: Last bill generation date
- next_billing_date: Next scheduled billing

Updated rent_payments Table:
- allocated_to_rent: Amount applied to rent
- allocated_to_water: Amount applied to water bill
- allocated_to_arrears: Amount applied to arrears
- remaining_balance: Balance after payment

WATER BILL INTEGRATION:
Missing Water Bills Check Query:
SELECT ta.tenant_id, t.first_name, t.last_name, t.phone_number, pu.unit_code, p.name as property_name
FROM tenant_allocations ta
JOIN tenants t ON ta.tenant_id = t.id
JOIN property_units pu ON ta.unit_id = pu.id
JOIN properties p ON pu.property_id = p.id
WHERE ta.is_active = true AND p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)

SMS QUEUE MANAGEMENT TABLES:

1. sms_queue (for failed SMS retry):
   - id (uuid): Primary key
   - recipient_phone (varchar): Formatted phone (254XXXXXXXXX)
   - message (text): SMS message content
   - message_type (varchar): 'bill_notification', 'payment_confirmation'
   - status (varchar): 'pending', 'sent', 'failed'
   - billing_month (varchar): Month in YYYY-MM format
   - attempts (integer): Retry attempts (max 3)
   - error_message (text): Last error message
   - created_at (timestamp): When SMS was queued
   - agent_id (uuid): Reference to users.id (who triggered)

2. sms_notifications (for SMS history):
   - id (uuid): Primary key
   - phone_number (varchar): Recipient phone
   - message_type (varchar): Type of SMS sent
   - message_content (text): Full message content
   - status (varchar): 'sent', 'failed'
   - sent_at (timestamp): When SMS was sent

AGENT REPORTS DATABASE QUERIES:

1. Agent Tenants Report Query:
SELECT t.id, t.national_id, t.first_name, t.last_name, t.phone_number, t.email, t.created_at, pu.unit_code, p.name as property_name, ta.monthly_rent, ta.arrears_balance, ta.lease_start_date, ta.lease_end_date
FROM tenants t
LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
LEFT JOIN property_units pu ON ta.unit_id = pu.id
LEFT JOIN properties p ON pu.property_id = p.id
WHERE p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)
ORDER BY p.name, pu.unit_code;

2. Agent Payments Report Query:
SELECT rp.id, rp.amount, rp.payment_month, rp.status, rp.created_at, rp.mpesa_receipt_number, t.first_name, t.last_name, t.phone_number, pu.unit_code, p.name as property_name
FROM rent_payments rp
JOIN tenants t ON rp.tenant_id = t.id
JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
JOIN property_units pu ON ta.unit_id = pu.id
JOIN properties p ON pu.property_id = p.id
WHERE p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)
ORDER BY rp.created_at DESC;

3. Agent Revenue Report Query:
SELECT p.name as property_name, COUNT(DISTINCT rp.id) as payment_count, SUM(rp.amount) as total_revenue, AVG(rp.amount) as average_payment, MIN(rp.created_at) as first_payment, MAX(rp.created_at) as last_payment
FROM rent_payments rp
JOIN tenants t ON rp.tenant_id = t.id
JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
JOIN property_units pu ON ta.unit_id = pu.id
JOIN properties p ON pu.property_id = p.id
WHERE p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)
GROUP BY p.id, p.name
ORDER BY total_revenue DESC;

DATABASE SCHEMA CLARIFICATIONS (UPDATE 6.0):

property_units Table Critical Fields:
CREATE TABLE property_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id),
  unit_code VARCHAR(50) UNIQUE NOT NULL,      -- Generated: property_code + "-" + unit_number
  unit_type VARCHAR(20) NOT NULL,             -- bedsitter, studio, etc.
  unit_number VARCHAR(20) NOT NULL,           -- Display number: "01", "101"
  rent_amount NUMERIC(10,2) NOT NULL,
  deposit_amount NUMERIC(10,2) DEFAULT 0,
  description TEXT,
  features JSONB DEFAULT '{}'::jsonb,         -- Stored as object, NOT array
  is_occupied BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (rent_amount > 0),
  CHECK (unit_number ~ '^[A-Za-z0-9-]+$')
);

Important Notes on Features Field:
- Type: JSONB (Binary JSON for PostgreSQL)
- Default: '{}'::jsonb (empty object)
- Storage: Objects like {"Parking": true, "Balcony": false}
- Querying: Use features->>'Parking' = 'true' for filtering

Unit Code Generation Logic:
unit_code = CONCAT(
  (SELECT property_code FROM properties WHERE id = :property_id),
  '-',
  :unit_number
)

Example Unit Records:
INSERT INTO property_units VALUES
  ('property-uuid', 'MJ-01', '01', 'studio', 10000.00, 10000.00, '{}'),
  ('property-uuid', 'MJ-02', '02', 'studio', 10000.00, 10000.00, '{}'),
  ('property-uuid', 'MJ-03', '03', 'studio', 10000.00, 10000.00, '{}');

Recommended Indexes for Performance:
-- For fast property unit lookups
CREATE INDEX idx_property_units_property_id ON property_units(property_id);
-- For occupancy status filtering
CREATE INDEX idx_property_units_occupied ON property_units(is_occupied) WHERE is_active = true;
-- For features querying if needed
CREATE INDEX idx_property_units_features ON property_units USING GIN(features);

UPDATE 8.0 - PRODUCTION DEPLOYMENT DEPENDENCIES:

PACKAGE DEPENDENCY UPDATES REQUIRED:
MUST ADD TO package.json:
{
  "dependencies": {
    "multer": "^1.4.5-lts.1",
    // ... existing dependencies
  }
}

PRODUCTION FILE UPLOAD STRATEGY:
Current Simplified Approach (Temporary):
- ID images stored as base64 strings or URLs in tenants table
- Avoids file system dependencies in cloud environment

Recommended Production Approach:
1. Cloud Storage Integration: AWS S3, Google Cloud Storage, or Azure Blob Storage
2. Generate pre-signed URLs for direct client upload
3. Store only file references in database

File Upload Middleware Pattern for Production:
const uploadToS3 = async (fileBuffer, fileName, mimeType) => {
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key: `tenant-ids/${Date.now()}-${fileName}`,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'private'
  };
  const result = await s3.upload(params).promise();
  return result.Location;
};

DEPLOYMENT CHECKLIST FOR RENDER:
✅ Required: All dependencies in package.json (not devDependencies)
✅ Required: DATABASE_URL environment variable
✅ Required: JWT_SECRET environment variable
✅ Required: FRONTEND_URL for CORS
✅ Recommended: S3 or cloud storage for file uploads
✅ Recommended: Environment-specific configuration

DATABASE MIGRATION CONSIDERATIONS:
For production file uploads:
1. Current: Store base64/text URLs
2. Future: Store cloud storage URLs
3. No schema changes needed if using TEXT columns

SECURITY NOTES FOR PRODUCTION:
1. File Upload Validation: Validate file types, set size limits (5MB max)
2. Database Security: Use connection pooling, parameterized queries only, regular backups
3. Environment Variables Required: DATABASE_URL, JWT_SECRET, FRONTEND_URL, S3_BUCKET (if using S3)

PRODUCTION PERFORMANCE OPTIMIZATIONS:
-- Indexes for fast tenant lookup
CREATE INDEX idx_tenants_phone ON tenants(phone_number);
CREATE INDEX idx_tenants_national_id ON tenants(national_id);
-- For tenant allocation lookups
CREATE INDEX idx_tenant_allocations_active_tenant ON tenant_allocations(tenant_id, is_active);
-- For payment history
CREATE INDEX idx_rent_payments_tenant_date ON rent_payments(tenant_id, created_at DESC);

SUMMARY OF FIXES (UPDATE 6.0):
✅ Fixed PropertyContext.jsx: Removed caching, added parallel unit fetching, improved state management
✅ Fixed UnitManagement.jsx: Corrected data format (features as object), removed unit_code field
✅ Fixed API Integration: Correct request format, proper error handling
✅ Fixed Database Schema Understanding: Clarified features field as JSONB object, documented unit code generation

Current System Status: Database schema is production-ready with all billing, arrears tracking, and agent isolation features implemented.

LAST UPDATED: After Update 8.0 - Production deployment dependencies addressed, schema optimized for performance.