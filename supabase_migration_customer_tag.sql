-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add tag field to customer table
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Add tag column (nullable, for internal identification like "karangjati", "BPR")
ALTER TABLE trx.customer
ADD COLUMN IF NOT EXISTS tag TEXT;

-- Create index for faster tag searches
CREATE INDEX IF NOT EXISTS idx_customer_tag ON trx.customer(tag);
