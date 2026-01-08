
---

### **4. DATABASE SCHEMA: `CLAUDE.md`**
**Location:** `/abdallah-rental-system/backend/CLAUDE_DB.md`
```markdown
# Database Schema & Business Logic

## 🗃️ DATABASE OVERVIEW
**Technology:** PostgreSQL 15+ on Supabase
**UUIDs:** All primary keys use `uuid_generate_v4()`
**Timestamps:** `created_at`, `updated_at` patterns throughout
**Soft Deletes:** `is_active` flags instead of hard deletes

## 👥 CORE USER TABLES

### `users` - System Users (Admins, Agents)
**Key Columns:**
- `id` (uuid): Primary key
- `national_id`: Kenyan national ID (required)
- `email`, `phone_number`: Contact info
- `password_hash`: bcrypt hashed password
- `role`: ENUM('admin', 'agent', 'tenant') - defines permissions
- `is_active`: Soft delete flag
- `notification_preferences`: JSONB for communication settings

**Business Rules:**
1. National ID must be unique across system
2. Phone numbers stored in Kenyan format (254XXXXXXXXX)
3. Profile images stored as URLs (Supabase Storage)

### `tenants` - Rental Tenants
**Key Columns:**
- `id` (uuid): Primary key
- `national_id`: Kenyan national ID (required, unique)
- `first_name`, `last_name`, `phone_number`
- `id_front_image`, `id_back_image`: KYC documentation
- `emergency_contact_name`, `emergency_contact_phone`

**Relationship:**
- Tenants → `tenant_allocations` → `property_units`
- One tenant can have multiple allocations over time

## 🏢 PROPERTY MANAGEMENT TABLES

### `properties` - Rental Properties
**Key Columns:**
- `id` (uuid): Primary key
- `property_code`: Unique identifier (e.g., "PROP001")
- `name`, `address`, `county`, `town`: Location data
- `total_units`, `available_units`: Inventory tracking
- `unit_type`: ENUM default - defines default unit type for property
- `created_by`: References `users.id`

**Business Rules:**
1. `property_code` must be uppercase alphanumeric, no spaces
2. `available_units` auto-calculated from `property_units.is_occupied`
3. County/Town follow Kenyan administrative divisions

### `property_units` - Individual Rental Units
**Key Columns:**
- `id` (uuid): Primary key
- `property_id`: References `properties.id`
- `unit_code`: Unique identifier (e.g., "PROP001-001")
- `unit_type`: ENUM('bedsitter', 'studio', 'one_bedroom', 'two_bedroom', 'three_bedroom')
- `unit_number`: Display number (e.g., "BS1", "2B3")
- `rent_amount`, `deposit_amount`: Monetary values
- `is_occupied`: Boolean occupancy status
- `features`: JSONB for amenities list

**Business Rules:**
1. `unit_code` format: `{property_code}-{3-digit-sequence}`
2. `unit_number` format varies by unit_type for readability
3. Rent amount required, deposit defaults to 0

### `property_images` - Property/Unit Images
**Key Columns:**
- `id` (uuid): Primary key
- `property_id`, `unit_id`: Optional foreign keys
- `image_url`: Supabase Storage URL
- `image_type`: ENUM('exterior', 'interior', 'floor_plan', 'amenity')
- `caption`: Optional description

## 📝 TENANT ALLOCATION TABLES

### `tenant_allocations` - Unit Assignments
**Key Columns:**
- `id` (uuid): Primary key
- `tenant_id`: References `tenants.id`
- `unit_id`: References `property_units.id`
- `lease_start_date`, `lease_end_date`: Lease period
- `monthly_rent`: Specific rent for this allocation
- `security_deposit`: Collected amount
- `rent_due_day`: Day of month rent is due (default: 1)
- `grace_period_days`: Days before late fee (default: 5)
- `is_active`: Current active allocation flag

**Business Rules:**
1. Only one active allocation per tenant at a time
2. Only one active allocation per unit at a time
3. `monthly_rent` can differ from `property_units.rent_amount`
4. End date can be null for month-to-month tenancy

## 💰 PAYMENT TABLES

### `rent_payments` - Rent Payment Records
**Key Columns:**
- `id` (uuid): Primary key
- `tenant_id`, `unit_id`: Payment context
- `mpesa_transaction_id`: Safaricom transaction ID
- `mpesa_receipt_number`: M-Pesa confirmation code
- `phone_number`: Payer's phone (254 format)
- `amount`: Payment amount
- `payment_month`: Which month's rent (YYYY-MM-01)
- `status`: ENUM('pending', 'processing', 'completed', 'failed', 'overdue')
- `late_fee`: Calculated late penalty
- `is_late_payment`: Boolean flag

**Business Rules:**
1. Payment month format: First day of month (`2024-03-01`)
2. Late fee calculation: `(days_late * monthly_rent * 0.05)`
3. Advance payments flagged with `is_advance_payment`

### `mpesa_transactions` - M-Pesa Transaction Log
**Key Columns:**
- `id` (uuid): Primary key
- `transaction_type`: Payment context
- `mpesa_code`: Safaricom transaction code
- `phone_number`, `amount`: Transaction details
- `account_number`: Unit code or identifier
- `is_confirmed`: Boolean callback confirmation
- `raw_response`: JSONB full Safaricom response

**Relationship:**
- `rent_payments.mpesa_transaction_id` references this table
- One M-Pesa transaction can cover multiple rent payments

## 🛠️ COMPLAINT MANAGEMENT TABLES

### `complaints` - Tenant Complaints
**Key Columns:**
- `id` (uuid): Primary key
- `tenant_id`, `unit_id`: Complaint context
- `title`, `description`, `category`: Complaint details
- `priority`: ENUM('low', 'medium', 'high', 'urgent')
- `status`: ENUM('open', 'acknowledged', 'in_progress', 'resolved', 'closed')
- `assigned_agent`: References `users.id` (agent role)
- `raised_at`, `acknowledged_at`, `resolved_at`: Timeline
- `tenant_feedback`, `tenant_satisfaction_rating`: Resolution feedback

### `complaint_updates` - Complaint Progress Tracking
**Key Columns:**
- `id` (uuid): Primary key
- `complaint_id`: References `complaints.id`
- `updated_by`: References `users.id`
- `update_text`: Progress description
- `update_type`: ENUM('assignment', 'progress', 'resolution', 'note')

## 💬 COMMUNICATION TABLES

### `notifications` - In-App Notifications
**Key Columns:**
- `id` (uuid): Primary key
- `user_id`: Recipient
- `title`, `message`, `type`: Notification content
- `related_entity_type`, `related_entity_id`: Context links
- `is_read`: Read status flag

**Notification Types:**
- `payment_success`, `payment_failed`
- `complaint_updated`, `complaint_resolved`
- `announcement`, `system_alert`

### `chat_conversations`, `chat_messages`, `chat_participants`
**Real-time chat system for internal communication**

## 📊 REPORTING & ANALYTICS TABLES

### `payment_reports` - Generated Reports
**Key Columns:**
- `id` (uuid): Primary key
- `tenant_id`: Optional filter
- `report_type`: Report category
- `start_date`, `end_date`: Report period
- `report_data`: JSONB structured report content

## 🔐 ADMINISTRATION TABLES

### `admin_settings` - System Configuration
**Key Columns:**
- `id` (uuid): Primary key
- `setting_key`: Unique setting identifier
- `setting_value`: Text value (parsed as needed)
- `description`: Human-readable explanation

**Key Settings:**
- `mpesa_paybill_number`: Business paybill
- `mpesa_passkey`: Lipa Na M-Pesa passkey
- `late_fee_percentage`: Default late penalty (e.g., "5")
- `company_name`, `contact_phone`

## 🔗 KEY FOREIGN KEY RELATIONSHIPS
1. **User Creation Chain**: `users` → `properties` → `property_units`
2. **Tenant Lifecycle**: `tenants` → `tenant_allocations` → `property_units`
3. **Payment Flow**: `rent_payments` → `mpesa_transactions` + `tenant_allocations`
4. **Complaint Resolution**: `complaints` → `complaint_updates` + `users` (agents)

## ⚠️ DATA INTEGRITY RULES
1. **Cascade Deletes**: Limited use, prefer soft deletes
2. **Unique Constraints**: 
   - `users.national_id` UNIQUE
   - `properties.property_code` UNIQUE
   - `property_units.unit_code` UNIQUE
   - `tenant_allocations` unique active per tenant/unit
3. **Check Constraints**: 
   - `rent_amount` > 0
   - `phone_number` format validation
   - `payment_month` first day of month

## 📈 PERFORMANCE OPTIMIZATIONS
**Indexes Applied:**
- All foreign key columns
- `property_units.is_occupied` + `property_id`
- `rent_payments.payment_month` + `tenant_id`
- `notifications.user_id` + `is_read` + `created_at`

**Partitioning Consideration:**
- `rent_payments` by `payment_month` (if volume grows)
- `chat_messages` by `created_at` (if volume grows)

---
*Supabase PostgreSQL Database*
*Auto-backups configured via Supabase*
*Migration files in `/backend/migrations/`*

Chat Tables Relationships for chat
chat_conversations
    ↑ (1)
chat_participants (many-to-many join)
    ↑ (many)
users
    ↓
chat_messages
    ↓
chat_message_reads (read receipts)

Key Business Rules
Direct Conversations: Auto-created, no duplicates between same users

Group Conversations: Require title, can have multiple participants

Message Flow: All messages stored, soft-deleted via is_deleted flag

Read Receipts: Tracked per user per message via chat_message_reads

Active Participation: is_active flag in chat_participants for leaving groups

🔌 INTEGRATION PATTERNS
1. Authentication Integration
// Frontend: Socket connection with JWT
const socket = io(SOCKET_URL, {
  auth: { token: localStorage.getItem('token') }
});

// Backend: Socket middleware (in server.js)
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
2. Notification Integration
// Chat notifications trigger app notifications
socket.on('chat_notification', (data) => {
  // Update notification bell count
  notificationContext.incrementUnreadCount();
  
  // Show toast notification
  toast.success(`New message from ${data.senderName}`);
});
3. Typing Indicators
// Frontend: Send typing events
const TypingIndicator = () => {
  const [isTyping, setIsTyping] = useState(false);
  
  useEffect(() => {
    if (isTyping) {
      ChatService.startTyping(conversationId);
      const timer = setTimeout(() => {
        ChatService.stopTyping(conversationId);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isTyping]);
};

// Backend: Broadcast typing events
socket.on('typing_start', (data) => {
  socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
    userId: socket.userId,
    userName: socket.userName,
    conversationId: data.conversationId
  });
});
🚀 DEPLOYMENT & CONFIGURATION
Environment Variables
# Frontend (.env)
VITE_API_URL=https://zakaria-rental-system.onrender.com
VITE_SOCKET_URL=wss://zakaria-rental-system.onrender.com

# Backend (.env)
NODE_ENV=production
SOCKET_PORT=3001
CORS_ORIGIN=https://your-frontend-url.com
Production Socket.io Configuration
// In server.js
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true
  },
  transports: ['websocket'], // WebSocket only for production
  pingTimeout: 60000,
  pingInterval: 25000
});
🐛 DEBUGGING & TROUBLESHOOTING
Common Issues & Solutions
1. Socket Connection Failing
// Check: Frontend connection
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  // Fallback to REST polling
});

// Check: Backend authentication
io.use((socket, next) => {
  console.log('Socket auth attempt:', socket.handshake.auth);
  next();
});
2. Messages Not Updating in Real-time

Verify user is in correct Socket.io rooms

Check conversation_${id} room membership

Verify event names match (new_message vs message_received)

3. Unread Counts Incorrect
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

📈 PERFORMANCE OPTIMIZATIONS
Implemented:

Lazy Loading: Chat components loaded on demand

Message Pagination: limit and offset for conversation lists

Socket Room Management: Users only in active conversation rooms

Database Indexes: On conversation_id, sender_id, created_at

Future Considerations:

Virtualized Message List: For conversations with 1000+ messages

Message Compression: For large file sharing

Read Receipt Batching: Batch updates instead of per-message

🗄️ DATABASE SCHEMA
Notification Table Structure
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- payment_success, announcement, etc.
    related_entity_type VARCHAR(50), -- rent_payment, complaint, salary_payment
    related_entity_id UUID, -- Links to payments/complaints/etc.
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_user_id (user_id),
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_created_at (created_at DESC),
    INDEX idx_type (type)
);

Relationships
user_id → users.id (many-to-one)

related_entity_id → Various tables based on related_entity_type
Database Queries for Debugging
-- Check user's notifications
SELECT * FROM notifications 
WHERE user_id = 'user-uuid' 
ORDER BY created_at DESC 
LIMIT 10;

-- Check unread counts
SELECT type, COUNT(*) as count, SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread
FROM notifications 
WHERE user_id = 'user-uuid'
GROUP BY type;

-- Check rate limiting issues
SELECT COUNT(*) as requests_last_minute
FROM api_logs 
WHERE user_id = 'user-uuid' 
  AND endpoint = 'getNotifications'
  AND timestamp > NOW() - INTERVAL '1 minute';
  