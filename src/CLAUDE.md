# React Frontend Architecture & Patterns

## 🎨 UI/UX FOUNDATION
Tech Stack:
- React 18.2: Functional components with hooks
- Vite 4.5: Fast build tool with hot reload
- Tailwind CSS 3.3.6: Utility-first styling
- Lucide React: Consistent icon library
- React Router DOM 6.20: Nested routing

Styling Conventions:
- Mobile-first responsive design (sm:, md:, lg: breakpoints)
- Consistent spacing scale (4px multiples)
- Color palette defined in tailwind.config.js
- Component-level styling with Tailwind classes
- Dark mode not implemented (future consideration)

## 🏗️ COMPONENT ARCHITECTURE
Component Types:
1. Pages: Route components (src/pages/*) - dashboards, main views
2. Components: Reusable UI (src/components/*) - forms, cards, tables
3. Context Providers: State management (src/context/*) - auth, payments, etc.
4. Services: API integration (src/services/*) - axios configuration

Component Structure Pattern:
import React, { useState, useEffect } from 'react';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ExampleComponent = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await API.properties.getProperties();
      if (response.data.success) {
        setData(response.data.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <LoadingSpinner />;
  
  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Component Title</h2>
      {/* Component content */}
    </div>
  );
};

export default ExampleComponent;

## 🔌 API INTEGRATION PATTERNS
Axios Configuration (src/services/api.jsx):
- Base URL from VITE_API_URL or Render deployment
- Automatic JWT token attachment via interceptors
- 30-second timeout for M-Pesa requests
- Global 401 handling (auto-logout)

API Service Usage:
import { API } from '../services/api';

const handleLogin = async (credentials) => {
  try {
    const response = await API.auth.login(credentials);
    if (response.data.success) {
      // Handle successful login
    }
  } catch (error) {
    console.error('Login failed:', error);
  }
};

Available API Modules:
- API.auth: Authentication (login, register, profile)
- API.properties: Property & unit management
- API.payments: Rent & M-Pesa payments
- API.allocations: Tenant-unit allocations
- API.complaints: Complaint management
- API.notifications: Notification system
- API.chatAPI: Real-time messaging
- API.dashboard: Dashboard statistics

## 🧠 STATE MANAGEMENT
Context API Pattern:
Each domain has its own context (Auth, Payments, Notifications)
Contexts provide: state, setters, and domain-specific functions
Consume via custom hooks: useAuth(), usePayments(), etc.

AuthContext Pattern:
// 1. Create context with undefined default
const AuthContext = createContext(undefined);

// 2. Provider component with useMemo for value
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  
  const value = useMemo(() => ({
    user, token, login, logout
  }), [user, token]);
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// 3. Custom hook for consumption
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

## 🚦 ROUTING STRUCTURE
Role-Based Routing:
- /login → Authentication page
- /admin → Admin dashboard & management
- /agent → Agent dashboard & operations
Route protection via AuthContext

Dashboard Pattern:
// Lazy loading for performance
const UserManagement = lazy(() => import('../components/UserManagement'));

// Tab-based navigation
const [activeTab, setActiveTab] = useState('overview');

// Suspense for lazy components
<Suspense fallback={<TabLoadingSpinner />}>
  {activeTab === 'users' && <UserManagement />}
</Suspense>

## 📱 RESPONSIVE DESIGN PATTERNS
Tailwind Responsive Classes:
<div className="
  p-2          // Mobile: 0.5rem (8px)
  sm:p-4       // Small+: 1rem (16px)
  md:p-6       // Medium+: 1.5rem (24px)
">

Mobile Optimization:
- Touch targets: min-h-[44px] for buttons
- No horizontal scroll: overflow-x-hidden on containers
- Simplified navigation on mobile (icons vs text)

## 💾 FORM HANDLING PATTERNS
Controlled Component Pattern:
const [formData, setFormData] = useState({
  name: '',
  email: '',
  phone: ''
});

const handleChange = (e) => {
  setFormData({
    ...formData,
    [e.target.name]: e.target.value
  });
};

// For M-Pesa phone validation
const handlePhoneChange = (e) => {
  const value = e.target.value;
  if (API.mpesa.validatePhoneNumber(value)) {
    setFormData({ ...formData, phone: value });
  }
};

## 🎯 PERFORMANCE OPTIMIZATIONS
Implemented:
- Lazy loading for route components
- useCallback/useMemo for expensive computations
- React.memo for pure components (where needed)
- Virtualized lists for large datasets (consideration)

Loading States:
{loading ? (
  <div className="animate-pulse bg-gray-200 h-20 rounded"></div>
) : (
  <DataComponent data={data} />
)}

## 🧪 ERROR BOUNDARIES & ERROR HANDLING
Global Error Handling:
- Axios interceptors handle API errors
- 401 responses trigger automatic logout
- Network errors show user-friendly messages
- Console errors in development only

Component-Level Error Handling:
const fetchData = async () => {
  try {
    const response = await API.getData();
    // Process response
  } catch (error) {
    setError('Failed to load data. Please try again.');
    console.error('API Error:', error.response?.data || error.message);
  }
};

## 🔄 REAL-TIME FEATURES
Socket.io Integration:
import { io } from 'socket.io-client';

const socket = io(API_BASE_URL, {
  auth: { token: localStorage.getItem('token') }
});

socket.on('new_notification', (data) => {
  // Update notifications context
});

## 💬 CHAT MODULE ARCHITECTURE
Real-time chat module for internal communication between Admins, Agents, and Tenants.
Features include direct/group messaging, typing indicators, read receipts, and real-time notifications via Socket.io.

Chat Module Structure:
src/
├── context/ChatContext.jsx          # State management & socket orchestration
├── services/ChatService.js          # REST API service layer
├── components/chat/                  # UI Components (lazy-loaded)
│   ├── ChatModule.jsx               # Main container (sidebar + chat area)
│   ├── MessageList.jsx              # Messages display
│   ├── MessageInput.jsx             # Message composer
│   ├── ConversationList.jsx         # Conversations sidebar
│   └── NewConversationModal.jsx     # New chat modal

Key Chat Patterns:
1. Context-Based State Management:
const [state, dispatch] = useReducer(chatReducer, initialState);
const socketRef = useRef(null); // Socket.io instance
const convsRef = useRef([]);    // Conversations cache

2. Real-time Integration Pattern:
const socket = io(import.meta.env.VITE_SOCKET_URL, {
  auth: { token }, // JWT from localStorage
  transports: ['websocket']
});

socket.on('new_message', ({ message, conversationId }) => {
  if (activeConvRef.current?.id === conversationId) {
    dispatch({ type: 'ADD_MESSAGE', payload: message });
  } else {
    updateUnreadCount(conversationId);
  }
});

3. Optimistic UI Updates:
const sendMessage = async (conversationId, messageText) => {
  const tempMessage = createTempMessage(messageText);
  dispatch({ type: 'ADD_MESSAGE', payload: tempMessage });
  
  const realMessage = await ChatService.sendMessage(conversationId, messageText);
  
  dispatch({ type: 'REPLACE_MESSAGE', payload: { tempId, realMessage } });
  
  socketRef.current?.emit('send_message', { conversationId, messageText });
};

## 🔔 NOTIFICATIONS SYSTEM ARCHITECTURE
Frontend Architecture:
src/
├── context/NotificationContext.jsx     # State management with smart polling
├── components/
│   ├── NotificationBell.jsx            # Real-time dropdown (bell icon)
│   ├── NotificationsPage.jsx           # Full management interface
│   └── NotificationManagement.jsx      # (Optional) Admin management
└── services/api.jsx                    # notificationAPI + notificationUtils

Key Notification Patterns:
1. Smart Polling with Backoff:
const backoffRef = useRef(30000); // Start with 30s
const MAX_BACKOFF = 5 * 60 * 1000; // Max 5 minutes

const refreshNotifications = async () => {
  try {
    await Promise.all([fetchNotifications(), fetchUnreadCount()]);
    backoffRef.current = 30000; // Reset on success
  } catch (err) {
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
  }
};

2. Combined Unread Counts:
const { getTotalUnreadCount: getChatUnreadCount } = useChat();
const chatUnreadCount = getChatUnreadCount();
const totalUnread = unreadCount + chatUnreadCount;

{totalUnread > 0 && (
  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full">
    {totalUnread}
  </span>
)}

## 💰 BILLING UI/UX PATTERNS
UI/UX Patterns for Billing:

1. Bill Breakdown Display:
<BillBreakdown 
  rent={15000}
  water={500}
  arrears={2000}
  total={17500}
  paid={5000}
  remaining={12500}
/>

2. Billing Status Indicators:
<BillingStatus 
  status="pending"  // pending, sent, failed, skipped
  date="2024-03-28"
  retryCount={2}
  onRetry={() => retrySMS()}
/>

3. Settings Form with Validation:
<BillingSettingsForm
  billingDay={28}
  paybillNumber="123456"
  companyName="Rental Management"
  onSave={(data) => saveSettings(data)}
  validationRules={{
    billingDay: { min: 1, max: 28 },
    paybillNumber: { pattern: /^\d{5,10}$/ }
  }}
/>

Mobile-First Billing Design:
- Responsive Tables: Scrollable billing history on mobile
- Touch-Friendly: Larger buttons for SMS retry actions
- Progressive Disclosure: Details hidden behind expandable sections
- Quick Actions: One-tap retry for failed SMS

## 📋 IMPLEMENTATION STATUS CHECKLIST
✅ COMPLETED:
1. Database Schema: Arrears tracking and billing tables
2. Backend Services: CronService, BillingService, enhanced SMS
3. Admin Settings: Configurable billing with validation
4. Payment Allocation: Rent/water/arrears split logic
5. SMS Templates: Professional bill breakdown messages
6. Error Handling: Failed SMS tracking and retry system

⏳ READY FOR TESTING:
1. Cron Automation: Monthly billing scheduler
2. Billing Calculation: Rent + water + arrears engine
3. Admin Interface: Settings and monitoring endpoints
4. Agent Fallback: Manual SMS retry functionality

## 🔧 TESTING INSTRUCTIONS
Phase 1: Configuration Test:
# 1. Set paybill number (use test number)
PUT /api/admin/settings/paybill_number
Body: { "value": "TEST123" }

# 2. Set billing day to today (for immediate testing)
PUT /api/admin/settings/billing_day
Body: { "value": "15" }  # Today's date

# 3. Verify settings
GET /api/admin/settings

Phase 2: Manual Billing Test:
# 1. Trigger manual billing (admin only)
POST /api/cron/trigger-billing

# 2. Check billing run status
GET /api/cron/history

# 3. Check SMS queue
GET /api/cron/failed-sms

Phase 3: Payment Allocation Test:
# 1. Make test payment
POST /api/payments/paybill
Body: {
  "unit_code": "PROP001-001",
  "amount": 10000,
  "mpesa_receipt_number": "TEST123",
  "phone_number": "254712345678"
}

# 2. Check payment allocation
GET /api/payments/breakdown/{paymentId}

Frontend runs on localhost:5173 during development
Build with: npm run build
=================================================================================
UPDATE
==================================================================================
## 📦 NEW COMPONENT: TenantManagement
**Location**: src/components/TenantManagement.jsx
**Purpose**: Agent-facing tenant management with full CRUD, allocation, and ID verification
**Key Features**:
- Create/Edit tenants with unit allocation
- Upload ID images (front/back)
- Search tenants by name, phone, national ID
- Paginated listing with status indicators
- Emergency contact management

**API Integration**:
- Uses tenantAPI from services/api.jsx
- File upload via fileAPI for ID images
- Handles both tenant creation and unit allocation in single form

## 🔄 UPDATED FILES
1. api.jsx - Added tenantAPI with all CRUD endpoints
2. AgentDashboard.jsx - Added new "Tenant Management" tab