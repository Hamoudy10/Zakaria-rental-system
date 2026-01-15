REACT FRONTEND ARCHITECTURE & PATTERNS

UI/UX FOUNDATION
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

COMPONENT ARCHITECTURE
Component Types:
1. Pages: Route components (src/pages/*) - dashboards, main views
2. Components: Reusable UI (src/components/*) - forms, cards, tables
3. Context Providers: State management (src/context/*) - auth, payments, etc.
4. Services: API integration (src/services/*) - axios configuration

Standard Component Pattern:
import React, { useState, useEffect } from 'react';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ExampleComponent = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  
  useEffect(() => { fetchData(); }, []);
  
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

API INTEGRATION PATTERNS
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

STATE MANAGEMENT
Context API Pattern:
Each domain has its own context (Auth, Payments, Notifications)
Contexts provide: state, setters, and domain-specific functions
Consume via custom hooks: useAuth(), usePayments(), etc.

AuthContext Pattern Example:
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

ROUTING STRUCTURE
Role-Based Routing:
- /login → Authentication page
- /admin → Admin dashboard & management
- /agent → Agent dashboard & operations
Route protection via AuthContext

Dashboard Pattern with Lazy Loading:
// Lazy loading for performance
const UserManagement = lazy(() => import('../components/UserManagement'));

// Tab-based navigation
const [activeTab, setActiveTab] = useState('overview');

// Suspense for lazy components
<Suspense fallback={<TabLoadingSpinner />}>
  {activeTab === 'users' && <UserManagement />}
</Suspense>

RESPONSIVE DESIGN PATTERNS
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

FORM HANDLING PATTERNS
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

PERFORMANCE OPTIMIZATIONS
Implemented:
- Lazy loading for route components
- useCallback/useMemo for expensive computations
- React.memo for pure components (where needed)

Loading States Pattern:
{loading ? (
  <div className="animate-pulse bg-gray-200 h-20 rounded"></div>
) : (
  <DataComponent data={data} />
)}

ERROR HANDLING
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

REAL-TIME FEATURES
Socket.io Integration:
import { io } from 'socket.io-client';

const socket = io(API_BASE_URL, {
  auth: { token: localStorage.getItem('token') }
});

socket.on('new_notification', (data) => {
  // Update notifications context
});

CHAT MODULE ARCHITECTURE
Real-time chat module for internal communication between Admins, Agents, and Tenants.

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
1. Context-Based State Management with useReducer
2. Socket.io integration with JWT authentication
3. Optimistic UI Updates for message sending

NOTIFICATIONS SYSTEM ARCHITECTURE
Frontend Architecture:
src/
├── context/NotificationContext.jsx     # State management with smart polling
├── components/
│   ├── NotificationBell.jsx            # Real-time dropdown (bell icon)
│   ├── NotificationsPage.jsx           # Full management interface

Key Notification Patterns:
1. Smart Polling with Backoff: Starts at 30s, max 5 minutes
2. Combined Unread Counts: Notifications + Chat messages
3. Real-time updates via Socket.io

BILLING UI/UX PATTERNS
1. Bill Breakdown Display: Rent + Water + Arrears + Total
2. Billing Status Indicators: pending, sent, failed, skipped
3. Settings Form with Validation: Billing day (1-28), paybill number validation
4. Mobile-First Billing Design: Scrollable tables, touch-friendly buttons

IMPLEMENTATION STATUS CHECKLIST (LATEST)
✅ COMPLETED:
1. Database Schema: Arrears tracking and billing tables
2. Backend Services: CronService, BillingService, enhanced SMS
3. Admin Settings: Configurable billing with validation
4. Payment Allocation: Rent/water/arrears split logic
5. SMS Templates: Professional bill breakdown messages
6. Error Handling: Failed SMS tracking and retry system
7. Water Bill Integration: Enhanced AgentWaterBills.jsx with SMS functionality
8. Agent SMS Management: Complete 3-tab interface with all features

✅ READY FOR TESTING:
1. Agent SMS triggering with missing water bill warnings
2. Failed SMS management and retry system
3. SMS history with filtering capabilities
4. Real-time SMS queue monitoring

NEW COMPONENT: TenantManagement.jsx
Location: src/components/TenantManagement.jsx
Purpose: Agent-facing tenant management with full CRUD, allocation, and ID verification
Key Features:
- Create/Edit tenants with unit allocation
- Upload ID images (front/back)
- Search tenants by name, phone, national ID
- Paginated listing with status indicators
- Emergency contact management

NEW COMPONENT ARCHITECTURE: AgentSMSManagement.jsx
Three-tab architecture with shared state:
1. Tab 1: Trigger Billing SMS - Month selection, property filtering, missing bills confirmation
2. Tab 2: Failed SMS Management - List with details, bulk selection, individual retry
3. Tab 3: SMS History - Filter by status, date range, property, message preview

Component Pattern:
const AgentSMSManagement = () => {
  const [activeTab, setActiveTab] = useState('trigger');
  const [month, setMonth] = useState('');
  const [failedSMS, setFailedSMS] = useState([]);
  const [smsHistory, setSmsHistory] = useState([]);
  
  // Tab-based rendering
  return (
    <div>
      {activeTab === 'trigger' && <TriggerTab />}
      {activeTab === 'failed' && <FailedSMSTab />}
      {activeTab === 'history' && <HistoryTab />}
    </div>
  );
};

UPDATED API INTEGRATION PATTERNS:
New API Endpoints in api.jsx:
const billingAPI = {
  // Agent SMS Management
  triggerAgentBilling: (data) => api.post('/cron/agent/trigger-billing', data),
  getAgentFailedSMS: (params) => api.get('/cron/agent/failed-sms', { params }),
  retryAgentFailedSMS: (data) => api.post('/cron/agent/retry-sms', data),
  getSMSHistory: (params) => api.get('/cron/sms-history', { params }),
};

NEW COMPONENT: AgentReports.jsx
Location: /src/components/AgentReports.jsx
Status: Created (needs API integration fixes)
Purpose: Agent-facing reports system with 7 report types and PDF/Excel export

Features Implemented:
1. 7 Report Types:
   - Tenants Report (API: /api/agent-properties/my-tenants)
   - Payments Report (agent-specific payments endpoint)
   - Revenue Report (requires backend endpoint)
   - Properties Report (API: /api/properties/agent/assigned)
   - Complaints Report (API: /api/agent-properties/my-complaints)
   - Water Bills Report (API: /api/water-bills)
   - SMS Report (API: /api/cron/sms-history)

2. Export Functionality:
   - PDF export with jsPDF + jspdf-autotable
   - Excel export with ExcelJS
   - Company branding with logo placeholder
   - Filtered data export

3. UI/UX Features:
   - Tab-based navigation for report types
   - Date range filtering
   - Search functionality
   - Statistics summary
   - Responsive design

ISSUES IDENTIFIED:
1. API Structure Mismatch: Current API object doesn't have expected modules (API.tenantAPI, API.agentAPI, etc. are undefined)
2. Export Dependencies: jspdf-autotable not properly initialized (doc.autoTable is not a function)
3. Missing Endpoints: Some reports need backend implementation

UPDATED FILES:
1. AgentDashboard.jsx - Added "Reports" tab to navigation
2. Export Utilities:
   - /src/utils/pdfExport.js with company branding
   - /src/utils/excelExport.js with Excel formatting

TESTING INSTRUCTIONS
Phase 1: Water Bill Creation Test:
1. Navigate to Agent Dashboard → Water Bills
2. Create several water bills for different tenants
3. Verify bills are saved correctly

Phase 2: Missing Water Bills Check:
1. Create water bills for only some tenants
2. Click "Send Billing SMS" button
3. Verify warning modal shows missing tenants
4. Confirm SMS sending proceeds anyway

Phase 3: SMS Trigger Test:
1. Click "Send Billing SMS" after creating water bills
2. Confirm pre-flight check works correctly
3. Verify billing SMS sent to all tenants
4. Check tenants without water bills get KSh 0 for water

Phase 4: Agent SMS Management Test:
1. Navigate to SMS Management tab
2. Test all 3 tabs (Trigger, Failed SMS, History)
3. Verify agent property filtering works
4. Test bulk retry functionality for failed SMS
5. Check SMS history filtering by date and status

EXPORT FUNCTIONALITY TESTING:
1. Navigate to Agent Dashboard → Reports
2. Select each report type
3. Test date range filtering
4. Attempt PDF and Excel export
5. Verify company branding appears in exports

END OF FRONTEND ARCHITECTURE SUMMARY