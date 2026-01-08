# Zakaria Rental Management System - Project Memory

## 🏠 PROJECT OVERVIEW
A full-stack rental property management platform for Kenyan markets with multi-role access (Admin, Agent, Tenant), M-Pesa payment integration, real-time chat, and comprehensive property/tenant management. Built with a React Vite frontend and Node.js/Express backend.
Real-time notification system with smart polling, rate limiting, and integration across all modules (payments, complaints, chat, announcements). Features include admin broadcasts, mobile-first UI, and exponential backoff for 429 handling.

## 🚀 DEPLOYMENT & ENVIRONMENT
- **Frontend**: React Vite app (localhost during development)
- **Backend**: Deployed on **Render** at `https://zakaria-rental-system.onrender.com`
- **Database**: PostgreSQL on **Supabase**
- **Frontend URL**: `http://localhost:5173` (dev) - Configured via `VITE_API_URL` in `.env`
- **Backend API**: `/api` prefix on all endpoints

## 🛠 TECH STACK
### Frontend (React Vite)
- **React 18.2** with functional components & hooks
- **React Router DOM v6.20** for routing
- **Axios 1.12** with interceptors for API calls
- **Tailwind CSS 3.3.6** with mobile-first responsive design
- **Context API** for state management (no Redux)
- **Socket.io-client 4.8** for real-time features
- **Lucide React 0.562** for icons
- **ExcelJS 4.4 & jsPDF 3.0** for report generation

### Backend (Node.js/Express)
- **Express 4.22** with MVC architecture
- **PostgreSQL** via `pg` 8.11 driver
- **JWT Authentication** with `jsonwebtoken` 9.0
- **bcryptjs 2.4** for password hashing
- **Socket.io 4.8** for real-time communication
- **Moment 2.30** for date handling
- **Helmet 7.1 & CORS** for security
- **Nodemon** for development

## 📁 PROJECT STRUCTURE

abdallah-rental-system/
├── src/ # React frontend
│ ├── auth/ # Authentication utilities
│ ├── components/ # Reusable React components
│ ├── context/ # React Context providers
│ ├── pages/ # Page components (dashboards)
│ └── services/ # API service layer (axios config)
├── backend/ # Node.js/Express backend
│ ├── config/ # DB configuration
│ ├── controllers/ # Route controllers (business logic)
│ ├── middleware/ # Express middleware (auth, validation)
│ ├── routes/ # API route definitions
│ ├── services/ # Business logic services
│ └── migrations/ # Database migrations
└── CLAUDE.md # This file - PROJECT MEMORY


## 🔐 AUTHENTICATION & ROLES
**Three-tier role system:**
1. **ADMIN**: Full system access, user management, reports, system settings, property and unit management,payment management
2. **AGENT**: Payment tracking, complaint handling, water bill processing, notification sending, reports(later implementation)

**Auth Flow:**
- JWT tokens stored in `localStorage`
- Auto-attached to requests via Axios interceptors
- Token refresh handled via `/auth/refresh` endpoint
- Automatic logout on 401 responses

## 💰 PAYMENT INTEGRATION
**M-Pesa Integration:**
- Phone number formatting: `0XXXXXXXXX` → `254XXXXXXXXX`
- Transaction references: `RENT_TIMESTAMP_RANDOM`
- Paybill number configured via admin settings
- Payment status tracking via `mpesa_transactions` table
- Salary payments to agents via same M-Pesa integration

## 📱 KEY FRONTEND PATTERNS
1. **API Calls**: Use services from `src/services/api.jsx` (e.g., `API.auth.login()`)
2. **State Management**: Context providers in `src/context/` with `useContext` hooks
3. **Error Handling**: Global error handler in `api.jsx` with 401 auto-logout
4. **Loading States**: Skeleton loaders for async operations
5. **Form Handling**: Controlled components with local state

## 🗄️ DATABASE KEY RELATIONSHIPS
- **Users** → **Properties** (created_by)
- **Properties** → **Property_Units** (one-to-many)
- **Tenants** → **Tenant_Allocations** → **Property_Units**
- **Rent_Payments** → **Tenants** + **Property_Units**
- **Complaints** → **Tenants** + **Agents** (assigned_to)

## 🚨 IMPORTANT CONVENTIONS
1. **API Responses**: Always follow `{ success: boolean, data: any, message?: string }`
2. **Error Handling**: Controllers use try-catch with specific error messages
3. **Database Transactions**: Use `BEGIN`/`COMMIT`/`ROLLBACK` for multi-step operations
4. **Phone Numbers**: Store and display in Kenyan format, convert for M-Pesa
5. **File Uploads**: Images stored as URLs, references in `property_images` table

## 🔄 DEVELOPMENT WORKFLOW
1. **Backend First**: API endpoints must exist before frontend integration
2. **Environment Variables**: Required for both frontend (`VITE_*`) and backend
3. **Database Changes**: Create migration files, never modify production directly
4. **Testing**: Test M-Pesa with mock endpoints in development

## 📝 HOW TO USE THIS MEMORY SYSTEM
1. When asking for help, **COPY RELEVANT SECTIONS** from CLAUDE.md files
2. For component work, reference `src/CLAUDE.md` patterns
3. For API work, reference `backend/CLAUDE.md` conventions
4. Update files when making architectural changes

---
*Last Updated: $(date)*
*Project Status: Backend deployed, Frontend in development*