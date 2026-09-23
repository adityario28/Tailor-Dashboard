-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: UUID + ref_number for cross-device sync
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add uuid and ref_number columns to order_group
ALTER TABLE trx.order_group
ADD COLUMN IF NOT EXISTS uuid TEXT,
ADD COLUMN IF NOT EXISTS ref_number INTEGER;

-- 2. Add uuid and ref_number columns to group_member
ALTER TABLE trx.group_member
ADD COLUMN IF NOT EXISTS uuid TEXT,
ADD COLUMN IF NOT EXISTS ref_number INTEGER,
ADD COLUMN IF NOT EXISTS group_uuid TEXT;

-- 3. Create sequences for ref_number auto-increment
CREATE SEQUENCE IF NOT EXISTS trx.order_group_ref_seq START 1;
CREATE SEQUENCE IF NOT EXISTS trx.group_member_ref_seq START 1;

-- 4. Backfill existing rows with generated UUIDs and ref_numbers
UPDATE trx.order_group
SET uuid = gen_random_uuid()::TEXT,
    ref_number = nextval('trx.order_group_ref_seq')
WHERE uuid IS NULL;

UPDATE trx.group_member
SET uuid = gen_random_uuid()::TEXT,
    ref_number = nextval('trx.group_member_ref_seq')
WHERE uuid IS NULL;

-- 5. Backfill group_uuid for existing members
UPDATE trx.group_member gm
SET group_uuid = og.uuid
FROM trx.order_group og
WHERE gm.group_id = og.id AND gm.group_uuid IS NULL;

-- 6. Add constraints after backfill
ALTER TABLE trx.order_group
ALTER COLUMN uuid SET NOT NULL,
ADD CONSTRAINT order_group_uuid_unique UNIQUE (uuid);

ALTER TABLE trx.group_member
ALTER COLUMN uuid SET NOT NULL,
ADD CONSTRAINT group_member_uuid_unique UNIQUE (uuid);

-- 7. Create trigger function to auto-assign ref_number on INSERT
CREATE OR REPLACE FUNCTION trx.assign_order_group_ref()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ref_number IS NULL THEN
    NEW.ref_number := nextval('trx.order_group_ref_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trx.assign_group_member_ref()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ref_number IS NULL THEN
    NEW.ref_number := nextval('trx.group_member_ref_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create triggers (drop first if exists to avoid duplicates)
DROP TRIGGER IF EXISTS trg_order_group_ref ON trx.order_group;
CREATE TRIGGER trg_order_group_ref
  BEFORE INSERT ON trx.order_group
  FOR EACH ROW
  EXECUTE FUNCTION trx.assign_order_group_ref();

DROP TRIGGER IF EXISTS trg_group_member_ref ON trx.group_member;
CREATE TRIGGER trg_group_member_ref
  BEFORE INSERT ON trx.group_member
  FOR EACH ROW
  EXECUTE FUNCTION trx.assign_group_member_ref();

-- 9. Create indexes for faster UUID lookups
CREATE INDEX IF NOT EXISTS idx_order_group_uuid ON trx.order_group(uuid);
CREATE INDEX IF NOT EXISTS idx_group_member_uuid ON trx.group_member(uuid);
CREATE INDEX IF NOT EXISTS idx_group_member_group_uuid ON trx.group_member(group_uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (run after migration)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT id, uuid, ref_number FROM trx.order_group LIMIT 5;
-- SELECT id, uuid, ref_number, group_uuid FROM trx.group_member LIMIT 5;
