REACT FRONTEND ARCHITECTURE & PATTERNS - SUMMARY

TECH STACK:
- React 18.2: Functional components with hooks
- Vite 4.5: Fast build tool with hot reload
- Tailwind CSS 3.3.6: Utility-first styling
- Lucide React: Icon library
- React Router DOM 6.20: Nested routing

COMPONENT ARCHITECTURE:
1. Pages: Route components (src/pages/*) - dashboards, main views
2. Components: Reusable UI (src/components/*) - forms, cards, tables
3. Context Providers: State management (src/context/*) - auth, payments, etc.
4. Services: API integration (src/services/*) - axios configuration

STANDARD COMPONENT PATTERN:
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

API INTEGRATION PATTERNS:
Axios Configuration (src/services/api.jsx):
- Base URL from VITE_API_URL or Render deployment
- Automatic JWT token attachment via interceptors
- 30-second timeout for M-Pesa requests
- Global 401 handling (auto-logout)

Available API Modules:
- API.auth: Authentication (login, register, profile)
- API.properties: Property & unit management
- API.payments: Rent & M-Pesa payments
- API.allocations: Tenant-unit allocations
- API.complaints: Complaint management
- API.notifications: Notification system
- API.chatAPI: Real-time messaging
- API.dashboard: Dashboard statistics

STATE MANAGEMENT PATTERN:
Context API with custom hooks:
- Each domain has its own context (Auth, Payments, Notifications)
- Consume via: useAuth(), usePayments(), etc.

AuthContext Example:
const AuthContext = createContext(undefined);
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  
  const value = useMemo(() => ({ user, token, login, logout }), [user, token]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

ROUTING STRUCTURE:
- Role-Based Routing: /login → /admin → /agent
- Route protection via AuthContext
- Lazy loading for performance:
  const UserManagement = lazy(() => import('../components/UserManagement'));

RESPONSIVE DESIGN PATTERNS:
Tailwind Responsive Classes:
<div className="p-2 sm:p-4 md:p-6">
Mobile Optimization:
- Touch targets: min-h-[44px] for buttons
- No horizontal scroll: overflow-x-hidden
- Simplified navigation on mobile

FORM HANDLING PATTERNS:
Controlled Component Pattern:
const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
const handleChange = (e) => {
  setFormData({ ...formData, [e.target.name]: e.target.value });
};

PERFORMANCE OPTIMIZATIONS:
- Lazy loading for route components
- useCallback/useMemo for expensive computations
- React.memo for pure components
- Loading states with skeleton UI

ERROR HANDLING:
Global Error Handling:
- Axios interceptors handle API errors
- 401 responses trigger automatic logout
- Network errors show user-friendly messages

Component-Level Error Handling:
try {
  const response = await API.getData();
} catch (error) {
  setError('Failed to load data. Please try again.');
  console.error('API Error:', error.response?.data || error.message);
}

REAL-TIME FEATURES:
Socket.io Integration:
const socket = io(API_BASE_URL, { auth: { token: localStorage.getItem('token') } });
socket.on('new_notification', (data) => { /* Update notifications */ });

CHAT MODULE ARCHITECTURE:
src/
├── context/ChatContext.jsx          # State management & socket
├── services/ChatService.js          # REST API service
├── components/chat/                  # UI Components
│   ├── ChatModule.jsx               # Main container
│   ├── MessageList.jsx              # Messages display
│   ├── MessageInput.jsx             # Message composer
│   ├── ConversationList.jsx         # Conversations sidebar
│   └── NewConversationModal.jsx     # New chat modal

NOTIFICATIONS SYSTEM:
- Smart Polling with Backoff: Starts at 30s, max 5 minutes
- Combined Unread Counts: Notifications + Chat messages
- Real-time updates via Socket.io

KEY COMPONENTS IMPLEMENTED:

1. TenantManagement.jsx:
   - Agent-facing tenant management with full CRUD
   - Upload ID images (front/back)
   - Search tenants by name, phone, national ID
   - Paginated listing with status indicators

2. AgentSMSManagement.jsx (3-tab architecture):
   Tab 1: Trigger Billing SMS - Month selection, property filtering
   Tab 2: Failed SMS Management - Bulk selection, individual retry
   Tab 3: SMS History - Filter by status, date range, property

3. AgentReports.jsx:
   - 7 Report Types: Tenants, Payments, Revenue, Properties, Complaints, Water Bills, SMS
   - PDF export with jsPDF + jspdf-autotable
   - Excel export with ExcelJS
   - Company branding with logo placeholder

API INTEGRATION UPDATES:
New API Endpoints in api.jsx:
const billingAPI = {
  triggerAgentBilling: (data) => api.post('/cron/agent/trigger-billing', data),
  getAgentFailedSMS: (params) => api.get('/cron/agent/failed-sms', { params }),
  retryAgentFailedSMS: (data) => api.post('/cron/agent/retry-sms', data),
  getSMSHistory: (params) => api.get('/cron/sms-history', { params }),
};

PROPERTY CONTEXT ENHANCEMENTS (UPDATE 6.0):
Fixed State Management Pattern:

OLD (Problematic):
if (properties.length > 0 && !forceRefresh) {
  console.log('✅ Using cached properties')
  return  // ⚠️ Returns early, units never fetched!
}

NEW (Fixed):
const propertiesWithUnits = await Promise.all(
  propertiesData.map(async (property) => {
    const unitsResponse = await propertyAPI.getPropertyUnits(property.id)
    const units = unitsResponse.data?.data || unitsResponse.data?.units || []
    
    return {
      ...property,
      units: Array.isArray(units) ? units : [],
      total_units: units.length,
    }
  })
)

Unit Management Form Corrections:
- Features format changed from array [] to object {}
- Removed unit_code input field (backend generates automatically)
- Backend creates unit_code format: ${property_code}-${unit_number}

Features Handling Pattern:
const toggleFeature = (feature) => {
  setNewUnit(prev => ({
    ...prev,
    features: { ...prev.features, [feature]: !prev.features[feature] }
  }))
};

Correct Unit Creation Payload:
const unitData = {
  unit_number: newUnit.unit_number,      // "01"
  unit_type: newUnit.unit_type,          // "studio"
  rent_amount: parseFloat(newUnit.rent_amount),      // 10000
  deposit_amount: parseFloat(newUnit.deposit_amount), // 10000
  description: newUnit.description || '',
  features: newUnit.features              // {}, not []
};

TENANT MANAGEMENT FORM FIXES (UPDATE 7.0):
Phone Number Handling:
- User inputs: 0712345678
- Form state: 0712345678 (as entered)
- Backend storage: 254712345678 (automatic conversion)
- Table display: 0712345678 (converted back)

Unit Allocation:
- Changed from optional to required field
- Added HTML5 required attribute
- Validation ensures unit selection before submission

Available Units Dropdown:
- Fetches units only from agent's assigned properties
- Filters: is_occupied === false && is_active === true
- Shows count of available units

FRONTEND API INTEGRATION FIXES (UPDATE 8.0):
API Service Updates Required:
- Tenants endpoints now properly loaded (not placeholder)
- ID upload now accepts base64/URLs instead of form data

Updated Tenant Form for Simplified ID Upload:
<input 
  type="text"
  placeholder="Front ID Image URL or base64"
  value={formData.id_front_image}
  onChange={(e) => setFormData({...formData, id_front_image: e.target.value})}
/>

API Endpoints Status Check:
✅ WORKING (After backend fix):
- GET /api/tenants - List tenants with search/pagination
- POST /api/tenants - Create tenant with allocation
- GET /api/tenants/available-units - Get available units
- POST /api/tenants/:id/upload-id - Upload ID images (base64/URL)
- PUT /api/tenants/:id - Update tenant
- DELETE /api/tenants/:id - Delete tenant

IMPLEMENTATION STATUS CHECKLIST:
✅ COMPLETED:
1. Database Schema: Arrears tracking and billing tables
2. Backend Services: CronService, BillingService, enhanced SMS
3. Admin Settings: Configurable billing with validation
4. Payment Allocation: Rent/water/arrears split logic
5. SMS Templates: Professional bill breakdown messages
6. Agent SMS Management: Complete 3-tab interface
7. PropertyContext state management fixed
8. Unit creation with correct feature format
9. Real-time property statistics updates
10. Tenant management with phone validation

✅ READY FOR TESTING:
1. Agent SMS triggering with missing water bill warnings
2. Failed SMS management and retry system
3. SMS history with filtering capabilities
4. Real-time SMS queue monitoring
5. Unit creation with correct feature format
6. Real-time property statistics updates

ISSUES IDENTIFIED:
1. API Structure Mismatch: Current API object doesn't have expected modules
2. Export Dependencies: jspdf-autotable not properly initialized
3. Missing Endpoints: Some reports need backend implementation

TESTING INSTRUCTIONS:
1. Tenant Creation: Verify POST /api/tenants works with phone conversion
2. ID Image Upload: Test with base64 string or image URL
3. Agent Data Isolation: Agent should only see assigned properties' units
4. SMS Trigger: Test billing SMS with missing water bills warning
5. Export Functionality: Test PDF and Excel export with company branding

FRONTEND FILE STRUCTURE:
src/
├── components/
│   ├── TenantManagement.jsx       # Tenant CRUD with phone fixes
│   ├── UnitManagement.jsx         # Unit CRUD with features fix
│   ├── AgentSMSManagement.jsx     # 3-tab SMS system
│   ├── AgentReports.jsx           # Reports with export
│   ├── AgentWaterBills.jsx        # Water bills with SMS
│   └── chat/                      # Chat components
├── context/
│   ├── AuthContext.jsx           # Authentication state
│   ├── PropertyContext.jsx       # Property & unit state (rewritten)
│   ├── ChatContext.jsx           # Chat state management
│   └── NotificationContext.jsx   # Notifications with polling
├── services/
│   ├── api.jsx                   # Axios configuration & API calls
│   └── ChatService.js            # REST API for chat
├── utils/
│   ├── pdfExport.js              # PDF export utility
│   └── excelExport.js            # Excel export utility
└── pages/
    ├── AdminDashboard.jsx        # Admin dashboard with tabs
    ├── AgentDashboard.jsx        # Agent dashboard with tabs
    └── Login.jsx                 # Authentication page

LAST UPDATED: Frontend architecture complete with all critical fixes applied.
UPDATE 9.0 - FILE UPLOAD INTEGRATION CONFIRMED:

FRONTEND STATUS: No changes required - implementation was already correct

CONFIRMED WORKING PATTERN (TenantManagement.jsx):
const handleImageUpload = async (tenantId) => {
  const formData = new FormData();
  if (idFrontImage) formData.append('id_front_image', idFrontImage);
  if (idBackImage) formData.append('id_back_image', idBackImage);
  await API.tenants.uploadIDImages(tenantId, formData);
};

API INTEGRATION:
- Endpoint: POST /api/tenants/:id/upload-id
- Content-Type: multipart/form-data (automatically set by FormData)
- Headers: Authorization token included via axios interceptors
- Response: { success: true, data: { id_front_image: '/uploads/...', ... } }

IMAGE DISPLAY PATTERN:
// For displaying uploaded images
<img 
  src={`https://zakaria-rental-system.onrender.com${tenant.id_front_image}`}
  alt="ID Front"
  className="max-w-full h-auto"
/>

FILE INPUT COMPONENT (Recommended pattern):
<input
  type="file"
  accept=".jpg,.jpeg,.png"
  onChange={(e) => setIdFrontImage(e.target.files[0])}
  className="border rounded p-2"
/>

VALIDATION ALIGNMENT:
- Frontend: Accepts .jpg, .jpeg, .png (via accept attribute)
- Backend: Same validation via Multer middleware
- Size: Both enforce 5MB limit

ERROR HANDLING FLOW:
1. File selection → Client-side validation (type, size)
2. Form submission → Backend validation (Multer middleware)
3. Upload process → Progress indication with setUploading(true)
4. Success/Error → Appropriate user feedback

PERFORMANCE NOTES:
- FormData uses native browser multipart encoding
- No base64 conversion overhead
- Direct file upload to backend
- Images stored as files, not in database BLOBs

TESTING CONFIRMED:
✅ Tenant creation with ID images works
✅ File type validation aligned frontend/backend
✅ Error messages properly displayed
✅ Image preview/display functional

UPDATE 10.0 - CLOUDINARY INTEGRATION CONFIRMED

FRONTEND STATUS: No functional changes were required.
-   The `handleImageUpload` function in `TenantManagement.jsx` correctly uses `FormData` and the existing `API.tenants.uploadIDImages` endpoint.
-   The backend middleware and controller changes are transparent to the frontend.

IMAGE DISPLAY PATTERN:
-   After a successful upload, the backend returns data containing Cloudinary URLs in `id_front_image` and `id_back_image`.
-   The frontend can display these images directly using the returned URL:
    ```jsx
    <img
        src={tenantData.id_front_image} // Full Cloudinary URL, e.g., "https://res.cloudinary.com/..."
        alt="ID Front"
        className="max-w-full h-auto"
    />
    ```
-   CLOUDINARY BENEFITS: The URL points to Cloudinary's CDN, which provides automatic image optimization, fast delivery, and format selection based on the client browser.

DEVELOPER NOTES:
-   The frontend remains agnostic to the storage backend (local, S3, Cloudinary).
-   The contract is simply: "POST FormData with images, receive URLs in response."
-   This abstraction makes the frontend resilient to future changes in the storage infrastructure.
UPDATE 12.0 - TENANT ALLOCATION COMPONENT SYNCHRONIZATION WITH BACKEND API

FRONTEND ARCHITECTURE UPDATES:

PROBLEM RESOLVED: "Unknown Tenant" display in Tenant Allocation tab
ROOT CAUSE: Frontend searching users array, backend returning from tenants table

FRONTEND FIXES IMPLEMENTED (/src/components/TenantAllocation.jsx):

1. DATA EXTRACTION FUNCTIONS UPDATED:
   - REMOVED: getTenantName() function (lines ~33-46)
   - ADDED: getTenantDetails(allocation) function (lines ~33-45)
   - ADDED: getUnitDetails(allocation) function (lines ~47-57)

2. NEW DATA FLOW PATTERN:
   OLD: tenantId → search users array → display name
   NEW: allocation object → extract tenant_first_name, tenant_last_name → display

3. API RESPONSE FIELD MAPPING:
   - tenant_first_name: allocation.tenant_first_name
   - tenant_last_name: allocation.tenant_last_name  
   - tenant_full_name: allocation.tenant_full_name
   - tenant_phone: allocation.tenant_phone
   - tenant_national_id: allocation.tenant_national_id
   - unit_code: allocation.unit_code
   - property_name: allocation.property_name

4. COMPONENT RENDERING UPDATES:
   - Mobile Card View: Uses tenant.fullName from getTenantDetails()
   - Desktop Table View: Uses tenant.fullName and tenant.phone
   - Both views now show tenant national ID in desktop mode

KEY CODE CHANGES:

BEFORE (Problematic):
const getTenantName = useCallback((tenantId) => {
  const tenant = safeUsers.find(user => user.id === tenantId)
  return {
    firstName: tenant.first_name || 'Unknown',
    lastName: tenant.last_name || 'Tenant'
  }
}, [safeUsers])

AFTER (Fixed):
const getTenantDetails = useCallback((allocation) => {
  return {
    firstName: allocation.tenant_first_name || 'Unknown',
    lastName: allocation.tenant_last_name || 'Tenant',
    fullName: allocation.tenant_full_name || 
      `${allocation.tenant_first_name || 'Unknown'} ${allocation.tenant_last_name || 'Tenant'}`,
    phone: allocation.tenant_phone || 'N/A'
  }
}, [])

RENDERING PATTERNS UPDATED:

Mobile View (lines ~290-295):
<div className="text-sm font-medium text-gray-900">
  {tenant.fullName}  ← Using new fullName field
</div>
<div className="text-xs text-gray-500">{tenant.phone}</div>

Desktop View (lines ~375-380):
<div className="text-sm font-medium text-gray-900 whitespace-nowrap">
  {tenant.fullName}  ← Using new fullName field  
</div>
<div className="text-sm text-gray-500 whitespace-nowrap">
  {tenant.phone} • ID: {tenant.nationalId}  ← Added national ID
</div>

DATA FLOW VALIDATION:
✅ Backend API returns tenant data in allocations response
✅ Frontend extracts data directly from allocation object
✅ No unnecessary API calls to users endpoint
✅ Single source of truth: allocation data from /api/allocations

PERFORMANCE IMPROVEMENTS:
- Eliminated redundant search through users array
- Reduced API dependencies
- Faster rendering with direct data access
- Better TypeScript/type safety with predictable fields

TESTING CONFIRMED:
✅ Tenant names display correctly from tenants table
✅ Phone numbers and national IDs show properly
✅ Mobile and desktop views synchronized
✅ No more "Unknown Tenant" display
✅ Allocation creation/deletion maintains proper data flow

FRONTEND STATUS: TenantAllocation component now fully synchronized with backend API response structure and displays accurate tenant information.

UPDATE 13.0 - CHAT CONTEXT & UI FIXES

PROBLEM RESOLVED:
1.  The "X" button on the chat header was unresponsive and did not close the active conversation view.
2.  Unread message counts were being incremented incorrectly due to duplicate socket events.

ROOT CAUSE:
-   The `setActiveConversation` function in `ChatContext.jsx` had a guard `if (!conv) return;`, which prevented setting the active conversation to `null`.
-   The frontend was correctly structured to handle single events, but the backend was emitting duplicates.

SOLUTION IMPLEMENTED:
-   The guard clause in `setActiveConversation` was removed, allowing `setActiveConversation(null)` to be dispatched. This correctly unmounts the message view and shows the `EmptyChatState`.
-   The `new_message` socket listener in `ChatContext.jsx` was confirmed to have deduplication logic, making it resilient to the (now-fixed) backend issue.

FILE MODIFIED: `/src/context/ChatContext.jsx`.

---
UPDATE 14.0 - NEW COMPONENT: TENANT DETAILS MODAL

FEATURE IMPLEMENTED: A read-only "View Records" modal was added to `TenantManagement.jsx`.

COMPONENT STRUCTURE:
-   **Trigger:** A new "View" button in the tenant table.
-   **State:** Added `showViewModal` and `selectedTenantData` to manage the modal's state and data.
-   **Data Flow:**
    1.  `handleViewDetails(tenant)` is called on button click.
    2.  An API call is made to `GET /api/tenants/:id` to fetch full details.
    3.  The response is stored in `selectedTenantData`, and `showViewModal` is set to `true`.
-   **Modal UI:**
    -   Displays data in organized sections (Personal, Lease, Emergency, Payments, ID Docs).
    -   Renders ID images directly from the Cloudinary URLs (`id_front_image`, `id_back_image`).
    -   Includes a "Close" button and a convenient "Edit Tenant" button to switch to the edit form.

FILE MODIFIED: `/src/components/TenantManagement.jsx`.

---
UPDATE 15.0 - ADMIN REPORTS REFACTORING

PROBLEM RESOLVED: The Admin "Reports" tab was not functional and used a different UI from the Agent's tab.

ARCHITECTURAL CHANGE: Replaced a legacy report component with the `AgentReports.jsx` component for UI consistency across dashboards.

IMPLEMENTATION DETAILS:
1.  **Component Swap:** In `AdminDashboard.jsx`, the "Reports" tab now lazy-loads and renders `<AgentReports />` instead of the old component.
2.  **API Helper Fix (`apiHelper.js`):** The `getReportAPI` helper function was updated. It no longer has separate logic for `admin` and `agent`. It now consistently uses the `agentService` API calls (e.g., `/api/agent-properties/my-tenants`) for both roles.
3.  **Data Consistency:** This change ensures that the admin report tab receives data in the exact flat-array structure that the `AgentReports.jsx` component expects, resolving data fetching and display errors.

FILES MODIFIED: `/src/pages/AdminDashboard.jsx`, `/src/utils/apiHelper.js`.
UPDATE 16.0 - PAYMENT MANAGEMENT COMPONENT FIXES

CRASH FIX: `Cannot read properties of undefined (reading 'totalCount')`
- ROOT CAUSE: `pagination` was undefined on initial render before API response
- FIX: Added optional chaining throughout (`pagination?.totalCount || 0`)

PAYMENTCONTEXT.JSX CRITICAL FIX:
- `pagination` state was NOT included in context `value` object
- Added `pagination` to both `value` object and `useMemo` dependencies
- Frontend components can now access pagination data correctly

RESPONSE HANDLING STANDARDIZATION:
- All API responses now expected as `response.data.data.payments` (not `response.data.payments`)
- `fetchTenantHistory()` returns `{ payments: [], summary: {} }` for modal display
- Added proper error handling with `historyError` state for modal

PAYMENT MANAGEMENT DATA FLOW: