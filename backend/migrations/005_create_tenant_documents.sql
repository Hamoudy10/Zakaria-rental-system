CREATE TABLE IF NOT EXISTS tenant_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(1000) NOT NULL,
  file_type VARCHAR(150),
  file_size BIGINT DEFAULT 0,
  uploaded_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_documents_tenant_active
  ON tenant_documents(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_tenant_documents_created_at
  ON tenant_documents(created_at DESC);
