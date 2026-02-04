# DATABASE SCHEMA - POSTGRESQL

## OVERVIEW
PostgreSQL 15+ on Supabase | UUIDs for PKs | Soft deletes (`is_active`) | JSONB for flexible data

---

## CORE TABLES

### users (System Users - Admins/Agents)
```sql
id UUID PRIMARY KEY
national_id VARCHAR UNIQUE NOT NULL
email, phone_number, password_hash VARCHAR
first_name, last_name VARCHAR
role ENUM('admin', 'agent', 'tenant')
is_active BOOLEAN DEFAULT true
is_online BOOLEAN DEFAULT false          -- Added for chat
last_seen TIMESTAMP                       -- Added for chat
profile_image VARCHAR(500) DEFAULT NULL   -- Cloudinary URL
notification_preferences JSONB
```

### tenants (Renters - SEPARATE from users)
```sql
id UUID PRIMARY KEY
national_id VARCHAR UNIQUE NOT NULL
first_name, last_name, phone_number VARCHAR
email VARCHAR
id_front_image, id_back_image VARCHAR    -- Cloudinary URLs
emergency_contact_name, emergency_contact_phone VARCHAR
```

### properties
```sql
id UUID PRIMARY KEY
property_code VARCHAR UNIQUE NOT NULL    -- e.g., "MJ"
name, address, county, town VARCHAR
description TEXT
total_units, available_units INTEGER     -- available_units is cached count
created_by UUID REFERENCES users(id)
created_at, updated_at TIMESTAMP
-- NOTE: NO is_active column exists
```

### property_units
```sql
id UUID PRIMARY KEY
property_id UUID REFERENCES properties(id)
unit_code VARCHAR UNIQUE NOT NULL        -- Generated: property_code + "-" + unit_number
unit_number VARCHAR NOT NULL             -- e.g., "01"
unit_type ENUM('bedsitter','studio','one_bedroom','two_bedroom','three_bedroom','shop','hall')
rent_amount, deposit_amount NUMERIC
features JSONB DEFAULT '{}'              -- Object NOT array: {"Parking": true}
is_occupied BOOLEAN DEFAULT false
is_active BOOLEAN DEFAULT true
created_at, updated_at TIMESTAMP
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
allocated_by UUID REFERENCES users(id)
allocation_date TIMESTAMP DEFAULT NOW()
is_active BOOLEAN DEFAULT true
last_billing_date, next_billing_date DATE
updated_at TIMESTAMP DEFAULT NOW()       -- ADDED via migration
```

### agent_property_assignments
```sql
id UUID PRIMARY KEY
agent_id UUID REFERENCES users(id)
property_id UUID REFERENCES properties(id)
is_active BOOLEAN DEFAULT true
created_at TIMESTAMP
```

---

## FINANCIAL TABLES

### rent_payments
```sql
id UUID PRIMARY KEY
tenant_id UUID, unit_id UUID, property_id UUID
mpesa_transaction_id, mpesa_receipt_number VARCHAR
phone_number VARCHAR                     -- Stored as 254xxxxxxxxx
amount NUMERIC
payment_date, payment_month DATE         -- payment_month = First of month: YYYY-MM-01
status ENUM('pending','completed','failed','overdue')  -- NO 'processing'
allocated_to_arrears NUMERIC DEFAULT 0
allocated_to_water NUMERIC DEFAULT 0
allocated_to_rent NUMERIC DEFAULT 0
remaining_balance NUMERIC DEFAULT 0
is_advance_payment BOOLEAN DEFAULT false
original_payment_id UUID                 -- Links carry-forward to source
payment_method VARCHAR                   -- 'mpesa', 'carry_forward'
created_at, updated_at TIMESTAMP
```

### water_bills
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
unit_id UUID, property_id UUID, agent_id UUID
amount NUMERIC NOT NULL
bill_month DATE NOT NULL                 -- Stored as YYYY-MM-01
notes TEXT
created_at TIMESTAMP
UNIQUE(tenant_id, bill_month)
```

### expenses
```sql
id UUID PRIMARY KEY
expense_date DATE NOT NULL
amount NUMERIC NOT NULL
description TEXT NOT NULL
category VARCHAR NOT NULL
subcategory VARCHAR
property_id UUID REFERENCES properties(id)
unit_id UUID REFERENCES property_units(id)
complaint_id UUID REFERENCES complaints(id)
recorded_by UUID REFERENCES users(id)
approved_by UUID REFERENCES users(id)
approved_at TIMESTAMP
status ENUM('pending','approved','rejected','reimbursed') DEFAULT 'pending'
rejection_reason TEXT
payment_method VARCHAR DEFAULT 'cash'
receipt_number VARCHAR
receipt_image_url VARCHAR
vendor_name, vendor_phone VARCHAR
notes TEXT
is_recurring BOOLEAN DEFAULT false
recurring_frequency VARCHAR
expense_type VARCHAR
created_at, updated_at TIMESTAMP
```

### expense_categories
```sql
id UUID PRIMARY KEY
name VARCHAR UNIQUE NOT NULL
description TEXT
display_order INTEGER DEFAULT 0
is_active BOOLEAN DEFAULT true
```

### sms_queue
```sql
id UUID PRIMARY KEY
recipient_phone VARCHAR                  -- 254xxxxxxxxx format
message TEXT
message_type VARCHAR                     -- 'bill_notification', 'payment_confirmation'
status ENUM('pending','sent','failed')
billing_month VARCHAR                    -- YYYY-MM format
attempts INTEGER DEFAULT 0               -- Max 3
error_message TEXT
agent_id UUID REFERENCES users(id)
sent_at, last_attempt_at TIMESTAMP
created_at TIMESTAMP
```

---

## NOTIFICATION TABLES

### notifications
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES users(id)        -- Always users.id, NOT tenants.id
title VARCHAR(255) NOT NULL
message TEXT NOT NULL
type VARCHAR(50) NOT NULL                -- payment_success, tenant_created, etc.
related_entity_type VARCHAR(50)
related_entity_id UUID
is_read BOOLEAN DEFAULT false
read_at TIMESTAMP
created_at TIMESTAMP DEFAULT NOW()
```

---

## CHAT TABLES

### chat_conversations
```sql
id UUID PRIMARY KEY
title VARCHAR                            -- For group chats
conversation_type VARCHAR                -- 'direct' or 'group'
created_by UUID REFERENCES users(id)
created_at, updated_at TIMESTAMP
```

### chat_participants
```sql
id UUID PRIMARY KEY
conversation_id UUID REFERENCES chat_conversations(id)
user_id UUID REFERENCES users(id)
is_active BOOLEAN DEFAULT true
joined_at TIMESTAMP DEFAULT NOW()
UNIQUE(conversation_id, user_id)
```

### chat_messages
```sql
id UUID PRIMARY KEY
conversation_id UUID REFERENCES chat_conversations(id)
sender_id UUID REFERENCES users(id)
message_text TEXT
image_url VARCHAR                        -- Cloudinary URL for images
status VARCHAR(20) DEFAULT 'sent'        -- 'sent', 'delivered', 'read'
is_deleted BOOLEAN DEFAULT false
created_at TIMESTAMP DEFAULT NOW()
```

### chat_message_reads
```sql
id UUID PRIMARY KEY
message_id UUID REFERENCES chat_messages(id)
user_id UUID REFERENCES users(id)
read_at TIMESTAMP DEFAULT NOW()
UNIQUE(message_id, user_id)
```

---

## COMPLAINT TABLES

### complaints
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
property_id UUID REFERENCES properties(id)
unit_id UUID REFERENCES property_units(id)
assigned_agent_id UUID REFERENCES users(id)
title VARCHAR NOT NULL
description TEXT
categories JSONB                         -- Array of category strings
priority VARCHAR DEFAULT 'medium'
status VARCHAR DEFAULT 'open'            -- open, in_progress, resolved
raised_at TIMESTAMP DEFAULT NOW()        -- NOT created_at
resolved_at TIMESTAMP
```

### complaint_steps
```sql
id UUID PRIMARY KEY
complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE
step_order INTEGER NOT NULL
step_description TEXT NOT NULL
is_completed BOOLEAN DEFAULT false
completed_at TIMESTAMP
completed_by UUID REFERENCES users(id)
created_at TIMESTAMP DEFAULT NOW()
UNIQUE(complaint_id, step_order)
```

---

## IMAGE TABLES

### property_images (Option A - Unified Schema)
```sql
id UUID PRIMARY KEY
property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE
unit_id UUID REFERENCES property_units(id) ON DELETE CASCADE  -- NULL = property, NOT NULL = unit
image_url VARCHAR(500) NOT NULL
image_type VARCHAR(50) DEFAULT 'general' -- 'exterior', 'interior', 'amenity'
caption VARCHAR(255)
display_order INTEGER DEFAULT 0
uploaded_by UUID REFERENCES users(id)
uploaded_at TIMESTAMP DEFAULT NOW()
```

---

## ADMIN SETTINGS

### admin_settings
```sql
id UUID PRIMARY KEY
setting_key VARCHAR(100) UNIQUE NOT NULL
setting_value TEXT
description TEXT
created_at, updated_at TIMESTAMP
```

---

## CRITICAL RELATIONSHIPS

```
users (admin/agent) ←→ agent_property_assignments ←→ properties
                                                          ↓
tenants ←→ tenant_allocations ←→ property_units ←─────────┘
    ↓              ↓
rent_payments  water_bills

notifications.user_id → users.id (NOT tenants)
tenant_allocations.tenant_id → tenants.id (NOT users)
```

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
SELECT 
  COALESCE(SUM(wb.amount), 0) as total_billed,
  COALESCE(SUM(rp.allocated_to_water), 0) as total_paid,
  COALESCE(SUM(wb.amount), 0) - COALESCE(SUM(rp.allocated_to_water), 0) as balance
FROM water_bills wb
LEFT JOIN rent_payments rp ON wb.tenant_id = rp.tenant_id
WHERE wb.tenant_id = $1
```

### Available Units Recalculation (Accurate)
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

### Expense Stats - ALL-TIME by Status (for tab counts)
```sql
SELECT status, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
FROM expenses
WHERE 1=1 -- No date filter for all-time
GROUP BY status
```

---

## INDEXES
```sql
CREATE INDEX idx_property_units_property_id ON property_units(property_id);
CREATE INDEX idx_property_units_occupied ON property_units(is_occupied) WHERE is_active = true;
CREATE INDEX idx_tenant_allocations_active ON tenant_allocations(tenant_id, is_active);
CREATE INDEX idx_tenant_allocations_unit ON tenant_allocations(unit_id, is_active);
CREATE INDEX idx_rent_payments_tenant_month ON rent_payments(tenant_id, payment_month);
CREATE INDEX idx_rent_payments_payment_date ON rent_payments(payment_date);
CREATE INDEX idx_water_bills_tenant_month ON water_bills(tenant_id, bill_month);
CREATE INDEX idx_sms_queue_status ON sms_queue(status) WHERE status = 'failed';
CREATE INDEX idx_users_online ON users(is_online) WHERE is_online = true;
CREATE INDEX idx_chat_messages_status ON chat_messages(status);
CREATE INDEX idx_chat_participants_user_active ON chat_participants(user_id, is_active);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_property_images_unit_id ON property_images(unit_id);
```

---

## MIGRATIONS APPLIED

### tenant_allocations updated_at column
```sql
ALTER TABLE tenant_allocations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE tenant_allocations SET updated_at = COALESCE(allocation_date, NOW()) WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION update_tenant_allocations_timestamp() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_tenant_allocations_timestamp ON tenant_allocations;
CREATE TRIGGER trigger_update_tenant_allocations_timestamp
  BEFORE UPDATE ON tenant_allocations FOR EACH ROW
  EXECUTE FUNCTION update_tenant_allocations_timestamp();
```

### Chat enhancements
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent';
```

---

## DATA INTEGRITY NOTES

1. **available_units** is cached; use subquery for accurate count
2. **bill_month / payment_month** always stored as first of month (YYYY-MM-01)
3. **phone_number** stored as 254xxxxxxxxx, displayed as 0xxxxxxxxx
4. **features** is JSONB object `{}`, not array `[]`
5. **properties** table has NO `is_active` column
6. **complaints** uses `raised_at` (not `created_at`)
7. **tenant_allocations** uses `allocation_date` and now has `updated_at`
8. **payment_status** enum has NO 'processing' value
9. **unit_type** enum includes 'shop' and 'hall'
10. Unit code generated: `{property_code}-{unit_number}`
