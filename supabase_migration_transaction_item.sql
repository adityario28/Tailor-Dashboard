-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add transaction_item table for set orders (multiple pieces per order)
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trx.transaction_item (
  id                    SERIAL PRIMARY KEY,
  transaction_id        INTEGER NOT NULL REFERENCES trx.transaction(id) ON DELETE CASCADE,
  outfit_type           VARCHAR(100),
  panjang_kain          NUMERIC,
  lebar_kain            NUMERIC,
  cuci_sebelum_potong   BOOLEAN DEFAULT false,
  panjang_badan         NUMERIC,
  lebar_bahu            NUMERIC,
  panjang_lengan        NUMERIC,
  lingkar_lengan        NUMERIC,
  lingkar_ujung_lengan  NUMERIC,
  lingkar_dada          NUMERIC,
  lingkar_perut         NUMERIC,
  lingkar_pinggul       NUMERIC,
  lingkar_leher         NUMERIC,
  lebar_pundak          NUMERIC,
  furing                BOOLEAN DEFAULT false,
  padding_tebal         BOOLEAN DEFAULT false,
  padding_tipis         BOOLEAN DEFAULT false,
  kancing               BOOLEAN DEFAULT false,
  catatan               TEXT,
  item_price            NUMERIC,
  sewing_fee            NUMERIC,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups by transaction
CREATE INDEX IF NOT EXISTS idx_transaction_item_transaction_id ON trx.transaction_item(transaction_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query (run after migration)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_schema = 'trx' AND table_name = 'transaction_item';
