DATABASE SCHEMA & BUSINESS LOGIC

DATABASE OVERVIEW
Technology: PostgreSQL 15+ on Supabase
UUIDs: All primary keys use uuid_generate_v4()
Timestamps: created_at, updated_at patterns throughout
Soft Deletes: is_active flags instead of hard deletes

CORE USER TABLES

users - System Users (Admins, Agents)
Key Columns:
- id (uuid): Primary key
- national_id: Kenyan national ID (required, unique)
- email, phone_number: Contact info
- password_hash: bcrypt hashed password
- role: ENUM('admin', 'agent', 'tenant') - defines permissions
- is_active: Soft delete flag
- notification_preferences: JSONB for communication settings

Business Rules:
1. National ID must be unique across system
2. Phone numbers stored in Kenyan format (254XXXXXXXXX)
3. Profile images stored as URLs (Supabase Storage)

tenants - Rental Tenants
Key Columns:
- id (uuid): Primary key
- national_id: Kenyan national ID (required, unique)
- first_name, last_name, phone_number
- id_front_image, id_back_image: KYC documentation
- emergency_contact_name, emergency_contact_phone

Relationship:
- Tenants → tenant_allocations → property_units
- One tenant can have multiple allocations over time

PROPERTY MANAGEMENT TABLES

properties - Rental Properties
Key Columns:
- id (uuid): Primary key
- property_code: Unique identifier (e.g., "PROP001")
- name, address, county, town: Location data
- total_units, available_units: Inventory tracking
- unit_type: ENUM default - defines default unit type for property
- created_by: References users.id

Business Rules:
1. property_code must be uppercase alphanumeric, no spaces
2. available_units auto-calculated from property_units.is_occupied
3. County/Town follow Kenyan administrative divisions

property_units - Individual Rental Units
Key Columns:
- id (uuid): Primary key
- property_id: References properties.id
- unit_code: Unique identifier (e.g., "PROP001-001")
- unit_type: ENUM('bedsitter', 'studio', 'one_bedroom', 'two_bedroom', 'three_bedroom')
- unit_number: Display number (e.g., "BS1", "2B3")
- rent_amount, deposit_amount: Monetary values
- is_occupied: Boolean occupancy status
- features: JSONB for amenities list

Business Rules:
1. unit_code format: {property_code}-{3-digit-sequence}
2. unit_number format varies by unit_type for readability
3. Rent amount required, deposit defaults to 0

TENANT ALLOCATION TABLES

tenant_allocations - Unit Assignments
Key Columns:
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

Business Rules:
1. Only one active allocation per tenant at a time
2. Only one active allocation per unit at a time
3. monthly_rent can differ from property_units.rent_amount
4. End date can be null for month-to-month tenancy
5. Arrears balance accumulates unpaid amounts across months
6. Negative balance indicates advance payment credit
7. Billing dates auto-calculated based on system settings

PAYMENT TABLES

rent_payments - Rent Payment Records
Key Columns:
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

Business Rules:
1. Payment month format: First day of month (2024-03-01)
2. Late fee calculation: (days_late * monthly_rent * 0.05)
3. Advance payments flagged with is_advance_payment
4. Allocation happens in order: arrears → water → rent
5. Remaining balance triggers advance payment if positive
6. Negative remaining balance indicates partial payment

ENHANCED PAYMENT & BILLING SYSTEM

New Table: billing_runs
Purpose: Audit log for automated monthly billing
Columns:
- id (uuid): Primary key
- month (varchar): Billing month in YYYY-MM format
- total_tenants (integer): Number of active tenants during billing
- bills_sent (integer): Number of SMS successfully sent
- bills_failed (integer): Number of SMS that failed
- skipped (integer): Tenants skipped (due to advance payments)
- failed_details (jsonb): Array of failed SMS with error details
- skipped_details (jsonb): Array of skipped tenants with reasons
- run_date (timestamp): When the billing run was executed
- created_at (timestamp): Record creation time

Indexes:
CREATE INDEX idx_billing_runs_month ON billing_runs(month DESC);
CREATE INDEX idx_billing_runs_date ON billing_runs(run_date DESC);

COMPLAINT MANAGEMENT TABLES

complaints - Tenant Complaints
Key Columns:
- id (uuid): Primary key
- tenant_id, unit_id: Complaint context
- title, description, category: Complaint details
- priority: ENUM('low', 'medium', 'high', 'urgent')
- status: ENUM('open', 'acknowledged', 'in_progress', 'resolved', 'closed')
- assigned_agent: References users.id (agent role)
- raised_at, acknowledged_at, resolved_at: Timeline
- tenant_feedback, tenant_satisfaction_rating: Resolution feedback

CHAT TABLES

chat_conversations
Key Columns:
- id (uuid): Primary key
- conversation_type: ENUM('direct', 'group')
- title: Required for group conversations
- created_by: References users.id
- is_active: Boolean active flag
- created_at, updated_at: Timestamps

chat_messages
Key Columns:
- id (uuid): Primary key
- conversation_id: References chat_conversations.id
- sender_id: References users.id
- message_text: Text content
- message_type: ENUM('text', 'image', 'file', 'system')
- is_deleted: Soft delete flag
- deleted_at: When message was deleted
- created_at: Timestamp

chat_participants
Key Columns:
- id (uuid): Primary key
- conversation_id: References chat_conversations.id
- user_id: References users.id
- joined_at: When user joined
- is_active: Boolean active flag (for leaving groups)
- role: ENUM('member', 'admin') for group conversations

ADMINISTRATION TABLES

admin_settings - System Configuration
Key Columns:
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

KEY FOREIGN KEY RELATIONSHIPS
1. User Creation Chain: users → properties → property_units
2. Tenant Lifecycle: tenants → tenant_allocations → property_units
3. Payment Flow: rent_payments → mpesa_transactions + tenant_allocations
4. Complaint Resolution: complaints → complaint_updates + users (agents)

DATA INTEGRITY RULES
1. Cascade Deletes: Limited use, prefer soft deletes
2. Unique Constraints:
   - users.national_id UNIQUE
   - properties.property_code UNIQUE
   - property_units.unit_code UNIQUE
   - tenant_allocations unique active per tenant/unit
3. Check Constraints:
   - rent_amount > 0
   - phone_number format validation
   - payment_month first day of month

PERFORMANCE OPTIMIZATIONS
Indexes Applied:
- All foreign key columns
- property_units.is_occupied + property_id
- rent_payments.payment_month + tenant_id
- notifications.user_id + is_read + created_at
- billing_runs.month DESC
- billing_runs.run_date DESC
- tenant_allocations.arrears_balance WHERE arrears_balance > 0
- water_bills.tenant_id + bill_month

ENHANCED ARREARS TRACKING
Updated tenant_allocations Table:
- arrears_balance: Total outstanding arrears
- last_billing_date: Last bill generation date
- next_billing_date: Next scheduled billing

Updated rent_payments Table:
- allocated_to_rent: Amount applied to rent
- allocated_to_water: Amount applied to water bill
- allocated_to_arrears: Amount applied to arrears
- remaining_balance: Balance after payment

DATABASE INTEGRATION UPDATES

Water Bill Integration Tables:
tables referenced:
- water_bills: Main water bill storage with tenant/property relationships
- tenants: Tenant information for name resolution
- property_units: Unit information for billing context
- properties: Property information for grouping
- agent_property_assignments: Agent data isolation
- tenant_allocations: Active tenant verification

Key Queries Implemented:

Missing Water Bills Check:
SELECT ta.tenant_id, t.first_name, t.last_name, t.phone_number, pu.unit_code, p.name as property_name, EXISTS(SELECT 1 FROM water_bills wb WHERE wb.tenant_id = ta.tenant_id AND DATE_TRUNC('month', wb.bill_month) = DATE_TRUNC('month', $1::date)) as has_water_bill
FROM tenant_allocations ta
JOIN tenants t ON ta.tenant_id = t.id
JOIN property_units pu ON ta.unit_id = pu.id
JOIN properties p ON pu.property_id = p.id
WHERE ta.is_active = true

Agent Property Filtering:
AND p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $2 AND is_active = true)

SMS QUEUE MANAGEMENT TABLES

sms_queue table (for failed SMS retry):
- id (uuid): Primary key
- recipient_phone (varchar): Formatted phone number (254XXXXXXXXX)
- message (text): SMS message content
- message_type (varchar): 'bill_notification', 'payment_confirmation', etc.
- status (varchar): 'pending', 'sent', 'failed'
- billing_month (varchar): Month in YYYY-MM format
- attempts (integer): Number of retry attempts (max 3)
- error_message (text): Last error message
- created_at (timestamp): When SMS was queued
- sent_at (timestamp): When SMS was sent
- last_attempt_at (timestamp): Last retry attempt
- agent_id (uuid): Reference to users.id (who triggered)

sms_notifications table (for SMS history):
- id (uuid): Primary key
- phone_number (varchar): Recipient phone
- message_type (varchar): Type of SMS sent
- message_content (text): Full message content
- status (varchar): 'sent', 'failed'
- sent_at (timestamp): When SMS was sent
- created_at (timestamp): Record creation time

Key Queries for Agent SMS Management:

Agent's Failed SMS Query:
SELECT sq.*, t.first_name, t.last_name, pu.unit_code, p.name as property_name
FROM sms_queue sq
LEFT JOIN tenants t ON sq.recipient_phone = t.phone_number
LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
LEFT JOIN property_units pu ON ta.unit_id = pu.id
LEFT JOIN properties p ON pu.property_id = p.id
WHERE sq.status = 'failed' AND sq.message_type = 'bill_notification' AND p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)
ORDER BY sq.created_at DESC;

AGENT REPORTS DATABASE QUERIES

REQUIRED QUERIES FOR REPORTS:

1. Agent Tenants Report:
SELECT t.id, t.national_id, t.first_name, t.last_name, t.phone_number, t.email, t.created_at, pu.unit_code, p.name as property_name, ta.monthly_rent, ta.arrears_balance, ta.lease_start_date, ta.lease_end_date
FROM tenants t
LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
LEFT JOIN property_units pu ON ta.unit_id = pu.id
LEFT JOIN properties p ON pu.property_id = p.id
WHERE p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)
ORDER BY p.name, pu.unit_code;

2. Agent Payments Report:
SELECT rp.id, rp.amount, rp.payment_month, rp.status, rp.created_at, rp.mpesa_receipt_number, t.first_name, t.last_name, t.phone_number, pu.unit_code, p.name as property_name
FROM rent_payments rp
JOIN tenants t ON rp.tenant_id = t.id
JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
JOIN property_units pu ON ta.unit_id = pu.id
JOIN properties p ON pu.property_id = p.id
WHERE p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)
ORDER BY rp.created_at DESC;

3. Agent Revenue Report:
SELECT p.name as property_name, COUNT(DISTINCT rp.id) as payment_count, SUM(rp.amount) as total_revenue, AVG(rp.amount) as average_payment, MIN(rp.created_at) as first_payment, MAX(rp.created_at) as last_payment
FROM rent_payments rp
JOIN tenants t ON rp.tenant_id = t.id
JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
JOIN property_units pu ON ta.unit_id = pu.id
JOIN properties p ON pu.property_id = p.id
WHERE p.id IN (SELECT property_id FROM agent_property_assignments WHERE agent_id = $1 AND is_active = true)
GROUP BY p.id, p.name
ORDER BY total_revenue DESC;

PERFORMANCE INDEXES FOR REPORTS:
-- For fast agent property filtering
CREATE INDEX idx_agent_property_assignments_agent ON agent_property_assignments(agent_id, is_active, property_id);

-- For payment reports
CREATE INDEX idx_rent_payments_tenant_date ON rent_payments(tenant_id, created_at DESC);

-- For tenant allocation lookups
CREATE INDEX idx_tenant_allocations_active ON tenant_allocations(tenant_id, is_active);

END OF DATABASE SCHEMA SUMMARY