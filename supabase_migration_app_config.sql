-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add app_config table for storing application settings
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trx.app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default Payhook config rows
INSERT INTO trx.app_config (key, value) VALUES
  ('payhook_bearer_token', ''),
  ('payhook_secret_key', '')
ON CONFLICT (key) DO NOTHING;

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION trx.update_app_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_app_config_timestamp ON trx.app_config;
CREATE TRIGGER trg_app_config_timestamp
  BEFORE UPDATE ON trx.app_config
  FOR EACH ROW
  EXECUTE FUNCTION trx.update_app_config_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'app_config table' AS feature,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='trx' AND table_name='app_config') AS ready;
