-- API Keys for Bot Authentication
-- Migration: 002_api_keys.sql
-- Date: 2026-02-04

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the API key
  key_prefix TEXT NOT NULL, -- First 8 chars for display (e.g., "sk_live_")
  name TEXT, -- Optional name for the key (e.g., "Production Bot")
  scopes TEXT[] DEFAULT ARRAY['read', 'write'], -- Permissions
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);

-- RLS policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own API keys
CREATE POLICY "Users can view own API keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create API keys for themselves
CREATE POLICY "Users can create own API keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own API keys
CREATE POLICY "Users can delete own API keys"
  ON api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_updated_at();

COMMENT ON TABLE api_keys IS 'API keys for bot authentication';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the full API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters for display';
COMMENT ON COLUMN api_keys.scopes IS 'Array of permission scopes (read, write, admin)';
