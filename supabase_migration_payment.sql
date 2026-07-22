-- Add payment columns to transaction table
ALTER TABLE trx.transaction 
ADD COLUMN total_price DECIMAL(12,2),
ADD COLUMN amount_paid DECIMAL(12,2) DEFAULT 0,
ADD COLUMN payment_status VARCHAR(20) DEFAULT 'belum_bayar';

-- Update existing trigger to log payment changes
CREATE OR REPLACE FUNCTION trx.log_transaction_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'status', OLD.status, NEW.status);
  END IF;
  
  -- Log outfit_type changes
  IF OLD.outfit_type IS DISTINCT FROM NEW.outfit_type THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'outfit_type', OLD.outfit_type, NEW.outfit_type);
  END IF;
  
  -- Log panjang_kain changes
  IF OLD.panjang_kain IS DISTINCT FROM NEW.panjang_kain THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'panjang_kain', OLD.panjang_kain::TEXT, NEW.panjang_kain::TEXT);
  END IF;
  
  -- Log lebar_kain changes
  IF OLD.lebar_kain IS DISTINCT FROM NEW.lebar_kain THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'lebar_kain', OLD.lebar_kain::TEXT, NEW.lebar_kain::TEXT);
  END IF;
  
  -- Log cuci_sebelum_potong changes
  IF OLD.cuci_sebelum_potong IS DISTINCT FROM NEW.cuci_sebelum_potong THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'cuci_sebelum_potong', OLD.cuci_sebelum_potong::TEXT, NEW.cuci_sebelum_potong::TEXT);
  END IF;
  
  -- Log panjang_badan changes
  IF OLD.panjang_badan IS DISTINCT FROM NEW.panjang_badan THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'panjang_badan', OLD.panjang_badan::TEXT, NEW.panjang_badan::TEXT);
  END IF;
  
  -- Log lebar_bahu changes
  IF OLD.lebar_bahu IS DISTINCT FROM NEW.lebar_bahu THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'lebar_bahu', OLD.lebar_bahu::TEXT, NEW.lebar_bahu::TEXT);
  END IF;
  
  -- Log panjang_lengan changes
  IF OLD.panjang_lengan IS DISTINCT FROM NEW.panjang_lengan THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'panjang_lengan', OLD.panjang_lengan::TEXT, NEW.panjang_lengan::TEXT);
  END IF;
  
  -- Log lingkar_lengan changes
  IF OLD.lingkar_lengan IS DISTINCT FROM NEW.lingkar_lengan THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'lingkar_lengan', OLD.lingkar_lengan::TEXT, NEW.lingkar_lengan::TEXT);
  END IF;
  
  -- Log lingkar_ujung_lengan changes
  IF OLD.lingkar_ujung_lengan IS DISTINCT FROM NEW.lingkar_ujung_lengan THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'lingkar_ujung_lengan', OLD.lingkar_ujung_lengan::TEXT, NEW.lingkar_ujung_lengan::TEXT);
  END IF;
  
  -- Log lingkar_dada changes
  IF OLD.lingkar_dada IS DISTINCT FROM NEW.lingkar_dada THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'lingkar_dada', OLD.lingkar_dada::TEXT, NEW.lingkar_dada::TEXT);
  END IF;
  
  -- Log lingkar_perut changes
  IF OLD.lingkar_perut IS DISTINCT FROM NEW.lingkar_perut THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'lingkar_perut', OLD.lingkar_perut::TEXT, NEW.lingkar_perut::TEXT);
  END IF;
  
  -- Log lingkar_pinggul changes
  IF OLD.lingkar_pinggul IS DISTINCT FROM NEW.lingkar_pinggul THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'lingkar_pinggul', OLD.lingkar_pinggul::TEXT, NEW.lingkar_pinggul::TEXT);
  END IF;
  
  -- Log lingkar_leher changes
  IF OLD.lingkar_leher IS DISTINCT FROM NEW.lingkar_leher THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'lingkar_leher', OLD.lingkar_leher::TEXT, NEW.lingkar_leher::TEXT);
  END IF;
  
  -- Log lebar_pundak changes
  IF OLD.lebar_pundak IS DISTINCT FROM NEW.lebar_pundak THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'lebar_pundak', OLD.lebar_pundak::TEXT, NEW.lebar_pundak::TEXT);
  END IF;
  
  -- Log catatan changes
  IF OLD.catatan IS DISTINCT FROM NEW.catatan THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'catatan', OLD.catatan, NEW.catatan);
  END IF;
  
  -- Log total_price changes
  IF OLD.total_price IS DISTINCT FROM NEW.total_price THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'total_price', OLD.total_price::TEXT, NEW.total_price::TEXT);
  END IF;
  
  -- Log amount_paid changes
  IF OLD.amount_paid IS DISTINCT FROM NEW.amount_paid THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'amount_paid', OLD.amount_paid::TEXT, NEW.amount_paid::TEXT);
  END IF;
  
  -- Log payment_status changes
  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    INSERT INTO trx.transaction_log (transaction_id, field_changed, old_value, new_value)
    VALUES (NEW.id, 'payment_status', OLD.payment_status, NEW.payment_status);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add created_at if it doesn't exist (run this if dates show as "—")
-- ALTER TABLE trx.transaction 
-- ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
