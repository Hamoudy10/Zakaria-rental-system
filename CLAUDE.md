# ZAKARIA RENTAL SYSTEM - PROJECT CONTEXT

## OVERVIEW
Full-stack rental management platform for Kenya with multi-role access (Admin/Agent/Tenant), M-Pesa payments, automated billing, SMS notifications, and real-time chat.

## DEPLOYMENT
- **Frontend:** React + Vite (localhost:5173 dev)
- **Backend:** Express on Render (https://zakaria-rental-system.onrender.com)
- **Database:** PostgreSQL on Supabase
- **Storage:** Cloudinary (ID images)
- **Auth:** JWT (Header: `Authorization: Bearer <token>`)

## TECH STACK
| Layer | Technologies |
|-------|-------------|
| Frontend | React 18.2, React Router 6, Axios, Tailwind CSS, Socket.io-client, Lucide React |
| Backend | Express 4.22, PostgreSQL (pg), JWT, bcryptjs, Socket.io, node-cron |
| Exports | ExcelJS, jsPDF |

## CORE FEATURES
1. **Automated Billing:** Monthly billing (configurable day 1-28), SMS via Celcom
2. **Payment Allocation:** Arrears → Water → Rent → Advance (strict order)
3. **Agent Isolation:** Agents only see assigned properties via `agent_property_assignments` table
4. **M-Pesa Integration:** Phone format conversion (07xx → 2547xx)
5. **Real-time Chat:** Socket.io rooms per conversation

## KEY ENTITIES
- **users:** System users (admin/agent roles)
- **tenants:** Renters (separate from users table)
- **properties / property_units:** Buildings and units
- **tenant_allocations:** Tenant↔Unit links with arrears tracking
- **rent_payments:** M-Pesa transactions with allocation splits
- **water_bills:** Monthly water charges (unique per tenant/month)
- **sms_queue:** SMS retry system

## CRITICAL PATTERNS

### API Response Format
```json
{ "success": boolean, "data": any, "message?": string }
```

### Phone Number Flow
- Input: `0712345678` → Storage: `254712345678` → Display: `0712345678`

### Unit Features
- Store as JSON Object `{}`, NOT Array `[]`

### Route Order
- Specific routes (`/balance/:id`) MUST come before generic (`/:id`)

## RECENT CRITICAL FIXES (v10-17)

| Issue | Fix |
|-------|-----|
| Cloudinary Integration | Replaced local filesystem with `multer-storage-cloudinary` |
| Allocation Display | API returns `tenant_full_name` directly (not from users table) |
| Payment Crash | Added optional chaining for `pagination?.totalCount` |
| Carry-Forward Bug | Now allocates `monthly_rent` per month, not total balance |
| SMS History 500 | Fixed UUID/BIGINT type mismatch in SQL query |
| Water Balance | New endpoint calculates `Billed - Paid` from payments |

## FILE STRUCTURE
```
├── src/
│   ├── components/     # TenantManagement, AgentSMSManagement, AgentReports
│   ├── context/        # AuthContext, PropertyContext, PaymentContext, ChatContext
│   ├── services/       # api.jsx, ChatService.js
│   └── utils/          # pdfExport.js, excelExport.js
└── backend/
    ├── controllers/    # Business logic
    ├── routes/         # API endpoints
    ├── services/       # billingService, smsService
    └── middleware/     # authMiddleware, uploadMiddleware (Cloudinary)
```

## CONVENTIONS
1. Database uses UUIDs, soft deletes (`is_active`)
2. All agent queries join `agent_property_assignments`
3. Controllers check role: Admin = all data, Agent = filtered
4. Notifications reference `users.id`, NOT `tenants.id`

## RECENT UPDATES (Profile Image Upload)

| Feature | Implementation |
|---------|---------------|
| Profile Image Upload | Drag & drop with Cloudinary storage |
| Image Storage | `zakaria_rental/profile_images` folder |
| File Validation | JPEG, PNG, WebP only, max 5MB |
| API Endpoint | `PUT /api/auth/profile` (multipart/form-data) |
| Delete Endpoint | `DELETE /api/auth/profile/image` |

## PROFILE IMAGE DISPLAY (App.jsx)

### SimpleUserAvatar Component
Reusable avatar component with profile image + fallback to initials.

```jsx
<SimpleUserAvatar user={user} size="md" /> // sm, md, lg, xl

## SYSTEM SETTINGS - ADMIN PROFILE IMAGE UPLOAD

### Features
- Drag & drop profile image upload
- Click to upload alternative
- Image preview before saving
- Delete existing image
- Fallback to initials
- Auto-refresh header avatar after save

### Uses AuthContext Methods
- `updateUserProfile(formData)` - Save profile with image
- `refreshUser()` - Refresh user state after save

### Cloudinary Storage
- Folder: `zakaria_rental/profile_images`
- Max size: 5MB
- Formats: JPEG, PNG, WebP
## PDF & EXCEL EXPORT WITH COMPANY BRANDING

### Features
- Company logo from Cloudinary displayed on documents
- Company name, address, phone, email in header
- Professional styling with blue theme
- Automatic totals calculation
- Page numbers (PDF)
- 5-minute caching for company info

### Files
- `src/utils/pdfExport.js` - PDF generation with jsPDF + autoTable
- `src/utils/excelExport.js` - Excel generation with ExcelJS

### API Dependency
- `GET /api/admin/company-info` - Fetches company branding

### Cache Control
```javascript
import { clearCompanyInfoCache } from '../utils/pdfExport';
clearCompanyInfoCache(); // Call when company info is updated