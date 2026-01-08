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
---
Last Updated: $(date)
Project Status: Backend deployed, Frontend in development