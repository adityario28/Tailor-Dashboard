-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Material & Expense tracking
-- Tables: material, purchase, purchase_item, material_usage
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Master bahan (benang, kancing, dsb.)
CREATE TABLE trx.material (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(100)   NOT NULL,
  unit                VARCHAR(20)    NOT NULL,           -- roll, pcs, meter, yard, lusin
  current_stock       DECIMAL(10,3)  NOT NULL DEFAULT 0,
  avg_cost_per_unit   DECIMAL(12,2)  NOT NULL DEFAULT 0,
  low_stock_threshold DECIMAL(10,3)  NOT NULL DEFAULT 1, -- batas alert stok rendah
  created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- 2. Sesi belanja (1 kali pergi ke toko = 1 purchase)
CREATE TABLE trx.purchase (
  id           SERIAL PRIMARY KEY,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Detail item per sesi belanja
CREATE TABLE trx.purchase_item (
  id          SERIAL PRIMARY KEY,
  purchase_id INTEGER        NOT NULL REFERENCES trx.purchase(id)  ON DELETE CASCADE,
  material_id INTEGER        NOT NULL REFERENCES trx.material(id),
  quantity    DECIMAL(10,3)  NOT NULL,   -- jumlah yang dibeli
  unit_price  DECIMAL(12,2)  NOT NULL,   -- harga satuan saat beli
  created_at  TIMESTAMPTZ    DEFAULT NOW()
);

-- 4. Bahan yang dipakai per order
CREATE TABLE trx.material_usage (
  id                     SERIAL PRIMARY KEY,
  transaction_id         INTEGER        NOT NULL REFERENCES trx.transaction(id) ON DELETE CASCADE,
  material_id            INTEGER        NOT NULL REFERENCES trx.material(id),
  quantity_used          DECIMAL(10,3)  NOT NULL,
  cost_per_unit_snapshot DECIMAL(12,2)  NOT NULL DEFAULT 0, -- avg cost dikunci saat pencatatan
  created_at             TIMESTAMPTZ    DEFAULT NOW()
);

-- Indexes untuk query yang sering dipakai
CREATE INDEX idx_purchase_item_purchase_id  ON trx.purchase_item(purchase_id);
CREATE INDEX idx_purchase_item_material_id  ON trx.purchase_item(material_id);
CREATE INDEX idx_material_usage_transaction ON trx.material_usage(transaction_id);
CREATE INDEX idx_material_usage_material    ON trx.material_usage(material_id);
CREATE INDEX idx_purchase_purchased_at      ON trx.purchase(purchased_at);
