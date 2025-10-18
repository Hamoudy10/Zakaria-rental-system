Zakaria Rental System - Database Integration Documentation
Overview
This document outlines the steps to integrate the Zakaria Rental System with a PostgreSQL database, replacing mock data with real database operations.

Current Issues Identified
1. File Structure Problems
Backend files using .jsx extension (should be .js)

Missing proper database configuration

Inconsistent response formats between frontend and backend

2. Database Integration Gaps
Controllers using mock data instead of database queries

No proper error handling for database operations

Missing database connection pooling

Implementation Plan
Phase 1: Backend Restructuring
1.1 File Renaming
text
backend/
├── controllers/
│   ├── authController.js      ← Rename from .jsx
│   ├── userController.js      ← Rename from .jsx
│   ├── propertyController.js  ← Rename from .jsx
│   └── paymentController.js   ← Rename from .jsx
├── routes/
│   ├── auth.js               ← Rename from .jsx
│   ├── users.js              ← Rename from .jsx
│   └── properties.js         ← Rename from .jsx
└── config/
    └── database.js           ← Rename from .jsx
1.2 Database Configuration
File: backend/config/database.js

PostgreSQL connection pooling

Environment-based configuration

Connection error handling

Query export for database operations

1.3 Environment Setup
File: backend/.env

env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zakaria_rental
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
PORT=3001
CLIENT_URL=http://localhost:5173
Phase 2: Controller Updates
2.1 Authentication Controller
Login: Database user lookup + JWT token generation

Register: User creation with password hashing

Password validation with bcrypt

2.2 User Management Controller
getUsers: Fetch all users from database

createUser: Insert new user with hashed password

updateUser: Modify user details

deleteUser: Soft delete (set is_active = false)

2.3 Property Management Controller
getProperties: Fetch properties with unit counts

createProperty: Insert new property record

2.4 Payment Controller
getPayments: Fetch all payments with tenant/property details

getPaymentsByTenant: Tenant-specific payment history

createPayment: Record new payment transactions

Phase 3: Route Integration
3.1 Route Structure
text
/api/auth/login          → POST (Authentication)
/api/auth/register       → POST (User Registration)
/api/users               → GET, POST (User Management)
/api/properties          → GET, POST (Property Management)
/api/payments            → GET, POST (Payment Operations)
/api/payments/tenant/:id → GET (Tenant Payments)
3.2 Authentication Middleware
JWT token validation

Role-based access control

Request user context injection

Phase 4: Frontend Updates
4.1 API Service (src/services/api.jsx)
Consistent response handling

Automatic token attachment

Error interception and handling

Response format normalization

4.2 Context Updates
All React contexts updated to:

Use real API endpoints

Handle database-driven responses

Implement proper error states

Manage loading states effectively

Database Schema Integration
Key Tables Utilized
users: User accounts and authentication

properties: Property information and management

property_units: Individual rental units

tenant_allocations: Tenant-unit assignments

rent_payments: Payment records and history

admin_settings: System configuration

Data Flow
text
Frontend → API Routes → Controllers → Database Queries → Response
Response Format Standardization
Success Response
javascript
{
  success: true,
  message: "Operation successful",
  data: { /* response data */ }
}
Error Response
javascript
{
  success: false,
  message: "Error description",
  error: "Detailed error info (development)"
}
Security Implementation
1. Authentication
JWT token-based authentication

Password hashing with bcrypt

Token expiration management

2. Authorization
Role-based access control (admin, agent, tenant)

Route protection middleware

User context validation

3. Data Validation
Input sanitization

SQL injection prevention

Parameter validation

Implementation Steps
Step 1: Environment Setup
Install PostgreSQL and create database

Run provided SQL schema script

Configure environment variables

Install backend dependencies

Step 2: Backend Deployment
Rename all backend files (.jsx → .js)

Update package.json for ES6 modules

Start backend server

Verify database connection

Step 3: Frontend Integration
Update API service for real endpoints

Test authentication flow

Verify data loading from database

Test CRUD operations

Step 4: Testing & Validation
User authentication testing

Data creation and retrieval

Error handling verification

Performance testing

Dependencies Required
Backend Dependencies
json
{
  "pg": "PostgreSQL client",
  "bcryptjs": "Password hashing",
  "jsonwebtoken": "JWT authentication",
  "express": "Web framework",
  "cors": "Cross-origin requests",
  "helmet": "Security headers",
  "morgan": "Request logging",
  "dotenv": "Environment variables"
}
Expected Outcomes
After Implementation
✅ Real database integration

✅ Persistent data storage

✅ Proper user authentication

✅ Role-based access control

✅ Complete CRUD operations

✅ Error handling and validation

✅ Scalable architecture

Performance Benefits
Faster data retrieval vs mock API

Real-time data consistency

Proper transaction handling

Database indexing optimization

Next Phase Considerations
1. Advanced Features
M-Pesa payment integration

Real-time notifications

File upload handling

Advanced reporting

2. Optimization
Database query optimization

Caching implementation

API response compression

Connection pooling tuning

3. Monitoring
Application logging

Performance monitoring

Error tracking

Database health checks

Support & Troubleshooting
Common Issues
Database connection failures - Check credentials and network

JWT token issues - Verify secret and expiration

CORS errors - Validate client URL configuration

Query failures - Check database schema alignment

Testing Checklist
Database connection successful

User authentication working

Data persistence verified

Error handling functional

All roles can access appropriate features

This documentation provides a comprehensive roadmap for transitioning from mock data to a fully functional database-driven application with proper security, error handling, and scalability.

