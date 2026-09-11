CREATE TABLE staff (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id),
  csrf_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE members (
  id UUID PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE CHECK (length(barcode) BETWEEN 1 AND 128),
  full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 160),
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  membership TEXT NOT NULL DEFAULT 'Member',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX members_name_idx ON members(LOWER(full_name));
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_outstanding INTEGER NOT NULL DEFAULT 6 CHECK (max_outstanding BETWEEN 1 AND 50),
  due_hours INTEGER NOT NULL DEFAULT 12 CHECK (due_hours BETWEEN 1 AND 168)
);
INSERT INTO settings(id) VALUES (1);
CREATE TABLE towel_transactions (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  member_id UUID NOT NULL REFERENCES members(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  kind TEXT NOT NULL CHECK (kind IN ('checkout', 'return')),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX transactions_time_idx ON towel_transactions(created_at DESC);
CREATE INDEX transactions_member_idx ON towel_transactions(member_id, created_at DESC);
CREATE TABLE loans (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES members(id),
  transaction_id UUID NOT NULL REFERENCES towel_transactions(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  remaining INTEGER NOT NULL CHECK (remaining >= 0 AND remaining <= quantity),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL,
  returned_at TIMESTAMPTZ
);
CREATE INDEX loans_outstanding_idx ON loans(member_id, issued_at) WHERE remaining > 0;
CREATE TABLE return_allocations (
  return_transaction_id UUID NOT NULL REFERENCES towel_transactions(id),
  loan_id UUID NOT NULL REFERENCES loans(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (return_transaction_id, loan_id)
);
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id),
  file_name TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  preview JSONB,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  staff_id UUID REFERENCES staff(id),
  action TEXT NOT NULL,
  entity_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
