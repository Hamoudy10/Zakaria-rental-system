### **3. FRONTEND: `CLAUDE.md`**
**Location:** `/abdallah-rental-system/src/CLAUDE.md`
```markdown
# React Frontend Architecture & Patterns

## 🎨 UI/UX FOUNDATION
**Tech Stack:**
- **React 18.2**: Functional components with hooks
- **Vite 4.5**: Fast build tool with hot reload
- **Tailwind CSS 3.3.6**: Utility-first styling
- **Lucide React**: Consistent icon library
- **React Router DOM 6.20**: Nested routing

**Styling Conventions:**
- Mobile-first responsive design (`sm:`, `md:`, `lg:` breakpoints)
- Consistent spacing scale (4px multiples)
- Color palette defined in `tailwind.config.js`
- Component-level styling with Tailwind classes
- Dark mode not implemented (future consideration)

## 🏗️ COMPONENT ARCHITECTURE
**Component Types:**
1. **Pages**: Route components (`src/pages/*`) - dashboards, main views
2. **Components**: Reusable UI (`src/components/*`) - forms, cards, tables
3. **Context Providers**: State management (`src/context/*`) - auth, payments, etc.
4. **Services**: API integration (`src/services/*`) - axios configuration

**Component Structure Pattern:**
```jsx
import React, { useState, useEffect } from 'react';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ExampleComponent = () => {
  // 1. State at the top
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  
  // 2. Effects after state
  useEffect(() => {
    fetchData();
  }, []);
  
  // 3. Functions after effects
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
  
  // 4. Conditional rendering
  if (loading) return <LoadingSpinner />;
  
  // 5. JSX return
  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Component Title</h2>
      {/* Component content */}
    </div>
  );
};

export default ExampleComponent;
🔌 API INTEGRATION PATTERNS
Axios Configuration (src/services/api.jsx):

Base URL from VITE_API_URL or Render deployment

Automatic JWT token attachment via interceptors

30-second timeout for M-Pesa requests

Global 401 handling (auto-logout)

API Service Usage:
// Import the API object
import { API } from '../services/api';

// Usage in components
const handleLogin = async (credentials) => {
  try {
    const response = await API.auth.login(credentials);
    if (response.data.success) {
      // Handle successful login
    }
  } catch (error) {
    // Error handled by global interceptor
    console.error('Login failed:', error);
  }
};
Available API Modules:

API.auth: Authentication (login, register, profile)

API.properties: Property & unit management

API.payments: Rent & M-Pesa payments

API.allocations: Tenant-unit allocations

API.complaints: Complaint management

API.notifications: Notification system

API.chatAPI: Real-time messaging

API.dashboard: Dashboard statistics

🧠 STATE MANAGEMENT
Context API Pattern:

Each domain has its own context (Auth, Payments, Notifications)

Contexts provide: state, setters, and domain-specific functions

Consume via custom hooks: useAuth(), usePayments(), etc.

AuthContext Pattern (from your code):
// 1. Create context with undefined default
const AuthContext = createContext(undefined);

// 2. Provider component with useMemo for value
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  
  // Memoized context value prevents unnecessary re-renders
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

🚦 ROUTING STRUCTURE
Role-Based Routing:

/login → Authentication page

/admin → Admin dashboard & management

/agent → Agent dashboard & operations
Route protection via AuthContext
Dashboard Pattern (from AdminDashboard.jsx):
// Lazy loading for performance
const UserManagement = lazy(() => import('../components/UserManagement'));

// Tab-based navigation
const [activeTab, setActiveTab] = useState('overview');

// Suspense for lazy components
<Suspense fallback={<TabLoadingSpinner />}>
  {activeTab === 'users' && <UserManagement />}
</Suspense>
📱 RESPONSIVE DESIGN PATTERNS
Tailwind Responsive Classes:
<div className="
  p-2          // Mobile: 0.5rem (8px)
  sm:p-4       // Small+: 1rem (16px)
  md:p-6       // Medium+: 1.5rem (24px)
">
Mobile Optimization:

Touch targets: min-h-[44px] for buttons

No horizontal scroll: overflow-x-hidden on containers

Simplified navigation on mobile (icons vs text)

💾 FORM HANDLING PATTERNS
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

🎯 PERFORMANCE OPTIMIZATIONS
Implemented:

Lazy loading for route components

useCallback/useMemo for expensive computations

React.memo for pure components (where needed)

Virtualized lists for large datasets (consideration)

Loading States:
// Skeleton loaders during data fetch
{loading ? (
  <div className="animate-pulse bg-gray-200 h-20 rounded"></div>
) : (
  <DataComponent data={data} />
)}
🧪 ERROR BOUNDARIES & ERROR HANDLING
Global Error Handling:

Axios interceptors handle API errors

401 responses trigger automatic logout

Network errors show user-friendly messages

Console errors in development only

Component-Level Error Handling:
const fetchData = async () => {
  try {
    const response = await API.getData();
    // Process response
  } catch (error) {
    // Show user-friendly error
    setError('Failed to load data. Please try again.');
    // Log detailed error for debugging
    console.error('API Error:', error.response?.data || error.message);
  }
};
🔄 REAL-TIME FEATURES
Socket.io Integration:
// Connection in main App or context
import { io } from 'socket.io-client';

const socket = io(API_BASE_URL, {
  auth: { token: localStorage.getItem('token') }
});

// Listen for events
socket.on('new_notification', (data) => {
  // Update notifications context
});
📄 IMPORT/EXPORT PATTERNS
Absolute Imports: Not configured (using relative paths)
Export Conventions:

Default export for pages/components

Named exports for utilities/hooks

Barrel files not used (direct imports)

Frontend runs on localhost:5173 during development
Build with: npm run build

Real-time chat module for internal communication between Admins, Agents, and Tenants. Features include direct/group messaging, typing indicators, read receipts, and real-time notifications via Socket.io.

🔄 END-TO-END DATA FLOW
User Types → ChatModule.jsx → useChat() Hook → ChatContext.jsx → ChatService.js → Backend API
          ↑                                                                  ↓
Real-time Updates ← Socket.io Client ← WebSocket ← Socket.io Server ← ChatController.js
Chat Module Structure
src/
├── context/ChatContext.jsx          # State management & socket orchestration
├── services/ChatService.js          # REST API service layer
├── components/chat/                  # UI Components (lazy-loaded)
│   ├── ChatModule.jsx               # Main container (sidebar + chat area)
│   ├── MessageList.jsx              # Messages display
│   ├── MessageInput.jsx             # Message composer
│   ├── ConversationList.jsx         # Conversations sidebar
│   └── NewConversationModal.jsx     # New chat modal
Key Patterns
1. Context-Based State Management
// Pattern: useReducer for complex state + useRef for socket/performance
const [state, dispatch] = useReducer(chatReducer, initialState);
const socketRef = useRef(null); // Socket.io instance
const convsRef = useRef([]);    // Conversations cache
2. Real-time Integration Pattern// Socket setup with auth token
const socket = io(import.meta.env.VITE_SOCKET_URL, {
  auth: { token }, // JWT from localStorage
  transports: ['websocket']
});

// Event handling
socket.on('new_message', ({ message, conversationId }) => {
  // Update UI based on active conversation
  if (activeConvRef.current?.id === conversationId) {
    dispatch({ type: 'ADD_MESSAGE', payload: message });
  } else {
    // Increment unread count for inactive conversations
    updateUnreadCount(conversationId);
  }
});
3. Optimistic UI Updates
const sendMessage = async (conversationId, messageText) => {
  // 1. Immediate UI update (optimistic)
  const tempMessage = createTempMessage(messageText);
  dispatch({ type: 'ADD_MESSAGE', payload: tempMessage });
  
  // 2. Send via REST API
  const realMessage = await ChatService.sendMessage(conversationId, messageText);
  
  // 3. Replace temp with real message
  dispatch({ type: 'REPLACE_MESSAGE', payload: { tempId, realMessage } });
  
  // 4. Emit socket for real-time
  socketRef.current?.emit('send_message', { conversationId, messageText });
};
const sendMessage = async (conversationId, messageText) => {
  // 1. Immediate UI update (optimistic)
  const tempMessage = createTempMessage(messageText);
  dispatch({ type: 'ADD_MESSAGE', payload: tempMessage });
  
  // 2. Send via REST API
  const realMessage = await ChatService.sendMessage(conversationId, messageText);
  
  // 3. Replace temp with real message
  dispatch({ type: 'REPLACE_MESSAGE', payload: { tempId, realMessage } });
  
  // 4. Emit socket for real-time
  socketRef.current?.emit('send_message', { conversationId, messageText });
};
4. Component Lazy Loading
// In ChatModule.jsx - Performance optimization
const MessageList = React.lazy(() => import('./chat/MessageList'));
const MessageInput = React.lazy(() => import('./chat/MessageInput'));

// Usage with Suspense
<React.Suspense fallback={<LoadingSpinner />}>
  <MessageList messages={messages} />
</React.Suspense>
API Service Pattern (ChatService.js)
// Standardized service pattern
const ChatService = {
  // GET with params
  getRecentChats: async (limit = 50, offset = 0) => {
    const res = await api.get('/chat/conversations', {
      params: { limit, offset }, // URL params for pagination
    });
    return res.data?.data || []; // Consistent null-safety
  },
  
  // POST with body
  sendMessage: async (conversationId, messageText) => {
    const res = await api.post('/chat/messages/send', {
      conversationId,
      messageText,
    });
    return res.data?.data; // Returns full message object
  },
  
  // Real-time features
  startTyping: async (conversationId) => {
    await api.post(`/chat/conversations/${conversationId}/typing/start`);
  },
};

🏗️ FRONTEND ARCHITECTURE
Component Structure
src/
├── context/NotificationContext.jsx     # State management with smart polling
├── components/
│   ├── NotificationBell.jsx            # Real-time dropdown (bell icon)
│   ├── NotificationsPage.jsx           # Full management interface
│   └── NotificationManagement.jsx      # (Optional) Admin management
└── services/api.jsx                    # notificationAPI + notificationUtils
Key Frontend Patterns
1. Smart Polling with Backoff (NotificationContext.jsx)// Exponential backoff strategy for 429 responses
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

// Polling effect with auth awareness
useEffect(() => {
  const poll = async () => {
    if (!isAuthenticated()) return;
    await refreshNotifications();
    pollingRef.current = setTimeout(poll, backoffRef.current);
  };
  poll();
  return () => clearTimeout(pollingRef.current);
}, [isAuthenticated]);
2. Rate Limit Handling (NotificationBell.jsx)

// Debounced fetching with 429 retry logic
const fetchNotifications = useCallback(async () => {
  if (fetchTimeoutRef.current) return;
  
  fetchTimeoutRef.current = setTimeout(async () => {
    try {
      const res = await API.notifications.getNotifications(20, 0);
      // ... handle response
    } catch (error) {
      if (error.response?.status === 429) {
        // Exponential backoff retry
        retryTimeoutRef.current = setTimeout(fetchNotifications, 5000);
      }
    } finally {
      fetchTimeoutRef.current = null;
    }
  }, 300); // 300ms debounce
}, []);
3. Combined Unread Counts (Notifications + Chat)
// In NotificationBell.jsx - unified badge
const { getTotalUnreadCount: getChatUnreadCount } = useChat();
const chatUnreadCount = getChatUnreadCount();
const totalUnread = unreadCount + chatUnreadCount;

// Display combined count
{totalUnread > 0 && (
  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full">
    {totalUnread}
  </span>
)}
4. Mobile-First Responsive Design (NotificationsPage.jsx)
// Breakpoint-based styling
className="text-xs xs:text-sm sm:text-base" // xs=extra small screens
className="p-2 xs:p-3 sm:p-4" // Responsive padding
className="grid grid-cols-2 xs:grid-cols-4" // Responsive grid

// Touch optimization
className="min-h-[44px] touch-manipulation" // Minimum touch target size
API Consumption Patterns
1. Standardized Service Calls (api.jsx)
// notificationAPI provides consistent interface
const response = await API.notifications.getNotifications(limit, offset, type, is_read);
const unread = await API.notifications.getUnreadCount();
await API.notifications.markAsRead(notificationId);
await API.notifications.markAllAsRead();
2. Utility Functions for UI
// Formatting utilities
const icon = API.notificationUtils.getNotificationIcon('payment_success'); // Returns '💰'
const time = API.notificationUtils.formatTimestamp(created_at); // "2h ago"
const message = API.notificationUtils.formatNotificationMessage(notification);
📱 UI/UX PATTERNS
1. Notification Bell Behavior
Real-time updates: Polling every 30s (with backoff)

Combined counts: Shows (notifications + chat) unread total

Click behavior: Opens dropdown, triggers fetch if closed > 5min

Mark as read: Single click on notification, "Mark all" button

2. Notifications Page Features
Tab filtering: All/Unread/Read

Type filtering: Dropdown for notification types

Date range: Start/end date filtering

Bulk operations: Mark all read, clear read, delete

Pagination: Loads 20 at a time with prev/next

Admin features: Broadcast notification modal

3. Mobile Optimization
Touch targets: Minimum 44px height for all interactive elements

Responsive grids: 1 → 2 → 4 column layouts based on screen size

Typography scaling: xs → sm → base font sizes

Spacing adaptation: p-2 → p-3 → p-4 padding based on breakpoints

🔧 INTEGRATION PATTERNS
1. With Payment System
// After successful payment
await NotificationService.createPaymentNotification({
  tenantId: payment.tenant_id,
  tenantName: `${tenant.first_name} ${tenant.last_name}`,
  amount: payment.amount,
  paymentMonth: payment.payment_month,
  allocatedAmount: payment.allocated_amount,
  carryForwardAmount: payment.carry_forward_amount,
  isMonthComplete: payment.is_month_complete,
  paymentId: payment.id
});
2. With Chat System
// Combined unread counts in NotificationBell.jsx
const totalUnread = unreadCount + chatUnreadCount;

// Unified "Mark all as read" buttons
{unreadCount > 0 && (
  <button onClick={markAllNotificationsRead}>Mark all read</button>
)}
{chatUnreadCount > 0 && (
  <button onClick={markAllChatsRead}>Mark chats read</button>
)}
3. With Authentication System
// Polling only when authenticated
useEffect(() => {
  const poll = async () => {
    if (!isAuthenticated()) return; // Stops polling when logged out
    await refreshNotifications();
    pollingRef.current = setTimeout(poll, backoffRef.current);
  };
  poll();
}, [isAuthenticated]);
