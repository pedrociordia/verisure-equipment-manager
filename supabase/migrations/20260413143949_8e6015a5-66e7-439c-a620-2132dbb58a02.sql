ALTER TABLE public.equipment_transactions
  ADD COLUMN IF NOT EXISTS source_system text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_row_hash text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS import_batch_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz DEFAULT NULL;