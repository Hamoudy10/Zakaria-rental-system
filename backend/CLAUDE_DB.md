# Database Schema & Business Logic

## 🗃️ DATABASE OVERVIEW
Technology: PostgreSQL 15+ on Supabase
UUIDs: All primary keys use uuid_generate_v4()
Timestamps: created_at, updated_at patterns throughout
Soft Deletes: is_active flags instead of hard deletes

## 👥 CORE USER TABLES

### users - System Users (Admins, Agents)
Key Columns:
- id (uuid): Primary key
- national_id: Kenyan national ID (required)
- email, phone_number: Contact info
- password_hash: bcrypt hashed password
- role: ENUM('admin', 'agent', 'tenant') - defines permissions
- is_active: Soft delete flag
- notification_preferences: JSONB for communication settings

Business Rules:
1. National ID must be unique across system
2. Phone numbers stored in Kenyan format (254XXXXXXXXX)
3. Profile images stored as URLs (Supabase Storage)

### tenants - Rental Tenants
Key Columns:
- id (uuid): Primary key
- national_id: Kenyan national ID (required, unique)
- first_name, last_name, phone_number
- id_front_image, id_back_image: KYC documentation
- emergency_contact_name, emergency_contact_phone

Relationship:
- Tenants → tenant_allocations → property_units
- One tenant can have multiple allocations over time

## 🏢 PROPERTY MANAGEMENT TABLES

### properties - Rental Properties
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

### property_units - Individual Rental Units
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

### property_images - Property/Unit Images
Key Columns:
- id (uuid): Primary key
- property_id, unit_id: Optional foreign keys
- image_url: Supabase Storage URL
- image_type: ENUM('exterior', 'interior', 'floor_plan', 'amenity')
- caption: Optional description

## 📝 TENANT ALLOCATION TABLES

### tenant_allocations - Unit Assignments
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

## 💰 PAYMENT TABLES

### rent_payments - Rent Payment Records
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

### mpesa_transactions - M-Pesa Transaction Log
Key Columns:
- id (uuid): Primary key
- transaction_type: Payment context
- mpesa_code: Safaricom transaction code
- phone_number, amount: Transaction details
- account_number: Unit code or identifier
- is_confirmed: Boolean callback confirmation
- raw_response: JSONB full Safaricom response

Relationship:
- rent_payments.mpesa_transaction_id references this table
- One M-Pesa transaction can cover multiple rent payments

## 💰 ENHANCED PAYMENT & BILLING SYSTEM

### New Table: billing_runs
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

## 🛠️ COMPLAINT MANAGEMENT TABLES

### complaints - Tenant Complaints
Key Columns:
- id (uuid): Primary key
- tenant_id, unit_id: Complaint context
- title, description, category: Complaint details
- priority: ENUM('low', 'medium', 'high', 'urgent')
- status: ENUM('open', 'acknowledged', 'in_progress', 'resolved', 'closed')
- assigned_agent: References users.id (agent role)
- raised_at, acknowledged_at, resolved_at: Timeline
- tenant_feedback, tenant_satisfaction_rating: Resolution feedback

### complaint_updates - Complaint Progress Tracking
Key Columns:
- id (uuid): Primary key
- complaint_id: References complaints.id
- updated_by: References users.id
- update_text: Progress description
- update_type: ENUM('assignment', 'progress', 'resolution', 'note')

## 💬 COMMUNICATION TABLES

### notifications - In-App Notifications
Key Columns:
- id (uuid): Primary key
- user_id: Recipient
- title, message, type: Notification content
- related_entity_type, related_entity_id: Context links
- is_read: Read status flag
- read_at TIMESTAMP
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

Indexes for performance:
INDEX idx_user_id (user_id)
INDEX idx_user_read (user_id, is_read)
INDEX idx_created_at (created_at DESC)
INDEX idx_type (type)

Notification Types:
- payment_success, payment_failed
- complaint_updated, complaint_resolved
- announcement, system_alert

## 💬 CHAT TABLES

### chat_conversations
Key Columns:
- id (uuid): Primary key
- conversation_type: ENUM('direct', 'group')
- title: Required for group conversations
- created_by: References users.id
- is_active: Boolean active flag
- created_at, updated_at: Timestamps

### chat_messages
Key Columns:
- id (uuid): Primary key
- conversation_id: References chat_conversations.id
- sender_id: References users.id
- message_text: Text content
- message_type: ENUM('text', 'image', 'file', 'system')
- is_deleted: Soft delete flag
- deleted_at: When message was deleted
- created_at: Timestamp

### chat_participants
Key Columns:
- id (uuid): Primary key
- conversation_id: References chat_conversations.id
- user_id: References users.id
- joined_at: When user joined
- is_active: Boolean active flag (for leaving groups)
- role: ENUM('member', 'admin') for group conversations

### chat_message_reads
Key Columns:
- id (uuid): Primary key
- message_id: References chat_messages.id
- user_id: References users.id
- read_at: When message was read

Chat Tables Relationships:
chat_conversations
    ↑ (1)
chat_participants (many-to-many join)
    ↑ (many)
users
    ↓
chat_messages
    ↓
chat_message_reads (read receipts)

Key Business Rules:
- Direct Conversations: Auto-created, no duplicates between same users
- Group Conversations: Require title, can have multiple participants
- Message Flow: All messages stored, soft-deleted via is_deleted flag
- Read Receipts: Tracked per user per message via chat_message_reads
- Active Participation: is_active flag in chat_participants for leaving groups

## 📊 REPORTING & ANALYTICS TABLES

### payment_reports - Generated Reports
Key Columns:
- id (uuid): Primary key
- tenant_id: Optional filter
- report_type: Report category
- start_date, end_date: Report period
- report_data: JSONB structured report content

## 🔐 ADMINISTRATION TABLES

### admin_settings - System Configuration
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
- company_name: For SMS signature
- sms_billing_template: Customizable billing message

## 🔗 KEY FOREIGN KEY RELATIONSHIPS
1. User Creation Chain: users → properties → property_units
2. Tenant Lifecycle: tenants → tenant_allocations → property_units
3. Payment Flow: rent_payments → mpesa_transactions + tenant_allocations
4. Complaint Resolution: complaints → complaint_updates + users (agents)

## ⚠️ DATA INTEGRITY RULES
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

## 📈 PERFORMANCE OPTIMIZATIONS
Indexes Applied:
- All foreign key columns
- property_units.is_occupied + property_id
- rent_payments.payment_month + tenant_id
- notifications.user_id + is_read + created_at
- billing_runs.month DESC
- billing_runs.run_date DESC
- tenant_allocations.arrears_balance WHERE arrears_balance > 0
- water_bills.tenant_id + bill_month

Partitioning Consideration:
- rent_payments by payment_month (if volume grows)
- chat_messages by created_at (if volume grows)

## 📊 ENHANCED ARREARS TRACKING
Updated tenant_allocations Table:
- arrears_balance: Total outstanding arrears
- last_billing_date: Last bill generation date
- next_billing_date: Next scheduled billing

Updated rent_payments Table:
- allocated_to_rent: Amount applied to rent
- allocated_to_water: Amount applied to water bill
- allocated_to_arrears: Amount applied to arrears
- remaining_balance: Balance after payment

## 🔌 INTEGRATION PATTERNS
1. Authentication Integration:
// Frontend: Socket connection with JWT
const socket = io(SOCKET_URL, {
  auth: { token: localStorage.getItem('token') }
});

// Backend: Socket middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error'));
    socket.userId = decoded.id;
    socket.userName = `${decoded.first_name} ${decoded.last_name}`;
    next();
  });
});

2. Notification Integration:
// Chat notifications trigger app notifications
socket.on('chat_notification', (data) => {
  notificationContext.incrementUnreadCount();
  toast.success(`New message from ${data.senderName}`);
});

## 🐛 DEBUGGING & TROUBLESHOOTING
Common Issues & Solutions:
1. Socket Connection Failing:
// Check: Frontend connection
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

2. Messages Not Updating in Real-time:
- Verify user is in correct Socket.io rooms
- Check conversation_${id} room membership
- Verify event names match

3. Unread Counts Incorrect:
-- Debug query
SELECT 
  cm.id,
  cm.message_text,
  EXISTS (
    SELECT 1 FROM chat_message_reads r 
    WHERE r.message_id = cm.id AND r.user_id = 'user-uuid'
  ) as is_read
FROM chat_messages cm
WHERE cm.conversation_id = 'conversation-uuid';

## 📈 PERFORMANCE OPTIMIZATIONS
Implemented:
- Lazy Loading: Chat components loaded on demand
- Message Pagination: limit and offset for conversation lists
- Socket Room Management: Users only in active conversation rooms
- Database Indexes: On conversation_id, sender_id, created_at

Future Considerations:
- Virtualized Message List: For conversations with 1000+ messages
- Message Compression: For large file sharing
- Read Receipt Batching: Batch updates instead of per-message

Supabase PostgreSQL Database
Auto-backups configured via Supabase
Migration files in /backend/migrations/