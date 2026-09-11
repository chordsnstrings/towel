CREATE TABLE login_limits (
  key_hash TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX login_limits_expiry_idx ON login_limits(reset_at);
