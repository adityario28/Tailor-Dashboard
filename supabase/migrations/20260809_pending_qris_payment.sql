-- Tabel untuk tracking pending QRIS payments
-- Digunakan untuk matching payment webhook dengan order yang benar

CREATE TABLE IF NOT EXISTS trx.pending_qris_payment (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES trx.transaction(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 minutes'),
  status VARCHAR(20) DEFAULT 'pending', -- pending, matched, expired, cancelled
  matched_at TIMESTAMP WITH TIME ZONE
);

-- Index untuk query cepat
CREATE INDEX idx_pending_qris_status ON trx.pending_qris_payment(status);
CREATE INDEX idx_pending_qris_amount ON trx.pending_qris_payment(amount);
CREATE INDEX idx_pending_qris_created ON trx.pending_qris_payment(created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE trx.pending_qris_payment;

COMMENT ON TABLE trx.pending_qris_payment IS 'Track pending QRIS payments for webhook matching';
