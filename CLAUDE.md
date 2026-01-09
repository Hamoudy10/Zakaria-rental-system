# Zakaria Rental Management System - Project Memory

## 🏠 PROJECT OVERVIEW
A full-stack rental property management platform for Kenyan markets with multi-role access (Admin, Agent, Tenant), M-Pesa payment integration, real-time chat, and comprehensive property/tenant management. Built with a React Vite frontend and Node.js/Express backend.

## 🚀 DEPLOYMENT & ENVIRONMENT
- Frontend: React Vite app (localhost during development) - http://localhost:5173
- Backend: Deployed on Render at https://zakaria-rental-system.onrender.com
- Database: PostgreSQL on Supabase
- Frontend Configuration: VITE_API_URL in .env
- Backend API: /api prefix on all endpoints

## 🛠 TECH STACK
Frontend (React Vite):
- React 18.2 with functional components & hooks
- React Router DOM v6.20 for routing
- Axios 1.12 with interceptors for API calls
- Tailwind CSS 3.3.6 with mobile-first responsive design
- Context API for state management (no Redux)
- Socket.io-client 4.8 for real-time features
- Lucide React 0.562 for icons
- ExcelJS 4.4 & jsPDF 3.0 for report generation

Backend (Node.js/Express):
- Express 4.22 with MVC architecture
- PostgreSQL via pg 8.11 driver
- JWT Authentication with jsonwebtoken 9.0
- bcryptjs 2.4 for password hashing
- Socket.io 4.8 for real-time communication
- Moment 2.30 for date handling
- Helmet 7.1 & CORS for security
- Nodemon for development

## 📁 PROJECT STRUCTURE
abdallah-rental-system/
├── src/ (React frontend)
│   ├── auth/ (Authentication utilities)
│   ├── components/ (Reusable React components)
│   ├── context/ (React Context providers)
│   ├── pages/ (Page components - dashboards)
│   └── services/ (API service layer - axios config)
├── backend/ (Node.js/Express backend)
│   ├── config/ (DB configuration)
│   ├── controllers/ (Route controllers - business logic)
│   ├── middleware/ (Express middleware - auth, validation)
│   ├── routes/ (API route definitions)
│   ├── services/ (Business logic services)
│   └── migrations/ (Database migrations)
└── CLAUDE.md (Project memory)

## 🎯 NEW CORE FUNCTIONALITY
Automated Billing System:
1. Monthly Billing Automation: Runs on configurable date (default: 28th monthly)
2. SMS Notifications: Sends bill breakdown (rent + water + arrears) to tenants
3. Payment Allocation: Automatic split between rent/water/arrears
4. Arrears Tracking: Carries forward unpaid amounts to next month
5. Advance Payment Detection: Skips SMS for tenants with advance payments

New Services:
- Cron Service: Automated scheduling for monthly billing
- Billing Service: Calculates rent + water + arrears + totals
- Enhanced SMS Service: Professional templates with breakdowns
- Admin Settings System: Configurable billing day, paybill number, SMS templates

Admin Dashboard Updates:
- Billing Settings Page: Configure paybill, billing day, SMS templates
- Billing History: View past billing runs and success/failure rates
- Failed SMS Management: Retry failed notifications manually

## 🔐 AUTHENTICATION & ROLES
Three-tier role system:
1. ADMIN: Full system access, user management, reports, system settings, property and unit management, payment management
2. AGENT: Payment tracking, complaint handling, water bill processing, notification sending, reports (later implementation)

Auth Flow:
- JWT tokens stored in localStorage
- Auto-attached to requests via Axios interceptors
- Token refresh handled via /auth/refresh endpoint
- Automatic logout on 401 responses

## 💰 PAYMENT INTEGRATION
M-Pesa Integration:
- Phone number formatting: 0XXXXXXXXX → 254XXXXXXXXX
- Transaction references: RENT_TIMESTAMP_RANDOM
- Paybill number configured via admin settings
- Payment status tracking via mpesa_transactions table
- Salary payments to agents via same M-Pesa integration

## 📱 KEY FRONTEND PATTERNS
1. API Calls: Use services from src/services/api.jsx (e.g., API.auth.login())
2. State Management: Context providers in src/context/ with useContext hooks
3. Error Handling: Global error handler in api.jsx with 401 auto-logout
4. Loading States: Skeleton loaders for async operations
5. Form Handling: Controlled components with local state

## 🗄️ DATABASE KEY RELATIONSHIPS
- Users → Properties (created_by)
- Properties → Property_Units (one-to-many)
- Tenants → Tenant_Allocations → Property_Units
- Rent_Payments → Tenants + Property_Units
- Complaints → Tenants + Agents (assigned_to)

## 🌟 CORE BUSINESS FUNCTIONALITY
Automated Billing System:
- End-of-month bill generation (28th of each month)
- SMS notifications with rent/water/arrears breakdown
- Payment allocation: arrears → water → rent → advance
- Skip logic for tenants with advance payments

SMS Integration:
- Celcom SMS provider (replaceable)
- Queue-based sending with retry logic
- Template system for different message types
- Agent fallback for failed automation

Payment Tracking:
- Arrears accumulation across months
- Payment splitting between rent/water/arrears
- Advance payment detection and handling
- Balance tracking with carry-forward

## 🚨 IMPORTANT CONVENTIONS
1. API Responses: Always follow { success: boolean, data: any, message?: string }
2. Error Handling: Controllers use try-catch with specific error messages
3. Database Transactions: Use BEGIN/COMMIT/ROLLBACK for multi-step operations
4. Phone Numbers: Store and display in Kenyan format, convert for M-Pesa
5. File Uploads: Images stored as URLs, references in property_images table

## 🔄 DEVELOPMENT WORKFLOW
1. Backend First: API endpoints must exist before frontend integration
2. Environment Variables: Required for both frontend (VITE_*) and backend
3. Database Changes: Create migration files, never modify production directly
4. Testing: Test M-Pesa with mock endpoints in development

## 📝 HOW TO USE THIS MEMORY SYSTEM
1. When asking for help, COPY RELEVANT SECTIONS from CLAUDE.md files
2. For component work, reference src/CLAUDE.md patterns
3. For API work, reference backend/CLAUDE.md conventions
4. Update files when making architectural changes

## 📋 FILES CREATED/UPDATED SO FAR
Created Files:
- Database Migration: /backend/migrations/001_add_arrears_and_billing_fields.sql
- Billing Service: /backend/services/billingService.js
- Enhanced SMS Methods: Added to /backend/services/smsService.js

Planned Files:
- Cron Service: /backend/services/cronService.js
- Admin Settings Controller: /backend/controllers/adminController.js
- Agent Billing Interface: /src/components/AgentBillingManagement.jsx
- Enhanced Payment Controller: Updates to /backend/controllers/paymentController.js

## ⚠️ CURRENT FOCUS
Important: Backend implementation for payment controller, cron services, and new database table has only been done on the front end. Currently we need to finish the frontend to test how this new update is working. Focus should be on UI/UX design for:

1. Agent Dashboard to handle:
   - Manual SMS sending
   - Water bill management

2. Admin Settings to input:
   - Date for automatic SMS sending
   - Other settings as per requirements

Check other CLAUDE.md files for clarification on specific requirements.

CURRENT ISSUES AND RESOLUTIONS SECTION:
===================================================================================
Issues Fixed:
Fixed Route Loading Error: Resolved Route.get() requires a callback function but got [object Undefined] error in adminRoutes.js

Fixed Authentication Issues:

Added adminOnly alias in auth middleware

Fixed axios token interceptor in api.jsx

Updated AdminDashboard.jsx to use configured axios instance instead of fetch()

Fixed SystemSettings UI/UX:

Consolidated 5 tabs to 4 logical tabs

Eliminated duplicate settings display

Added Admin Profile management

Added placeholder Appearance tab

Changes Made:
Updated SystemSettingsContext.jsx:

Fixed getSettingsByCategory() to properly categorize settings

Removed duplicate entries

Grouped settings logically

Updated SystemSettings.jsx:

Changed from 5 tabs to 4: Billing & Payments, M-Pesa Integration, Admin Profile, Appearance

Added profile editing functionality

Fixed field duplication issues

Updated api.jsx:

Added proper axios request interceptor to attach tokens from localStorage

Fixed token handling for dashboard API calls

Updated AdminDashboard.jsx:

Switched from fetch() to configured api instance for API calls

Fixed authentication token attachment issue

=============================================================================
UPDATES.1.0
✅ MILESTONE 1 COMPLETED: Billing Settings Integration
Changes Made:
1. Updated src/services/api.jsx:
✅ Fixed settings API endpoints: Changed from /admin-settings to /admin/settings to match backend

✅ Added billing API section: New endpoints for /cron/trigger-billing, /cron/history, /cron/failed-sms

✅ Updated main API export: Added billing: billingAPI to API object

2. Updated src/context/SystemSettingsContext.jsx:
✅ Removed mock data: Now uses real API calls instead of simulated responses

✅ Fixed error handling: Properly extracts error messages from backend responses

✅ Added billing category: Updated getSettingsByCategory() to include billing settings

✅ Fixed state updates: Properly updates local state after API calls

✅ Added auto-refresh: Settings refresh after resetting to defaults

3. Updated src/components/SystemSettings.jsx:
✅ Added billing tab: New tab for billing settings (default active tab)

✅ Enhanced field renderers: Added specialized inputs for:

billing_day: Select dropdown (1-28)

paybill_number: Digit-only input with validation

late_fee_percentage: Number input (0-50%)

grace_period_days: Number input (0-30)

auto_billing_enabled: Checkbox

sms_billing_template: Textarea with variable hints

mpesa_secret_fields: Password inputs with show/hide toggle

✅ Improved UI/UX: Better layout, hover states, validation hints

✅ Added visual feedback: Save status indicators, loading states

✅ Enhanced mobile responsiveness: Better layout on small screens

Backend Integration:
✅ API endpoints: Frontend now correctly calls /api/admin/settings/* endpoints

✅ Data structure: Frontend expects { key, value, description, updated_at } format

✅ Validation: Frontend validation matches backend validation rules

✅ Error handling: Properly displays backend validation errors

Testing Instructions:
Navigate to Admin Dashboard → Settings tab

Verify billing tab is present and active by default

Test each setting field:

Change billing day (1-28)

Enter paybill number (5-10 digits)

Adjust late fee percentage (0-50%)

Modify SMS template

Click "Save changes" - Should show success message

Test "Reset to defaults" - Should reset all billing settings

Next Steps (MILESTONE 2):
Create Agent Billing Management interface

Add billing history dashboard

Implement manual SMS retry functionality

Add cron job trigger button for admin testing

Files Modified:
src/services/api.jsx - Fixed endpoints, added billing API

src/context/SystemSettingsContext.jsx - Removed mocks, added real API calls

src/components/SystemSettings.jsx - Added billing tab and field renderers

Key Features Now Available:
Billing Day Configuration: Set automated billing date (1-28)

Paybill Number: Configure business paybill for SMS instructions

Late Fee Settings: Set late fee percentage and grace period

SMS Template Management: Customize billing notification messages

Auto-Billing Toggle: Enable/disable monthly automated billing

M-Pesa Configuration: Configure paybill and API credentials

Status: ✅ MILESTONE 1 COMPLETED - Admin can now configure billing settings via UI
Next: Ready to proceed with MILESTONE 2: Agent Billing Management interface

=======================================================================================
UPDATE.2.0
=======================================================================================
# UPDATES TO CLAUDE.MD - TENANT MANAGEMENT & AGENT DATA ISOLATION

## 🔄 BACKEND UPDATES - tenantController.js

### IMPLEMENTED AGENT DATA ISOLATION
All tenant management operations now respect agent property assignments:

**Data Access Rules:**
- Agents can ONLY see/manage tenants from properties they're assigned to
- Agents can see ALL tenants in their assigned properties (even if created by others)
- Agents can create tenants in their assigned properties only
- Agents can update/delete ANY tenant in their assigned properties
- Admin users maintain full system access (no changes to admin functionality)

**Updated Functions:**

1. `getTenants()`
   - **Agent**: Filters by `agent_property_assignments` table join
   - **Admin**: No change - sees all tenants
   - **Query Logic**: 
     ```sql
     -- For agents only:
     INNER JOIN agent_property_assignments apa ON p.id = apa.property_id
     WHERE apa.agent_id = $1 AND apa.is_active = true
     ```

2. `getTenant()`
   - **Agent**: Checks if tenant belongs to agent-assigned property via EXISTS subquery
   - **Admin**: No change
   - **Error Message**: "Tenant not found or not accessible" for agents

3. `createTenant()`
   - **Agent**: Validates unit assignment belongs to their assigned property
   - **Admin**: No change
   - **Validation**: Unit must be in agent's assigned properties via `agent_property_assignments`

4. `updateTenant()`
   - **Agent**: Checks property assignment before allowing update
   - **Admin**: No change
   - **Transaction**: Uses BEGIN/COMMIT/ROLLBACK for data integrity

5. `deleteTenant()`
   - **Agent**: Validates property assignment before deletion
   - **Admin**: No change
   - **Error Handling**: Proper 403 vs 404 status codes based on role

6. `getAvailableUnits()`
   - **Agent**: Only shows units from assigned properties
   - **Admin**: Shows all available units
   - **Query**: Uses EXISTS clause with `agent_property_assignments`

**Security Implementation:**
- All agent checks use `req.user.role === 'agent'` conditionals
- Agent property validation via `agent_property_assignments.is_active = true`
- Proper 403 Forbidden responses when agents access unauthorized data
- Maintains all existing validation (duplicate national_id, phone_number, etc.)

**Database Integration:**
- Relies on existing `agent_property_assignments` table structure
- Uses `agent_id`, `property_id`, `is_active` columns
- Maintains referential integrity with existing foreign keys

## 🐛 ISSUES RESOLVED

### FROM PREVIOUS LOGS:
1. **404 API Error**: `/api/properties` - Agents need separate endpoint for assigned properties
2. **Auth Token Issue**: `Auth token present: false` - Fixed axios interceptors in api.jsx
3. **React TypeError**: `can't convert item to string` - Fixed React key usage in components
4. **Data Isolation**: Agents were seeing all tenants instead of only assigned properties

### NEW BACKEND ENDPOINTS NEEDED:
(To be implemented in propertyController.js)

=========================================================================
UPDATE 3.0
=========================================================================
# CLAUDE.MD UPDATES - AGENT PROPERTY ACCESS & ERROR RESOLUTIONS

## 🔄 BACKEND UPDATES - Property Routes & Controller Fixes

### FIXED SQL COLUMN ERROR IN PROPERTY ROUTES
**Issue**: `column p.is_active does not exist` causing 500 Internal Server Error
**Root Cause**: The `properties` table doesn't have an `is_active` column (unlike other tables)
**Files Modified**: `/backend/routes/propertyRoutes.js`

**Changes Made:**
1. **Removed all references to `p.is_active`** from SQL queries
2. **Kept only `apa.is_active`** (agent_property_assignments table)
3. **Updated all agent property queries** to only filter by agent assignments

**Before (Error):**
```sql
WHERE apa.agent_id = $1 
  AND apa.is_active = true 
  AND p.is_active = true  // ERROR: column doesnt exist
=====================================================================================
  UPDATE 4.0
  ==================================================================================
  ## 🚀 NEW FEATURES ADDED

### Tenant Management for Agent Dashboard
- **Component**: /src/components/TenantManagement.jsx
- **Features**: CRUD operations, unit allocation, ID image upload, search & pagination
- **Backend**: Updated routes/tenants.js to use tenantController.js with dedicated tenants table
- **API**: Added tenantAPI in /src/services/api.jsx
- **Database**: Uses dedicated tenants table with ID image support

## 🔧 RESOLVED ISSUES
1. Fixed 404 error on /api/properties/:id/units - Removed unnecessary property unit fetching
2. Fixed React TypeError with proper error boundaries
3. Unified backend to use tenantController.js (dedicated tenants table)
---
Last Updated: $(date)
Project Status: Backend deployed, Frontend in development
====================================================================
UPDATE 5.0
======================================================================
## 📋 FILES CREATED/UPDATED SO FAR
Created Files:
- Database Migration: /backend/migrations/001_add_arrears_and_billing_fields.sql
- Billing Service: /backend/services/billingService.js
- Enhanced SMS Service: Added to /backend/services/smsService.js
- Water Bills Route: /backend/routes/waterBills.js

Updated Files:
- Backend Server: /backend/server.js (added water bills route registration)
- Water Bill Controller: /backend/controllers/waterBillController.js (added checkMissingWaterBills function)
- Agent Water Bills Component: /src/components/AgentWaterBills.jsx (enhanced with SMS functionality)
- API Service: /src/services/api.jsx (added missing water bills endpoint)
