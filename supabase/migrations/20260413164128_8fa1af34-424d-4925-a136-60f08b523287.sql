CREATE UNIQUE INDEX IF NOT EXISTS idx_eq_tx_source_row_hash_unique 
  ON public.equipment_transactions (source_row_hash) 
  WHERE source_row_hash IS NOT NULL;