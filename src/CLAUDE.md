# FRONTEND ARCHITECTURE - REACT/VITE

## TECH STACK
React 18.2 | Vite 4.5 | Tailwind CSS 3.3.6 | React Router 6 | Axios | Socket.io-client | Lucide React

## ARCHITECTURE PATTERN
```
Pages (route components) → Components (reusable UI) → Context (state) → Services (API)
```

## STATE MANAGEMENT (Context API)

### Key Contexts
| Context | Purpose |
|---------|---------|
| AuthContext | User auth, token, login/logout |
| PropertyContext | Properties & units state |
| PaymentContext | Payments + pagination |
| ChatContext | Messages, conversations, socket |
| NotificationContext | Notifications with polling |

### Context Pattern
```jsx
const { user, token } = useAuth();
const { properties, fetchProperties } = useProperty();
const { payments, pagination } = usePayments();
```

## API INTEGRATION

### Axios Setup (src/services/api.jsx)
- Base URL from `VITE_API_URL` or Render deployment
- Auto JWT attachment via interceptors
- 30s timeout for M-Pesa
- Global 401 → auto logout

### API Modules
```javascript
API.auth       // login, register, profile
API.properties // property & unit CRUD
API.payments   // rent & M-Pesa
API.allocations// tenant-unit links
API.tenants    // tenant CRUD, ID upload
API.chatAPI    // messaging
```

## KEY COMPONENTS

### TenantManagement.jsx
- CRUD with phone validation (07xx format input)
- ID image upload via FormData → Cloudinary
- View modal with PDF export
- Edit modal includes current unit in dropdown

### AgentSMSManagement.jsx (3 Tabs)
1. Water Bills & SMS Trigger
2. Failed SMS Management (retry)
3. SMS History (filter by status/date)

### AgentReports.jsx
- 7 report types with PDF/Excel export
- Used by both Admin and Agent dashboards

### TenantAllocation.jsx
- Uses `allocation.tenant_full_name` directly
- NOT searching users array

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
// Convert stored 254xxx to display 0xxx
const displayPhone = (phone) => phone?.replace(/^254/, '0') || '';
```

### File Upload (Cloudinary)
```jsx
const formData = new FormData();
formData.append('id_front_image', file);
await API.tenants.uploadIDImages(tenantId, formData);
// Response contains Cloudinary URL
```

### Image Display
```jsx
<img src={tenant.id_front_image} /> // Full Cloudinary URL from API
```

## RECENT FIXES

| Component | Fix |
|-----------|-----|
| PaymentManagement | Added `pagination?.totalCount` optional chaining |
| PaymentContext | Added `pagination` to context value |
| TenantAllocation | Extract tenant data from allocation object |
| ChatContext | Allow `setActiveConversation(null)` to close chat |
| TenantManagement | Include current unit in edit dropdown |
| AdminDashboard | Use AgentReports component for unified UI |

## RESPONSIVE DESIGN
```jsx
// Tailwind responsive classes
<div className="p-2 sm:p-4 md:p-6">
// Touch targets
<button className="min-h-[44px]">
```

## SOCKET.IO (Chat)
```javascript
const socket = io(API_BASE_URL, { 
  auth: { token: localStorage.getItem('token') } 
});
socket.on('new_message', handleMessage);
socket.on('chat_notification', handleNotification);
```