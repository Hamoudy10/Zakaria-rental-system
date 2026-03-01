# FRONTEND ARCHITECTURE - REACT/VITE

## TECH STACK
React 18.2 | Vite 4.5 | Tailwind CSS 3.3.6 | React Router 6 | Axios | Socket.io-client | Lucide React

## ARCHITECTURE PATTERN
```
Pages (route components) → Components (reusable UI) → Context (state) → Services (API)
```

## ROUTING STRUCTURE (App.jsx)
```
/login                    → Login (public)
/admin/*                  → AdminDashboard, notifications, profile, settings, agents, chat
/agent/*                  → AgentDashboard, notifications, profile, chat
/tenant/*                 → TenantDashboard, notifications, payments, profile
```

Chat routes: `/${user.role}/chat` (e.g., `/admin/chat`, `/agent/chat`)

## STATE MANAGEMENT (Context API)

### Key Contexts
| Context | Purpose |
|---------|---------|
| AuthContext | User auth, token, login/logout, user object with role |
| PropertyContext | Properties & units state |
| PaymentContext | Payments + pagination |
| ChatContext | Messages, conversations, socket, typing, online status |
| NotificationContext | Notifications with polling, unread count |
| AllocationContext | Tenant allocations, diagnostics, reconciliation |

### Context Patterns
```jsx
const { user, token } = useAuth();           // user.id, user.role, user.first_name
const { properties, fetchProperties } = useProperty();
const { payments, pagination } = usePayments();
const { conversations, setActiveConversation, loadMessages, getTotalUnreadCount } = useChat();
const { notifications, unreadCount, refreshNotifications, markAsRead } = useNotification();
```

## API INTEGRATION

### Axios Setup (src/services/api.jsx)
- Base URL from `VITE_API_URL` or Render deployment
- Auto JWT attachment via interceptors
- 120s timeout for M-Pesa
- Global 401 → auto logout (except auth endpoints)

### API Modules
```javascript
API.auth       // login, register, profile
API.properties // property & unit CRUD, images
API.payments   // rent & M-Pesa
API.allocations// tenant-unit links, diagnostics, reconciliation
API.tenants    // tenant CRUD, ID upload
API.expenses   // expense CRUD, stats, categories
API.notifications // notifications, SMS
API.chatAPI    // conversations, messages
notificationAPI // notifications (alternative export)
expenseAPI     // expenses (alternative export)
```

## KEY COMPONENTS

### NotificationBell.jsx
- Uses NotificationContext as single source of truth
- Three tabs: All, System, Chat
- Chat items from ChatContext.conversations
- Properly reads `conversation.participants` array for sender name
- `conversation.last_message` is a STRING (not object)
- Click marks as read (no navigation, calls loadMessages + loadConversations)
- Scrollable dropdown with flexbox layout

### ChatModule.jsx
- WhatsApp-style two-panel layout
- Handles incoming navigation state from NotificationBell
- Uses `useLocation` to read `location.state.conversation`
- Clears state after handling: `window.history.replaceState({}, document.title)`

### AdminExpenseManagement.jsx / AgentExpenseManagement.jsx
- Stats from `byStatus` array (ALL-TIME counts for tabs)
- Monthly totals from `stats.totals`
- Helper functions: `getStatusCount(status)`, `getStatusAmount(status)`

### TenantAllocation Components
- Uses `allocation.tenant_full_name` directly
- Uses AllocationContext for CRUD and diagnostics

## CRITICAL PATTERNS

### Data Fetching
```jsx
const fetchData = async () => {
  try {
    setLoading(true);
    const response = await API.endpoint.method();
    if (response.data.success) {
      setData(response.data.data);
    }
  } catch (error) {
    setError(error.response?.data?.message || 'Error');
  } finally {
    setLoading(false);
  }
};
```

### Response Handling
```javascript
// Standard pattern - access nested data
const items = response.data.data.payments;
const total = response.data.data.pagination?.totalCount || 0;
```

### Phone Display
```javascript
const displayPhone = (phone) => phone?.replace(/^254/, '0') || '';
```

### File Upload (Cloudinary)
```jsx
const formData = new FormData();
formData.append('id_front_image', file);
await API.tenants.uploadIDImages(tenantId, formData);
```

## CHAT CONTEXT DATA STRUCTURE

### Conversation Object
```javascript
{
  id: "uuid",
  conversation_type: "direct" | "group",
  title: null | "Group Name",
  display_name: "Other User Name",
  last_message: "actual message text",      // STRING, not object!
  last_message_at: "2026-02-04T03:41:41.080Z",
  unread_count: 1,
  participants: [
    { id: "uuid", first_name: "John", last_name: "Doe", profile_image: "url" },
    { id: "uuid", first_name: "Jane", last_name: "Smith", profile_image: null }
  ]
}
```

### Finding Other Participant
```javascript
const currentUserId = user?.id;
const otherParticipant = conversation.participants?.find(p => p.id !== currentUserId);
const senderName = otherParticipant 
  ? `${otherParticipant.first_name} ${otherParticipant.last_name}`.trim()
  : 'Unknown';
```

## NOTIFICATION CONTEXT

### Exported Values
```javascript
const {
  notifications,           // Array of notification objects
  loading,                 // Boolean loading state
  error,                   // Error message or null
  unreadCount,             // Number of unread notifications
  pagination,              // { currentPage, totalPages, totalCount, hasNext, hasPrev }
  fetchNotifications,      // Function to fetch notifications
  fetchUnreadCount,        // Function to fetch unread count
  refreshNotifications,    // Function to refresh both
  markAsRead,              // Function to mark single as read
  markAllAsRead,           // Function to mark all as read
  deleteNotification,      // Function to delete notification
  clearReadNotifications,  // Function to clear all read
  createBroadcastNotification, // Admin: send broadcast
  clearError               // Function to clear error state
} = useNotification();
```

### Notification Object
```javascript
{
  id: "uuid",
  user_id: "uuid",
  title: "Payment Received",
  message: "John paid KSh 15,000...",
  type: "payment_received",
  related_entity_type: "rent_payment",
  related_entity_id: "uuid",
  is_read: false,
  created_at: "2026-02-04T10:30:00Z"
}
```

## SOCKET.IO (Chat)
```javascript
const socket = io(API_BASE_URL, { 
  auth: { token: localStorage.getItem('token') },
  transports: ['websocket', 'polling']
});
socket.on('new_message', handleMessage);
socket.on('user_typing', handleTyping);
socket.on('user_online_status', handleOnlineStatus);
```

## RESPONSIVE DESIGN
```jsx
// Tailwind responsive classes
<div className="p-2 sm:p-4 md:p-6">
// Touch targets
<button className="min-h-[44px]">
// Mobile-first chat layout
<div className={`${activeConversation ? 'hidden md:flex' : 'flex'} ...`}>
```

## JSPDF-AUTOTABLE v5.x USAGE
```javascript
const jspdfModule = await import('jspdf');
const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
const autoTableModule = await import('jspdf-autotable');
const autoTable = autoTableModule.default;
const doc = new jsPDF('landscape', 'mm', 'a4');
autoTable(doc, { startY: 55, head: [[...]], body: [...] }); // doc as first arg
```

---

## 4. Frontend `claude.md` (`/src/claude.md`) — Add to the bottom

```markdown
## WHATSAPP INTEGRATION (Backend Only)

WhatsApp messaging is handled entirely on the backend. No frontend changes required.

### What Frontend Users See
- Bulk SMS and Targeted SMS endpoints now return additional fields in response:
  - `whatsapp_sent`: Number of successful WhatsApp deliveries
  - `whatsapp_failed`: Number of failed WhatsApp deliveries
- All existing SMS functionality continues to work unchanged
- Response format from `sendBulkSMS` and `sendTargetedSMS`:
```javascript
{
  success: true,
  message: "Messages sent to 5 of 5 tenants via SMS. 3 also received WhatsApp.",
  data: {
    total: 5,
    sent: 5,           // SMS sent count
    failed: 0,         // SMS failed count
    whatsapp_sent: 3,  // WhatsApp sent count
    whatsapp_failed: 0,// WhatsApp failed count
    errors: []
  }
}

Phase 1: Payment System Upgrade & M-Pesa Integration

    Backend Architecture Overhaul (Payment Module)
        Refactored paymentController.js:
            Removed STK Push (tenant-initiated payments) as tenants don't use the system.
            Implemented processPaybillPayment for recording M-Pesa Paybill transactions.
            Implemented recordManualPayment for cash/bank payments.
            Implemented handleMpesaCallback to process real-time payment notifications from Safaricom.
            Core Logic: Added trackRentPayment (allocation logic) and recordCarryForward (handling overpayments).
            Fix: Updated recordCarryForward to accept a transaction client (dbClient) to fix foreign key constraint errors during atomic transactions.
            Fix: Made mpesa_transaction_id nullable in the database to support manual payments.
            Fix: Added duplicate payment detection logic.

    Route & API Standardization
        Refactored paymentRoutes.js:
            Aligned route paths with frontend API calls (e.g., /mpesa/callback instead of /mpesa-callback).
            Secured debug routes (/debug-env) with admin authentication.
            Ensured correct middleware (protect, adminOnly) usage.
        Updated Frontend API (api.jsx):
            synced paymentAPI methods with backend routes (e.g., getDetailedHistory, getOverdueReminders).

    Database Updates
        Created payment_notifications table for logging SMS/WhatsApp alerts.
        Created salary_payments table for agent salary tracking.
        Adjusted rent_payments table constraints (nullable mpesa_transaction_id, fixed FK for original_payment_id).

    Testing & Verification (Sandbox)
        Conducted rigorous Postman testing:
            Connectivity: Verified health checks and M-Pesa config.
            Paybill: Confirmed successful payment processing.
            Duplicates: Verified duplicate receipt rejection (409 Conflict).
            Manual Payments: Confirmed successful recording.
            Overpayments: Verified carry-forward logic (allocating excess to future months).
            Callbacks: Simulated successful and failed M-Pesa callbacks; verified status updates.

Phase 2: Notification System (SMS & WhatsApp)

    Dual-Channel Messaging
        Implemented MessagingService to send notifications via SMS (Celcom) and WhatsApp (Meta Cloud API) in parallel.
        Configured retry logic for failed messages.

    Authentication Fixes
        Fixed server.js middleware ordering (CORS before body parsers) to resolve "req.body undefined" login errors.
        Addressed WhatsApp token expiration issue (identified need for permanent token).

Phase 3: Logic Clarification (Outstanding Balances & Lease Period)

    Lease Period Logic
        Lease Start/End: Used to determine validity of a tenant's stay.
        Billing Cycle: The system checks if the current date falls within the lease period. If yes, rent is expected.
        Rent Calculation:
            Due: monthly_rent from tenant_allocations.
            Paid: Sum of payments in rent_payments for the target month.
            Outstanding: Due - Paid.
        Arrears: Cumulative unpaid balance from previous months (stored in tenant_allocations.arrears_balance).
        Total Due: Rent (Current Month) + Arrears + Water Bill.

    Frontend Consistency (PaymentManagement.jsx)
        Logic Check: The frontend uses API.payments.getTenantPaymentStatus which aggregates data correctly:
            Calculates rent_due, water_due, arrears, and total_due.
            Handles advance_amount separately.
        Visuals:
            Unpaid Tab: Filters tenants where total_due > 0.
            Paid Tab: Filters tenants where total_due <= 0 OR rent_paid >= monthly_rent.
            Status Indicators: Shows "Paid" (Green) or "Unpaid" (Red) based on logic.

Current Status

    System State: Production-Ready (Code & Logic).
    Pending External Actions:
        Client to provide M-Pesa Business Portal Username.
        Go-Live: Apply for Daraja Go-Live using the Paybill number.
        Switch: Update Render environment variables to Production credentials.
        WhatsApp: Generate permanent token.

Your system is now robust, tested, and waiting only for live credentials to launch.

## RECENT SESSION SUMMARY (2026-02-24)

- Agent Reports export behavior improved for all tabs:
  - PDF/Excel exports now pull complete report data (no viewport/screenshot truncation).
  - Wide/long content is preserved across pages/columns.
- Fixed reports runtime error in production build:
  - `ReferenceError: cell is not defined` in Excel export utility.
- Corrected date rendering in reports:
  - Complaint and Payment report rows now resolve proper date fields before falling back to `N/A`.
- Improved Water Bill report UX/data:
  - Added fuller detail columns in report output.
  - Backend feed adjusted so valid historical water bills are visible under agent scope.
- Agent Dashboard overview payment alerts corrected:
  - Alert amount rendering now uses robust due fallback logic (`balance_due` -> `amount_due` -> `monthly_rent - rent_paid`).
  - Prevents false `KSh 0` alerts for unpaid tenants.

## RECENT FRONTEND SUMMARY (2026-02-26)

### 1) Input/Search Icon UX Cleanup
- Goal: prevent icon overlap with typed text by moving field icons to the right.
- Pattern applied:
  - icon classes switched from left positioning to right positioning
  - input paddings switched from `pl-10 pr-4` to right-icon-friendly variants (e.g. `pl-4 pr-10`)
  - added `pointer-events-none` on icons where needed.

### 2) Components Updated
- `src/components/PropertyManagement.jsx` (search field)
- `src/components/UnitManagement.jsx` (modal money fields)
- `src/components/PaymentManagement.jsx` (search field)
- `src/components/ComplaintManagement.jsx` (search field)
- `src/components/AgentReports.jsx` (search field)
- `src/components/UserManagement.jsx` (modal form field icons incl password field)
- `src/components/NotificationManagement.jsx` (tenant + history searches)
- `src/components/AdminTenantBrowser.jsx` (search field)

### 3) Modal Positioning/Scroll Usability Improvements
- Updated major management modals to use fixed overlays with scroll-safe wrappers (`overflow-y-auto`) so dialogs stay centered/usable even when the parent layout is scrolled.
- Applied in:
  - `src/components/PaymentManagement.jsx`
  - `src/components/ComplaintManagement.jsx`

### 4) System Settings UI Enhancements for Messaging Templates
- File: `src/components/SystemSettings.jsx`
- Added editable field support for:
  - `whatsapp_billing_template_name`
  - `whatsapp_billing_fallback_template`
- Existing `sms_billing_template` editor retained; all billing template fields are now manageable via System Settings UI.

### 5) QA/Operations Guidance Delivered
- Guided step-by-step Postman usage for beginners:
  - environments, variable saving, pre/post-request scripts, token switching.
- Helped run and interpret CRUD + RBAC verification for core modules.

## RECENT FRONTEND SUMMARY (2026-02-27)

### 1) Payment Statement UX Enhancement
- In tenant payment history modal (`PaymentManagement`), added a new metric card:
  - `Current Month Expected`
- File:
  - `src/components/PaymentManagement.jsx`

### 2) Tenant Agreement Upload in Tenant Management
- Added agreement upload section in tenant form:
  - accepts `PDF/DOC/DOCX`
  - supports multi-file selection
  - uploads after tenant create/update
- Added agreement list in tenant details modal with direct download links.
- File:
  - `src/components/TenantManagement.jsx`

### 3) Tenant Hub Visibility for Agreement Files
- Added “Agreement Files” section inside tenant detail modal.
- Documents are shown with type/size and downloadable links.
- File:
  - `src/components/TenantHub.jsx`

### 4) Frontend API Additions
- Added tenant agreement endpoints in API client:
  - `uploadTenantAgreement(id, formData)`
  - `getTenantAgreements(id)`
  - `deleteTenantAgreement(id, documentId)`
- File:
  - `src/services/api.jsx`

### 5) Build Status
- Frontend production build passed after these updates.

---

## RECENT FRONTEND SUMMARY (2026-03-01)
- Payment Management manual posting UX improved:
  - tenant list prefetch on modal open,
  - tenant selection always visible/editable,
  - stronger submit validation (`tenant_id`, `unit_id`, amount > 0, `payment_month`).
- Tenant Allocation now supports multi-unit tenants:
  - status shows allocation count,
  - allocated tenants can add another unit,
  - deallocate opens a picker modal to deactivate a specific unit/allocation.
- Tenant Management now clearly communicates duplicate identity behavior (existing profile reused for new unit allocation).
