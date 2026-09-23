-- Migration: Add is_special_order flag to material table
-- Run this in Supabase SQL Editor

ALTER TABLE trx.material
ADD COLUMN IF NOT EXISTS is_special_order BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN trx.material.is_special_order IS 'If true, this material is bought for specific orders only and won''t trigger low-stock warnings';

-- Migration: Add sewing_fee to transaction table
ALTER TABLE trx.transaction
ADD COLUMN IF NOT EXISTS sewing_fee INTEGER;

COMMENT ON COLUMN trx.transaction.sewing_fee IS 'Base sewing fee for worker commission calculation (30%). If NULL, uses total_price.';

-- Backfill existing transactions: set sewing_fee = total_price for all existing orders
UPDATE trx.transaction SET sewing_fee = total_price WHERE sewing_fee IS NULL;
