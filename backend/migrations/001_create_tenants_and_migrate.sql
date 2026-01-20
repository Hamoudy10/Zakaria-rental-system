-- Step 1: Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    national_id VARCHAR(20) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone_number VARCHAR(15) NOT NULL,
    id_front_image VARCHAR(500),
    id_back_image VARCHAR(500),
    profile_image VARCHAR(500),
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(15),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS tenants_national_id_unique ON tenants(national_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_phone_unique ON tenants(phone_number);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_email_unique ON tenants(email) WHERE email IS NOT NULL;

-- Step 2: Migrate existing tenants from users table
INSERT INTO tenants (
    id, national_id, first_name, last_name, email, phone_number, 
    id_front_image, id_back_image, profile_image, is_active, created_by, created_at, updated_at
)
SELECT 
    id, national_id, first_name, last_name, email, phone_number,
    id_front_image, id_back_image, profile_image, is_active, created_by, created_at, updated_at
FROM users 
WHERE role = 'tenant';

-- Step 3: Create temporary columns to track old user IDs
ALTER TABLE tenant_allocations ADD COLUMN temp_tenant_user_id UUID;
ALTER TABLE rent_payments ADD COLUMN temp_tenant_user_id UUID;
ALTER TABLE complaints ADD COLUMN temp_tenant_user_id UUID;

-- Step 4: Store the old user IDs
UPDATE tenant_allocations SET temp_tenant_user_id = tenant_id;
UPDATE rent_payments SET temp_tenant_user_id = tenant_id;
UPDATE complaints SET temp_tenant_user_id = tenant_id;

-- Step 5: Update tenant_allocations to use new tenant IDs
UPDATE tenant_allocations ta
SET tenant_id = t.id
FROM tenants t
WHERE ta.temp_tenant_user_id = t.id;

-- Step 6: Update rent_payments to use new tenant IDs
UPDATE rent_payments rp
SET tenant_id = t.id
FROM tenants t
WHERE rp.temp_tenant_user_id = t.id;

-- Step 7: Update complaints to use new tenant IDs
UPDATE complaints c
SET tenant_id = t.id
FROM tenants t
WHERE c.temp_tenant_user_id = t.id;

-- Step 8: Drop the temporary columns
ALTER TABLE tenant_allocations DROP COLUMN temp_tenant_user_id;
ALTER TABLE rent_payments DROP COLUMN temp_tenant_user_id;
ALTER TABLE complaints DROP COLUMN temp_tenant_user_id;

-- Step 9: Update foreign key constraints
ALTER TABLE tenant_allocations 
DROP CONSTRAINT IF EXISTS tenant_allocations_tenant_id_fkey,
ADD CONSTRAINT tenant_allocations_tenant_id_fkey 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE rent_payments 
DROP CONSTRAINT IF EXISTS rent_payments_tenant_id_fkey,
ADD CONSTRAINT rent_payments_tenant_id_fkey 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE complaints 
DROP CONSTRAINT IF EXISTS complaints_tenant_id_fkey,
ADD CONSTRAINT complaints_tenant_id_fkey 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;

-- Step 10: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at 
    BEFORE UPDATE ON tenants 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();