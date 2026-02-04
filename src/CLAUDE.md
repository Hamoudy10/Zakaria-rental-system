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
