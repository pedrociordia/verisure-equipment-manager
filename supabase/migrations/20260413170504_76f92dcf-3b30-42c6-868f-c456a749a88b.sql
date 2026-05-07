DROP INDEX IF EXISTS idx_eq_tx_source_row_hash_unique;
ALTER TABLE public.equipment_transactions
  ADD CONSTRAINT uq_eq_tx_source_row_hash UNIQUE (source_row_hash);