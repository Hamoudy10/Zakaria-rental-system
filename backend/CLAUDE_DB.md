# DATABASE SCHEMA - POSTGRESQL

## OVERVIEW
PostgreSQL 15+ on Supabase | UUIDs for PKs | Soft deletes (`is_active`) | JSONB for flexible data

---

## CORE TABLES

### users (System Users - Admins/Agents)
```sql
id UUID PRIMARY KEY
national_id VARCHAR UNIQUE NOT NULL
email, phone_number, password_hash
role ENUM('admin', 'agent', 'tenant')
is_active BOOLEAN DEFAULT true
notification_preferences JSONB
```

### tenants (Renters - SEPARATE from users)
```sql
id UUID PRIMARY KEY
national_id VARCHAR UNIQUE NOT NULL
first_name, last_name, phone_number
id_front_image, id_back_image VARCHAR  -- Cloudinary URLs
emergency_contact_name, emergency_contact_phone
```

### properties
```sql
id UUID PRIMARY KEY
property_code VARCHAR UNIQUE NOT NULL  -- e.g., "MJ"
name, address, county, town
total_units, available_units INTEGER   -- available_units is cached count
created_by UUID REFERENCES users(id)
```

### property_units
```sql
id UUID PRIMARY KEY
property_id UUID REFERENCES properties(id)
unit_code VARCHAR UNIQUE NOT NULL      -- Generated: property_code + "-" + unit_number
unit_number VARCHAR NOT NULL           -- e.g., "01"
unit_type ENUM('bedsitter','studio','one_bedroom','two_bedroom','three_bedroom')
rent_amount, deposit_amount NUMERIC
features JSONB DEFAULT '{}'            -- Object NOT array: {"Parking": true}
is_occupied BOOLEAN DEFAULT false
is_active BOOLEAN DEFAULT true
```

### tenant_allocations
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
unit_id UUID REFERENCES property_units(id)
lease_start_date, lease_end_date DATE
monthly_rent, security_deposit NUMERIC
arrears_balance NUMERIC DEFAULT 0
rent_due_day INTEGER DEFAULT 1
grace_period_days INTEGER DEFAULT 5
is_active BOOLEAN DEFAULT true
-- NOTE: No 'updated_at' column exists
```

### agent_property_assignments
```sql
id UUID PRIMARY KEY
agent_id UUID REFERENCES users(id)
property_id UUID REFERENCES properties(id)
is_active BOOLEAN DEFAULT true
```

---

## FINANCIAL TABLES

### rent_payments
```sql
id UUID PRIMARY KEY
tenant_id UUID, unit_id UUID
mpesa_transaction_id, mpesa_receipt_number VARCHAR
phone_number VARCHAR                   -- Stored as 254xxxxxxxxx
amount NUMERIC
payment_month DATE                     -- First of month: YYYY-MM-01
status ENUM('pending','processing','completed','failed','overdue')
allocated_to_arrears NUMERIC DEFAULT 0
allocated_to_water NUMERIC DEFAULT 0
allocated_to_rent NUMERIC DEFAULT 0
remaining_balance NUMERIC DEFAULT 0
is_advance_payment BOOLEAN DEFAULT false
original_payment_id UUID               -- Links carry-forward to source
payment_method VARCHAR                 -- 'mpesa', 'carry_forward'
```

### water_bills
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
unit_id UUID, property_id UUID, agent_id UUID
amount NUMERIC NOT NULL
bill_month DATE NOT NULL               -- Stored as YYYY-MM-01
notes TEXT
UNIQUE(tenant_id, bill_month)
```

### sms_queue
```sql
id UUID PRIMARY KEY
recipient_phone VARCHAR                -- 254xxxxxxxxx format
message TEXT
message_type VARCHAR                   -- 'bill_notification', 'payment_confirmation'
status ENUM('pending','sent','failed')
billing_month VARCHAR                  -- YYYY-MM format
attempts INTEGER DEFAULT 0             -- Max 3
error_message TEXT
agent_id UUID REFERENCES users(id)
```

### billing_runs (Audit Log)
```sql
id UUID PRIMARY KEY
month VARCHAR                          -- YYYY-MM
total_tenants, bills_sent, bills_failed, skipped INTEGER
failed_details, skipped_details JSONB
run_date TIMESTAMP
```

---

## CRITICAL RELATIONSHIPS

```
users (admin/agent) ←→ agent_property_assignments ←→ properties
                                                          ↓
tenants ←→ tenant_allocations ←→ property_units ←─────────┘
    ↓              ↓
rent_payments  water_bills
```

**IMPORTANT:** 
- `notifications.user_id` → `users.id` (NOT tenants)
- `tenant_allocations.tenant_id` → `tenants.id` (NOT users)

---

## KEY QUERIES

### Agent Data Isolation Pattern
```sql
WHERE property_id IN (
  SELECT property_id FROM agent_property_assignments 
  WHERE agent_id = $1::uuid AND is_active = true
)
```

### Water Bill Balance Calculation
```sql
-- Balance = Total Billed - Total Paid
SELECT 
  COALESCE(SUM(wb.amount), 0) as total_billed,
  COALESCE(SUM(rp.allocated_to_water), 0) as total_paid,
  COALESCE(SUM(wb.amount), 0) - COALESCE(SUM(rp.allocated_to_water), 0) as balance
FROM water_bills wb
LEFT JOIN rent_payments rp ON wb.tenant_id = rp.tenant_id
WHERE wb.tenant_id = $1
```

### Available Units Recalculation
```sql
UPDATE properties p SET available_units = (
  SELECT COUNT(*) FROM property_units 
  WHERE property_id = p.id AND is_active = true AND is_occupied = false
) WHERE id = $1
```

### Tenant List with Allocation Data
```sql
SELECT t.*, ta.monthly_rent, ta.arrears_balance, ta.lease_start_date,
       pu.unit_code, p.name as property_name
FROM tenants t
LEFT JOIN tenant_allocations ta ON t.id = ta.tenant_id AND ta.is_active = true
LEFT JOIN property_units pu ON ta.unit_id = pu.id
LEFT JOIN properties p ON pu.property_id = p.id
```

---

## INDEXES (Performance)
```sql
CREATE INDEX idx_property_units_property_id ON property_units(property_id);
CREATE INDEX idx_property_units_occupied ON property_units(is_occupied) WHERE is_active = true;
CREATE INDEX idx_tenant_allocations_active ON tenant_allocations(tenant_id, is_active);
CREATE INDEX idx_rent_payments_tenant_month ON rent_payments(tenant_id, payment_month);
CREATE INDEX idx_water_bills_tenant_month ON water_bills(tenant_id, bill_month);
CREATE INDEX idx_sms_queue_status ON sms_queue(status) WHERE status = 'failed';
```

---

## DATA INTEGRITY NOTES

1. **available_units** is cached; can drift from actual COUNT
2. **bill_month** always stored as first of month (YYYY-MM-01)
3. **phone_number** stored as 254xxxxxxxxx, displayed as 0xxxxxxxxx
4. **features** is JSONB object `{}`, not array `[]`
5. **tenant_allocations** has NO `updated_at` column
6. Unit code generated: `{property_code}-{unit_number}`

### Cloudinary Storage
- Folder: `zakaria_rental/profile_images`
- Naming: `profile-{userId}-{timestamp}`
- Transformation: 500x500, face-focused crop
## PROFILE IMAGE UPLOAD

### Endpoint

---

## Database `backend/claude_db.md`

```markdown
## ADMIN_SETTINGS TABLE (Company Info)

### Structure
```sql
CREATE TABLE admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
## COMPLAINT_STEPS TABLE
```sql
CREATE TABLE complaint_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_description TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP,
  completed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(complaint_id, step_order)
);

---

## Database `backend/claude_db.md` - Add this section:

```markdown
## SCHEMA CONSTRAINTS (v19)

### Properties Table
- NO `is_active` column exists
- Columns: `id`, `property_code`, `name`, `address`, `county`, `town`, `description`, `total_units`, `available_units`, `created_by`, `created_at`, `updated_at`, `unit_type`

### Enum Values
```sql
-- payment_status (NO 'processing' value)
pending, completed, failed, overdue

-- unit_type
bedsitter, studio, one_bedroom, two_bedroom, three_bedroom, shop, hall

---

## For `backend/claude_db.md` (Add at the end)

```markdown
## PROPERTY_IMAGES TABLE (Option A - Unified Schema)

### Purpose
Single table architecture storing both property showcase images and unit walkthrough images.

### Schema
```sql
CREATE TABLE property_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES property_units(id) ON DELETE CASCADE, -- NULL = property, NOT NULL = unit
  image_url VARCHAR(500) NOT NULL,
  image_type VARCHAR(50) DEFAULT 'general', -- 'exterior', 'interior', 'amenity', etc.
  caption VARCHAR(255),
  display_order INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT NOW()
);