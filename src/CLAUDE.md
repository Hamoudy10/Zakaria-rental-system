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

---

## Frontend `src/claude.md`

```markdown
## VERCEL DEPLOYMENT

### Setup
- Auto-deploys on `git push origin main`
- Preview deployments for feature branches
- Environment variables set in Vercel Dashboard

### vercel.json (in project root)
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }],
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
## COMPLAINT MANAGEMENT

### Component: ComplaintManagement.jsx
- Create/Edit complaint modals
- Property → Tenant → Unit cascading selection
- Multi-category selection (JSONB array)
- Start Servicing modal (add resolution steps)
- PDF export with dynamic jsPDF import

### PDF Export Pattern
```javascript
const jsPDFModule = await import('jspdf');
const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default;
await import('jspdf-autotable');
const doc = new jsPDF('landscape', 'mm', 'a4');
doc.autoTable({...});

---

## For Frontend `src/claude.md` - Add this section:

```markdown
## COMPLAINT PDF EXPORT

### File: ComplaintManagement.jsx

### Dependencies
- jspdf: ^3.0.4
- jspdf-autotable: ^5.0.7

### jspdf-autotable v5.x Usage (Dynamic Import)
```javascript
// Load libraries
const jspdfModule = await import('jspdf');
const jsPDF = jspdfModule.jsPDF || jspdfModule.default;

const autoTableModule = await import('jspdf-autotable');
const autoTable = autoTableModule.default;

// Create doc and table
const doc = new jsPDF('landscape', 'mm', 'a4');
autoTable(doc, { startY: 55, head: [[...]], body: [...] }); // Pass doc as 1st arg

---

## For `src/utils/complaintPdfExport.js` - Add to relevant claude.md:

```markdown
## COMPLAINT PDF EXPORT UTILITY

### File: src/utils/complaintPdfExport.js

### Exported Functions
| Function | Description |
|----------|-------------|
| `exportComplaintsToPDF(complaints, options)` | Export multiple complaints |
| `exportSingleComplaintToPDF(complaint)` | Export single complaint detail |
| `getCompanyInfo()` | Fetch company info with 5-min cache |
| `clearCompanyInfoCache()` | Clear cache after settings update |

### Options for exportComplaintsToPDF
```javascript
{
  title: 'Complaints Report',
  includeSteps: true,
  filterStatus: null, // 'open', 'in_progress', 'resolved'
  isAdmin: false
}

---

## Frontend `src/claude.md` - Add this section:

```markdown
## ADMIN DASHBOARD OVERVIEW (v19)

### Component: AdminDashboard.jsx
- Fetches from `/admin/dashboard/comprehensive-stats`
- Uses `pendingPayments` (NOT `processingPayments`)
- Displays: Key Metrics, Financial Overview, Property Stats, Payment Activity, Agents, Complaints, SMS, Quick Actions, Monthly Trend, Recent Activities, Top Properties

### Data Access Pattern
```javascript
const { property, tenant, financial, agent, complaint, sms, payment, unitTypeBreakdown, monthlyTrend } = stats;
// All fields use optional chaining: payment?.pendingPayments || 0

---

## For `src/claude.md` (Add at the end)

```markdown
## PROPERTY MANAGEMENT REDESIGN (v4.0)

### Component: PropertyManagement.jsx
- **Form Changes:** Removed `unit_type` field from property creation/edit modals
- **Gallery System:** Added "Manage Showcase" button for property images
- **Unit Media:** Added camera icon with count to each unit for walkthrough photos

### Image Management Logic (Option A)
```javascript
// Client-side image segregation from single API response
const allImages = property.images || [];

// Property-level images (unit_id is NULL)
const propertyImages = allImages.filter(img => !img.unit_id);

// Unit-level images (unit_id matches)
unit.images = allImages.filter(img => img.unit_id === unit.id);
## AGENT SHOWCASE COMPONENT (Option B UI)
### UI/UX
- **Interactive Selection:** Dropdown to select any building from the global registry.
- **Filtering Logic:** Agents can toggle "Show Only Vacant Units" and "Items with Images" for focused tours.
- **Smooth Navigation:** Full-screen lightbox for high-res walkthroughs with keyboard support.

### Image Segregation (Option A Pattern)
- Frontend processes single `images[]` array from showcase endpoint.
- Segregation: `Building_Photos = images.filter(i => !i.unit_id)`
- Segregation: `Unit_Photos = images.filter(i => i.unit_id === active_unit_id)`
