CREATE TABLE IF NOT EXISTS token_blacklist (
  token TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);
