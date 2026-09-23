-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Customer Portal + Notification Log
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tambah portal_token ke transaction (UUID unik per order)
ALTER TABLE trx.transaction
ADD COLUMN portal_token UUID DEFAULT gen_random_uuid();

-- Isi portal_token untuk order yang sudah ada
UPDATE trx.transaction SET portal_token = gen_random_uuid() WHERE portal_token IS NULL;

-- 2. Tabel log pengiriman notifikasi WA
CREATE TABLE trx.notification_log (
  id             SERIAL PRIMARY KEY,
  transaction_id INTEGER,
  customer_name  VARCHAR(100),
  customer_phone VARCHAR(20),
  status_sent    VARCHAR(50),   -- status yang dikirim, e.g. 'Jahit'
  message        TEXT,          -- isi pesan WA yang dikirim
  wa_status      VARCHAR(20)    NOT NULL DEFAULT 'pending', -- 'success' | 'failed'
  error_msg      TEXT,          -- diisi jika wa_status = 'failed'
  sent_at        TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX idx_notification_log_transaction ON trx.notification_log(transaction_id);
CREATE INDEX idx_notification_log_sent_at     ON trx.notification_log(sent_at);
