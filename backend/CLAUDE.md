# BACKEND ARCHITECTURE - EXPRESS/NODE.JS

## TECH STACK
Express 4.22 | PostgreSQL (pg pool) | JWT | bcryptjs | Socket.io | node-cron | Cloudinary | multer-storage-cloudinary

## ARCHITECTURE
```
Routes → Middleware → Controllers → Services → Database (pg pool)
```

## AUTHENTICATION

### Middleware Pattern
```javascript
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
router.get('/admin-only', authMiddleware, requireAdmin, handler);
router.get('/agent-or-admin', authMiddleware, requireRole(['agent', 'admin']), handler);
```

### JWT Flow
1. Extract from `Authorization: Bearer <token>`
2. Verify with `jsonwebtoken.verify()`
3. Attach `req.user = { id, role, first_name, last_name, ... }`

## CONTROLLER PATTERN
```javascript
const handler = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Business logic
    await client.query('COMMIT');
    res.json({ success: true, data: result, message: 'Done' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
};
```

## AGENT DATA ISOLATION

### Pattern (All Agent Queries)
```sql
WHERE property_id IN (
  SELECT property_id FROM agent_property_assignments 
  WHERE agent_id = $1 AND is_active = true
)
```

### Admin-Aware Endpoints
```javascript
if (req.user.role === 'admin') {
  // Skip agent filter, return all data
} else {
  // Apply agent_property_assignments filter
}
```

## KEY SERVICES

### billingService.js
- `calculateTenantBill()`: Rent + Water + Arrears
- `allocatePayment()`: Arrears → Water → Rent → Advance
- `generateMonthlyBills()`: Bulk billing

### notificationService.js
- `createNotification()`: Single user notification
- `createBulkNotifications()`: Multiple users
- `createPaymentNotification()`: Payment success with allocations
- `createComplaintNotification()`: Complaint events
- `createExpenseNotification()`: Expense events

### allocationIntegrityService.js
- `getDiagnostics()`: Find data inconsistencies
- `autoResolveTenantConflicts()`: Clean up stale allocations
- `reconcileAllocations()`: Full system reconciliation
- `forceDeactivateAllocation()`: Emergency cleanup

### cronService.js
- Monthly billing (configurable day, default 28th at 9:00 AM)
- SMS queue processing with rate limiting
- Lease expiry checks (8:00 AM daily)
- Overdue rent checks (10:00 AM daily)

### smsService.js
- Celcom SMS provider integration
- Queue-based retry (max 3 attempts)
- Phone format: `2547XXXXXXXX`

## CLOUDINARY UPLOAD

### Middleware (uploadMiddleware.js)
```javascript
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'zakaria_rental/id_images' }
});
// Returns file.path = Cloudinary URL
```

## PAYMENT ALLOCATION LOGIC
```javascript
const allocatePayment = (amount, arrearsDue, waterDue, rentDue) => {
  let remaining = amount;
  const allocation = { arrears: 0, water: 0, rent: 0, advance: 0 };
  
  allocation.arrears = Math.min(remaining, arrearsDue);
  remaining -= allocation.arrears;
  
  allocation.water = Math.min(remaining, waterDue);
  remaining -= allocation.water;
  
  allocation.rent = Math.min(remaining, rentDue);
  remaining -= allocation.rent;
  
  allocation.advance = remaining;
  return allocation;
};
```

## ROUTE ORDER (CRITICAL)
```javascript
// ✅ CORRECT - specific before generic
router.get('/stats', getStats);           // Static routes first
router.get('/balance/:tenantId', getBalance);
router.get('/:id', getById);              // Parameterized routes last

// ❌ WRONG - generic catches all
router.get('/:id', getById);
router.get('/stats', getStats);           // Never reached!
```

## BOOLEAN COERCION (CRITICAL)
```javascript
// In updateAllocation controller
if (is_active !== undefined) {
  // Coerce to boolean - handles string "false", boolean false, number 0
  is_active = is_active === true || is_active === 'true' || is_active === 1;
}
```

## KEY ROUTES

### Allocations
| Route | Purpose |
|-------|---------|
| GET /allocations | Get all allocations |
| POST /allocations | Create allocation |
| PUT /allocations/:id | Update allocation (with boolean coercion) |
| DELETE /allocations/:id | Delete allocation |
| GET /allocations/maintenance/diagnostics | Run diagnostics |
| POST /allocations/maintenance/reconcile | Reconcile all |

### Expenses
| Route | Purpose |
|-------|---------|
| GET /expenses/categories | Get categories |
| GET /expenses | Get expenses (agent isolation) |
| GET /expenses/stats | Get stats (byStatus = ALL-TIME, totals = monthly) |
| POST /expenses | Create expense |
| PATCH /expenses/:id/status | Approve/reject (admin) |
| POST /expenses/bulk-approve | Bulk approve (admin) |
| GET /expenses/reports/net-profit | Net profit report |

### Notifications
| Route | Purpose |
|-------|---------|
| GET /notifications | Get user notifications |
| GET /notifications/unread-count | Get unread count |
| PUT /notifications/:id/read | Mark as read |
| PUT /notifications/read-all | Mark all as read |
| POST /notifications/broadcast | Create broadcast (admin) |
| POST /notifications/bulk-sms | Send bulk SMS |
| POST /notifications/targeted-sms | Send targeted SMS |
| GET /notifications/sms-history | Get SMS history |

### Properties
| Route | Purpose |
|-------|---------|
| GET /properties/showcase/list | List all for showcase (no assignment check) |
| GET /properties/showcase/:id | Get showcase details |
| POST /properties/:id/images | Upload property images |
| POST /units/:id/images | Upload unit images |

## EXPENSE STATS ENDPOINT FIX
```javascript
// byStatus query - NO date filter (ALL-TIME for tab counts)
const allTimeStatusQuery = `
  SELECT status, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
  FROM expenses
  WHERE 1=1 ${propertyFilter} ${agentFilter}
  GROUP BY status
`;

// totals query - WITH date filter (monthly for cards)
const monthlyQuery = `
  SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
  FROM expenses
  WHERE 1=1 ${dateFilter} ${propertyFilter} ${agentFilter}
`;
```

## ALLOCATION CONTROLLER FIXES
```javascript
// 1. Boolean coercion
if (is_active !== undefined) {
  is_active = is_active === true || is_active === 'true' || is_active === 1;
}

// 2. Accurate property count (use subquery, not increment/decrement)
await client.query(`
  UPDATE properties 
  SET available_units = (
    SELECT COUNT(*) FROM property_units 
    WHERE property_id = properties.id AND is_active = true AND is_occupied = false
  )
  WHERE id = $1
`, [property_id]);

// 3. Auto-cleanup stale allocations
const cleanupResult = await AllocationIntegrityService.autoResolveTenantConflicts(client, tenant_id);
```

## ERROR HANDLING
```javascript
// HTTP Status Codes
200 // Success
201 // Created
400 // Bad request / validation
401 // Unauthorized
403 // Forbidden (role)
404 // Not found
429 // Rate limited
500 // Server error

// Response Format
{ success: false, message: 'Human-readable error' }
```

## ENVIRONMENT VARIABLES
```
DATABASE_URL, JWT_SECRET, FRONTEND_URL
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
SMS_API_KEY, SMS_PARTNER_ID, SMS_SENDER_ID, SMS_BASE_URL
```

## CORS CONFIGURATION
```javascript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://zakaria-rental-system.vercel.app',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## SOCKET.IO EVENTS
| Event | Direction | Purpose |
|-------|-----------|---------|
| `connection` | Receive | User connected - join rooms, set online |
| `disconnect` | Receive | User disconnected - set offline |
| `new_message` | Emit | Broadcast new message to room |
| `user_typing` | Emit | Notify typing in conversation |
| `typing_stop` | Emit | Notify stop typing |
| `user_online_status` | Emit | Broadcast online/offline change |
| `messages_read_receipt` | Emit | Notify sender of read status |

---

## 2. Backend `claude.md` (`/backend/claude.md`) — Add to the bottom

```markdown
## WHATSAPP SERVICE (Meta Cloud API)

### whatsappService.js
- Singleton class mirroring `smsService.js` method signatures
- Uses Meta Cloud API template messages
- 11 template methods matching every SMS message type
- Queue system: `queueMessage()`, `queueForRetry()`, `processQueue()`
- Logging to `whatsapp_notifications` table
- Error handling for Meta-specific codes:
  - `131026`: Recipient not on WhatsApp → marked as `skipped`
  - `131047`: Template required (24h window)
  - `131048`: Rate limited
  - `132000`: Template not found
  - `132001`: Parameter count mismatch
- Webhook support: `processWebhook()` for delivery status updates
- Rate limit: 300ms between queued messages

### messagingService.js
- Unified entry point for all messaging (SMS + WhatsApp)
- `sendParallel(smsFn, whatsappFn)` — core engine using `Promise.all`
- Same method signatures as `smsService.js` — drop-in replacement
- Methods: `sendWelcomeMessage`, `sendPaymentConfirmation`, `sendEnhancedPaymentConfirmation`, `sendBillNotification`, `sendBalanceReminder`, `sendAdminAlert`, `sendAdminPaymentAlert`, `sendAdvancePaymentNotification`, `sendMaintenanceUpdate`, `sendAnnouncement`, `sendRawMessage`
- Queue methods: `queueBillMessage()` (queues to both tables), `processQueues()` (processes both queues)
- Statistics: `getStatistics()`, `getServiceStatus()` (combined from both channels)
- `isWhatsAppAvailable(phone)` — checks local records for previously skipped numbers

### Modified Controllers
- **paymentController.js**: `sendPaybillSMSNotifications()`, `handleMpesaCallback()`, `sendBalanceReminders()` use `MessagingService` instead of direct `SMSService`
- **notificationController.js**: `sendBulkSMS()`, `sendTargetedSMS()` use `MessagingService.sendRawMessage()`, response includes `whatsapp_sent` and `whatsapp_failed` counts
- **cronService.js**: `sendMonthlyBills()` queues to both `sms_queue` + `whatsapp_queue`, cron processes both queues via `MessagingService.processQueues()`

### Environment Variables
```

## RECENT UPDATES (2026-02-24)

### Payment Logic Hardening (`paymentController.js`)
- `trackRentPayment()` now prevents over-allocation when target month is already full:
  - `remainingForTargetMonth` is clamped to `>= 0`
  - overflow always goes to `carryForwardAmount`
- Added strict validation for invalid rent/payment inputs (`NaN`, `<= 0`).
- `recordCarryForward()` safety improved:
  - max future month guard runs before loop body `continue` paths
  - logs unallocated remainder if safety limit is reached.
- Tenant/unit scoping fixes:
  - `getPaymentStatusByUnitCode()` aggregates now filter by both `unit_id` and `tenant_id`.
  - `sendBalanceReminders()` rent sum join now includes tenant match (`ta.tenant_id = rp.tenant_id`).
  - `getTenantPaymentStatus()` water-paid aggregation now includes `unit_id`.
- Tenant status due calculation now applies advance credit:
  - `gross_due = rent_due + water_due + arrears`
  - `advance_applied = min(advance_amount, gross_due)`
  - `total_due = max(0, gross_due - advance_applied)`

### Agent Reports Messaging Coverage (`notificationController.js`)
- `getMessagingHistory()` now returns a unified feed from:
  - `sms_queue` + `whatsapp_queue` (manual/queued sends)
  - `sms_notifications` + `whatsapp_notifications` (automatic/system sends)
- Agent visibility model:
  - sees own `agent_id` sends
  - plus system messages to tenant phones in agent-assigned properties.
- Added source metadata in response rows:
  - `source = 'queue' | 'notification'`
  - system rows expose `sent_by_name = 'System (Auto)'`.
- Added runtime table checks using `to_regclass(...)` so endpoint still works if notification tables are missing.

### Data Repair Assets Added
- Migration: `backend/migrations/002_add_fix_overpaid_month_carry_forward_procedure.sql`
- Ops script: `backend/scripts/sql/repair_overpaid_carry_forward.sql`
- Purpose: repair historical month over-allocation by moving overflow to future advance months.

### Operational Guidance
- For messaging report issues, start with `GET /api/notifications/sms-history`.
- For historical rent anomalies, run the procedure `fix_overpaid_month_carry_forward(...)` inside a transaction and verify by month totals afterward.
