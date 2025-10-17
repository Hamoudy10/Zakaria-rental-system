# 🏠 Zakaria Rental System

A comprehensive rental property management system built with React.js and PostgreSQL, designed to streamline property management, tenant relations, and financial tracking for rental businesses in Kenya.

## 🚀 Live Demo
[Add your live demo link here when deployed]

## 📋 Table of Contents
- [System Overview](#system-overview)
- [Features](#features)
- [User Roles](#user-roles)
- [Technology Stack](#technology-stack)
- [Database Schema](#database-schema)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [API Integration](#api-integration)
- [Development Guide](#development-guide)
- [Screenshots](#screenshots)
- [Contributing](#contributing)
- [License](#license)

## 🎯 System Overview

The Zakaria Rental System is a full-stack web application designed to automate and streamline rental property management operations. The system supports three main user roles (Admin, Agent, Tenant) and provides comprehensive features for property management, rent collection, maintenance tracking, and financial reporting.

### Key Business Objectives:
- **Digital Transformation**: Move from manual record-keeping to automated digital management
- **Payment Automation**: Integrate M-Pesa for seamless rent collection
- **Multi-role Access**: Provide tailored interfaces for different stakeholders
- **Real-time Analytics**: Offer business intelligence through dashboards and reports
- **Mobile-First Design**: Ensure accessibility across all devices

## ✨ Features

### 👨‍💼 Admin Features
- **Dashboard Overview**: Real-time business metrics and performance analytics
- **User Management**: Complete CRUD operations for admins, agents, and tenants
- **Property Management**: Add, edit, and manage properties and units
- **Tenant Allocation**: Assign tenants to specific units with lease management
- **Payment Management**: Track and confirm rent payments
- **Salary Management**: Process agent salary payments
- **Complaint Management**: Oversee maintenance requests and resolutions
- **Advanced Reporting**: Financial, occupancy, and revenue analytics
- **System Settings**: Configure application-wide settings

### 👨‍💼 Agent Features
- **Property Management**: Manage assigned properties and units
- **Tenant Management**: Handle tenant communications and information
- **Complaint Resolution**: Process and resolve maintenance requests
- **Performance Tracking**: Monitor resolution times and satisfaction rates

### 👤 Tenant Features
- **Rent Payments**: Make and track rent payments via M-Pesa
- **Maintenance Requests**: Submit and track complaint resolutions
- **Payment History**: View complete payment records
- **Profile Management**: Update personal information and documents

### 🔔 Notification System
- **Real-time Alerts**: In-app notifications for important events
- **Multi-channel**: SMS and email notifications (ready for integration)
- **Customizable Preferences**: User-controlled notification settings
- **Notification Types**: Payments, maintenance, announcements, and reminders

## 👥 User Roles

| Role | Description | Access Level |
|------|-------------|--------------|
| **Admin** | System administrator | Full system access |
| **Agent** | Property manager | Assigned properties and tenants |
| **Tenant** | Property occupant | Personal account and payments |

## 🛠 Technology Stack

### Frontend
- **React.js 18** - Modern UI framework with hooks
- **Vite** - Fast build tool and development server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router v6** - Client-side routing with protected routes
- **Context API** - State management (Auth, Properties, Payments, etc.)
- **Axios/Fetch** - API communication

### Backend (To be implemented)
- **Node.js/Express** or **Python/FastAPI** - API server
- **PostgreSQL** - Relational database
- **JWT** - Authentication tokens
- **M-Pesa API** - Payment processing
- **Redis** - Session management (optional)

### Database
- **PostgreSQL** - Primary database
- **UUID** - Unique identifier generation
- **JSONB** - Flexible data storage for features and reports
- **Enums** - Type-safe enumerations for status fields

## 🗄 Database Schema

### Core Tables Structure

#### Users & Authentication
```sql
users (id, national_id, first_name, last_name, email, phone_number, 
       password_hash, role, is_active, created_at, updated_at)