# BACKEND ARCHITECTURE - EXPRESS/NODE.JS

## TECH STACK
Express 4.22 | PostgreSQL (pg pool) | JWT | bcryptjs | Socket.io | node-cron | Cloudinary

## ARCHITECTURE
```
Routes → Middleware → Controllers → Services → Database (pg pool)
```

## AUTHENTICATION

### Middleware Pattern
```javascript
// authMiddleware.js
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
router.get('/admin-only', authMiddleware, requireRole(['admin']), handler);
router.get('/agent-or-admin', authMiddleware, requireRole(['agent', 'admin']), handler);
```

### JWT Flow
1. Extract from `Authorization: Bearer <token>`
2. Verify with `jsonwebtoken.verify()`
3. Attach `req.user = { id, role, ... }`

## CONTROLLER PATTERN
```javascript
const handler = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Business logic
    await client.query('COMMIT');
    res.json({ success: true, data: result, message: 'Done' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
};
```

## AGENT DATA ISOLATION

### Pattern (All Agent Queries)
```sql
WHERE property_id IN (
  SELECT property_id FROM agent_property_assignments 
  WHERE agent_id = $1 AND is_active = true
)
```

### Admin-Aware Endpoints
```javascript
// Controller logic
if (req.user.role === 'admin') {
  // Skip agent filter, return all data
} else {
  // Apply agent_property_assignments filter
}
```

## KEY SERVICES

### billingService.js
- `calculateTenantBill()`: Rent + Water + Arrears
- `allocatePayment()`: Arrears → Water → Rent → Advance
- `generateMonthlyBills()`: Bulk billing

### cronService.js
- Monthly billing (configurable day, default 28th at 9:00 AM)
- SMS queue processing with rate limiting
- Skip tenants with advance payments

### smsService.js
- Celcom SMS provider integration
- Queue-based retry (max 3 attempts)

## CLOUDINARY UPLOAD

### Middleware (uploadMiddleware.js)
```javascript
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'zakaria_rental/id_images' }
});
// Returns file.path = Cloudinary URL
```

### Controller
```javascript
const imageUrl = req.files['id_front_image'][0].path; // Cloudinary URL
await pool.query('UPDATE tenants SET id_front_image = $1', [imageUrl]);
```

## PAYMENT ALLOCATION LOGIC
```javascript
const allocatePayment = (amount, arrearsDue, waterDue, rentDue) => {
  let remaining = amount;
  const allocation = { arrears: 0, water: 0, rent: 0, advance: 0 };
  
  allocation.arrears = Math.min(remaining, arrearsDue);
  remaining -= allocation.arrears;
  
  allocation.water = Math.min(remaining, waterDue);
  remaining -= allocation.water;
  
  allocation.rent = Math.min(remaining, rentDue);
  remaining -= allocation.rent;
  
  allocation.advance = remaining;
  return allocation;
};
```

## CARRY-FORWARD LOGIC
```javascript
// For each future month until remaining exhausted:
const allocationAmount = Math.min(remaining, monthlyRent - alreadyPaid);
// Insert with is_advance_payment = true, original_payment_id = sourceId
remaining -= allocationAmount;
```

## ROUTE ORDER (CRITICAL)
```javascript
// ✅ CORRECT - specific before generic
router.get('/balance/:tenantId', getBalance);
router.get('/:id', getById);

// ❌ WRONG - generic catches all
router.get('/:id', getById);
router.get('/balance/:tenantId', getBalance); // Never reached
```

## KEY ROUTES

| Route | Purpose |
|-------|---------|
| `/api/tenants/:id/upload-id` | Cloudinary ID upload |
| `/api/allocations` | Tenant-unit CRUD |
| `/api/payments` | Payment CRUD with allocation |
| `/api/agent-properties/my-tenants` | Agent-scoped tenants |
| `/api/agent-properties/water-bills/balance/:tenantId` | Water balance |
| `/api/cron/agent/trigger-billing` | Agent SMS trigger |

## RECENT FIXES

| Issue | Solution |
|-------|----------|
| Duplicate messages | Removed redundant socket emission loop |
| SMS History 500 | Build count query separately, add `::uuid` cast |
| Notification FK error | Use `req.user.id` not `tenant_id` |
| Allocation 500 | Fixed WHERE clause, removed `updated_at` column |
| Carry-forward bug | Insert `allocationAmount` not total `amount` |

## ERROR HANDLING
```javascript
// HTTP Status Codes
200 // Success
201 // Created
400 // Bad request / validation
401 // Unauthorized
403 // Forbidden (role)
404 // Not found
500 // Server error

// Response Format
{ success: false, message: 'Human-readable error' }
```

## ENVIRONMENT VARIABLES
```
DATABASE_URL, JWT_SECRET, FRONTEND_URL
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
```
## USERS TABLE UPDATE

### profile_image Column
```sql
profile_image VARCHAR(500) DEFAULT NULL
-- Stores Cloudinary URL for user profile image

---

## Backend `backend/claude.md`

```markdown
## CORS CONFIGURATION FOR VERCEL

### Required Origins
```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://zakaria-rental-system.vercel.app',  // Production (HTTPS required!)
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

---

### For BACKEND backend/claude.md - Add this section:

```markdown
## COMPLAINT STEPS ENDPOINTS
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/complaints/:id/steps` | Get all steps |
| POST | `/complaints/:id/steps` | Add single step |
| PATCH | `/complaints/:id/steps/:stepId` | Toggle completion |

---

## For Backend `backend/claude.md` - No changes needed

The backend `/api/admin/company-info` endpoint already works correctly. The fix was on the frontend mapping.

---

## Quick Reference - Copy this to any relevant file:

```markdown
## JSPDF-AUTOTABLE v5.x FIX

### Problem
`doc.autoTable is not a function` with dynamic imports

### Solution
```javascript
const autoTableModule = await import('jspdf-autotable');
const autoTable = autoTableModule.default;
autoTable(doc, { ...options }); // doc as first argument, NOT doc.autoTable()

---

## Backend `backend/claude.md` - Add this section:

```markdown
## ADMIN DASHBOARD CONTROLLER (v19)

### File: controllers/dashboardController.js

### Endpoints
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/dashboard/stats` | Legacy stats (backward compatible) |
| GET | `/admin/dashboard/comprehensive-stats` | Detailed dashboard data |
| GET | `/admin/dashboard/recent-activities` | Last 10 system activities |
| GET | `/admin/dashboard/top-properties` | Top 6 properties by revenue |

### Schema Constraints
- `properties` has NO `is_active` column - dont filter by it
- Use `raised_at` for complaints (not `created_at`)
- Use `allocation_date` for tenant_allocations (not `created_at`)
- Use `sent_at` for SMS sent today count
- Payment status enum: `pending`, `completed`, `failed`, `overdue`
- Return `pendingPayments` (not `processingPayments`)

### Route Registration (adminRoutes.js)
``javascript
router.get('/dashboard/comprehensive-stats', protect, adminOnly, dashboardController.getComprehensiveStats);

---

## For `backend/claude.md` (Add at the end)

```markdown
## PROPERTY IMAGE MANAGEMENT (v4.0 - Option A)

### Architecture
Single `property_images` table stores both property and unit images. Differentiation is handled by the `unit_id` column:
- `unit_id = NULL` → Property showcase image
- `unit_id = UUID` → Unit walkthrough image

### Routes (properties.js)

#### Property Images
```javascript
// Upload property images
router.post('/:id/images', protect, adminOnly, uploadPropertyImages, async (req, res) => {
  // INSERT INTO property_images (property_id, image_url, ...) 
  // unit_id is NOT set (defaults to NULL)
});

// Delete property image
router.delete('/:id/images/:imageId', protect, adminOnly, async (req, res) => {
  // DELETE FROM property_images WHERE id = $1 AND property_id = $2
});

zakaria_rental/
├── property_images/
│   └── {property_id}/
│       └── image-{timestamp}.jpg
└── unit_images/
    └── {unit_id}/
        └── image-{timestamp}.jpg

## MARKETING & SHOWCASE ENDPOINTS
| Method | Route | Scope |
|--------|-------|-------|
| GET | `/api/properties/showcase/list` | List names/codes of all buildings |
| GET | `/api/properties/showcase/:id` | Full marketing data (Images + Units) |

### Implementation Note
These endpoints return public building data and images to Agents without requiring assignment in `agent_property_assignments`, enabling cross-portfolio marketing.