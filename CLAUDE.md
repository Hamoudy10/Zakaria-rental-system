# ZAKARIA RENTAL SYSTEM - PROJECT CONTEXT

## OVERVIEW
Full-stack rental management platform for Kenya with multi-role access (Admin/Agent/Tenant), M-Pesa payments, automated billing, SMS notifications, real-time chat, and expense tracking.

## DEPLOYMENT
- **Frontend:** React + Vite on Vercel (https://zakaria-rental-system.vercel.app)
- **Backend:** Express on Render (https://zakaria-rental-system.onrender.com)
- **Database:** PostgreSQL on Supabase
- **Storage:** Cloudinary (ID images, profile images, chat images)
- **Auth:** JWT (Header: `Authorization: Bearer <token>`)

## TECH STACK
| Layer | Technologies |
|-------|-------------|
| Frontend | React 18.2, React Router 6, Axios, Tailwind CSS, Socket.io-client, Lucide React |
| Backend | Express 4.22, PostgreSQL (pg), JWT, bcryptjs, Socket.io, node-cron |
| Exports | ExcelJS, jsPDF |

## CORE FEATURES
1. **Automated Billing:** Monthly billing (configurable day 1-28), SMS via Celcom
2. **Payment Allocation:** Arrears → Water → Rent → Advance (strict order)
3. **Agent Isolation:** Agents only see assigned properties via `agent_property_assignments` table
4. **M-Pesa Integration:** Phone format conversion (07xx → 2547xx)
5. **Real-time Chat:** Socket.io rooms per conversation, WhatsApp-style UI
6. **Expense Tracking:** Agent expense recording with admin approval workflow
7. **Notification System:** In-app notifications + SMS with polling

## KEY ENTITIES
- **users:** System users (admin/agent roles) with profile_image, is_online, last_seen
- **tenants:** Renters (separate from users table)
- **properties / property_units:** Buildings and units with image galleries
- **tenant_allocations:** Tenant↔Unit links with arrears tracking, updated_at column
- **rent_payments:** M-Pesa transactions with allocation splits
- **water_bills:** Monthly water charges (unique per tenant/month)
- **sms_queue:** SMS retry system
- **expenses:** Agent expense records with approval workflow
- **expense_categories:** Dynamic category list
- **notifications:** User notifications with read status
- **chat_conversations / chat_messages / chat_participants:** Chat system
- **complaints / complaint_steps:** Complaint management with resolution workflow
- **property_images:** Unified table for property and unit images (Option A architecture)

## CRITICAL PATTERNS

### API Response Format
```json
{ "success": boolean, "data": any, "message?": string }
```

### Phone Number Flow
- Input: `0712345678` → Storage: `254712345678` → Display: `0712345678`

### Unit Features
- Store as JSON Object `{}`, NOT Array `[]`

### Route Order (CRITICAL)
- Specific routes (`/balance/:id`) MUST come before generic (`/:id`)

### Boolean Coercion (CRITICAL)
- Always coerce: `is_active = is_active === true || is_active === 'true' || is_active === 1`

## FILE STRUCTURE
```
├── src/
│   ├── components/     # UI Components (TenantManagement, ChatModule, NotificationBell, etc.)
│   ├── context/        # AuthContext, PropertyContext, PaymentContext, ChatContext, NotificationContext
│   ├── services/       # api.jsx, ChatService.js
│   ├── pages/          # AdminDashboard, AgentDashboard, TenantDashboard
│   └── utils/          # pdfExport.js, excelExport.js
└── backend/
    ├── controllers/    # Business logic
    ├── routes/         # API endpoints
    ├── services/       # billingService, smsService, notificationService, allocationIntegrityService
    └── middleware/     # authMiddleware, uploadMiddleware (Cloudinary)
```

## CONVENTIONS
1. Database uses UUIDs, soft deletes (`is_active`)
2. All agent queries join `agent_property_assignments`
3. Controllers check role: Admin = all data, Agent = filtered
4. Notifications reference `users.id`, NOT `tenants.id`
5. tenant_allocations has `updated_at` column (added via migration)

## VERCEL DEPLOYMENT (Frontend)
```json
// vercel.json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }],
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

## CELCOM SMS INTEGRATION
- **Provider:** Celcom Africa
- **Method:** POST (JSON)
- **Endpoint:** https://isms.celcomafrica.com/api/services/sendsms/
- **Phone Format:** `2547XXXXXXXX`
- **Validation:** `response.data.responses[0]['response-code'] === 200`

---

# FEATURE MODULES

## 1. PROFILE IMAGE UPLOAD
- Drag & drop with Cloudinary storage
- Folder: `zakaria_rental/profile_images`
- File Validation: JPEG, PNG, WebP only, max 5MB
- API: `PUT /api/auth/profile` (multipart/form-data), `DELETE /api/auth/profile/image`

## 2. PDF & EXCEL EXPORT WITH COMPANY BRANDING
- Company logo from Cloudinary displayed on documents
- Company name, address, phone, email in header
- API: `GET /api/admin/company-info` (5-minute caching)
- Files: `src/utils/pdfExport.js`, `src/utils/excelExport.js`

## 3. COMPLAINT MANAGEMENT SYSTEM
- Multi-category complaints (JSONB storage)
- Step-based servicing workflow with progress tracking
- PDF export with company branding
- Tables: `complaints`, `complaint_steps`

## 4. ADMIN DASHBOARD (Comprehensive Stats)
- Endpoint: `GET /api/admin/dashboard/comprehensive-stats`
- Schema Notes:
  - `properties` table has NO `is_active` column
  - `complaints` uses `raised_at` (not `created_at`)
  - `tenant_allocations` uses `allocation_date` (not `created_at`)
  - `payment_status` enum: `pending`, `completed`, `failed`, `overdue` (no `processing`)

## 5. PROPERTY & UNIT IMAGE MANAGEMENT (Option A)
- Single `property_images` table for both property and unit images
- Differentiation: `unit_id = NULL` → property image, `unit_id = UUID` → unit image
- Cloudinary folders: `zakaria_rental/property_images/`, `zakaria_rental/unit_images/`

## 6. AGENT PROPERTY SHOWCASE
- Agents can access any property for showcasing (bypasses assignment checks)
- Endpoint: `GET /api/properties/showcase` (unassigned access for marketing)
- Route specificity: `/showcase/*` routes before `/:id` routes

## 7. EXPENSE TRACKING MODULE
- Categories: Maintenance, Repairs, Utilities, Security, Cleaning, Supplies, Professional Services, Insurance, Taxes, Marketing, Salaries, Transportation, Miscellaneous
- Approval workflow: pending → approved/rejected → reimbursed
- Stats endpoint returns `byStatus` array for ALL-TIME counts (tab badges) and `totals` for monthly

## 8. WHATSAPP-STYLE CHAT SYSTEM
- User-specific conversation isolation
- Features: Direct messaging, group chats, online status, typing indicators, read receipts, image messages
- Socket events: `new_message`, `user_typing`, `messages_read`, `user_online_status`
- Database: `chat_conversations`, `chat_messages`, `chat_participants`, `chat_message_reads`

## 9. NOTIFICATION SYSTEM
- Types: payment_success/failed/pending, tenant_created/allocated/deallocated, complaint_created/updated/resolved, water_bill_created, expense_created/approved/rejected, lease_expiring, rent_overdue, announcement, maintenance, emergency, system_alert, broadcast
- Polling with exponential backoff (30s - 5min)
- Scheduled jobs: 8AM (expiring leases), 10AM (overdue rent), 9AM billing day (monthly bills), every 5min (SMS queue)

## 10. TENANT ALLOCATION SYSTEM
- Soft delete pattern with `is_active` flag
- Auto-cleanup via `AllocationIntegrityService`
- Property count sync: Uses subquery for accurate `available_units` count
- `updated_at` column required (added via migration)

---

# RECENT UPDATES (Current Session)

## 1. TENANT ALLOCATION BUG FIX
**Problem:** Deallocation silently failed because code referenced `updated_at` column that didn't exist.

**Solution:**
- Added `updated_at` column to `tenant_allocations` table via SQL migration
- Added auto-update trigger for `updated_at`
- Fixed boolean coercion in `allocationController.js`
- Enhanced `allocationIntegrityService.js` with better auto-cleanup

**SQL Migration:**
```sql
ALTER TABLE tenant_allocations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE tenant_allocations SET updated_at = COALESCE(allocation_date, NOW()) WHERE updated_at IS NULL;
CREATE OR REPLACE FUNCTION update_tenant_allocations_timestamp() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trigger_update_tenant_allocations_timestamp BEFORE UPDATE ON tenant_allocations FOR EACH ROW EXECUTE FUNCTION update_tenant_allocations_timestamp();
```

## 2. EXPENSE STATS FIX
**Problem:** Expense stats showed 0 counts because `byStatus` query filtered by current month only.

**Solution:**
- `byStatus` now returns ALL-TIME counts (for tab badges)
- `totals` returns monthly totals (for cards)
- Added `allTimeTotals` for "All" tab count
- Updated both `AdminExpenseManagement.jsx` and `AgentExpenseManagement.jsx`

## 3. NOTIFICATION BELL COMPLETE REWRITE
**Problems:**
- Had duplicate state management (didn't use NotificationContext)
- Chat messages showed "New Message" instead of actual content
- Sender name showed "Unknown"
- Navigation to chat didn't work

**Solutions:**
- Uses NotificationContext as single source of truth
- Properly reads `conversation.participants` array to find other participant
- Correctly passes `currentUserId` to find the "other" participant
- Gets sender name: `otherParticipant.first_name + otherParticipant.last_name`
- Gets message from `conversation.last_message` (it's a string, not object)
- Click marks chat as read (calls `loadMessages` + `loadConversations`)
- Proper scrollable dropdown with flexbox layout
- Three tabs: All, System, Chat

## 4. CHAT MODULE NAVIGATION STATE HANDLING
**Added:** `useLocation` to handle incoming navigation state from NotificationBell
```javascript
useEffect(() => {
  const state = location.state;
  if (state?.conversationId && state?.conversation) {
    setActiveConversation(state.conversation);
    window.history.replaceState({}, document.title);
  }
}, [location.state, setActiveConversation, activeConversation?.id]);
```
## 11. WHATSAPP BUSINESS API INTEGRATION

### Overview
All SMS messages in the system are now also sent via WhatsApp (Meta Cloud API) in parallel. SMS always sends as the default/fallback. WhatsApp sends simultaneously if configured and recipient has WhatsApp.

### Architecture

### Provider
- **WhatsApp:** Meta Cloud API (WhatsApp Business Platform)
- **Free Tier:** 1,000 service conversations/month
- **Endpoint:** `https://graph.facebook.com/{version}/{phone_number_id}/messages`
- **Auth:** Bearer token in Authorization header

### New Files
| File | Purpose |
|------|---------|
| `backend/services/whatsappService.js` | WhatsApp Cloud API integration, template messaging, queue, retry |
| `backend/services/messagingService.js` | Unified wrapper — sends SMS + WhatsApp in parallel via `Promise.all` |

### Modified Files
| File | Change |
|------|--------|
| `backend/controllers/paymentController.js` | `sendPaybillSMSNotifications()`, `handleMpesaCallback()`, `sendBalanceReminders()` now use `MessagingService` |
| `backend/controllers/notificationController.js` | `sendBulkSMS()`, `sendTargetedSMS()` now use `MessagingService.sendRawMessage()` |
| `backend/services/cronService.js` | Monthly billing queues to both `sms_queue` + `whatsapp_queue`, queue processing runs both queues |

### Database Tables
| Table | Purpose |
|-------|---------|
| `whatsapp_queue` | Queue for WhatsApp messages with retry (max 3 attempts), status: pending/sent/failed/skipped |
| `whatsapp_notifications` | Log of all WhatsApp send attempts for tracking/statistics |

### WhatsApp Templates (11 Meta-approved templates)
| Template Name | Used For |
|--------------|----------|
| `rental_welcome` | New tenant welcome |
| `payment_confirmation` | Payment received |
| `payment_confirmation_detailed` | Payment with breakdown |
| `bill_notification` | Monthly bill |
| `balance_reminder` | Balance reminder |
| `admin_payment_alert` | Admin payment alert |
| `admin_payment_alert_detailed` | Admin detailed alert |
| `advance_payment` | Advance payment notice |
| `maintenance_update` | Maintenance update |
| `general_announcement` | Bulk/targeted messages |
| `monthly_bill_cron` | Cron monthly billing |

### Sending Strategy
- **Parallel:** SMS + WhatsApp sent simultaneously via `Promise.all`
- **SMS always sends** regardless of WhatsApp result
- **WhatsApp failure never blocks SMS**
- **Not on WhatsApp (error 131026):** Marked as `skipped`, SMS still delivers
- **WhatsApp not configured:** Cleanly skipped, SMS-only mode

### Environment Variables

### Provider
- **WhatsApp:** Meta Cloud API (WhatsApp Business Platform)
- **Free Tier:** 1,000 service conversations/month
- **Endpoint:** `https://graph.facebook.com/{version}/{phone_number_id}/messages`
- **Auth:** Bearer token in Authorization header

### New Files
| File | Purpose |
|------|---------|
| `backend/services/whatsappService.js` | WhatsApp Cloud API integration, template messaging, queue, retry |
| `backend/services/messagingService.js` | Unified wrapper — sends SMS + WhatsApp in parallel via `Promise.all` |

### Modified Files
| File | Change |
|------|--------|
| `backend/controllers/paymentController.js` | `sendPaybillSMSNotifications()`, `handleMpesaCallback()`, `sendBalanceReminders()` now use `MessagingService` |
| `backend/controllers/notificationController.js` | `sendBulkSMS()`, `sendTargetedSMS()` now use `MessagingService.sendRawMessage()` |
| `backend/services/cronService.js` | Monthly billing queues to both `sms_queue` + `whatsapp_queue`, queue processing runs both queues |

### Database Tables
| Table | Purpose |
|-------|---------|
| `whatsapp_queue` | Queue for WhatsApp messages with retry (max 3 attempts), status: pending/sent/failed/skipped |
| `whatsapp_notifications` | Log of all WhatsApp send attempts for tracking/statistics |

### WhatsApp Templates (11 Meta-approved templates)
| Template Name | Used For |
|--------------|----------|
| `rental_welcome` | New tenant welcome |
| `payment_confirmation` | Payment received |
| `payment_confirmation_detailed` | Payment with breakdown |
| `bill_notification` | Monthly bill |
| `balance_reminder` | Balance reminder |
| `admin_payment_alert` | Admin payment alert |
| `admin_payment_alert_detailed` | Admin detailed alert |
| `advance_payment` | Advance payment notice |
| `maintenance_update` | Maintenance update |
| `general_announcement` | Bulk/targeted messages |
| `monthly_bill_cron` | Cron monthly billing |

### Sending Strategy
- **Parallel:** SMS + WhatsApp sent simultaneously via `Promise.all`
- **SMS always sends** regardless of WhatsApp result
- **WhatsApp failure never blocks SMS**
- **Not on WhatsApp (error 131026):** Marked as `skipped`, SMS still delivers
- **WhatsApp not configured:** Cleanly skipped, SMS-only mode

### Environment Variables

## 12. PAYMENT STATEMENT MODAL EXPORTS (Frontend)

### Scope
- Added export actions directly inside the **Payment Statement** modal opened from Paid/Unpaid tenants tabs in `PaymentManagement`.
- Users can now export the currently viewed tenant statement as:
  - PDF
  - Excel

### Files Updated
| File | Change |
|------|--------|
| `src/components/PaymentManagement.jsx` | Added modal export buttons + handlers, export loading guard |
| `src/utils/pdfExport.js` | Added `tenant_statement` report type + `totalsOverride` support |
| `src/utils/excelExport.js` | Added `tenant_statement` report type + `totalsOverride` support |

### Export Content
- Statement rows include payment date, amount, reference code, payment month, method, status.
- Statement summary is exported via override totals:
  - Total Expected
  - Total Paid
  - Outstanding Balance
  - Payment Records

### Branding
- PDF/Excel exports continue using shared branding pipeline:
  - Company name, contacts, and logo from settings (`/api/admin/company-info`)
  - Existing cache behavior preserved (no breaking changes).

### UX Safeguards
- Export buttons are disabled while statement is loading or export is in progress.
- Empty history cannot be exported (user receives validation alert).

## 13. SESSION SUMMARY (2026-02-24)

- Hardened rent/payment logic and carry-forward handling in `paymentController.js` to avoid month over-allocation and to keep allocation behavior consistent.
- Added data-repair assets for overpaid months:
  - Procedure migration: `backend/migrations/002_add_fix_overpaid_month_carry_forward_procedure.sql`
  - Ops SQL script: `backend/scripts/sql/repair_overpaid_carry_forward.sql`
- Expanded reports pipeline for full exports (PDF/Excel) so exports use full dataset, not viewport/screenshot-like truncation.
- Fixed Excel runtime crash in reports (`ReferenceError: cell is not defined`) by correcting cell-style logic placement.
- Improved Agent Reports data quality:
  - Payment/Complaint date fallback mapping fixed (avoids `N/A` when valid timestamps exist).
  - Water-bill report columns expanded to show relevant details.
  - Water-bill listing for agents now includes assigned-property scope plus records created by the same agent.
- Dashboard payment alert integrity fixed:
  - `/agent-properties/my-tenants` returns usable due fields (`monthly_rent`, `rent_paid`, `balance_due`, `amount_due`, `due_date`, `payment_status`).
  - Agent pending-payment stats now use computed current-month rent balance instead of naive payment-row existence checks.
  - Frontend overview alert amount has safe fallback computation to prevent false `KSh 0` display.
